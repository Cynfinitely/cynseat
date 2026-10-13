import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { parseTicketCode, ticketCodeMatches } from "../../../domain/tokens/tokens";
import { createOrg, createPublishedEvent } from "../../../../tests/integration/fixtures";
import { expectInventoryConsistent } from "../../../../tests/integration/invariants";
import { setupTestApp, type TestApp } from "../../../../tests/integration/test-app";
import { holds, orders, orgProfiles, outboxJobs, tickets, ticketTypes } from "../../db/schema";
import { cancelEvent, saveTranslation } from "../events/service";
import { setCart, sweepExpiredHolds, type Buyer } from "../inventory/service";
import {
  cancelCheckout,
  confirmPayment,
  getOrderByToken,
  PaymentMismatchError,
  startCheckout,
} from "./service";

const SECRET = "test-signing-secret-0123456789abcdef";
const MINUTE = 60_000;
const buyer = (): Buyer => ({ sessionId: randomUUID(), userId: null });
type Event = Awaited<ReturnType<typeof createPublishedEvent>>;

/** Puts tickets in a cart and starts checkout, as the storefront does. */
async function checkout(
  app: TestApp,
  event: Event,
  options: { quantity?: number; email?: string; who?: Buyer } = {},
) {
  const who = options.who ?? buyer();
  await setCart(app, who, event.id, [
    { ticketTypeId: event.ticketTypeId, quantity: options.quantity ?? 2 },
  ]);
  const started = await startCheckout(app, who, {
    eventId: event.id,
    email: options.email ?? `${randomUUID()}@example.com`,
    name: "Aino Buyer",
    locale: "en",
  });
  return { who, started };
}

