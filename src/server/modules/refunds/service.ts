import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { pickTranslation } from "../../../domain/events/rules";
import { formatMoney } from "../../../domain/money/money";
import { orderAccessToken } from "../../../domain/tokens/tokens";
import { authorizeOrg } from "../../authz/authorize";
import { transactionWithRetry } from "../../db/retry";
import {
  events,
  holds,
  orderItems,
  orders,
  refunds,
  refundTickets,
  tickets,
  ticketTypes,
} from "../../db/schema";
import { conflict, invalid, notFound } from "../../errors";
import { recordAudit } from "../audit/service";
import { closeUnpaidOrder, orderUrl, type CheckoutDeps } from "../checkout/service";
import { findOrderEvent } from "../checkout/repo";
import { unsellSeats } from "../inventory/repo";
import { returnHeldInventory } from "../inventory/service";
import { dispatchEmails, enqueueEmail, type DbOrTx } from "../notifications/service";
import { toEmailLocale } from "../notifications/templates";
import type { OrgContext } from "../orgs/service";

type Deps = CheckoutDeps;
type RefundReason = "requested" | "event_cancelled" | "unfulfillable";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Records a refund and voids its tickets, all in the caller's transaction. No money moves
 * here: `settle` does that after the commit, so a failed provider call can never leave a
 * ticket valid that we believe refunded, or the reverse.
 *
 * Returns null when there is nothing to refund.
 */
async function open(
  deps: Deps,
  tx: DbOrTx,
  input: {
    orderId: string;
    /** Which tickets; "all" for every ticket still valid. */
    ticketIds: string[] | "all";
    reason: RefundReason;
    note?: string;
    source: "organizer" | "system";
    restock: boolean;
    initiatedBy: string | null;
  },
): Promise<string | null> {
  const now = deps.clock.now();
  const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
  if (!order) throw notFound("order");

  const valid = await tx
    .select({
      id: tickets.id,
      ticketTypeId: tickets.ticketTypeId,
      eventSeatId: tickets.eventSeatId,
      unitPriceAmount: orderItems.unitPriceAmount,
    })
    .from(tickets)
    .innerJoin(orderItems, eq(orderItems.id, tickets.orderItemId))
    .where(and(eq(tickets.orderId, order.id), eq(tickets.status, "valid")))
    .orderBy(asc(tickets.ticketTypeId), asc(tickets.id))
    .for("update", { of: tickets });

  const chosen =
    input.ticketIds === "all"
      ? valid
      : valid.filter((ticket) => input.ticketIds.includes(ticket.id));
  if (input.ticketIds !== "all" && chosen.length !== new Set(input.ticketIds).size) {
    // Some of the requested tickets are not this order's, or were already refunded.
    throw invalid("tickets_not_refundable");
  }

  // An order that never received tickets is refunded whatever is still owed on it.
  const amount =
    input.reason === "unfulfillable"
      ? order.totalAmount - order.refundedAmount
      : chosen.reduce((sum, ticket) => sum + ticket.unitPriceAmount, 0);
  if (chosen.length === 0 && amount === 0) return null;
  if (order.refundedAmount + amount > order.totalAmount) throw conflict("refund_exceeds_total");

  const [refund] = await tx
    .insert(refunds)
    .values({
      organizationId: order.organizationId,
      orderId: order.id,
      amount,
      reason: input.reason,
      note: input.note ?? null,
      source: input.source,
      restock: input.restock,
      // Nothing to send to the provider for a free order.
      status: amount === 0 ? "succeeded" : "pending",
      initiatedBy: input.initiatedBy,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: refunds.id });

  if (chosen.length > 0) {
    await tx
      .insert(refundTickets)
      .values(chosen.map((ticket) => ({ refundId: refund!.id, ticketId: ticket.id })));
    // Void at once: a ticket being refunded must not get through the door meanwhile.
    await tx
      .update(tickets)
      .set({ status: "void", voidReason: input.reason, voidedAt: now })
      .where(
        inArray(
          tickets.id,
          chosen.map((ticket) => ticket.id),
        ),
      );

    const perType = new Map<string, number>();
    for (const ticket of chosen) {
      perType.set(ticket.ticketTypeId, (perType.get(ticket.ticketTypeId) ?? 0) + 1);
    }
    // Ticket types in id order, as everywhere, so this cannot deadlock with a sale.
    for (const [ticketTypeId, count] of [...perType].sort(([a], [b]) => a.localeCompare(b))) {
      await tx
        .update(ticketTypes)
        .set({
          qtySold: sql`${ticketTypes.qtySold} - ${count}`,
          // Not putting them back on sale means there are simply fewer tickets now.
          ...(input.restock ? {} : { capacity: sql`${ticketTypes.capacity} - ${count}` }),
        })
        .where(eq(ticketTypes.id, ticketTypeId));
    }
    // Reserved seats go back on sale, or are blocked if they should not be resold.
    await unsellSeats(
      tx,
      chosen.flatMap((ticket) => (ticket.eventSeatId ? [ticket.eventSeatId] : [])),
      input.restock,
    );
  }

  await tx
    .update(orders)
    .set({ refundedAmount: order.refundedAmount + amount, updatedAt: now })
    .where(eq(orders.id, order.id));
  await recordAudit(tx, {
    organizationId: order.organizationId,
    actorUserId: input.initiatedBy,
    action: "order.refunded",
    entityType: "order",
    entityId: order.id,
    data: { refundId: refund!.id, amount, tickets: chosen.length, reason: input.reason },
  });
  return refund!.id;
}

