import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createOrg,
  createPublishedEvent,
  type TestOrg,
} from "../../../../tests/integration/fixtures";
import { expectInventoryConsistent } from "../../../../tests/integration/invariants";
import { codeOf, setupTestApp, type TestApp } from "../../../../tests/integration/test-app";
import { holds, orders, outboxJobs, refunds, tickets, ticketTypes } from "../../db/schema";
import { scanTicket } from "../checkin/service";
import { confirmPayment, getOrderByToken, startCheckout } from "../checkout/service";
import { cancelEvent } from "../events/service";
import { setCart, type Buyer } from "../inventory/service";
import {
  listEventOrders,
  refundCancelledEvent,
  refundOrder,
  retryRefund,
  settleOutstandingRefunds,
} from "./service";

const MINUTE = 60_000;
type Event = Awaited<ReturnType<typeof createPublishedEvent>>;
const buyer = (): Buyer => ({ sessionId: randomUUID(), userId: null });

/** Buys and pays for tickets. Returns the order id, its link token and its ticket ids. */
async function purchase(app: TestApp, event: Event, quantity = 2, options: { pay?: boolean } = {}) {
  const who = buyer();
  await setCart(app, who, event.id, [{ ticketTypeId: event.ticketTypeId, quantity }]);
  const started = await startCheckout(app, who, {
    eventId: event.id,
    email: `${randomUUID()}@example.com`,
    name: "Aino Buyer",
    locale: "en",
  });
  if (started.kind === "payment" && (options.pay ?? true)) {
    app.gateway.pay(app.gateway.sessionOf(started.orderId)!.id);
    await confirmPayment(app, started.orderId);
  }
  const rows = await app.db.select().from(tickets).where(eq(tickets.orderId, started.orderId));
  return {
    who,
    orderId: started.orderId,
    token: started.accessToken,
    ticketIds: rows.map((row) => row.id),
  };
}