describe("checkout", () => {
  const getApp = setupTestApp();
  const orderRow = async (id: string) => {
    const [row] = await getApp().db.select().from(orders).where(eq(orders.id, id));
    return row!;
  };
  const ticketsOf = (orderId: string) =>
    getApp().db.select().from(tickets).where(eq(tickets.orderId, orderId));
  const typeRow = async (id: string) => {
    const [row] = await getApp().db.select().from(ticketTypes).where(eq(ticketTypes.id, id));
    return row!;
  };
  const confirmationEmails = async (orderId: string) => {
    const rows = await getApp()
      .db.select()
      .from(outboxJobs)
      .where(eq(outboxJobs.dedupeKey, `order-confirmation:${orderId}`));
    return rows;
  };
  const setup = async (ticket: { price?: string; capacity?: number } = {}) => {
    const app = getApp();
    const org = await createOrg(app);
    const event = await createPublishedEvent(app, org, {
      ticket: { price: "12,50", capacity: 20, ...ticket },
    });
    return { app, org, event };
  };
  const failure = (fn: () => Promise<unknown>) =>
    fn().then(
      () => null,
      (error: unknown) => error,
    );

  describe("free orders", () => {
    it("are completed at once, with tickets and one confirmation email", async () => {
      const { app, event } = await setup({ price: "0" });
      const { started } = await checkout(app, event, { quantity: 3, email: "free@example.com" });

      expect(started.kind).toBe("complete");
      expect(await orderRow(started.orderId)).toMatchObject({
        status: "paid",
        totalAmount: 0,
        paymentProvider: "none",
        stripeAccountId: null,
      });
      expect(await ticketsOf(started.orderId)).toHaveLength(3);
      expect(await typeRow(event.ticketTypeId)).toMatchObject({ qtySold: 3, qtyHeld: 0 });

      const [email] = await confirmationEmails(started.orderId);
      expect(email!.payload).toMatchObject({
        to: "free@example.com",
        template: "orderConfirmation",
        data: { tickets: "3", event: "Bir Masal Gibi Anlat" },
      });
      await expectInventoryConsistent(app, event.id);
    });

    it("are capped per email address for each event", async () => {
      const { app, event } = await setup({ price: "0", capacity: 100 });
      await checkout(app, event, { quantity: 6, email: "Greedy@Example.com" });
      await checkout(app, event, { quantity: 4, email: "greedy@example.com" });

      const who = buyer();
      await setCart(app, who, event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 1 }]);
      const error = await failure(() =>
        startCheckout(app, who, {
          eventId: event.id,
          email: "GREEDY@example.com",
          name: "Aino",
          locale: "en",
        }),
      );
      expect(error).toMatchObject({ code: "CONFLICT", reason: "free_ticket_limit" });
      await expectInventoryConsistent(app, event.id);
    });

    it("do not need the organization to have a payment account", async () => {
      const app = getApp();
      const org = await createOrg(app, { payments: false });
      const event = await createPublishedEvent(app, org, { ticket: { price: "0" } });
      const { started } = await checkout(app, event);
      expect(started.kind).toBe("complete");
    });
  });

  describe("paid orders", () => {
    it("wait for payment: nothing is sold and no ticket exists until the money arrives", async () => {
      const { app, org, event } = await setup();
      const { started } = await checkout(app, event, { quantity: 2 });

      expect(started).toMatchObject({
        kind: "payment",
        url: expect.stringContaining("/pay/cs_fake_"),
      });
      const order = await orderRow(started.orderId);
      const [profile] = await app.db
        .select()
        .from(orgProfiles)
        .where(eq(orgProfiles.organizationId, org.id));
      expect(order).toMatchObject({
        status: "pending",
        totalAmount: 2500,
        currency: "eur",
        paymentProvider: "stripe",
        stripeAccountId: profile!.stripeAccountId,
        applicationFeeAmount: 0,
      });
      expect(await ticketsOf(order.id)).toEqual([]);
      expect(await typeRow(event.ticketTypeId)).toMatchObject({ qtySold: 0, qtyHeld: 2 });

      // The reservation now outlasts the payment page.
      const [hold] = await app.db.select().from(holds).where(eq(holds.id, order.holdId!));
      expect(hold).toMatchObject({ phase: "checkout", status: "active" });
      expect(hold!.expiresAt.getTime()).toBeGreaterThan(order.checkoutExpiresAt!.getTime());
      expect(app.gateway.sessionOf(order.id)?.request).toMatchObject({
        accountId: profile!.stripeAccountId,
        lines: [{ name: "Standard", unitAmount: 1250, quantity: 2 }],
        applicationFeeAmount: 0,
      });
    });

    it("issue tickets once, however many times the payment is confirmed", async () => {
      const { app, event } = await setup();
      const { started } = await checkout(app, event, { quantity: 3 });
      app.gateway.pay(app.gateway.sessionOf(started.orderId)!.id);

      const statuses = await Promise.all(
        Array.from({ length: 10 }, () => confirmPayment(app, started.orderId)),
      );
      await confirmPayment(app, started.orderId);

      expect(new Set(statuses)).toEqual(new Set(["paid"]));
      expect(await ticketsOf(started.orderId)).toHaveLength(3);
      expect(await confirmationEmails(started.orderId)).toHaveLength(1);
      expect(await typeRow(event.ticketTypeId)).toMatchObject({ qtySold: 3, qtyHeld: 0 });
      expect((await orderRow(started.orderId)).stripePaymentIntentId).toMatch(/^pi_fake_/);
      await expectInventoryConsistent(app, event.id);
    });

    it("are completed when the buyer returns before any notification", async () => {
      const { app, event } = await setup();
      const { started } = await checkout(app, event);

      expect((await getOrderByToken(app, started.accessToken, "en"))?.status).toBe("pending");
      app.gateway.pay(app.gateway.sessionOf(started.orderId)!.id);

      const view = await getOrderByToken(app, started.accessToken, "en");
      expect(view).toMatchObject({ status: "paid", totalAmount: 2500 });
      expect(view!.tickets).toHaveLength(2);
    });

    it("charge the price in the database, not anything the buyer saw earlier", async () => {
      const { app, event } = await setup();
      const who = buyer();
      await setCart(app, who, event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 2 }]);
      await app.db
        .update(ticketTypes)
        .set({ priceAmount: 2000 })
        .where(eq(ticketTypes.id, event.ticketTypeId));

      const started = await startCheckout(app, who, {
        eventId: event.id,
        email: "a@example.com",
        name: "Aino",
        locale: "en",
      });
      expect((await orderRow(started.orderId)).totalAmount).toBe(4000);
    });

    it("refuse to issue tickets when the provider's record does not match the order", async () => {
      const { app, event } = await setup();
      const mismatches = [{ amountTotal: 100 }, { currency: "usd" }, { orderId: randomUUID() }];
      for (const mismatch of mismatches) {
        const { started } = await checkout(app, event, { quantity: 1 });
        const session = app.gateway.sessionOf(started.orderId)!;
        app.gateway.pay(session.id);
        app.gateway.tamper(session.id, mismatch);

        await expect(confirmPayment(app, started.orderId)).rejects.toBeInstanceOf(
          PaymentMismatchError,
        );
        expect(await ticketsOf(started.orderId)).toEqual([]);
        expect((await orderRow(started.orderId)).status).toBe("pending");
      }
    });

    it("do not count a completed page as paid unless the money was collected", async () => {
      const { app, event } = await setup();
      const { started } = await checkout(app, event);
      app.gateway.tamper(app.gateway.sessionOf(started.orderId)!.id, {
        status: "complete",
        paid: false,
      });

      expect(await confirmPayment(app, started.orderId)).toBe("pending");
      expect(await ticketsOf(started.orderId)).toEqual([]);
    });

    it("give the same order and payment page to a buyer who clicks twice", async () => {
      const { app, event } = await setup();
      const who = buyer();
      await setCart(app, who, event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 2 }]);
      const input = {
        eventId: event.id,
        email: "a@example.com",
        name: "Aino",
        locale: "en" as const,
      };

      const [first, second] = await Promise.all([
        startCheckout(app, who, input),
        startCheckout(app, who, input),
      ]);
      const third = await startCheckout(app, who, input);

      expect(second.orderId).toBe(first.orderId);
      expect(third).toEqual(first);
      const mine = await app.db.select().from(orders).where(eq(orders.eventId, event.id));
      expect(mine).toHaveLength(1);
      expect((await typeRow(event.ticketTypeId)).qtyHeld).toBe(2);
    });

    it("cannot have their cart changed while the buyer is paying", async () => {
      const { app, event } = await setup();
      const { who } = await checkout(app, event);
      expect(
        await failure(() =>
          setCart(app, who, event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 9 }]),
        ),
      ).toMatchObject({ reason: "checkout_in_progress" });
    });

    it("are refused when the organization cannot take payments or the event is off sale", async () => {
      const { app, org, event } = await setup();
      const who = buyer();
      const input = {
        eventId: event.id,
        email: "a@example.com",
        name: "Aino",
        locale: "en" as const,
      };
      await setCart(app, who, event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 1 }]);

      await app.db
        .update(orgProfiles)
        .set({ stripeChargesEnabled: false })
        .where(eq(orgProfiles.organizationId, org.id));
      expect(await failure(() => startCheckout(app, who, input))).toMatchObject({
        reason: "payments_unavailable",
      });
      expect(await app.db.select().from(orders).where(eq(orders.eventId, event.id))).toEqual([]);

      await app.db
        .update(orgProfiles)
        .set({ stripeChargesEnabled: true })
        .where(eq(orgProfiles.organizationId, org.id));
      await cancelEvent(app, await org.as(org.admin), event.id, undefined);
      expect(await failure(() => startCheckout(app, who, input))).toMatchObject({
        reason: "not_on_sale",
      });
      expect(await failure(() => startCheckout(app, buyer(), input))).toMatchObject({
        reason: "not_on_sale",
      });
    });

    it("carry the platform fee, or the organization's own, fixed at purchase", async () => {
      const { app, org, event } = await setup();
      app.platformFee.bps = 250;
      app.platformFee.fixedMinor = 30;
      try {
        const standard = await checkout(app, event, { quantity: 2 });
        expect((await orderRow(standard.started.orderId)).applicationFeeAmount).toBe(63 + 60);
        expect(app.gateway.sessionOf(standard.started.orderId)?.request.applicationFeeAmount).toBe(
          123,
        );

        await app.db
          .update(orgProfiles)
          .set({ feeBps: 0, feeFixedMinor: 0 })
          .where(eq(orgProfiles.organizationId, org.id));
        const exempt = await checkout(app, event, { quantity: 2 });
        expect((await orderRow(exempt.started.orderId)).applicationFeeAmount).toBe(0);
      } finally {
        app.platformFee.bps = 0;
        app.platformFee.fixedMinor = 0;
      }
    });
  });

  describe("when payment does not go to plan", () => {
    it("puts the tickets back on sale when the payment page expires unpaid", async () => {
      const { app, event } = await setup({ capacity: 2 });
      const { started } = await checkout(app, event, { quantity: 2 });
      app.gateway.tamper(app.gateway.sessionOf(started.orderId)!.id, { status: "expired" });

      expect(await confirmPayment(app, started.orderId)).toBe("expired");
      expect(await confirmPayment(app, started.orderId)).toBe("expired");
      expect(await typeRow(event.ticketTypeId)).toMatchObject({ qtySold: 0, qtyHeld: 0 });
      expect((await checkout(app, event, { quantity: 2 })).started.kind).toBe("payment");
      await expectInventoryConsistent(app, event.id);
    });

    it("honours a payment that arrives after the reservation lapsed, if the tickets are still free", async () => {
      const { app, event } = await setup({ capacity: 5 });
      const { started } = await checkout(app, event, { quantity: 2 });

      app.clock.advance(40 * MINUTE);
      await sweepExpiredHolds(app);
      expect((await orderRow(started.orderId)).status).toBe("expired");
      expect(await typeRow(event.ticketTypeId)).toMatchObject({ qtySold: 0, qtyHeld: 0 });

      app.gateway.pay(app.gateway.sessionOf(started.orderId)!.id);
      expect(await confirmPayment(app, started.orderId)).toBe("paid");
      expect(await ticketsOf(started.orderId)).toHaveLength(2);
      expect(await typeRow(event.ticketTypeId)).toMatchObject({ qtySold: 2, qtyHeld: 0 });
      await expectInventoryConsistent(app, event.id);
    });

    it("marks the order for refund, without overselling, when the tickets have gone to someone else", async () => {
      const { app, event } = await setup({ capacity: 2 });
      const late = await checkout(app, event, { quantity: 2 });

      app.clock.advance(40 * MINUTE);
      const winner = await checkout(app, event, { quantity: 2 });
      app.gateway.pay(app.gateway.sessionOf(winner.started.orderId)!.id);
      expect(await confirmPayment(app, winner.started.orderId)).toBe("paid");

      app.gateway.pay(app.gateway.sessionOf(late.started.orderId)!.id);
      expect(await confirmPayment(app, late.started.orderId)).toBe("unfulfillable");
      expect(await confirmPayment(app, late.started.orderId)).toBe("unfulfillable");

      expect(await ticketsOf(late.started.orderId)).toEqual([]);
      expect(await confirmationEmails(late.started.orderId)).toEqual([]);
      expect(await typeRow(event.ticketTypeId)).toMatchObject({ qtySold: 2, qtyHeld: 0 });
      expect((await orderRow(late.started.orderId)).stripePaymentIntentId).toMatch(/^pi_fake_/);
      await expectInventoryConsistent(app, event.id);
    });

    it("never half-fills an order: partial stock means no tickets at all", async () => {
      const { app, event } = await setup({ capacity: 3 });
      const late = await checkout(app, event, { quantity: 3 });
      app.clock.advance(40 * MINUTE);
      const other = await checkout(app, event, { quantity: 1 });
      app.gateway.pay(app.gateway.sessionOf(other.started.orderId)!.id);
      await confirmPayment(app, other.started.orderId);

      app.gateway.pay(app.gateway.sessionOf(late.started.orderId)!.id);
      expect(await confirmPayment(app, late.started.orderId)).toBe("unfulfillable");
      expect(await typeRow(event.ticketTypeId)).toMatchObject({ qtySold: 1, qtyHeld: 0 });
      await expectInventoryConsistent(app, event.id);
    });

    it("closes the payment page before freeing tickets when the buyer backs out", async () => {
      const { app, event } = await setup({ capacity: 2 });
      const { who, started } = await checkout(app, event, { quantity: 2 });
      const session = app.gateway.sessionOf(started.orderId)!;

      expect(await cancelCheckout(app, who, event.id)).toBe("cancelled");
      expect(app.gateway.pay(session.id)).toBe(false);
      expect(await typeRow(event.ticketTypeId)).toMatchObject({ qtySold: 0, qtyHeld: 0 });
      expect(await cancelCheckout(app, who, event.id)).toBeNull();

      // The buyer can start again with a fresh cart.
      expect((await checkout(app, event, { who, quantity: 1 })).started.kind).toBe("payment");
      await expectInventoryConsistent(app, event.id);
    });

    it("completes the order if the buyer had in fact already paid when they cancel", async () => {
      const { app, event } = await setup();
      const { who, started } = await checkout(app, event, { quantity: 2 });
      app.gateway.pay(app.gateway.sessionOf(started.orderId)!.id);

      expect(await cancelCheckout(app, who, event.id)).toBe("paid");
      expect(await ticketsOf(started.orderId)).toHaveLength(2);
      await expectInventoryConsistent(app, event.id);
    });
  });

  describe("order links", () => {
    it("show the order with working ticket codes, in the reader's language", async () => {
      const { app, org, event } = await setup({ price: "0" });
      await saveTranslation(app, await org.as(org.admin), event.id, {
        locale: "fi",
        title: "Kerro kuin satu",
      });
      const { started } = await checkout(app, event, { quantity: 2, email: "a@example.com" });

      const view = (await getOrderByToken(app, started.accessToken, "fi"))!;
      expect(view).toMatchObject({
        status: "paid",
        email: "a@example.com",
        reference: expect.stringMatching(/^[2-9A-HJKMNP-Z]{8}$/),
        event: { title: "Kerro kuin satu", contentLocale: "fi", timezone: "Europe/Helsinki" },
        items: [{ description: "Standard", quantity: 2 }],
      });
      expect(view.tickets.map((ticket) => ticket.number)).toEqual([1, 2]);
      for (const ticket of view.tickets) {
        const parsed = parseTicketCode(ticket.code!)!;
        expect(parsed.ticketId).toBe(ticket.id);
        expect(ticketCodeMatches(SECRET, parsed, 1)).toBe(true);
      }
      expect(new Set(view.tickets.map((ticket) => ticket.code)).size).toBe(2);
    });

    it("cannot be guessed, and never store the secret itself", async () => {
      const { app, event } = await setup({ price: "0" });
      const { started } = await checkout(app, event);

      for (const token of [
        "",
        "nope",
        started.orderId,
        `${started.accessToken.slice(0, -1)}x`,
        "a".repeat(43),
      ]) {
        expect(await getOrderByToken(app, token, "en"), token).toBeNull();
      }
      const stored = (await orderRow(started.orderId)).accessTokenHash;
      expect(stored.toString("base64url")).not.toBe(started.accessToken);
      expect(stored.toString("utf8")).not.toContain(started.accessToken);
    });
  });
});
