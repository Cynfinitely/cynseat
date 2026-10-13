import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createOrg,
  createSeatedEvent,
  eventInput,
  hallLayout,
  venueInput,
} from "../../../../tests/integration/fixtures";
import { expectInventoryConsistent } from "../../../../tests/integration/invariants";
import { codeOf, setupTestApp, type TestApp } from "../../../../tests/integration/test-app";
import { eventSeats, orders, tickets, ticketTypes } from "../../db/schema";
import { scanTicket } from "../checkin/service";
import { confirmPayment, getOrderByToken, startCheckout } from "../checkout/service";
import { cancelEvent, createEvent, getOrgEvent, setEventVenue } from "../events/service";
import { getCart, setCart, sweepExpiredHolds, type Buyer } from "../inventory/service";
import { refundCancelledEvent, refundOrder } from "../refunds/service";
import { createVenue } from "../venues/service";
import {
  archiveSeatMap,
  attachSeatMap,
  createSeatMap,
  detachSeatMap,
  getEventSeating,
  getPublicSeating,
  getSeatMap,
  getUnavailableSeatIds,
  listSeatMaps,
  saveSeatedTicketType,
  saveSeatMap,
  setSeatsBlocked,
} from "./service";

const MINUTE = 60_000;
type Seated = Awaited<ReturnType<typeof createSeatedEvent>>;
const buyer = (): Buyer => ({ sessionId: randomUUID(), userId: null });
const failure = (fn: () => Promise<unknown>) =>
  fn().then(
    () => null,
    (error: unknown) => error,
  );

/** Holds seats (all at the full stalls or balcony price) and checks out. */
async function buySeats(
  app: TestApp,
  event: Seated,
  seatKeys: string[],
  options: { pay?: boolean; who?: Buyer } = {},
) {
  const who = options.who ?? buyer();
  await setCart(
    app,
    who,
    event.id,
    [],
    seatKeys.map((key) => ({
      seatId: event.seat(key),
      ticketTypeId: key.startsWith("stalls") ? event.types.stalls : event.types.balcony,
    })),
  );
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
  return { who, orderId: started.orderId, token: started.accessToken };
}

