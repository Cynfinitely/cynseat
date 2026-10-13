import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createOrg, createPublishedEvent } from "../../../../tests/integration/fixtures";
import { expectInventoryConsistent } from "../../../../tests/integration/invariants";
import { codeOf, setupTestApp, type TestApp } from "../../../../tests/integration/test-app";
import { orders, orgProfiles, paymentEvents, tickets, ticketTypes } from "../../db/schema";
import { startCheckout } from "../checkout/service";
import { setCart } from "../inventory/service";
import {
  handleGatewayEvent,
  paymentStatusOf,
  reconcilePendingOrders,
  refreshPaymentStatus,
  startPaymentOnboarding,
} from "./service";

const MINUTE = 60_000;

async function pendingOrder(
  app: TestApp,
  event: { id: string; ticketTypeId: string },
  quantity = 2,
) {
  const who = { sessionId: randomUUID(), userId: null };
  await setCart(app, who, event.id, [{ ticketTypeId: event.ticketTypeId, quantity }]);
  const started = await startCheckout(app, who, {
    eventId: event.id,
    email: "buyer@example.com",
    name: "Aino",
    locale: "en",
  });
  const session = app.gateway.sessionOf(started.orderId)!;
  return { orderId: started.orderId, session };
}

describe("payments", () => {
  const getApp = setupTestApp();
  const orderRow = async (id: string) => {
    const [row] = await getApp().db.select().from(orders).where(eq(orders.id, id));
    return row!;
  };
  const ticketCount = async (orderId: string) =>
    (await getApp().db.select().from(tickets).where(eq(tickets.orderId, orderId))).length;
  const completed = (
    app: TestApp,
    order: Awaited<ReturnType<typeof pendingOrder>>,
    overrides = {},
  ) =>
    app.gateway.parseEvent(
      ...(Object.values(
        app.gateway.notification({
          type: "checkout.session.completed",
          accountId: order.session.accountId,
          checkoutSessionId: order.session.id,
          orderId: order.orderId,
          ...overrides,
        }),
      ) as [string, string]),
    );

  describe("connecting a payment account", () => {
    it("takes an approved organization from nothing to ready", async () => {
      const app = getApp();
      const org = await createOrg(app, { payments: false });
      expect(paymentStatusOf((await org.as(org.admin)).profile).state).toBe("none");

      const link = await startPaymentOnboarding(app, await org.as(org.admin), "fi");
      const ctx = await org.as(org.admin);
      expect(paymentStatusOf(ctx.profile)).toEqual({
        state: "incomplete",
        accountId: `acct_fake_${org.id}`,
      });
      expect(link.url).toBe(`http://localhost:3000/fi/dashboard/${org.slug}/payments?returned=1`);

      // Returning from the form proves nothing until the provider confirms it.
      await refreshPaymentStatus(app, ctx);
      expect(paymentStatusOf((await org.as(org.admin)).profile).state).toBe("incomplete");

      app.gateway.setAccount(ctx.profile.stripeAccountId!, {
        chargesEnabled: true,
        detailsSubmitted: true,
      });
      await refreshPaymentStatus(app, ctx);
      expect(paymentStatusOf((await org.as(org.admin)).profile).state).toBe("ready");
    });

    it("creates one account however many admins click at once", async () => {
      const app = getApp();
      const org = await createOrg(app, { payments: false });
      const ctx = await org.as(org.admin);
      await Promise.all([1, 2, 3].map(() => startPaymentOnboarding(app, ctx, "en")));
      expect([...app.gateway.accounts.keys()].filter((id) => id.endsWith(org.id))).toHaveLength(1);
    });

    it("is for admins of approved organizations", async () => {
      const app = getApp();
      const org = await createOrg(app, { payments: false });
      const pending = await createOrg(app, { approved: false, payments: false });

      expect(
        await codeOf(async () => startPaymentOnboarding(app, await org.as(org.member), "en")),
      ).toBe("FORBIDDEN");
      expect(
        await codeOf(async () =>
          startPaymentOnboarding(app, await pending.as(pending.admin), "en"),
        ),
      ).toBe("CONFLICT");
      expect(app.gateway.accounts.has(`acct_fake_${pending.id}`)).toBe(false);
    });

    it("follows the provider when an account stops being able to take payments", async () => {
      const app = getApp();
      const org = await createOrg(app, { payments: false });
      await startPaymentOnboarding(app, await org.as(org.admin), "en");
      const accountId = `acct_fake_${org.id}`;
      const event = (state: boolean) => {
        app.gateway.setAccount(accountId, { chargesEnabled: state });
        const { body, signature } = app.gateway.notification({
          type: "account.updated",
          accountId,
          checkoutSessionId: null,
          orderId: null,
        });
        return handleGatewayEvent(app, app.gateway.parseEvent(body, signature));
      };

      await event(true);
      expect((await org.as(org.admin)).profile.stripeChargesEnabled).toBe(true);
      await event(false);
      expect((await org.as(org.admin)).profile.stripeChargesEnabled).toBe(false);
    });
  });

  describe("payment notifications", () => {
    it("issue tickets once, even when delivered several times at once", async () => {
      const app = getApp();
      const event = await createPublishedEvent(app, await createOrg(app));
      const order = await pendingOrder(app, event, 3);
      app.gateway.pay(order.session.id);

      await Promise.all([1, 2, 3, 4].map(() => handleGatewayEvent(app, completed(app, order))));
      const again = completed(app, order);
      await handleGatewayEvent(app, again);
      await handleGatewayEvent(app, again);

      expect((await orderRow(order.orderId)).status).toBe("paid");
      expect(await ticketCount(order.orderId)).toBe(3);
      await expectInventoryConsistent(app, event.id);
    });

    it("do not issue tickets on the notification's word alone", async () => {
      const app = getApp();
      const event = await createPublishedEvent(app, await createOrg(app));
      const order = await pendingOrder(app, event);

      // Says "completed", but the provider's own record is still unpaid.
      await handleGatewayEvent(app, completed(app, order));
      expect((await orderRow(order.orderId)).status).toBe("pending");
      expect(await ticketCount(order.orderId)).toBe(0);
    });

    it("ignore events from an account that is not the order's", async () => {
      const app = getApp();
      const event = await createPublishedEvent(app, await createOrg(app));
      const order = await pendingOrder(app, event);
      app.gateway.pay(order.session.id);

      await handleGatewayEvent(app, completed(app, order, { accountId: "acct_someone_else" }));
      await handleGatewayEvent(
        app,
        completed(app, order, { accountId: "acct_someone_else", checkoutSessionId: "cs_other" }),
      );
      expect((await orderRow(order.orderId)).status).toBe("pending");
      expect(await ticketCount(order.orderId)).toBe(0);
    });

    it("recover an order whose payment page was never recorded", async () => {
      const app = getApp();
      const event = await createPublishedEvent(app, await createOrg(app));
      const order = await pendingOrder(app, event);
      // As if the server had stopped right after the provider created the page.
      await app.db
        .update(orders)
        .set({ stripeCheckoutSessionId: null })
        .where(eq(orders.id, order.orderId));
      app.gateway.pay(order.session.id);

      await handleGatewayEvent(app, completed(app, order));
      expect(await orderRow(order.orderId)).toMatchObject({
        status: "paid",
        stripeCheckoutSessionId: order.session.id,
      });
    });

    it("release the tickets when the payment page expires", async () => {
      const app = getApp();
      const event = await createPublishedEvent(app, await createOrg(app));
      const order = await pendingOrder(app, event);
      app.gateway.tamper(order.session.id, { status: "expired" });

      await handleGatewayEvent(app, completed(app, order, { type: "checkout.session.expired" }));
      expect((await orderRow(order.orderId)).status).toBe("expired");
      const [type] = await app.db
        .select()
        .from(ticketTypes)
        .where(eq(ticketTypes.id, event.ticketTypeId));
      expect(type).toMatchObject({ qtyHeld: 0, qtySold: 0 });
    });

    it("are retried after a failure instead of being skipped as already seen", async () => {
      const app = getApp();
      const event = await createPublishedEvent(app, await createOrg(app));
      const order = await pendingOrder(app, event);
      app.gateway.pay(order.session.id);
      const notification = completed(app, order);

      const working = app.gateway.getCheckout;
      app.gateway.getCheckout = async () => {
        throw new Error("provider unavailable");
      };
      try {
        await expect(handleGatewayEvent(app, notification)).rejects.toThrow("provider unavailable");
      } finally {
        app.gateway.getCheckout = working;
      }
      const logged = async () =>
        (
          await app.db.select().from(paymentEvents).where(eq(paymentEvents.id, notification.id))
        )[0]!;
      expect(await logged()).toMatchObject({
        processedAt: null,
        attempts: 1,
        lastError: "provider unavailable",
      });
      expect(await ticketCount(order.orderId)).toBe(0);

      await handleGatewayEvent(app, notification);
      expect(await logged()).toMatchObject({ attempts: 2, lastError: null });
      expect((await logged()).processedAt).not.toBeNull();
      expect(await ticketCount(order.orderId)).toBe(2);
    });

    it("are refused when the signature does not verify", () => {
      const app = getApp();
      const { body, signature } = app.gateway.notification({
        type: "checkout.session.completed",
        accountId: "acct_x",
        checkoutSessionId: "cs_x",
        orderId: null,
      });
      expect(() => app.gateway.parseEvent(body, null)).toThrow();
      expect(() => app.gateway.parseEvent(body.replace("acct_x", "acct_y"), signature)).toThrow();
      expect(() => app.gateway.parseEvent(body, "00".repeat(32))).toThrow();
    });
  });

  it("settles orders whose notification never arrived", async () => {
    const app = getApp();
    const org = await createOrg(app);
    const event = await createPublishedEvent(app, org, { ticket: { capacity: 10 } });
    const paid = await pendingOrder(app, event);
    const abandoned = await pendingOrder(app, event);
    const stillOpen = await pendingOrder(app, event);
    app.gateway.pay(paid.session.id);
    app.gateway.tamper(abandoned.session.id, { status: "expired" });

    // Nothing of ours is overdue yet, so the first pass leaves all three alone.
    await reconcilePendingOrders(app);
    expect((await orderRow(paid.orderId)).status).toBe("pending");
    app.clock.advance(32 * MINUTE);
    expect(await reconcilePendingOrders(app)).toBeGreaterThanOrEqual(2);

    expect((await orderRow(paid.orderId)).status).toBe("paid");
    expect((await orderRow(abandoned.orderId)).status).toBe("expired");
    expect((await orderRow(stillOpen.orderId)).status).toBe("pending");
    const [profile] = await app.db
      .select()
      .from(orgProfiles)
      .where(eq(orgProfiles.organizationId, org.id));
    expect(profile!.stripeAccountId).toBe(paid.session.accountId);
    await expectInventoryConsistent(app, event.id);
  });
});
