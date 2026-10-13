import { randomUUID } from "node:crypto";
import { pickTranslation } from "../../../domain/events/rules";
import { isContentLocale } from "../../../domain/events/types";
import { applicationFee, type FeeRule } from "../../../domain/orders/fees";
import type { CheckoutInput } from "../../../domain/orders/schemas";
import {
  CHECKOUT_GRACE_SECONDS,
  CHECKOUT_SESSION_SECONDS,
  FREE_TICKETS_PER_EMAIL,
  type OrderStatus,
} from "../../../domain/orders/types";
import {
  hashAccessToken,
  newOrderReference,
  orderAccessToken,
  ticketCode,
} from "../../../domain/tokens/tokens";
import type { Db } from "../../db/client";
import { transactionWithRetry } from "../../db/retry";
import type { VenueSnapshot } from "../../db/schema";
import { conflict, notFound } from "../../errors";
import type { Clock } from "../../ports/clock";
import type { Mailer } from "../../ports/mailer";
import type { PaymentGateway } from "../../ports/payment-gateway";
import * as inventory from "../inventory/repo";
import { releaseExpiredHolds, type Buyer } from "../inventory/service";
import { dispatchEmails, enqueueEmail, type DbOrTx } from "../notifications/service";
import { toEmailLocale } from "../notifications/templates";
import * as repo from "./repo";

export type CheckoutDeps = {
  db: Db;
  clock: Clock;
  mailer: Mailer;
  gateway: PaymentGateway;
  appUrl: string;
  /** Key for order links and ticket codes. */
  signingSecret: string;
  /** CynSeat's fee unless an organization has its own. */
  platformFee: FeeRule;
};

const plusSeconds = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);

export const orderUrl = (deps: Pick<CheckoutDeps, "appUrl">, locale: string, token: string) =>
  `${deps.appUrl}/${locale}/orders/${token}`;

// ---- Issuing tickets ---------------------------------------------------------------------

/**
 * Turns an order into tickets. This is the only place tickets are created, whichever way
 * the payment was confirmed, and it can be called any number of times for the same order.
 *
 * Locks are always taken hold first, then order, then ticket types in id order.
 */
async function fulfill(
  deps: CheckoutDeps,
  tx: DbOrTx & Pick<Db, "transaction">,
  orderId: string,
  payment: { paymentIntentId: string | null },
): Promise<OrderStatus> {
  const now = deps.clock.now();
  const unlocked = await repo.findOrder(tx, orderId);
  if (!unlocked) throw notFound("order");
  const hold = unlocked.holdId ? await repo.lockHold(tx, unlocked.holdId) : undefined;
  const order = (await repo.lockOrder(tx, orderId))!;
  if (order.status === "paid" || order.status === "unfulfillable") return order.status;

  const items = await repo.findOrderItems(tx, orderId);

  if (hold?.status === "active") {
    // The normal case: the tickets were reserved all along.
    for (const item of items) await inventory.convertReserved(tx, item);
    await inventory.markHold(tx, hold.id, { status: "converted", updatedAt: now });
  } else {
    // The reservation lapsed before the payment was confirmed. Take the tickets again if
    // they are all still free; otherwise the order cannot be honoured and must be refunded.
    const secured = await tx
      .transaction(async (savepoint) => {
        for (const item of items) {
          if (!(await inventory.sellUnreserved(savepoint, item))) throw new Error("gone");
        }
        return true;
      })
      .catch(() => false);
    if (!secured) {
      await repo.updateOrder(tx, orderId, {
        status: "unfulfillable",
        stripePaymentIntentId: payment.paymentIntentId,
        closedAt: now,
        updatedAt: now,
      });
      return "unfulfillable";
    }
  }

  await repo.insertTickets(
    tx,
    items.flatMap((item) =>
      Array.from({ length: item.quantity }, (_, index) => ({
        organizationId: order.organizationId,
        eventId: order.eventId,
        orderId,
        orderItemId: item.id,
        seq: index + 1,
        ticketTypeId: item.ticketTypeId,
        createdAt: now,
      })),
    ),
  );
  await repo.updateOrder(tx, orderId, {
    status: "paid",
    paidAt: now,
    stripePaymentIntentId: payment.paymentIntentId,
    closedAt: null,
    updatedAt: now,
  });

  const event = await repo.findOrderEvent(tx, order.eventId);
  const locale = toEmailLocale(order.locale);
  const translation = event
    ? pickTranslation(event.translations, locale, event.event.defaultLocale)
    : undefined;
  await enqueueEmail(
    tx,
    deps.clock,
    {
      to: order.email,
      locale,
      template: "orderConfirmation",
      data: {
        name: order.buyerName,
        event: translation?.title ?? "",
        when: event
          ? new Intl.DateTimeFormat(locale, {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: event.event.timezone,
            }).format(event.event.startsAt)
          : "",
        reference: order.publicId,
        tickets: String(items.reduce((sum, item) => sum + item.quantity, 0)),
        url: orderUrl(deps, locale, orderAccessToken(deps.signingSecret, orderId)),
      },
    },
    // One confirmation per order, however many times fulfilment runs.
    { dedupeKey: `order-confirmation:${orderId}` },
  );
  return "paid";
}