describe("refunds", () => {
  const getApp = setupTestApp();
  const setup = async (ticket: { price?: string; capacity?: number } = {}) => {
    const app = getApp();
    const org = await createOrg(app);
    const event = await createPublishedEvent(app, org, {
      ticket: { price: "12,50", capacity: 20, ...ticket },
    });
    return { app, org, event };
  };
  const orderRow = async (id: string) =>
    (await getApp().db.select().from(orders).where(eq(orders.id, id)))[0]!;
  const typeRow = async (id: string) =>
    (await getApp().db.select().from(ticketTypes).where(eq(ticketTypes.id, id)))[0]!;
  const refundsOf = (orderId: string) =>
    getApp().db.select().from(refunds).where(eq(refunds.orderId, orderId));
  const providerRefunds = (app: TestApp) => [...app.gateway.refunds.values()];
  const failure = (fn: () => Promise<unknown>) =>
    fn().then(
      () => null,
      (error: unknown) => error,
    );
  const admin = (org: TestOrg) => org.as(org.admin);

  describe("by an organizer", () => {
    it("returns the money, voids the tickets and puts them back on sale", async () => {
      const { app, org, event } = await setup();
      const order = await purchase(app, event, 2);
      const before = providerRefunds(app).length;

      const outcome = await refundOrder(app, await admin(org), order.orderId, { restock: true });

      expect(outcome.status).toBe("succeeded");
      expect(await orderRow(order.orderId)).toMatchObject({ status: "paid", refundedAmount: 2500 });
      expect(providerRefunds(app).slice(before)).toEqual([
        expect.objectContaining({ amount: 2500 }),
      ]);
      expect(await typeRow(event.ticketTypeId)).toMatchObject({ qtySold: 0, capacity: 20 });
      const view = (await getOrderByToken(app, order.token, "en"))!;
      expect(view.tickets.map((ticket) => [ticket.status, ticket.code])).toEqual([
        ["void", null],
        ["void", null],
      ]);
      const [email] = await app.db
        .select()
        .from(outboxJobs)
        .where(eq(outboxJobs.dedupeKey, `order-refunded:${outcome.refundId}`));
      expect(email!.payload).toMatchObject({
        template: "orderRefunded",
        data: { amount: "€25.00" },
      });
      await expectInventoryConsistent(app, event.id);
    });

    it("can refund single tickets, each only once", async () => {
      const { app, org, event } = await setup();
      const order = await purchase(app, event, 3);
      const ctx = await admin(org);
      const [first, second, third] = order.ticketIds;

      await refundOrder(app, ctx, order.orderId, { ticketIds: [first!], restock: true });
      expect((await orderRow(order.orderId)).refundedAmount).toBe(1250);
      expect(
        await failure(() =>
          refundOrder(app, ctx, order.orderId, { ticketIds: [first!], restock: true }),
        ),
      ).toMatchObject({ code: "VALIDATION", reason: "tickets_not_refundable" });
      expect(
        await failure(() =>
          refundOrder(app, ctx, order.orderId, {
            ticketIds: [second!, randomUUID()],
            restock: true,
          }),
        ),
      ).toMatchObject({ reason: "tickets_not_refundable" });

      await refundOrder(app, ctx, order.orderId, { ticketIds: [second!, third!], restock: true });
      expect((await orderRow(order.orderId)).refundedAmount).toBe(3750);
      expect(
        await failure(() => refundOrder(app, ctx, order.orderId, { restock: true })),
      ).toMatchObject({
        reason: "nothing_to_refund",
      });
      await expectInventoryConsistent(app, event.id);
    });

    it("can keep refunded tickets off sale", async () => {
      const { app, org, event } = await setup({ capacity: 2 });
      const order = await purchase(app, event, 2);
      await refundOrder(app, await admin(org), order.orderId, { restock: false });

      expect(await typeRow(event.ticketTypeId)).toMatchObject({ qtySold: 0, capacity: 0 });
      expect(
        await codeOf(() =>
          setCart(app, buyer(), event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 1 }]),
        ),
      ).toBe("CONFLICT");
      await expectInventoryConsistent(app, event.id);
    });

    it("pays out once when two admins refund the same order at the same moment", async () => {
      const { app, org, event } = await setup();
      const order = await purchase(app, event, 2);
      const ctx = await admin(org);
      const before = providerRefunds(app).length;

      const results = await Promise.all(
        [1, 2, 3].map(() => codeOf(() => refundOrder(app, ctx, order.orderId, { restock: true }))),
      );

      expect(results.filter((code) => code === "none")).toHaveLength(1);
      expect(
        providerRefunds(app)
          .slice(before)
          .reduce((sum, refund) => sum + refund.amount, 0),
      ).toBe(2500);
      expect((await orderRow(order.orderId)).refundedAmount).toBe(2500);
      expect(await typeRow(event.ticketTypeId)).toMatchObject({ qtySold: 0 });
      await expectInventoryConsistent(app, event.id);
    });

    it("cancels free tickets without involving the payment provider", async () => {
      const { app, org, event } = await setup({ price: "0" });
      const order = await purchase(app, event, 2);
      const before = providerRefunds(app).length;

      const outcome = await refundOrder(app, await admin(org), order.orderId, { restock: true });
      expect(outcome.status).toBe("succeeded");
      expect(providerRefunds(app)).toHaveLength(before);
      expect((await refundsOf(order.orderId))[0]).toMatchObject({ amount: 0, status: "succeeded" });
      await expectInventoryConsistent(app, event.id);
    });

    it("is for admins of the order's own organization, on paid orders", async () => {
      const { app, org, event } = await setup();
      const rival = await createOrg(app);
      const order = await purchase(app, event, 1);
      const unpaid = await purchase(app, event, 1, { pay: false });
      const input = { restock: true };

      expect(
        await codeOf(async () => refundOrder(app, await org.as(org.member), order.orderId, input)),
      ).toBe("FORBIDDEN");
      expect(
        await codeOf(async () => refundOrder(app, await admin(rival), order.orderId, input)),
      ).toBe("NOT_FOUND");
      expect(
        await failure(async () => refundOrder(app, await admin(org), unpaid.orderId, input)),
      ).toMatchObject({
        reason: "order_not_paid",
      });
      expect(await codeOf(async () => listEventOrders(app, await admin(rival), event.id))).toBe(
        "none",
      );
      expect(await listEventOrders(app, await admin(rival), event.id)).toEqual([]);
      expect(await codeOf(async () => listEventOrders(app, await org.as(org.door), event.id))).toBe(
        "FORBIDDEN",
      );
      expect((await orderRow(order.orderId)).refundedAmount).toBe(0);
    });

    it("stops a refunded ticket at the door", async () => {
      const { app, org, event } = await setup({ price: "0" });
      const order = await purchase(app, event, 1);
      const code = (await getOrderByToken(app, order.token, "en"))!.tickets[0]!.code!;
      await refundOrder(app, await admin(org), order.orderId, { restock: true });

      const outcome = await scanTicket(app, await org.as(org.door), event.id, {
        code,
        scanId: randomUUID(),
      });
      expect(outcome.result).toBe("void");
    });
  });

  describe("when the provider refuses", () => {
    it("records the failure, stops counting the money as returned, and can be sent again", async () => {
      const { app, org, event } = await setup();
      const order = await purchase(app, event, 2);
      const ctx = await admin(org);

      app.gateway.failNextRefund("insufficient_funds");
      const outcome = await refundOrder(app, ctx, order.orderId, { restock: true });
      expect(outcome.status).toBe("failed");
      expect((await refundsOf(order.orderId))[0]).toMatchObject({
        status: "failed",
        failureReason: "insufficient_funds",
      });
      expect((await orderRow(order.orderId)).refundedAmount).toBe(0);
      // The tickets stay void: nobody gets in on a ticket we tried to refund.
      expect(
        (await getOrderByToken(app, order.token, "en"))!.tickets.every((t) => t.status === "void"),
      ).toBe(true);
      const [listed] = (await listEventOrders(app, ctx, event.id)).filter(
        (o) => o.id === order.orderId,
      );
      expect(listed!.refunds).toEqual([
        expect.objectContaining({ status: "failed", amount: 2500 }),
      ]);

      expect((await retryRefund(app, ctx, outcome.refundId)).status).toBe("succeeded");
      expect((await orderRow(order.orderId)).refundedAmount).toBe(2500);
      expect(await failure(() => retryRefund(app, ctx, outcome.refundId))).toMatchObject({
        reason: "refund_not_retryable",
      });
      expect(
        await codeOf(async () => retryRefund(app, await org.as(org.member), outcome.refundId)),
      ).toBe("FORBIDDEN");
    });
  });

  describe("automatic refunds", () => {
    it("return a payment that arrived after its tickets were sold to someone else, once", async () => {
      const { app, event } = await setup({ capacity: 2 });
      const late = await purchase(app, event, 2, { pay: false });
      app.clock.advance(40 * MINUTE);
      await purchase(app, event, 2);
      const before = providerRefunds(app).length;

      app.gateway.pay(app.gateway.sessionOf(late.orderId)!.id);
      expect(await confirmPayment(app, late.orderId)).toBe("unfulfillable");
      await confirmPayment(app, late.orderId);
      await settleOutstandingRefunds(app);

      expect(await refundsOf(late.orderId)).toEqual([
        expect.objectContaining({
          amount: 2500,
          status: "succeeded",
          reason: "unfulfillable",
          source: "system",
        }),
      ]);
      expect(providerRefunds(app).slice(before)).toHaveLength(1);
      expect((await orderRow(late.orderId)).refundedAmount).toBe(2500);
      await expectInventoryConsistent(app, event.id);
    });

    it("never open a second refund for a late payment whose first refund failed", async () => {
      const { app, event } = await setup({ capacity: 1 });
      const late = await purchase(app, event, 1, { pay: false });
      app.clock.advance(40 * MINUTE);
      await purchase(app, event, 1);

      app.gateway.pay(app.gateway.sessionOf(late.orderId)!.id);
      app.gateway.failNextRefund();
      await confirmPayment(app, late.orderId);
      expect(await refundsOf(late.orderId)).toEqual([
        expect.objectContaining({ status: "failed" }),
      ]);

      // Every later pass works on that one refund instead of adding another beside it.
      await confirmPayment(app, late.orderId);
      await settleOutstandingRefunds(app);
      app.clock.advance(61 * MINUTE);
      await settleOutstandingRefunds(app);
      await settleOutstandingRefunds(app);

      expect(await refundsOf(late.orderId)).toEqual([
        expect.objectContaining({ status: "succeeded", amount: 1250, retries: 1 }),
      ]);
      expect((await orderRow(late.orderId)).refundedAmount).toBe(1250);
    });

    it("refund every paid order when an event is cancelled, and close everything still open", async () => {
      const { app, org, event } = await setup({ capacity: 20 });
      const paid = [await purchase(app, event, 2), await purchase(app, event, 1)];
      const paying = await purchase(app, event, 1, { pay: false });
      const browsing = buyer();
      await setCart(app, browsing, event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 3 }]);
      const before = providerRefunds(app).length;

      await cancelEvent(app, await admin(org), event.id, "Storm");
      expect(await refundCancelledEvent(app, event.id)).toBe(0);

      for (const order of paid) {
        expect((await orderRow(order.orderId)).refundedAmount).toBe(1250 * order.ticketIds.length);
        expect(await refundsOf(order.orderId)).toEqual([
          expect.objectContaining({ reason: "event_cancelled", status: "succeeded" }),
        ]);
      }
      expect(
        (await app.db.select().from(tickets).where(eq(tickets.eventId, event.id))).every(
          (ticket) => ticket.status === "void",
        ),
      ).toBe(true);
      // The open payment page can no longer be paid, and the carts are gone.
      expect((await orderRow(paying.orderId)).status).toBe("cancelled");
      expect(app.gateway.pay(app.gateway.sessionOf(paying.orderId)!.id)).toBe(false);
      const open = await app.db.select().from(holds).where(eq(holds.eventId, event.id));
      expect(open.filter((hold) => hold.status === "active")).toEqual([]);
      expect(await typeRow(event.ticketTypeId)).toMatchObject({ qtySold: 0, qtyHeld: 0 });

      // Running it again changes nothing.
      expect(await refundCancelledEvent(app, event.id)).toBe(0);
      await settleOutstandingRefunds(app);
      expect(providerRefunds(app).slice(before)).toHaveLength(2);
    });

    it("do nothing for an event that is not cancelled", async () => {
      const { app, event } = await setup();
      const order = await purchase(app, event, 1);
      expect(await refundCancelledEvent(app, event.id)).toBe(0);
      expect(await refundsOf(order.orderId)).toEqual([]);
    });

    it("are sent again later when they fail, without ever paying twice", async () => {
      const { app, org, event } = await setup();
      const order = await purchase(app, event, 2);
      await cancelEvent(app, await admin(org), event.id, undefined);
      const before = providerRefunds(app).length;

      app.gateway.failNextRefund();
      expect(await refundCancelledEvent(app, event.id)).toBe(1);
      expect((await orderRow(order.orderId)).refundedAmount).toBe(0);

      await settleOutstandingRefunds(app); // too soon: left alone
      expect((await refundsOf(order.orderId))[0]!.status).toBe("failed");
      app.clock.advance(61 * MINUTE);
      await settleOutstandingRefunds(app);
      await settleOutstandingRefunds(app);

      expect(await refundsOf(order.orderId)).toEqual([
        expect.objectContaining({ status: "succeeded", retries: 1 }),
      ]);
      expect((await orderRow(order.orderId)).refundedAmount).toBe(2500);
      const sent = providerRefunds(app).slice(before);
      expect(sent.filter((refund) => refund.result.status === "succeeded")).toHaveLength(1);
    });
  });
});
