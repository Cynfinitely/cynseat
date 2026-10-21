import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  events,
  eventSeats,
  eventSections,
  holdItems,
  holds,
  orders,
  orgProfiles,
  ticketTypes,
  ticketTypeSections,
} from "../../db/schema";
import type { DbOrTx } from "../notifications/service";

export type HoldRow = typeof holds.$inferSelect;

/**
 * The event, if tickets can be bought for it right now. Takes a shared lock, which the
 * update that cancels or pauses an event has to wait for, so no hold can slip in behind it.
 */
export async function lockSellableEvent(db: DbOrTx, eventId: string) {
  const [row] = await db
    .select({ event: events })
    .from(events)
    .innerJoin(orgProfiles, eq(orgProfiles.organizationId, events.organizationId))
    .where(
      and(
        eq(events.id, eventId),
        eq(events.status, "published"),
        eq(events.salesPaused, false),
        eq(orgProfiles.approvalStatus, "approved"),
      ),
    )
    .for("share", { of: events });
  return row?.event;
}

/** The buyer's open hold for this event, locked. Serializes the buyer's own requests. */
export async function lockActiveHold(
  db: DbOrTx,
  eventId: string,
  buyerSessionId: string,
): Promise<HoldRow | undefined> {
  const [row] = await db
    .select()
    .from(holds)
    .where(
      and(
        eq(holds.eventId, eventId),
        eq(holds.buyerSessionId, buyerSessionId),
        eq(holds.status, "active"),
      ),
    )
    .for("update");
  return row;
}

export async function insertHold(
  db: DbOrTx,
  values: typeof holds.$inferInsert,
): Promise<HoldRow | undefined> {
  // Two tabs can race to create the buyer's first hold; the loser gets nothing back.
  const [row] = await db.insert(holds).values(values).onConflictDoNothing().returning();
  return row;
}

export async function findHoldItems(db: DbOrTx, holdId: string) {
  return db
    .select({ ticketTypeId: holdItems.ticketTypeId, quantity: holdItems.quantity })
    .from(holdItems)
    .where(eq(holdItems.holdId, holdId))
    .orderBy(asc(holdItems.ticketTypeId));
}

export async function setHoldItem(
  db: DbOrTx,
  item: { holdId: string; eventId: string; ticketTypeId: string; quantity: number },
): Promise<void> {
  if (item.quantity === 0) {
    await db
      .delete(holdItems)
      .where(and(eq(holdItems.holdId, item.holdId), eq(holdItems.ticketTypeId, item.ticketTypeId)));
    return;
  }
  await db
    .insert(holdItems)
    .values(item)
    .onConflictDoUpdate({
      target: [holdItems.holdId, holdItems.ticketTypeId],
      set: { quantity: item.quantity },
    });
}

/**
 * Reserves `quantity` more tickets of a type, if that many are free and the type is on
 * sale. The availability test and the write are one statement: when two buyers race for
 * the last ticket, the second waits for the first, re-checks, and matches nothing.
 */
export async function reserve(
  db: DbOrTx,
  input: { eventId: string; ticketTypeId: string; quantity: number; now: Date },
): Promise<boolean> {
  const { now } = input;
  const rows = await db
    .update(ticketTypes)
    .set({ qtyHeld: sql`${ticketTypes.qtyHeld} + ${input.quantity}` })
    .where(
      and(
        eq(ticketTypes.id, input.ticketTypeId),
        eq(ticketTypes.eventId, input.eventId),
        eq(ticketTypes.kind, "ga"),
        eq(ticketTypes.isActive, true),
        isNull(ticketTypes.archivedAt),
        sql`(${ticketTypes.salesStartAt} is null or ${ticketTypes.salesStartAt} <= ${now})`,
        sql`(${ticketTypes.salesEndAt} is null or ${ticketTypes.salesEndAt} > ${now})`,
        sql`${ticketTypes.qtySold} + ${ticketTypes.qtyHeld} + ${input.quantity} <= ${ticketTypes.capacity}`,
      ),
    )
    .returning({ id: ticketTypes.id });
  return rows.length === 1;
}

/** Gives reserved tickets back. */
export async function unreserve(
  db: DbOrTx,
  input: { ticketTypeId: string; quantity: number },
): Promise<void> {
  await db
    .update(ticketTypes)
    .set({ qtyHeld: sql`${ticketTypes.qtyHeld} - ${input.quantity}` })
    .where(eq(ticketTypes.id, input.ticketTypeId));
}

