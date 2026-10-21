import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createOrg, createPublishedEvent } from "../../../../tests/integration/fixtures";
import { setupTestApp, type TestApp } from "../../../../tests/integration/test-app";
import { events, orders, outboxJobs, tickets } from "../../db/schema";
import { getOrderByToken, startCheckout } from "../checkout/service";
import { setCart } from "../inventory/service";
import { ANONYMIZED_EMAIL, applyRetention } from "./service";

const DAY = 86_400_000;
const policy = { personalDataDays: 365, sentEmailDays: 30, paymentEventDays: 90 };

async function buy(app: TestApp, event: { id: string; ticketTypeId: string }) {
  const who = { sessionId: randomUUID(), userId: null };
  await setCart(app, who, event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 2 }]);
  return startCheckout(app, who, {
    eventId: event.id,
    email: `${randomUUID()}@example.com`,
    name: "Aino Buyer",
    locale: "en",
  });
}

describe("data retention", () => {
  const getApp = setupTestApp();

  it("erases buyers of events long past, and keeps everything bookkeeping needs", async () => {
    const app = getApp();
    const org = await createOrg(app);
    const old = await createPublishedEvent(app, org, { ticket: { price: "0" } });
    const recent = await createPublishedEvent(app, org, {
      event: { title: "Recent" },
      ticket: { price: "0" },
    });
    const oldOrder = await buy(app, old);
    const recentOrder = await buy(app, recent);
    await app.db
      .update(events)
      .set({ startsAt: new Date(Date.now() - 400 * DAY), endsAt: null })
      .where(eq(events.id, old.id));

    await applyRetention(app, policy);
    await applyRetention(app, policy); // nothing more the second time

    const [erased] = await app.db.select().from(orders).where(eq(orders.id, oldOrder.orderId));
    expect(erased).toMatchObject({
      email: ANONYMIZED_EMAIL,
      buyerName: "",
      userId: null,
      status: "paid",
    });
    expect(
      await app.db.select().from(tickets).where(eq(tickets.orderId, oldOrder.orderId)),
    ).toHaveLength(2);
    // The order link still opens: the buyer just is not named any more.
    expect((await getOrderByToken(app, oldOrder.accessToken, "en"))?.buyerName).toBe("");

    const [kept] = await app.db.select().from(orders).where(eq(orders.id, recentOrder.orderId));
    expect(kept!.email).not.toBe(ANONYMIZED_EMAIL);
  });

  it("clears sent emails after a while, but never ones still waiting to go", async () => {
    const app = getApp();
    const org = await createOrg(app);
    const event = await createPublishedEvent(app, org, { ticket: { price: "0" } });
    await buy(app, event);
    const before = await app.db.select().from(outboxJobs);
    expect(before.some((job) => job.status === "done")).toBe(true);

    app.clock.advance(31 * DAY);
    const result = await applyRetention(app, policy);
    expect(result.emails).toBeGreaterThan(0);
    const after = await app.db.select().from(outboxJobs);
    expect(after.every((job) => job.status !== "done")).toBe(true);
  });
});