/**
 * Sends the confirmation queued by `fulfill`, now that its transaction has committed.
 * A failure here is not the buyer's problem: the email stays queued for the next sweep.
 */
async function sendConfirmations(deps: CheckoutDeps): Promise<void> {
  await dispatchEmails(deps, { limit: 10 }).catch(() => {});
}

// ---- Starting a checkout -----------------------------------------------------------------

export type CheckoutStarted =
  /** Nothing to pay, or already paid: the tickets are ready. */
  | { kind: "complete"; orderId: string; accessToken: string }
  /** Send the buyer to `url` to pay. */
  | { kind: "payment"; orderId: string; accessToken: string; url: string };

/**
 * Turns the buyer's cart into an order. Prices come from the database, never from the
 * request. A free order is completed on the spot; a paid one gets a payment page, and its
 * reservation is extended to outlast that page.
 */
export async function startCheckout(
  deps: CheckoutDeps,
  buyer: Buyer,
  input: CheckoutInput,
): Promise<CheckoutStarted> {
  const prepared = await transactionWithRetry(deps.db, async (tx) => {
    const now = deps.clock.now();
    await releaseExpiredHolds(tx, input.eventId, now);
    const event = await inventory.lockSellableEvent(tx, input.eventId);
    if (!event) throw conflict("not_on_sale");
    const hold = await inventory.lockActiveHold(tx, input.eventId, buyer.sessionId);
    if (!hold) throw conflict("cart_expired");

    if (hold.phase === "checkout") {
      // A second click, or a return to the page: carry on with the order already made.
      const existing = await repo.findOrderByHold(tx, hold.id);
      if (!existing) throw conflict("cart_expired");
      return { order: existing, event, lines: [], created: false as const };
    }

    const lines = await repo.findHoldLines(tx, hold.id);
    const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    if (quantity === 0) throw conflict("cart_expired");
    const totalAmount = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceAmount, 0);
    const profile = await repo.findPaymentProfile(tx, event.organizationId);

    if (totalAmount === 0) {
      const already = await repo.countFreeTickets(tx, event.id, input.email);
      if (already + quantity > FREE_TICKETS_PER_EMAIL) {
        throw conflict("free_ticket_limit", { max: String(FREE_TICKETS_PER_EMAIL) });
      }
    } else if (!profile?.accountId || !profile.chargesEnabled) {
      throw conflict("payments_unavailable");
    }

    const orderId = randomUUID();
    const order = await repo.insertOrder(tx, {
      id: orderId,
      organizationId: event.organizationId,
      eventId: event.id,
      publicId: newOrderReference(),
      holdId: hold.id,
      email: input.email,
      buyerName: input.name,
      userId: buyer.userId,
      locale: input.locale,
      currency: event.currency,
      totalAmount,
      applicationFeeAmount: applicationFee(totalAmount, quantity, {
        bps: profile?.feeBps ?? deps.platformFee.bps,
        fixedMinor: profile?.feeFixedMinor ?? deps.platformFee.fixedMinor,
      }),
      paymentProvider: totalAmount === 0 ? "none" : "stripe",
      stripeAccountId: totalAmount === 0 ? null : profile!.accountId,
      checkoutExpiresAt: totalAmount === 0 ? null : plusSeconds(now, CHECKOUT_SESSION_SECONDS),
      accessTokenHash: hashAccessToken(orderAccessToken(deps.signingSecret, orderId)),
      createdAt: now,
      updatedAt: now,
    });
    await repo.insertOrderItems(
      tx,
      lines.map((line) => ({
        organizationId: event.organizationId,
        orderId,
        eventId: event.id,
        ticketTypeId: line.ticketTypeId,
        description: line.name,
        quantity: line.quantity,
        unitPriceAmount: line.unitPriceAmount,
        lineTotalAmount: line.unitPriceAmount * line.quantity,
      })),
    );

    if (totalAmount === 0) {
      await fulfill(deps, tx, orderId, { paymentIntentId: null });
      return { order: { ...order, status: "paid" as const }, event, lines, created: true as const };
    }

    // The reservation must not run out while the buyer can still pay.
    await inventory.markHold(tx, hold.id, {
      phase: "checkout",
      expiresAt: plusSeconds(now, CHECKOUT_SESSION_SECONDS + CHECKOUT_GRACE_SECONDS),
      updatedAt: now,
    });
    return { order, event, lines, created: true as const };
  });

  const { order } = prepared;
  const accessToken = orderAccessToken(deps.signingSecret, order.id);
  if (order.status === "paid") {
    if (prepared.created) await sendConfirmations(deps);
    return { kind: "complete", orderId: order.id, accessToken };
  }

  if (order.stripeCheckoutSessionId) {
    // Resuming: find out what became of the payment page opened earlier.
    const status = await confirmPayment(deps, order.id);
    if (status === "paid") return { kind: "complete", orderId: order.id, accessToken };
    const state = await deps.gateway.getCheckout({
      sessionId: order.stripeCheckoutSessionId,
      accountId: order.stripeAccountId!,
    });
    if (state?.status === "open" && state.url) {
      return { kind: "payment", orderId: order.id, accessToken, url: state.url };
    }
    throw conflict("cart_expired");
  }

  const items = await repo.findOrderItems(deps.db, order.id);
  const locale = isContentLocale(order.locale) ? order.locale : "en";
  const session = await deps.gateway.createCheckout({
    orderId: order.id,
    accountId: order.stripeAccountId!,
    currency: order.currency,
    lines: items.map((item) => ({
      name: item.description,
      unitAmount: item.unitPriceAmount,
      quantity: item.quantity,
    })),
    applicationFeeAmount: order.applicationFeeAmount,
    customerEmail: order.email,
    locale,
    successUrl: orderUrl(deps, locale, accessToken),
    cancelUrl: `${deps.appUrl}/${locale}/checkout/${order.eventId}?cancelled=1`,
    expiresAt: order.checkoutExpiresAt!,
  });
  await repo.attachCheckoutSession(deps.db, order.id, session.id, deps.clock.now());
  return { kind: "payment", orderId: order.id, accessToken, url: session.url };
}

