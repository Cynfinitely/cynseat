import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  events,
  eventSeats,
  eventSections,
  eventTranslations,
  holdItems,
  holds,
  orderItems,
  orders,
  organization,
  orgProfiles,
  tickets,
  ticketTypes,
} from "../../db/schema";
import type { DbOrTx } from "../notifications/service";

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type TicketRow = typeof tickets.$inferSelect;

/** What is in a hold, priced from the database, in the order ticket types are locked. */
export async function findHoldLines(db: DbOrTx, holdId: string) {
  return db
    .select({
      ticketTypeId: ticketTypes.id,
      name: ticketTypes.name,
      unitPriceAmount: ticketTypes.priceAmount,
      quantity: holdItems.quantity,
    })
    .from(holdItems)
    .innerJoin(ticketTypes, eq(ticketTypes.id, holdItems.ticketTypeId))
    .where(eq(holdItems.holdId, holdId))
    .orderBy(asc(ticketTypes.id));
}

export async function findPaymentProfile(db: DbOrTx, organizationId: string) {
  const [row] = await db
    .select({
      accountId: orgProfiles.stripeAccountId,
      chargesEnabled: orgProfiles.stripeChargesEnabled,
      feeBps: orgProfiles.feeBps,
      feeFixedMinor: orgProfiles.feeFixedMinor,
    })
    .from(orgProfiles)
    .where(eq(orgProfiles.organizationId, organizationId));
  return row;
}

/** Free tickets this address already holds for the event. */
export async function countFreeTickets(
  db: DbOrTx,
  eventId: string,
  email: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tickets)
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .where(
      and(
        eq(orders.eventId, eventId),
        eq(sql`lower(${orders.email})`, email.toLowerCase()),
        eq(orders.totalAmount, 0),
        eq(tickets.status, "valid"),
      ),
    );
  return row?.count ?? 0;
}

export async function insertOrder(
  db: DbOrTx,
  values: typeof orders.$inferInsert,
): Promise<OrderRow> {
  const [row] = await db.insert(orders).values(values).returning();
  return row!;
}

export async function insertOrderItems(
  db: DbOrTx,
  values: (typeof orderItems.$inferInsert)[],
): Promise<void> {
  await db.insert(orderItems).values(values);
}

export async function findOrder(db: DbOrTx, orderId: string): Promise<OrderRow | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
  return row;
}

export async function findOrderByHold(db: DbOrTx, holdId: string): Promise<OrderRow | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.holdId, holdId));
  return row;
}

export async function findOrderByTokenHash(
  db: DbOrTx,
  hash: Buffer,
): Promise<OrderRow | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.accessTokenHash, hash));
  return row;
}

export async function lockOrder(db: DbOrTx, orderId: string): Promise<OrderRow | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).for("update");
  return row;
}

export async function lockHold(db: DbOrTx, holdId: string) {
  const [row] = await db.select().from(holds).where(eq(holds.id, holdId)).for("update");
  return row;
}

export async function updateOrder(
  db: DbOrTx,
  orderId: string,
  values: Partial<typeof orders.$inferInsert>,
): Promise<void> {
  await db.update(orders).set(values).where(eq(orders.id, orderId));
}

/** Records the payment page for an order, unless one is already recorded. */
export async function attachCheckoutSession(
  db: DbOrTx,
  orderId: string,
  sessionId: string,
  now: Date,
): Promise<void> {
  await db
    .update(orders)
    .set({ stripeCheckoutSessionId: sessionId, updatedAt: now })
    .where(and(eq(orders.id, orderId), sql`${orders.stripeCheckoutSessionId} is null`));
}

export async function findOrderItems(db: DbOrTx, orderId: string): Promise<OrderItemRow[]> {
  return db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.ticketTypeId));
}

/** Issues tickets; rows that already exist are left alone, so repeating this is harmless. */
export async function insertTickets(
  db: DbOrTx,
  values: (typeof tickets.$inferInsert)[],
): Promise<void> {
  if (values.length === 0) return;
  await db
    .insert(tickets)
    .values(values)
    .onConflictDoNothing({ target: [tickets.orderItemId, tickets.seq] });
}

/** An order's tickets, each with its seat when the event has reserved seating. */
export async function findTickets(db: DbOrTx, orderId: string) {
  const rows = await db
    .select({
      ticket: tickets,
      section: eventSections.name,
      row: eventSeats.rowLabel,
      seat: eventSeats.seatLabel,
    })
    .from(tickets)
    .leftJoin(eventSeats, eq(eventSeats.id, tickets.eventSeatId))
    .leftJoin(eventSections, eq(eventSections.id, eventSeats.eventSectionId))
    .where(eq(tickets.orderId, orderId))
    .orderBy(asc(tickets.orderItemId), asc(tickets.seq));
  return rows.map(({ ticket, section, row, seat }) => ({
    ...ticket,
    seat: section !== null && row !== null && seat !== null ? { section, row, seat } : null,
  }));
}

/** The event an order is for, with its organizer and every language's text. */
export async function findOrderEvent(db: DbOrTx, eventId: string) {
  const [row] = await db
    .select({
      event: events,
      organization: { slug: organization.slug, name: organization.name },
      contactEmail: orgProfiles.contactEmail,
    })
    .from(events)
    .innerJoin(organization, eq(organization.id, events.organizationId))
    .innerJoin(orgProfiles, eq(orgProfiles.organizationId, events.organizationId))
    .where(eq(events.id, eventId));
  if (!row) return undefined;
  const translations = await db
    .select()
    .from(eventTranslations)
    .where(eq(eventTranslations.eventId, eventId));
  return { ...row, translations };
}

export async function findOrdersOfUser(db: DbOrTx, userId: string): Promise<OrderRow[]> {
  return db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.status, "paid")))
    .orderBy(desc(orders.createdAt));
}

/** Gives the account every paid order bought with its email that no account owns yet. */
export async function attachOrdersToUser(
  db: DbOrTx,
  email: string,
  userId: string,
  now: Date,
): Promise<number> {
  const rows = await db
    .update(orders)
    .set({ userId, updatedAt: now })
    .where(
      and(
        eq(sql`lower(${orders.email})`, email.toLowerCase()),
        sql`${orders.userId} is null`,
        eq(orders.status, "paid"),
      ),
    )
    .returning({ id: orders.id });
  return rows.length;
}

export async function findPaidOrdersByEmail(
  db: DbOrTx,
  email: string,
  limit: number,
): Promise<OrderRow[]> {
  return db
    .select()
    .from(orders)
    .where(and(eq(sql`lower(${orders.email})`, email.toLowerCase()), eq(orders.status, "paid")))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}