/**
 * Sends a recorded refund to the payment provider and stores the outcome. Safe to repeat:
 * the refund's own id is the provider-side idempotency key, so the money moves once.
 */
async function settle(deps: Deps, refundId: string): Promise<"succeeded" | "pending" | "failed"> {
  const [row] = await deps.db
    .select({ refund: refunds, order: orders })
    .from(refunds)
    .innerJoin(orders, eq(orders.id, refunds.orderId))
    .where(eq(refunds.id, refundId));
  if (!row) throw notFound("refund");
  const { refund, order } = row;
  if (refund.status !== "pending" || refund.providerRefundId) return refund.status;

  let result: {
    id: string | null;
    status: "succeeded" | "pending" | "failed";
    failureReason?: string;
  };
  if (!order.stripeAccountId || !order.stripePaymentIntentId) {
    result = { id: null, status: "failed", failureReason: "no_payment_on_record" };
  } else {
    result = await deps.gateway.refund({
      accountId: order.stripeAccountId,
      paymentIntentId: order.stripePaymentIntentId,
      amount: refund.amount,
      // A new key for each deliberate retry; within one attempt, repeats are harmless.
      idempotencyKey: `refund:${refund.id}:${refund.retries}`,
      // The buyer is made whole, so CynSeat does not keep a fee on money that went back.
      refundApplicationFee: true,
    });
  }

  await deps.db.transaction(async (tx) => {
    const now = deps.clock.now();
    await tx
      .update(refunds)
      .set({
        status: result.status,
        providerRefundId: result.id,
        failureReason: result.failureReason ?? null,
        updatedAt: now,
      })
      .where(eq(refunds.id, refund.id));

    if (result.status === "failed") {
      // The money did not go back, so stop counting it as refunded. The tickets stay
      // void: letting someone in on a ticket we tried to refund would be worse.
      await tx
        .update(orders)
        .set({ refundedAmount: sql`${orders.refundedAmount} - ${refund.amount}`, updatedAt: now })
        .where(eq(orders.id, order.id));
      return;
    }
    const event = await findOrderEvent(tx, order.eventId);
    const locale = toEmailLocale(order.locale);
    await enqueueEmail(
      tx,
      deps.clock,
      {
        to: order.email,
        locale,
        template: "orderRefunded",
        data: {
          name: order.buyerName,
          event:
            (event &&
              pickTranslation(event.translations, locale, event.event.defaultLocale)?.title) ??
            "",
          reference: order.publicId,
          amount: formatMoney(refund.amount, order.currency, locale),
          url: orderUrl(deps, locale, orderAccessToken(deps.signingSecret, order.id)),
        },
      },
      { dedupeKey: `order-refunded:${refund.id}` },
    );
  });
  if (result.status !== "failed") await dispatchEmails(deps, { limit: 10 }).catch(() => {});
  return result.status;
}

// ---- What callers use --------------------------------------------------------------------

export type RefundOutcome = { refundId: string; status: "succeeded" | "pending" | "failed" };

/** An organizer refunds some or all of an order's tickets. */
export async function refundOrder(
  deps: Deps,
  ctx: OrgContext,
  orderId: string,
  input: { ticketIds?: string[]; restock: boolean; note?: string },
): Promise<RefundOutcome> {
  authorizeOrg(ctx, "order.refund");
  if (!UUID.test(orderId)) throw notFound("order");

  const refundId = await transactionWithRetry(deps.db, async (tx) => {
    const [owned] = await tx
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.organizationId, ctx.organization.id)));
    if (!owned) throw notFound("order");
    if (owned.status !== "paid") throw conflict("order_not_paid");
    return open(deps, tx, {
      orderId,
      ticketIds: input.ticketIds ?? "all",
      reason: "requested",
      note: input.note,
      source: "organizer",
      restock: input.restock,
      initiatedBy: ctx.actor.userId,
    });
  });
  if (!refundId) throw conflict("nothing_to_refund");
  return { refundId, status: await settle(deps, refundId) };
}

