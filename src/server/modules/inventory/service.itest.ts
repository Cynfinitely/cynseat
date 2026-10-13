import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createOrg,
  createPublishedEvent,
  eventInput,
  ticketInput,
} from "../../../../tests/integration/fixtures";
import { expectInventoryConsistent } from "../../../../tests/integration/invariants";
import { codeOf, createUser, setupTestApp } from "../../../../tests/integration/test-app";
import { events, holds, ticketTypes } from "../../db/schema";
import { cancelEvent, createEvent, createTicketType } from "../events/service";
import { reviewOrganization } from "../orgs/service";
import { getCart, setCart, sweepExpiredHolds, type Buyer } from "./service";

const buyer = (): Buyer => ({ sessionId: randomUUID(), userId: null });
const MINUTE = 60_000;

describe("ticket holds", () => {
  const getApp = setupTestApp();
  const typeRow = async (id: string) => {
    const [row] = await getApp().db.select().from(ticketTypes).where(eq(ticketTypes.id, id));
    return row!;
  };
  const failure = (fn: () => Promise<unknown>) =>
    fn().then(
      () => null,
      (error: unknown) => error,
    );

  it("reserves tickets and treats each request as the cart's new contents", async () => {
    const app = getApp();
    const org = await createOrg(app);
    const event = await createPublishedEvent(app, org, {
      ticket: { price: "12,50", capacity: 20 },
    });
    const me = buyer();
    const line = (quantity: number) => [{ ticketTypeId: event.ticketTypeId, quantity }];

    const cart = await setCart(app, me, event.id, line(2));
    expect(cart).toMatchObject({
      totalQuantity: 2,
      totalAmount: 2500,
      currency: "eur",
      phase: "cart",
    });
    expect(cart!.expiresAt.getTime() - app.clock.now().getTime()).toBeGreaterThan(9 * MINUTE);

    // Sending the same cart again, or a different quantity, never adds on top.
    await setCart(app, me, event.id, line(2));
    expect((await typeRow(event.ticketTypeId)).qtyHeld).toBe(2);
    await setCart(app, me, event.id, line(5));
    expect((await typeRow(event.ticketTypeId)).qtyHeld).toBe(5);
    await setCart(app, me, event.id, line(1));
    expect((await typeRow(event.ticketTypeId)).qtyHeld).toBe(1);
    expect(await getCart(app, me, event.id)).toMatchObject({
      holdId: cart!.holdId,
      totalQuantity: 1,
    });

    expect(await setCart(app, me, event.id, line(0))).toBeNull();
    expect((await typeRow(event.ticketTypeId)).qtyHeld).toBe(0);
    expect(await getCart(app, me, event.id)).toBeNull();
    await expectInventoryConsistent(app, event.id);
  });

  it("never sells more than exist when fifty buyers race for ten tickets", async () => {
    const app = getApp();
    const org = await createOrg(app);
    const event = await createPublishedEvent(app, org, { ticket: { capacity: 10 } });

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        codeOf(() =>
          setCart(app, buyer(), event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 1 }]),
        ),
      ),
    );

    expect(results.filter((code) => code === "none")).toHaveLength(10);
    expect(results.filter((code) => code === "CONFLICT")).toHaveLength(40);
    expect((await typeRow(event.ticketTypeId)).qtyHeld).toBe(10);
    await expectInventoryConsistent(app, event.id);
  });

  it("gives whole carts or nothing when buyers want several tickets each", async () => {
    const app = getApp();
    const org = await createOrg(app);
    const event = await createPublishedEvent(app, org, { ticket: { capacity: 10 } });

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        codeOf(() =>
          setCart(app, buyer(), event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 3 }]),
        ),
      ),
    );

    // Three carts of three fit in ten; the tenth ticket is left for someone who wants one.
    expect(results.filter((code) => code === "none")).toHaveLength(3);
    expect((await typeRow(event.ticketTypeId)).qtyHeld).toBe(9);
    await setCart(app, buyer(), event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 1 }]);
    expect(
      await codeOf(() =>
        setCart(app, buyer(), event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 1 }]),
      ),
    ).toBe("CONFLICT");
    await expectInventoryConsistent(app, event.id);
  });

  it("leaves the cart untouched when one of several ticket types is sold out", async () => {
    const app = getApp();
    const org = await createOrg(app);
    const event = await createPublishedEvent(app, org, { ticket: { capacity: 10 } });
    const vip = await createTicketType(
      app,
      await org.as(org.admin),
      event.id,
      ticketInput({ name: "VIP", capacity: 1 }),
    );
    const me = buyer();
    await setCart(app, me, event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 1 }]);

    const error = await failure(() =>
      setCart(app, me, event.id, [
        { ticketTypeId: event.ticketTypeId, quantity: 4 },
        { ticketTypeId: vip.id, quantity: 2 },
      ]),
    );

    expect(error).toMatchObject({
      code: "CONFLICT",
      reason: "sold_out",
      fields: { [vip.id]: "sold_out" },
    });
    expect((await typeRow(event.ticketTypeId)).qtyHeld).toBe(1);
    expect((await typeRow(vip.id)).qtyHeld).toBe(0);
    expect(await getCart(app, me, event.id)).toMatchObject({ totalQuantity: 1 });
  });

  it("keeps one cart per buyer when their requests overlap", async () => {
    const app = getApp();
    const org = await createOrg(app);
    const event = await createPublishedEvent(app, org, { ticket: { capacity: 100 } });
    const me = buyer();

    await Promise.all(
      [1, 2, 3, 4, 5, 6].map((quantity) =>
        setCart(app, me, event.id, [{ ticketTypeId: event.ticketTypeId, quantity }]),
      ),
    );

    const active = await app.db.select().from(holds).where(eq(holds.buyerSessionId, me.sessionId));
    expect(active.filter((hold) => hold.status === "active")).toHaveLength(1);
    const cart = await getCart(app, me, event.id);
    expect((await typeRow(event.ticketTypeId)).qtyHeld).toBe(cart!.totalQuantity);
    await expectInventoryConsistent(app, event.id);
  });

  it("enforces the per-order and per-type limits", async () => {
    const app = getApp();
    const org = await createOrg(app);
    const event = await createPublishedEvent(app, org, { ticket: { capacity: 100 } });
    const limited = await createTicketType(
      app,
      await org.as(org.admin),
      event.id,
      ticketInput({ name: "Limited", maxPerOrder: 2 }),
    );

    expect(
      await failure(() =>
        setCart(app, buyer(), event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 11 }]),
      ),
    ).toMatchObject({ reason: "too_many_tickets", fields: { max: "10" } });
    expect(
      await failure(() =>
        setCart(app, buyer(), event.id, [{ ticketTypeId: limited.id, quantity: 3 }]),
      ),
    ).toMatchObject({ reason: "too_many_tickets", fields: { max: "2" } });
    for (const quantity of [-1, 1.5, 51]) {
      expect(
        await codeOf(() =>
          setCart(app, buyer(), event.id, [{ ticketTypeId: event.ticketTypeId, quantity }]),
        ),
      ).toBe("VALIDATION");
    }
    await expectInventoryConsistent(app, event.id);
  });

  describe("expiry", () => {
    it("returns tickets to sale once a cart has run out, without waiting for any sweep", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const event = await createPublishedEvent(app, org, { ticket: { capacity: 2 } });
      const [first, second] = [buyer(), buyer()];
      const line = [{ ticketTypeId: event.ticketTypeId, quantity: 2 }];

      await setCart(app, first, event.id, line);
      expect(await codeOf(() => setCart(app, second, event.id, line))).toBe("CONFLICT");

      app.clock.advance(9 * MINUTE);
      expect(await codeOf(() => setCart(app, second, event.id, line))).toBe("CONFLICT");
      app.clock.advance(2 * MINUTE);

      expect(await getCart(app, first, event.id)).toBeNull();
      expect(await setCart(app, second, event.id, line)).toMatchObject({ totalQuantity: 2 });
      expect((await typeRow(event.ticketTypeId)).qtyHeld).toBe(2);
      await expectInventoryConsistent(app, event.id);
    });

    it("does not let a buyer keep tickets by editing an expired cart", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const event = await createPublishedEvent(app, org, { ticket: { capacity: 5 } });
      const me = buyer();
      const first = await setCart(app, me, event.id, [
        { ticketTypeId: event.ticketTypeId, quantity: 5 },
      ]);

      app.clock.advance(11 * MINUTE);
      const fresh = await setCart(app, me, event.id, [
        { ticketTypeId: event.ticketTypeId, quantity: 1 },
      ]);

      expect(fresh!.holdId).not.toBe(first!.holdId);
      expect((await typeRow(event.ticketTypeId)).qtyHeld).toBe(1);
      await expectInventoryConsistent(app, event.id);
    });

    it("gives tickets back exactly once when sweeps and buyers overlap", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const event = await createPublishedEvent(app, org, { ticket: { capacity: 30 } });
      const line = [{ ticketTypeId: event.ticketTypeId, quantity: 1 }];
      await Promise.all(Array.from({ length: 30 }, () => setCart(app, buyer(), event.id, line)));
      expect((await typeRow(event.ticketTypeId)).qtyHeld).toBe(30);

      app.clock.advance(11 * MINUTE);
      const results = await Promise.all([
        ...Array.from({ length: 6 }, () => sweepExpiredHolds(app).then(() => "none")),
        ...Array.from({ length: 12 }, () => codeOf(() => setCart(app, buyer(), event.id, line))),
      ]);

      expect(results.every((code) => code === "none")).toBe(true);
      expect((await typeRow(event.ticketTypeId)).qtyHeld).toBe(12);
      await expectInventoryConsistent(app, event.id);
    });
  });

  describe("what cannot be put in a cart", () => {
    it("tickets for events that are not on sale", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const published = await createPublishedEvent(app, org);
      const line = [{ ticketTypeId: published.ticketTypeId, quantity: 1 }];

      const draft = await createEvent(app, ctx, eventInput({ title: "Draft" }));
      const draftType = await createTicketType(app, ctx, draft.id, ticketInput());
      expect(
        await failure(() =>
          setCart(app, buyer(), draft.id, [{ ticketTypeId: draftType.id, quantity: 1 }]),
        ),
      ).toMatchObject({ reason: "not_on_sale" });

      await app.db.update(events).set({ salesPaused: true }).where(eq(events.id, published.id));
      expect(await codeOf(() => setCart(app, buyer(), published.id, line))).toBe("CONFLICT");
      await app.db.update(events).set({ salesPaused: false }).where(eq(events.id, published.id));

      await cancelEvent(app, ctx, published.id, undefined);
      expect(await failure(() => setCart(app, buyer(), published.id, line))).toMatchObject({
        reason: "not_on_sale",
      });
      expect(await codeOf(() => setCart(app, buyer(), randomUUID(), line))).toBe("CONFLICT");
    });

    it("tickets outside their sales window, inactive ones, or another event's", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const event = await createPublishedEvent(app, org);
      const other = await createPublishedEvent(app, org, { event: { title: "Other" } });
      const later = await createTicketType(
        app,
        ctx,
        event.id,
        ticketInput({ name: "Later", salesStartAt: "2029-06-01T10:00" }),
      );
      const closed = await createTicketType(app, ctx, event.id, ticketInput({ name: "Closed" }));
      await app.db
        .update(ticketTypes)
        .set({ salesEndAt: new Date(Date.now() - MINUTE) })
        .where(eq(ticketTypes.id, closed.id));
      const inactive = await createTicketType(app, ctx, event.id, ticketInput({ name: "Off" }));
      await app.db
        .update(ticketTypes)
        .set({ isActive: false })
        .where(eq(ticketTypes.id, inactive.id));

      for (const ticketTypeId of [
        later.id,
        closed.id,
        inactive.id,
        other.ticketTypeId,
        randomUUID(),
      ]) {
        expect(
          await failure(() => setCart(app, buyer(), event.id, [{ ticketTypeId, quantity: 1 }])),
          ticketTypeId,
        ).toMatchObject({ reason: "sold_out" });
      }
      await expectInventoryConsistent(app, event.id);
      await expectInventoryConsistent(app, other.id);
    });

    it("anything from a suspended organization", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const event = await createPublishedEvent(app, org);
      const reviewer = await createUser(app, { platformAdmin: true });
      await reviewOrganization(app, reviewer.actor, {
        organizationId: org.id,
        decision: "suspend",
      });

      expect(
        await failure(() =>
          setCart(app, buyer(), event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 1 }]),
        ),
      ).toMatchObject({ reason: "not_on_sale" });
    });
  });

  it("keeps carts private to the browser session that made them", async () => {
    const app = getApp();
    const org = await createOrg(app);
    const event = await createPublishedEvent(app, org);
    await setCart(app, buyer(), event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 2 }]);
    expect(await getCart(app, buyer(), event.id)).toBeNull();
  });
});