// ---- Confirming and closing --------------------------------------------------------------

/** Thrown when what the payment provider reports does not match the order. Never ignore. */
export class PaymentMismatchError extends Error {
  constructor(orderId: string, detail: string) {
    super(`Payment for order ${orderId} does not match: ${detail}`);
    this.name = "PaymentMismatchError";
  }
}

/**
 * Asks the payment provider what happened to an order's payment page and acts on it:
 * issues the tickets if it was paid, releases the reservation if it expired.
 * Called from the provider's notification, from the buyer's return, and from the
 * scheduler, in any order and any number of times.
 */
export async function confirmPayment(deps: CheckoutDeps, orderId: string): Promise<OrderStatus> {
  const order = await repo.findOrder(deps.db, orderId);
  if (!order) throw notFound("order");
  if (order.status === "paid" || order.status === "unfulfillable") return order.status;
  if (!order.stripeCheckoutSessionId || !order.stripeAccountId) return order.status;

  const state = await deps.gateway.getCheckout({
    sessionId: order.stripeCheckoutSessionId,
    accountId: order.stripeAccountId,
  });
  if (!state) return order.status;

  if (state.status === "complete" && state.paid) {
    // Believe the provider about the money, not the request that told us to look.
    if (state.orderId !== order.id) throw new PaymentMismatchError(order.id, "order reference");
    if (state.accountId !== order.stripeAccountId)
      throw new PaymentMismatchError(order.id, "account");
    if (state.amountTotal !== order.totalAmount) throw new PaymentMismatchError(order.id, "amount");
    if (state.currency.toLowerCase() !== order.currency) {
      throw new PaymentMismatchError(order.id, "currency");
    }
    const status = await transactionWithRetry(deps.db, (tx) =>
      fulfill(deps, tx, order.id, { paymentIntentId: state.paymentIntentId }),
    );
    if (status === "paid") await sendConfirmations(deps);
    return status;
  }
  if (state.status === "expired") return closeUnpaidOrder(deps, order.id, "expired");
  return order.status;
}

