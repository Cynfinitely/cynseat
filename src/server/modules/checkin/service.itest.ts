import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ticketCode } from "../../../domain/tokens/tokens";
import {
  createOrg,
  createPublishedEvent,
  type TestOrg,
} from "../../../../tests/integration/fixtures";
import { codeOf, setupTestApp, type TestApp } from "../../../../tests/integration/test-app";
import { checkIns, tickets } from "../../db/schema";
import { getOrderByToken, startCheckout } from "../checkout/service";
import { setCart } from "../inventory/service";
import { getCheckInProgress, scanTicket, undoCheckIn } from "./service";

type Event = Awaited<ReturnType<typeof createPublishedEvent>>;

/** Buys free tickets and returns their QR code contents. */
async function buy(app: TestApp, event: Event, quantity = 2) {
  const who = { sessionId: randomUUID(), userId: null };
  await setCart(app, who, event.id, [{ ticketTypeId: event.ticketTypeId, quantity }]);
  const started = await startCheckout(app, who, {
    eventId: event.id,
    email: `${randomUUID()}@example.com`,
    name: "Aino Buyer",
    locale: "en",
  });
  const order = (await getOrderByToken(app, started.accessToken, "en"))!;
  return order.tickets.map((ticket) => ({ id: ticket.id, code: ticket.code! }));
}