/**
 * Sends a failed refund again, for instance once the organization's balance has been
 * topped up. The tickets were already voided by the first attempt.
 */
async function retry(deps: Deps, refundId: string): Promise<"succeeded" | "pending" | "failed"> {
  const reopened = await deps.db.transaction(async (tx) => {
    const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for("update");
    if (!refund || refund.status !== "failed") return false;
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, refund.orderId))
      .for("update");
    if (!order || order.refundedAmount + refund.amount > order.totalAmount) return false;
    const now = deps.clock.now();
    await tx
      .update(refunds)
      .set({
        status: "pending",
        retries: refund.retries + 1,
        providerRefundId: null,
        failureReason: null,
        updatedAt: now,
      })
      .where(eq(refunds.id, refundId));
    await tx
      .update(orders)
      .set({ refundedAmount: order.refundedAmount + refund.amount, updatedAt: now })
      .where(eq(orders.id, order.id));
    return true;
  });
  if (!reopened) throw conflict("refund_not_retryable");
  return settle(deps, refundId);
}

/** An organizer sends a failed refund again. */
export async function retryRefund(
  deps: Deps,
  ctx: OrgContext,
  refundId: string,
): Promise<RefundOutcome> {
  authorizeOrg(ctx, "order.refund");
  const [owned] = UUID.test(refundId)
    ? await deps.db
        .select({ id: refunds.id })
        .from(refunds)
        .where(and(eq(refunds.id, refundId), eq(refunds.organizationId, ctx.organization.id)))
    : [];
  if (!owned) throw notFound("refund");
  return { refundId, status: await retry(deps, refundId) };
}

/**
 * Refunds, in full, a paid order that could not be given tickets. Does nothing if that
 * has already been done, so it can be called from every place that notices such an order.
 */
export async function refundUnfulfillableOrder(deps: Deps, orderId: string): Promise<void> {
  const refundId = await transactionWithRetry(deps.db, async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order || order.status !== "unfulfillable") return null;
    const [existing] = await tx
      .select({ id: refunds.id })
      .from(refunds)
      .where(
        // Any earlier attempt counts, even a failed one: failed refunds are sent again by
        // `retry`, and opening a second refund beside one could pay the buyer twice.
        and(eq(refunds.orderId, orderId), eq(refunds.reason, "unfulfillable")),
      );
    if (existing) return existing.id;
    return open(deps, tx, {
      orderId,
      ticketIds: "all",
      reason: "unfulfillable",
      source: "system",
      restock: false,
      initiatedBy: null,
    });
  });
  if (refundId) await settle(deps, refundId);
}

/**
 * After an event is cancelled: closes every open payment page, releases every cart, and
 * refunds every paid order. Each order is handled on its own, so the job can stop anywhere
 * and be run again until nothing is left. Returns how many orders still need attention.
 */
export async function refundCancelledEvent(deps: Deps, eventId: string): Promise<number> {
  const [event] = await deps.db
    .select({ status: events.status })
    .from(events)
    .where(eq(events.id, eventId));
  if (event?.status !== "cancelled") return 0;

  // Unpaid orders first: close the payment page so nobody pays for a cancelled event.
  const pending = await deps.db
    .select()
    .from(orders)
    .where(and(eq(orders.eventId, eventId), eq(orders.status, "pending")));
  for (const order of pending) {
    if (order.stripeCheckoutSessionId && order.stripeAccountId) {
      const outcome = await deps.gateway.expireCheckout({
        sessionId: order.stripeCheckoutSessionId,
        accountId: order.stripeAccountId,
      });
      // Paid a moment before the cancellation: left pending for the reconciler, which
      // will find the tickets gone and refund it.
      if (outcome === "complete") continue;
    }
    await closeUnpaidOrder(deps, order.id, "cancelled");
  }
  // Carts that never reached checkout.
  await transactionWithRetry(deps.db, async (tx) => {
    const now = deps.clock.now();
    const closed = await tx
      .update(holds)
      .set({ status: "released", releasedAt: now, updatedAt: now })
      .where(and(eq(holds.eventId, eventId), eq(holds.status, "active"), eq(holds.phase, "cart")))
      .returning({ id: holds.id });
    await returnHeldInventory(
      tx,
      closed.map((hold) => hold.id),
    );
  });

  const paid = await deps.db
    .selectDistinct({ id: orders.id })
    .from(orders)
    .innerJoin(tickets, and(eq(tickets.orderId, orders.id), eq(tickets.status, "valid")))
    .where(and(eq(orders.eventId, eventId), eq(orders.status, "paid")));
  let remaining = 0;
  for (const order of paid) {
    try {
      const refundId = await transactionWithRetry(deps.db, (tx) =>
        open(deps, tx, {
          orderId: order.id,
          ticketIds: "all",
          reason: "event_cancelled",
          source: "system",
          restock: false,
          initiatedBy: null,
        }),
      );
      if (refundId && (await settle(deps, refundId)) === "failed") remaining += 1;
    } catch {
      remaining += 1;
    }
  }
  return remaining;
}