/** Ends an unpaid order and puts its tickets back on sale. Does nothing to a paid order. */
async function closeUnpaidOrder(
  deps: CheckoutDeps,
  orderId: string,
  status: "expired" | "cancelled",
): Promise<OrderStatus> {
  return transactionWithRetry(deps.db, async (tx) => {
    const now = deps.clock.now();
    const unlocked = await repo.findOrder(tx, orderId);
    if (!unlocked) throw notFound("order");
    if (unlocked.holdId) {
      const closed = await inventory.closeHolds(tx, {
        status: "released",
        now,
        where: { holdId: unlocked.holdId },
      });
      for (const item of await inventory.sumHoldItems(tx, closed))
        await inventory.unreserve(tx, item);
    }
    const order = (await repo.lockOrder(tx, orderId))!;
    if (order.status !== "pending") return order.status;
    await repo.updateOrder(tx, orderId, { status, closedAt: now, updatedAt: now });
    return status;
  });
}

/**
 * The buyer backs out of paying. The payment page is closed first, so that it cannot be
 * paid after its tickets have gone back on sale; if the buyer turns out to have paid
 * already, the order is completed instead.
 */
export async function cancelCheckout(
  deps: CheckoutDeps,
  buyer: Buyer,
  eventId: string,
): Promise<OrderStatus | null> {
  const hold = await deps.db.transaction((tx) =>
    inventory.lockActiveHold(tx, eventId, buyer.sessionId),
  );
  if (!hold || hold.phase !== "checkout") return null;
  const order = await repo.findOrderByHold(deps.db, hold.id);
  if (!order) return null;

  if (order.stripeCheckoutSessionId && order.stripeAccountId) {
    const outcome = await deps.gateway.expireCheckout({
      sessionId: order.stripeCheckoutSessionId,
      accountId: order.stripeAccountId,
    });
    if (outcome === "complete") return confirmPayment(deps, order.id);
  }
  return closeUnpaidOrder(deps, order.id, "cancelled");
}

// ---- Reading orders ----------------------------------------------------------------------