describe("seat maps", () => {
  const getApp = setupTestApp();
  const seatStatus = async (seatId: string) =>
    (await getApp().db.select().from(eventSeats).where(eq(eventSeats.id, seatId)))[0]!.status;

  describe("as templates", () => {
    it("belong to the organization that drew them, for a venue anyone can use", async () => {
      const app = getApp();
      const [a, b] = await Promise.all([createOrg(app), createOrg(app)]);
      const venue = await createVenue(app, await a.as(a.admin), venueInput());
      const map = await createSeatMap(app, await a.as(a.member), {
        venueId: venue.id,
        name: "Hall",
      });
      await saveSeatMap(app, await a.as(a.member), map.id, {
        name: "Main hall",
        layout: hallLayout(),
      });

      expect(await getSeatMap(app.db, await a.as(a.admin), map.id)).toMatchObject({
        name: "Main hall",
        seatCount: 24,
        venueName: venue.name,
      });
      expect((await listSeatMaps(app.db, await a.as(a.admin))).map((row) => row.id)).toEqual([
        map.id,
      ]);

      const rival = await b.as(b.admin);
      expect(await listSeatMaps(app.db, rival, { venueId: venue.id })).toEqual([]);
      expect(await codeOf(() => getSeatMap(app.db, rival, map.id))).toBe("NOT_FOUND");
      expect(
        await codeOf(() => saveSeatMap(app, rival, map.id, { name: "x", layout: hallLayout() })),
      ).toBe("NOT_FOUND");
      expect(await codeOf(() => archiveSeatMap(app, rival, map.id))).toBe("NOT_FOUND");
      // The rival can draw its own plan of the same venue.
      await createSeatMap(app, rival, { venueId: venue.id, name: "Ours" });
      expect(
        await codeOf(async () =>
          createSeatMap(app, await a.as(a.door), { venueId: venue.id, name: "x" }),
        ),
      ).toBe("FORBIDDEN");
    });

    it("reject drawings that are malformed or too big", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const venue = await createVenue(app, ctx, venueInput());
      const map = await createSeatMap(app, ctx, { venueId: venue.id, name: "Hall" });
      const layout = hallLayout();

      const huge = {
        ...layout,
        sections: layout.sections.map((s) => ({ ...s, rows: 100, seatsPerRow: 100 })),
      };
      expect(
        await failure(() => saveSeatMap(app, ctx, map.id, { name: "Hall", layout: huge })),
      ).toMatchObject({
        code: "VALIDATION",
        reason: "too_many_seats",
      });
      expect(
        await codeOf(() =>
          saveSeatMap(app, ctx, map.id, { name: "Hall", layout: { v: 1, sections: "no" } }),
        ),
      ).toBe("VALIDATION");
      expect(await codeOf(() => saveSeatMap(app, ctx, map.id, { name: " ", layout }))).toBe(
        "VALIDATION",
      );
      expect((await getSeatMap(app.db, ctx, map.id)).seatCount).toBe(0);
    });
  });

  describe("on an event", () => {
    it("are copied, so later edits to the map do not move the event's seats", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const event = await createSeatedEvent(app, org);
      const ctx = await org.as(org.admin);
      const before = (await getEventSeating(app.db, ctx, event.id))!;
      expect(before.seats).toHaveLength(24);
      expect(before.sections.map((s) => [s.name, s.ticketTypes.map((t) => t.name)])).toEqual([
        ["Stalls", ["Stalls student", "Stalls"]],
        ["Balcony", ["Balcony"]],
      ]);
      expect(before.seats.find((seat) => seat.key === "stalls:0-0")).toMatchObject({
        rowLabel: "A",
        seatLabel: "1",
        accessible: true,
        status: "available",
      });

      const smaller = hallLayout();
      smaller.sections.pop();
      await saveSeatMap(app, ctx, event.seatMapId, { name: "Changed", layout: smaller });
      await archiveSeatMap(app, ctx, event.seatMapId);

      expect(await getEventSeating(app.db, ctx, event.id)).toEqual(before);
    });

    it("can only be attached to a draft at the map's own venue, by its own organization", async () => {
      const app = getApp();
      const [org, rival] = await Promise.all([createOrg(app), createOrg(app)]);
      const ctx = await org.as(org.admin);
      const published = await createSeatedEvent(app, org);

      expect(
        await failure(() => attachSeatMap(app, ctx, published.id, published.seatMapId)),
      ).toMatchObject({
        reason: "not_draft",
      });
      expect(await failure(() => detachSeatMap(app, ctx, published.id))).toMatchObject({
        reason: "not_draft",
      });

      const elsewhere = await createEvent(app, ctx, eventInput({ title: "Elsewhere" }));
      const otherVenue = await createVenue(app, ctx, venueInput());
      await setEventVenue(app, ctx, elsewhere.id, { kind: "venue", venueId: otherVenue.id });
      expect(
        await failure(() => attachSeatMap(app, ctx, elsewhere.id, published.seatMapId)),
      ).toMatchObject({
        reason: "venue_mismatch",
      });

      const theirs = await createEvent(app, await rival.as(rival.admin), eventInput());
      await setEventVenue(app, await rival.as(rival.admin), theirs.id, {
        kind: "venue",
        venueId: published.venue.id,
      });
      expect(
        await codeOf(async () =>
          attachSeatMap(app, await rival.as(rival.admin), theirs.id, published.seatMapId),
        ),
      ).toBe("NOT_FOUND");
      expect(await codeOf(() => attachSeatMap(app, ctx, theirs.id, published.seatMapId))).toBe(
        "NOT_FOUND",
      );
    });

    it("can be replaced or removed while the event is still a draft", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const event = await createEvent(app, ctx, eventInput());
      const venue = await createVenue(app, ctx, venueInput());
      await setEventVenue(app, ctx, event.id, { kind: "venue", venueId: venue.id });
      const map = await createSeatMap(app, ctx, { venueId: venue.id, name: "Hall" });
      expect(await failure(() => attachSeatMap(app, ctx, event.id, map.id))).toMatchObject({
        reason: "seat_map_empty",
      });
      await saveSeatMap(app, ctx, map.id, { name: "Hall", layout: hallLayout() });

      expect(await attachSeatMap(app, ctx, event.id, map.id)).toEqual({ seats: 24 });
      const seating = (await getEventSeating(app.db, ctx, event.id))!;
      await saveSeatedTicketType(app, ctx, event.id, null, {
        name: "Stalls",
        price: "20",
        sectionIds: [seating.sections[0]!.id],
      });
      expect(await attachSeatMap(app, ctx, event.id, map.id)).toEqual({ seats: 24 });
      // The old sections are gone, and the ticket type that priced them with them.
      expect((await getOrgEvent(app, ctx, event.id)).ticketTypes).toEqual([]);

      await detachSeatMap(app, ctx, event.id);
      expect(await getEventSeating(app.db, ctx, event.id)).toBeNull();
    });

    it("prices sections with ticket types that belong to the same event", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const ctx = await org.as(org.admin);
      const event = await createSeatedEvent(app, org);
      const other = await createSeatedEvent(app, org);

      expect(
        await failure(() =>
          saveSeatedTicketType(app, ctx, event.id, null, {
            name: "Sneaky",
            price: "1",
            sectionIds: [other.sections.stalls],
          }),
        ),
      ).toMatchObject({ code: "VALIDATION", reason: "invalid_sections" });
      expect(
        await codeOf(() =>
          saveSeatedTicketType(app, ctx, event.id, null, {
            name: "None",
            price: "1",
            sectionIds: [],
          }),
        ),
      ).toBe("VALIDATION");
      expect(
        await codeOf(() =>
          saveSeatedTicketType(app, ctx, event.id, null, {
            name: "Bad",
            price: "1.234",
            sectionIds: [event.sections.stalls],
          }),
        ),
      ).toBe("VALIDATION");

      await saveSeatedTicketType(app, ctx, event.id, event.types.student, {
        name: "Under 26",
        price: "8",
        sectionIds: [event.sections.stalls, event.sections.balcony],
      });
      const seating = (await getEventSeating(app.db, ctx, event.id))!;
      expect(seating.sections[1]!.ticketTypes.map((type) => [type.name, type.priceAmount])).toEqual(
        [
          ["Under 26", 800],
          ["Balcony", 1500],
        ],
      );
    });
  });

  describe("choosing seats", () => {
    it("holds the chosen seats at the chosen price", async () => {
      const app = getApp();
      const event = await createSeatedEvent(app, await createOrg(app));
      const me = buyer();

      const cart = await setCart(
        app,
        me,
        event.id,
        [],
        [
          { seatId: event.seat("stalls:0-1"), ticketTypeId: event.types.stalls },
          { seatId: event.seat("stalls:0-2"), ticketTypeId: event.types.student },
          { seatId: event.seat("balcony:2-0"), ticketTypeId: event.types.balcony },
        ],
      );

      expect(cart).toMatchObject({ totalQuantity: 3, totalAmount: 2000 + 1000 + 1500 });
      expect(
        cart!.seats.map(
          (seat) => `${seat.sectionName} ${seat.rowLabel}${seat.seatLabel} ${seat.ticketTypeName}`,
        ),
      ).toEqual(["Stalls A2 Stalls", "Stalls A3 Stalls student", "Balcony 31 Balcony"]);
      expect(await seatStatus(event.seat("stalls:0-1"))).toBe("held");
      expect((await getUnavailableSeatIds(app.db, event.id)).sort()).toEqual(
        [event.seat("stalls:0-1"), event.seat("stalls:0-2"), event.seat("balcony:2-0")].sort(),
      );
      const seen = (await getPublicSeating(app.db, event.id))!;
      expect(seen.seats.filter((seat) => !seat.available)).toHaveLength(3);
      expect(seen.seats[0]).not.toHaveProperty("status");
      await expectInventoryConsistent(app, event.id);
    });

    it("gives a seat to exactly one of many buyers who click it at once", async () => {
      const app = getApp();
      const event = await createSeatedEvent(app, await createOrg(app));
      const choice = [{ seatId: event.seat("stalls:1-1"), ticketTypeId: event.types.stalls }];

      const results = await Promise.all(
        Array.from({ length: 25 }, () => codeOf(() => setCart(app, buyer(), event.id, [], choice))),
      );

      expect(results.filter((code) => code === "none")).toHaveLength(1);
      expect(results.filter((code) => code === "CONFLICT")).toHaveLength(24);
      await expectInventoryConsistent(app, event.id);
    });

    it("never deadlocks or splits a selection when buyers want overlapping seats in opposite order", async () => {
      const app = getApp();
      const event = await createSeatedEvent(app, await createOrg(app));
      const pick = (...keys: string[]) =>
        keys.map((key) => ({ seatId: event.seat(key), ticketTypeId: event.types.stalls }));
      const selections = [
        pick("stalls:0-0", "stalls:0-1", "stalls:0-2"),
        pick("stalls:0-2", "stalls:0-1", "stalls:0-3"),
        pick("stalls:0-3", "stalls:1-0", "stalls:0-0"),
        pick("stalls:1-0", "stalls:1-1"),
        pick("stalls:1-1", "stalls:0-1"),
      ];

      const results = await Promise.all(
        Array.from({ length: 4 }, () => selections)
          .flat()
          .map((seats) =>
            setCart(app, buyer(), event.id, [], seats).then(
              (cart) => cart,
              () => null,
            ),
          ),
      );

      const won = results.filter((cart) => cart !== null);
      expect(won.length).toBeGreaterThan(0);
      // All or nothing: whoever got seats got every seat they asked for, and no seat twice.
      const taken = won.flatMap((cart) => cart!.seats.map((seat) => seat.seatId));
      expect(new Set(taken).size).toBe(taken.length);
      expect((await getUnavailableSeatIds(app.db, event.id)).sort()).toEqual([...taken].sort());
      await expectInventoryConsistent(app, event.id);
    });

    it("says which seats were taken and leaves the cart as it was", async () => {
      const app = getApp();
      const event = await createSeatedEvent(app, await createOrg(app));
      const taken = event.seat("stalls:0-0");
      await setCart(
        app,
        buyer(),
        event.id,
        [],
        [{ seatId: taken, ticketTypeId: event.types.stalls }],
      );
      const me = buyer();
      const mine = { seatId: event.seat("stalls:2-2"), ticketTypeId: event.types.stalls };
      await setCart(app, me, event.id, [], [mine]);

      const error = await failure(() =>
        setCart(
          app,
          me,
          event.id,
          [],
          [
            mine,
            { seatId: event.seat("stalls:2-3"), ticketTypeId: event.types.stalls },
            { seatId: taken, ticketTypeId: event.types.stalls },
          ],
        ),
      );

      expect(error).toMatchObject({
        code: "CONFLICT",
        reason: "seats_taken",
        fields: { [taken]: "seats_taken" },
      });
      expect((await getCart(app, me, event.id))!.seats.map((seat) => seat.seatId)).toEqual([
        mine.seatId,
      ]);
      expect(await seatStatus(event.seat("stalls:2-3"))).toBe("available");
    });

    it("lets a buyer swap seats and change a seat's ticket type", async () => {
      const app = getApp();
      const event = await createSeatedEvent(app, await createOrg(app));
      const me = buyer();
      const [a, b, c] = ["stalls:0-0", "stalls:0-1", "stalls:0-2"].map(event.seat);
      await setCart(
        app,
        me,
        event.id,
        [],
        [
          { seatId: a!, ticketTypeId: event.types.stalls },
          { seatId: b!, ticketTypeId: event.types.stalls },
        ],
      );

      const cart = await setCart(
        app,
        me,
        event.id,
        [],
        [
          { seatId: b!, ticketTypeId: event.types.student },
          { seatId: c!, ticketTypeId: event.types.stalls },
        ],
      );

      expect(cart).toMatchObject({ totalAmount: 1000 + 2000 });
      expect(await seatStatus(a!)).toBe("available");
      expect(await setCart(app, me, event.id, [], [])).toBeNull();
      expect(await getUnavailableSeatIds(app.db, event.id)).toEqual([]);
      await expectInventoryConsistent(app, event.id);
    });

    it("refuses a ticket type that is not sold for that seat's section, and blocked seats", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const event = await createSeatedEvent(app, org);
      const other = await createSeatedEvent(app, org);
      const blocked = event.seat("balcony:0-0");
      expect(await setSeatsBlocked(app, await org.as(org.admin), event.id, [blocked], true)).toBe(
        1,
      );

      const attempts = [
        { seatId: event.seat("stalls:0-0"), ticketTypeId: event.types.balcony },
        { seatId: event.seat("stalls:0-0"), ticketTypeId: other.types.stalls },
        { seatId: other.seat("stalls:0-0"), ticketTypeId: event.types.stalls },
        { seatId: blocked, ticketTypeId: event.types.balcony },
        { seatId: randomUUID(), ticketTypeId: event.types.stalls },
      ];
      for (const attempt of attempts) {
        expect(await failure(() => setCart(app, buyer(), event.id, [], [attempt]))).toMatchObject({
          reason: "seats_taken",
        });
      }
      const me = buyer();
      const mine = event.seat("stalls:0-0");
      await setCart(app, me, event.id, [], [{ seatId: mine, ticketTypeId: event.types.stalls }]);
      expect(
        await failure(() =>
          setCart(app, me, event.id, [], [{ seatId: mine, ticketTypeId: event.types.balcony }]),
        ),
      ).toMatchObject({ reason: "seats_taken" });
      expect(
        await codeOf(() =>
          setCart(
            app,
            me,
            event.id,
            [],
            [
              { seatId: mine, ticketTypeId: event.types.stalls },
              { seatId: mine, ticketTypeId: event.types.student },
            ],
          ),
        ),
      ).toBe("VALIDATION");

      expect(
        await setSeatsBlocked(app, await org.as(org.admin), event.id, [blocked, mine], false),
      ).toBe(1);
      expect(await seatStatus(mine)).toBe("held");
      await expectInventoryConsistent(app, event.id);
      await expectInventoryConsistent(app, other.id);
    });

    it("frees seats when the cart runs out", async () => {
      const app = getApp();
      const event = await createSeatedEvent(app, await createOrg(app));
      const seat = { seatId: event.seat("stalls:0-0"), ticketTypeId: event.types.stalls };
      await setCart(app, buyer(), event.id, [], [seat]);
      expect(await codeOf(() => setCart(app, buyer(), event.id, [], [seat]))).toBe("CONFLICT");

      app.clock.advance(11 * MINUTE);
      expect(await setCart(app, buyer(), event.id, [], [seat])).toMatchObject({ totalQuantity: 1 });
      app.clock.advance(11 * MINUTE);
      await sweepExpiredHolds(app);
      expect(await seatStatus(seat.seatId)).toBe("available");
      await expectInventoryConsistent(app, event.id);
    });
  });

  describe("buying seats", () => {
    it("issues one ticket per seat, naming the seat", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const event = await createSeatedEvent(app, org);
      const order = await buySeats(app, event, ["stalls:1-2", "balcony:0-3"]);

      const view = (await getOrderByToken(app, order.token, "en"))!;
      expect(view).toMatchObject({ status: "paid", totalAmount: 3500 });
      const bySection = Object.fromEntries(
        view.tickets.map((ticket) => [ticket.description, ticket.seat]),
      );
      expect(bySection).toEqual({
        Balcony: { section: "Balcony", row: "1", seat: "4" },
        Stalls: { section: "Stalls", row: "B", seat: "3" },
      });
      expect(await seatStatus(event.seat("stalls:1-2"))).toBe("sold");

      const stalls = view.tickets.find((ticket) => ticket.description === "Stalls")!;
      const scanned = await scanTicket(app, await org.as(org.door), event.id, {
        code: stalls.code!,
        scanId: randomUUID(),
      });
      expect(scanned).toMatchObject({
        result: "accepted",
        ticket: { seat: { section: "Stalls", row: "B", seat: "3" } },
      });
      const [type] = await app.db
        .select()
        .from(ticketTypes)
        .where(eq(ticketTypes.id, event.types.stalls));
      expect(type).toMatchObject({ qtySold: 1, qtyHeld: 0, capacity: null });
      await expectInventoryConsistent(app, event.id);
    });

    it("keeps a paid-for seat out of everyone else's reach", async () => {
      const app = getApp();
      const event = await createSeatedEvent(app, await createOrg(app));
      await buySeats(app, event, ["stalls:0-0"]);
      expect(
        await codeOf(() =>
          setCart(
            app,
            buyer(),
            event.id,
            [],
            [{ seatId: event.seat("stalls:0-0"), ticketTypeId: event.types.stalls }],
          ),
        ),
      ).toBe("CONFLICT");
      // The database itself refuses a second live ticket for the seat.
      const [existing] = await app.db
        .select()
        .from(tickets)
        .where(eq(tickets.eventSeatId, event.seat("stalls:0-0")));
      await expect(
        app.db.insert(tickets).values({ ...existing!, id: randomUUID(), seq: 2 }),
      ).rejects.toThrow();
    });

    it("honours a late payment only if those very seats are still free", async () => {
      const app = getApp();
      const event = await createSeatedEvent(app, await createOrg(app));
      const lucky = await buySeats(app, event, ["stalls:2-0"], { pay: false });
      const unlucky = await buySeats(app, event, ["stalls:2-1", "stalls:2-2"], { pay: false });

      app.clock.advance(40 * MINUTE);
      await buySeats(app, event, ["stalls:2-2"]); // someone else takes one of the unlucky pair

      app.gateway.pay(app.gateway.sessionOf(lucky.orderId)!.id);
      expect(await confirmPayment(app, lucky.orderId)).toBe("paid");
      app.gateway.pay(app.gateway.sessionOf(unlucky.orderId)!.id);
      expect(await confirmPayment(app, unlucky.orderId)).toBe("unfulfillable");

      // Not even the seat that was still free is kept: the order is refunded whole.
      expect(await seatStatus(event.seat("stalls:2-1"))).toBe("available");
      const [refunded] = await app.db.select().from(orders).where(eq(orders.id, unlucky.orderId));
      expect(refunded).toMatchObject({ status: "unfulfillable", refundedAmount: 4000 });
      await expectInventoryConsistent(app, event.id);
    });

    it("puts a refunded seat back on sale, or blocks it", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const event = await createSeatedEvent(app, org);
      const ctx = await org.as(org.admin);
      const first = await buySeats(app, event, ["stalls:0-0", "stalls:0-1"]);
      const second = await buySeats(app, event, ["balcony:0-0"]);

      await refundOrder(app, ctx, first.orderId, { restock: true });
      await refundOrder(app, ctx, second.orderId, { restock: false });

      expect(await seatStatus(event.seat("stalls:0-0"))).toBe("available");
      expect(await seatStatus(event.seat("balcony:0-0"))).toBe("blocked");
      await buySeats(app, event, ["stalls:0-0"]);
      await expectInventoryConsistent(app, event.id);
    });

    it("refunds every seat when the event is cancelled", async () => {
      const app = getApp();
      const org = await createOrg(app);
      const event = await createSeatedEvent(app, org);
      const paid = await buySeats(app, event, ["stalls:0-0", "balcony:1-1"]);
      await setCart(
        app,
        buyer(),
        event.id,
        [],
        [{ seatId: event.seat("stalls:2-3"), ticketTypeId: event.types.stalls }],
      );

      await cancelEvent(app, await org.as(org.admin), event.id, "Cancelled");
      expect(await refundCancelledEvent(app, event.id)).toBe(0);

      const [order] = await app.db.select().from(orders).where(eq(orders.id, paid.orderId));
      expect(order!.refundedAmount).toBe(3500);
      expect(await seatStatus(event.seat("stalls:2-3"))).toBe("available");
      expect(await getPublicSeating(app.db, event.id)).toBeNull();
      await expectInventoryConsistent(app, event.id);
    });
  });
});
