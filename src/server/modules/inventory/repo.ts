import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { events, holdItems, holds, orders, orgProfiles, ticketTypes } from "../../db/schema";
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