export type OrderView = {
  id: string;
  reference: string;
  status: OrderStatus;
  email: string;
  buyerName: string;
  currency: string;
  totalAmount: number;
  paidAt: Date | null;
  items: {
    description: string;
    quantity: number;
    unitPriceAmount: number;
    lineTotalAmount: number;
  }[];
  tickets: {
    id: string;
    number: number;
    description: string;
    status: "valid" | "void";
    checkedInAt: Date | null;
    /** What the ticket's QR code contains. Only present on valid tickets. */
    code: string | null;
  }[];
  event: {
    title: string;
    contentLocale: string;
    startsAt: Date;
    doorsAt: Date | null;
    timezone: string;
    status: "draft" | "published" | "cancelled";
    venue: VenueSnapshot | null;
    isOnline: boolean;
    slug: string;
    organization: { slug: string; name: string };
    contactEmail: string | null;
  };
};

async function viewOf(
  deps: CheckoutDeps,
  order: repo.OrderRow,
  locale: string,
): Promise<OrderView> {
  const [items, tickets, event] = await Promise.all([
    repo.findOrderItems(deps.db, order.id),
    repo.findTickets(deps.db, order.id),
    repo.findOrderEvent(deps.db, order.eventId),
  ]);
  if (!event) throw notFound("order");
  const translation = pickTranslation(
    event.translations,
    isContentLocale(locale) ? locale : "en",
    event.event.defaultLocale,
  );
  const descriptions = new Map(items.map((item) => [item.id, item.description]));

  return {
    id: order.id,
    reference: order.publicId,
    status: order.status,
    email: order.email,
    buyerName: order.buyerName,
    currency: order.currency,
    totalAmount: order.totalAmount,
    paidAt: order.paidAt,
    items: items.map(({ description, quantity, unitPriceAmount, lineTotalAmount }) => ({
      description,
      quantity,
      unitPriceAmount,
      lineTotalAmount,
    })),
    tickets: tickets.map((ticket, index) => ({
      id: ticket.id,
      number: index + 1,
      description: descriptions.get(ticket.orderItemId) ?? "",
      status: ticket.status,
      checkedInAt: ticket.checkedInAt,
      code:
        ticket.status === "valid"
          ? ticketCode(deps.signingSecret, ticket.id, ticket.tokenVersion)
          : null,
    })),
    event: {
      title: translation?.title ?? "",
      contentLocale: translation?.locale ?? event.event.defaultLocale,
      startsAt: event.event.startsAt,
      doorsAt: event.event.doorsAt,
      timezone: event.event.timezone,
      status: event.event.status,
      venue: event.event.venueSnapshot,
      isOnline: event.event.isOnline,
      slug: event.event.slug,
      organization: event.organization,
      contactEmail: event.contactEmail,
    },
  };
}

/**
 * The order behind a buyer's link. If its payment is still unconfirmed this first checks
 * with the provider, so a buyer who returns before the notification arrives still gets
 * their tickets.
 */
export async function getOrderByToken(
  deps: CheckoutDeps,
  token: string,
  locale: string,
): Promise<OrderView | null> {
  // Tokens are 43 URL-safe characters; anything else cannot match and is not looked up.
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  let order = await repo.findOrderByTokenHash(deps.db, hashAccessToken(token));
  if (!order) return null;
  if (order.status === "pending" || order.status === "expired") {
    await confirmPayment(deps, order.id);
    order = (await repo.findOrder(deps.db, order.id))!;
  }
  return viewOf(deps, order, locale);
}

/** Paid orders of a signed-in buyer, with the link to each. */
export async function listOrdersOfUser(
  deps: CheckoutDeps,
  userId: string,
  locale: string,
): Promise<(OrderView & { accessToken: string })[]> {
  const rows = await repo.findOrdersOfUser(deps.db, userId);
  return Promise.all(
    rows.map(async (row) => ({
      ...(await viewOf(deps, row, locale)),
      accessToken: orderAccessToken(deps.signingSecret, row.id),
    })),
  );
}