describe("check-in", () => {
  const getApp = setupTestApp();
  const setup = async (): Promise<{ app: TestApp; org: TestOrg; event: Event }> => {
    const app = getApp();
    const org = await createOrg(app);
    const event = await createPublishedEvent(app, org, { ticket: { price: "0", capacity: 100 } });
    return { app, org, event };
  };
  const scan = (app: TestApp, org: TestOrg, eventId: string, code: string, scanId = randomUUID()) =>
    org.as(org.door).then((ctx) => scanTicket(app, ctx, eventId, { code, scanId }));

  it("admits a valid ticket once and names the holder", async () => {
    const { app, org, event } = await setup();
    const [ticket] = await buy(app, event);

    const first = await scan(app, org, event.id, ticket!.code);
    expect(first).toMatchObject({
      result: "accepted",
      ticket: { id: ticket!.id, description: "Standard", buyerName: "Aino Buyer" },
    });
    const second = await scan(app, org, event.id, ticket!.code);
    expect(second.result).toBe("duplicate");
    expect(second.ticket?.checkedInAt?.getTime()).toBe(first.ticket?.checkedInAt?.getTime());
    expect(await getCheckInProgress(app, await org.as(org.door), event.id)).toEqual({
      checkedIn: 1,
      total: 2,
    });
  });

  it("lets exactly one of several simultaneous scanners admit the same ticket", async () => {
    const { app, org, event } = await setup();
    const [ticket] = await buy(app, event, 1);

    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () => scan(app, org, event.id, ticket!.code)),
    );

    expect(outcomes.filter((outcome) => outcome.result === "accepted")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.result === "duplicate")).toHaveLength(11);
    const log = await app.db.select().from(checkIns).where(eq(checkIns.ticketId, ticket!.id));
    expect(log.filter((row) => row.result === "accepted")).toHaveLength(1);
  });

  it("gives a retried scan the same answer instead of a false 'already used'", async () => {
    const { app, org, event } = await setup();
    const [ticket] = await buy(app, event, 1);
    const scanId = randomUUID();

    const [first, retry, lateRetry] = [
      await scan(app, org, event.id, ticket!.code, scanId),
      await scan(app, org, event.id, ticket!.code, scanId),
      await scan(app, org, event.id, ticket!.code, scanId),
    ];
    expect([first.result, retry.result, lateRetry.result]).toEqual([
      "accepted",
      "accepted",
      "accepted",
    ]);
    // A different device scanning the same ticket afterwards is still refused.
    expect((await scan(app, org, event.id, ticket!.code)).result).toBe("duplicate");
  });

  it("rejects forged, garbled and reissued codes without saying which", async () => {
    const { app, org, event } = await setup();
    const [ticket] = await buy(app, event, 1);
    const forged = ticketCode("not-the-real-secret-0123456789abcdef", ticket!.id, 1);
    const unknown = ticketCode("test-signing-secret-0123456789abcdef", randomUUID(), 1);

    for (const code of [
      "",
      "hello",
      forged,
      unknown,
      ticket!.code.slice(0, -2),
      `${ticket!.code}x`,
    ]) {
      expect(await scan(app, org, event.id, code), code).toEqual({
        result: "not_found",
        ticket: null,
      });
    }

    // Reissuing a ticket kills the old code and makes a new one.
    await app.db.update(tickets).set({ tokenVersion: 2 }).where(eq(tickets.id, ticket!.id));
    expect((await scan(app, org, event.id, ticket!.code)).result).toBe("not_found");
    const reissued = ticketCode("test-signing-secret-0123456789abcdef", ticket!.id, 2);
    expect((await scan(app, org, event.id, reissued)).result).toBe("accepted");
  });

  it("refuses void tickets and tickets for another event", async () => {
    const { app, org, event } = await setup();
    const other = await createPublishedEvent(app, org, {
      event: { title: "Other" },
      ticket: { price: "0" },
    });
    const [voided] = await buy(app, event, 1);
    const [elsewhere] = await buy(app, other, 1);
    await app.db.update(tickets).set({ status: "void" }).where(eq(tickets.id, voided!.id));

    expect((await scan(app, org, event.id, voided!.code)).result).toBe("void");
    expect(await scan(app, org, event.id, elsewhere!.code)).toEqual({
      result: "wrong_event",
      ticket: null,
    });
    // The right door still works.
    expect((await scan(app, org, other.id, elsewhere!.code)).result).toBe("accepted");
  });

  it("treats another organization's ticket as unknown and leaves it unused", async () => {
    const { app, org, event } = await setup();
    const rival = await createOrg(app);
    const rivalEvent = await createPublishedEvent(app, rival, { ticket: { price: "0" } });
    const [theirs] = await buy(app, rivalEvent, 1);
    const [ours] = await buy(app, event, 1);

    expect(await scan(app, org, event.id, theirs!.code)).toEqual({
      result: "not_found",
      ticket: null,
    });
    // A scanner cannot be pointed at another organization's event either.
    expect(await codeOf(() => scan(app, org, rivalEvent.id, theirs!.code))).toBe("NOT_FOUND");
    expect(await codeOf(() => scan(app, rival, event.id, ours!.code))).toBe("NOT_FOUND");
    expect((await scan(app, rival, rivalEvent.id, theirs!.code)).result).toBe("accepted");
  });

  it("can be undone by an admin only, after which the ticket works again", async () => {
    const { app, org, event } = await setup();
    const [ticket] = await buy(app, event, 1);
    await scan(app, org, event.id, ticket!.code);

    expect(
      await codeOf(async () => undoCheckIn(app, await org.as(org.door), event.id, ticket!.id)),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(async () => undoCheckIn(app, await org.as(org.member), event.id, ticket!.id)),
    ).toBe("FORBIDDEN");
    await undoCheckIn(app, await org.as(org.admin), event.id, ticket!.id);
    expect(
      await codeOf(async () => undoCheckIn(app, await org.as(org.admin), event.id, ticket!.id)),
    ).toBe("NOT_FOUND");
    expect((await scan(app, org, event.id, ticket!.code)).result).toBe("accepted");
  });

  it("records every attempt, including the refused ones", async () => {
    const { app, org, event } = await setup();
    const [ticket] = await buy(app, event, 1);
    await scan(app, org, event.id, ticket!.code);
    await scan(app, org, event.id, ticket!.code);
    await scan(app, org, event.id, "garbage");

    const log = await app.db.select().from(checkIns).where(eq(checkIns.eventId, event.id));
    expect(log.map((row) => row.result).sort()).toEqual(["accepted", "duplicate", "not_found"]);
    expect(log.every((row) => row.scannedBy === org.door.actor.userId)).toBe(true);
  });

  it("shows on the buyer's order page", async () => {
    const { app, org, event } = await setup();
    const who = { sessionId: randomUUID(), userId: null };
    await setCart(app, who, event.id, [{ ticketTypeId: event.ticketTypeId, quantity: 1 }]);
    const started = await startCheckout(app, who, {
      eventId: event.id,
      email: "a@example.com",
      name: "Aino",
      locale: "en",
    });
    const before = (await getOrderByToken(app, started.accessToken, "en"))!;
    expect(before.tickets[0]!.checkedInAt).toBeNull();

    await scan(app, org, event.id, before.tickets[0]!.code!);
    const after = (await getOrderByToken(app, started.accessToken, "en"))!;
    expect(after.tickets[0]!.checkedInAt).not.toBeNull();
  });
});