/** Turns reserved tickets into sold ones. */
export async function convertReserved(
  db: DbOrTx,
  input: { ticketTypeId: string; quantity: number },
): Promise<void> {
  await db
    .update(ticketTypes)
    .set({
      qtyHeld: sql`${ticketTypes.qtyHeld} - ${input.quantity}`,
      qtySold: sql`${ticketTypes.qtySold} + ${input.quantity}`,
    })
    .where(eq(ticketTypes.id, input.ticketTypeId));
}

/** Sells tickets that are not reserved (a payment that arrived after its hold lapsed). */
export async function sellUnreserved(
  db: DbOrTx,
  input: { ticketTypeId: string; quantity: number },
): Promise<boolean> {
  const rows = await db
    .update(ticketTypes)
    .set({ qtySold: sql`${ticketTypes.qtySold} + ${input.quantity}` })
    .where(
      and(
        eq(ticketTypes.id, input.ticketTypeId),
        sql`${ticketTypes.qtySold} + ${ticketTypes.qtyHeld} + ${input.quantity} <= ${ticketTypes.capacity}`,
      ),
    )
    .returning({ id: ticketTypes.id });
  return rows.length === 1;
}

/**
 * Closes holds and returns their ids. Only holds that are still active change, and each
 * can change once, so two sweeps running together never give the same tickets back twice.
 * Locks are taken in id order and waited for: a second sweep finishes only after the first
 * has returned its tickets, so a buyer is never told "sold out" while tickets are being freed.
 */
export async function closeHolds(
  db: DbOrTx,
  input: {
    status: "expired" | "released";
    now: Date;
    where: { eventId: string; expiredBy: Date } | { holdId: string };
  },
): Promise<string[]> {
  const candidates =
    "holdId" in input.where
      ? eq(holds.id, input.where.holdId)
      : and(eq(holds.eventId, input.where.eventId), lte(holds.expiresAt, input.where.expiredBy));
  const rows = await db
    .update(holds)
    .set({ status: input.status, releasedAt: input.now, updatedAt: input.now })
    .where(
      inArray(
        holds.id,
        db
          .select({ id: holds.id })
          .from(holds)
          .where(and(eq(holds.status, "active"), candidates))
          .orderBy(asc(holds.id))
          .for("update"),
      ),
    )
    .returning({ id: holds.id });
  return rows.map((row) => row.id);
}

/** Total reserved per ticket type across some holds, in the order locks must be taken. */
export async function sumHoldItems(db: DbOrTx, holdIds: string[]) {
  if (holdIds.length === 0) return [];
  return db
    .select({
      ticketTypeId: holdItems.ticketTypeId,
      quantity: sql<number>`sum(${holdItems.quantity})::int`,
    })
    .from(holdItems)
    .where(inArray(holdItems.holdId, holdIds))
    .groupBy(holdItems.ticketTypeId)
    .orderBy(asc(holdItems.ticketTypeId));
}

/** Unpaid orders whose reservation has gone can no longer be completed normally. */
export async function expirePendingOrders(db: DbOrTx, holdIds: string[], now: Date): Promise<void> {
  if (holdIds.length === 0) return;
  await db
    .update(orders)
    .set({ status: "expired", closedAt: now, updatedAt: now })
    .where(and(inArray(orders.holdId, holdIds), eq(orders.status, "pending")));
}

export async function markHold(
  db: DbOrTx,
  holdId: string,
  values: Partial<typeof holds.$inferInsert>,
): Promise<void> {
  await db.update(holds).set(values).where(eq(holds.id, holdId));
}

export async function findEventsWithExpiredHolds(db: DbOrTx, now: Date, limit: number) {
  const rows = await db
    .selectDistinct({ eventId: holds.eventId })
    .from(holds)
    .where(and(eq(holds.status, "active"), lte(holds.expiresAt, now)))
    .limit(limit);
  return rows.map((row) => row.eventId);
}

/** Ticket types of an event with the buyer-facing facts a cart needs. */
export async function findCartTypes(db: DbOrTx, eventId: string, ticketTypeIds: string[]) {
  if (ticketTypeIds.length === 0) return [];
  return db
    .select({
      id: ticketTypes.id,
      name: ticketTypes.name,
      priceAmount: ticketTypes.priceAmount,
      maxPerOrder: ticketTypes.maxPerOrder,
    })
    .from(ticketTypes)
    .where(and(eq(ticketTypes.eventId, eventId), inArray(ticketTypes.id, ticketTypeIds)));
}