/**
 * Scheduler pass: finishes refunds that were recorded but never reached the provider
 * (a crash between the two steps), and cancelled events that still have valid tickets.
 */
export async function settleOutstandingRefunds(deps: Deps, limit = 50): Promise<number> {
  const stuck = await deps.db
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(
        eq(refunds.status, "pending"),
        isNull(refunds.providerRefundId),
        // Leave a moment for the request that created it to finish on its own.
        lte(refunds.createdAt, new Date(deps.clock.now().getTime() - 60_000)),
      ),
    )
    .limit(limit);
  for (const refund of stuck) await settle(deps, refund.id).catch(() => {});

  // Automatic refunds that failed are tried again a few times, an hour apart.
  const failed = await deps.db
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(
        eq(refunds.status, "failed"),
        eq(refunds.source, "system"),
        sql`${refunds.retries} < 5`,
        lte(refunds.updatedAt, new Date(deps.clock.now().getTime() - 3_600_000)),
      ),
    )
    .limit(limit);
  for (const refund of failed) await retry(deps, refund.id).catch(() => {});

  const cancelled = await deps.db
    .selectDistinct({ id: events.id })
    .from(events)
    .innerJoin(tickets, and(eq(tickets.eventId, events.id), eq(tickets.status, "valid")))
    .where(eq(events.status, "cancelled"))
    .limit(limit);
  for (const event of cancelled) await refundCancelledEvent(deps, event.id).catch(() => {});

  const unfulfillable = await deps.db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.status, "unfulfillable"),
        sql`${orders.refundedAmount} < ${orders.totalAmount}`,
      ),
    )
    .limit(limit);
  for (const order of unfulfillable) await refundUnfulfillableOrder(deps, order.id).catch(() => {});

  return stuck.length + failed.length + cancelled.length + unfulfillable.length;
}

// ---- Organizer views ---------------------------------------------------------------------

export type EventOrder = {
  id: string;
  reference: string;
  status: string;
  email: string;
  buyerName: string;
  currency: string;
  totalAmount: number;
  refundedAmount: number;
  createdAt: Date;
  tickets: {
    id: string;
    description: string;
    /** What was paid for this ticket. */
    unitPriceAmount: number;
    status: "valid" | "void";
    checkedInAt: Date | null;
  }[];
  refunds: { id: string; amount: number; status: string; reason: string; createdAt: Date }[];
};

/** Orders of one event that were paid for, newest first, for the organizer's dashboard. */
export async function listEventOrders(
  deps: Pick<Deps, "db">,
  ctx: OrgContext,
  eventId: string,
): Promise<EventOrder[]> {
  authorizeOrg(ctx, "order.view");
  if (!UUID.test(eventId)) throw notFound("event");
  const scope = and(eq(orders.organizationId, ctx.organization.id), eq(orders.eventId, eventId));

  const rows = await deps.db
    .select()
    .from(orders)
    .where(and(scope, inArray(orders.status, ["paid", "unfulfillable"])))
    .orderBy(desc(orders.createdAt))
    .limit(500);
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [ticketRows, refundRows] = await Promise.all([
    deps.db
      .select({
        id: tickets.id,
        orderId: tickets.orderId,
        status: tickets.status,
        checkedInAt: tickets.checkedInAt,
        description: orderItems.description,
        unitPriceAmount: orderItems.unitPriceAmount,
      })
      .from(tickets)
      .innerJoin(orderItems, eq(orderItems.id, tickets.orderItemId))
      .where(inArray(tickets.orderId, ids))
      .orderBy(asc(tickets.orderItemId), asc(tickets.seq)),
    deps.db
      .select()
      .from(refunds)
      .where(inArray(refunds.orderId, ids))
      .orderBy(asc(refunds.createdAt)),
  ]);

  return rows.map((order) => ({
    id: order.id,
    reference: order.publicId,
    status: order.status,
    email: order.email,
    buyerName: order.buyerName,
    currency: order.currency,
    totalAmount: order.totalAmount,
    refundedAmount: order.refundedAmount,
    createdAt: order.createdAt,
    tickets: ticketRows
      .filter((ticket) => ticket.orderId === order.id)
      .map(({ id, description, unitPriceAmount, status, checkedInAt }) => ({
        id,
        description,
        unitPriceAmount,
        status,
        checkedInAt,
      })),
    refunds: refundRows
      .filter((refund) => refund.orderId === order.id)
      .map(({ id, amount, status, reason, createdAt }) => ({
        id,
        amount,
        status,
        reason,
        createdAt,
      })),
  }));
}