// ---- Reserved seats ----------------------------------------------------------------------

export type SeatChoice = { seatId: string; ticketTypeId: string };

/**
 * Holds specific seats for a buyer, all or none. The requested rows are locked in id
 * order (every transaction that touches seats does the same, so they cannot deadlock),
 * then claimed only if each is still free and the chosen ticket type is really on sale
 * for that seat's section.
 *
 * Returns the ids that could not be had; empty means the hold succeeded.
 */
export async function claimSeats(
  db: DbOrTx,
  input: { eventId: string; holdId: string; choices: SeatChoice[]; now: Date },
): Promise<string[]> {
  if (input.choices.length === 0) return [];
  const ids = input.choices.map((choice) => choice.seatId).sort();
  const locked = await db
    .select({ id: eventSeats.id, sectionId: eventSeats.eventSectionId, status: eventSeats.status })
    .from(eventSeats)
    .where(and(eq(eventSeats.eventId, input.eventId), inArray(eventSeats.id, ids)))
    .orderBy(asc(eventSeats.id))
    .for("update");

  const typeIds = [...new Set(input.choices.map((choice) => choice.ticketTypeId))];
  const { now } = input;
  const sellable = await db
    .select({ ticketTypeId: ticketTypes.id, sectionId: ticketTypeSections.eventSectionId })
    .from(ticketTypes)
    .innerJoin(ticketTypeSections, eq(ticketTypeSections.ticketTypeId, ticketTypes.id))
    .where(
      and(
        eq(ticketTypes.eventId, input.eventId),
        inArray(ticketTypes.id, typeIds),
        eq(ticketTypes.kind, "seated"),
        eq(ticketTypes.isActive, true),
        isNull(ticketTypes.archivedAt),
        sql`(${ticketTypes.salesStartAt} is null or ${ticketTypes.salesStartAt} <= ${now})`,
        sql`(${ticketTypes.salesEndAt} is null or ${ticketTypes.salesEndAt} > ${now})`,
      ),
    );
  const allowed = new Set(sellable.map((row) => `${row.ticketTypeId}/${row.sectionId}`));

  const refused = input.choices
    .filter((choice) => {
      const seat = locked.find((row) => row.id === choice.seatId);
      return (
        !seat ||
        seat.status !== "available" ||
        !allowed.has(`${choice.ticketTypeId}/${seat.sectionId}`)
      );
    })
    .map((choice) => choice.seatId);
  if (refused.length > 0) return refused;

  for (const choice of input.choices) {
    await db
      .update(eventSeats)
      .set({ status: "held", holdId: input.holdId, heldTicketTypeId: choice.ticketTypeId })
      .where(and(eq(eventSeats.id, choice.seatId), eq(eventSeats.status, "available")));
  }
  return [];
}

/** Seats to change, locked in id order. */
const lockedSeats = (db: DbOrTx, where: ReturnType<typeof and>) =>
  db
    .select({ id: eventSeats.id })
    .from(eventSeats)
    .where(where)
    .orderBy(asc(eventSeats.id))
    .for("update");

/** Frees seats held by these holds (all of them, or only the ones named). */
export async function releaseSeats(
  db: DbOrTx,
  holdIds: string[],
  onlySeatIds?: string[],
): Promise<void> {
  if (holdIds.length === 0 || onlySeatIds?.length === 0) return;
  await db
    .update(eventSeats)
    .set({ status: "available", holdId: null, heldTicketTypeId: null })
    .where(
      inArray(
        eventSeats.id,
        lockedSeats(
          db,
          and(
            inArray(eventSeats.holdId, holdIds),
            onlySeatIds ? inArray(eventSeats.id, onlySeatIds) : undefined,
          ),
        ),
      ),
    );
}

/** Changes the ticket type chosen for a seat the buyer already holds. */
export async function setHeldSeatType(
  db: DbOrTx,
  holdId: string,
  choice: SeatChoice,
): Promise<void> {
  await db
    .update(eventSeats)
    .set({ heldTicketTypeId: choice.ticketTypeId })
    .where(and(eq(eventSeats.id, choice.seatId), eq(eventSeats.holdId, holdId)));
}

/** The seats in a hold with what the buyer will pay for each. */
export async function findHeldSeats(db: DbOrTx, holdId: string) {
  return (
    db
      .select({
        seatId: eventSeats.id,
        sectionId: eventSeats.eventSectionId,
        sectionName: eventSections.name,
        rowLabel: eventSeats.rowLabel,
        seatLabel: eventSeats.seatLabel,
        ticketTypeId: ticketTypes.id,
        ticketTypeName: ticketTypes.name,
        unitPriceAmount: ticketTypes.priceAmount,
      })
      .from(eventSeats)
      .innerJoin(eventSections, eq(eventSections.id, eventSeats.eventSectionId))
      .innerJoin(ticketTypes, eq(ticketTypes.id, eventSeats.heldTicketTypeId))
      .where(eq(eventSeats.holdId, holdId))
      // In hall order: section, then row and seat by position. A seat's key ends in
      // "<row>-<seat>" as numbers, which sorts correctly where labels ("A10" < "A2") do not.
      .orderBy(
        asc(eventSections.sortOrder),
        sql`split_part(split_part(${eventSeats.seatKey}, ':', 2), '-', 1)::int`,
        sql`split_part(split_part(${eventSeats.seatKey}, ':', 2), '-', 2)::int`,
      )
  );
}

/** Marks a hold's seats as sold. Returns how many there were. */
export async function sellHeldSeats(db: DbOrTx, holdId: string): Promise<number> {
  const rows = await db
    .update(eventSeats)
    .set({ status: "sold", holdId: null, heldTicketTypeId: null })
    .where(inArray(eventSeats.id, lockedSeats(db, eq(eventSeats.holdId, holdId))))
    .returning({ id: eventSeats.id });
  return rows.length;
}

/** Sells seats that are not held (a payment that arrived after its hold lapsed). */
export async function sellFreeSeats(db: DbOrTx, seatIds: string[]): Promise<boolean> {
  if (seatIds.length === 0) return true;
  const rows = await db
    .update(eventSeats)
    .set({ status: "sold" })
    .where(
      inArray(
        eventSeats.id,
        lockedSeats(db, and(inArray(eventSeats.id, seatIds), eq(eventSeats.status, "available"))),
      ),
    )
    .returning({ id: eventSeats.id });
  return rows.length === seatIds.length;
}

/** After a refund: the seat goes back on sale, or is kept off it. */
export async function unsellSeats(db: DbOrTx, seatIds: string[], restock: boolean): Promise<void> {
  if (seatIds.length === 0) return;
  await db
    .update(eventSeats)
    .set({ status: restock ? "available" : "blocked" })
    .where(
      inArray(
        eventSeats.id,
        lockedSeats(db, and(inArray(eventSeats.id, seatIds), eq(eventSeats.status, "sold"))),
      ),
    );
}

/** Adds to (or takes from) the sold count of a ticket type that is sold by seat. */
export async function adjustSeatedSold(
  db: DbOrTx,
  ticketTypeId: string,
  delta: number,
): Promise<void> {
  await db
    .update(ticketTypes)
    .set({ qtySold: sql`${ticketTypes.qtySold} + ${delta}` })
    .where(eq(ticketTypes.id, ticketTypeId));
}

/** Whether a seated ticket type is on sale right now for a given section. */
export async function seatTypeAllowed(
  db: DbOrTx,
  input: { eventId: string; sectionId: string; choice: SeatChoice; now: Date },
): Promise<boolean> {
  const { now } = input;
  const rows = await db
    .select({ id: ticketTypes.id })
    .from(ticketTypes)
    .innerJoin(ticketTypeSections, eq(ticketTypeSections.ticketTypeId, ticketTypes.id))
    .where(
      and(
        eq(ticketTypes.eventId, input.eventId),
        eq(ticketTypes.id, input.choice.ticketTypeId),
        eq(ticketTypeSections.eventSectionId, input.sectionId),
        eq(ticketTypes.kind, "seated"),
        eq(ticketTypes.isActive, true),
        isNull(ticketTypes.archivedAt),
        sql`(${ticketTypes.salesStartAt} is null or ${ticketTypes.salesStartAt} <= ${now})`,
        sql`(${ticketTypes.salesEndAt} is null or ${ticketTypes.salesEndAt} > ${now})`,
      ),
    )
    .limit(1);
  return rows.length === 1;
}
