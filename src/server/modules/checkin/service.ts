import { and, eq, isNull, sql } from "drizzle-orm";
import type { ScanResult } from "../../../domain/checkin/types";
import { parseTicketCode, ticketCodeMatches } from "../../../domain/tokens/tokens";
import { authorizeOrg } from "../../authz/authorize";
import type { Db } from "../../db/client";
import {
  checkIns,
  events,
  eventSeats,
  eventSections,
  orderItems,
  orders,
  tickets,
} from "../../db/schema";
import { notFound } from "../../errors";
import type { Clock } from "../../ports/clock";
import { recordAudit } from "../audit/service";
import type { OrgContext } from "../orgs/service";

type Deps = { db: Db; clock: Clock; signingSecret: string };

export type ScanOutcome = {
  result: ScanResult;
  /** Present when the code is a real ticket for this event. */
  ticket: {
    id: string;
    description: string;
    buyerName: string;
    reference: string;
    /** For reserved seating: where the holder sits. */
    seat: { section: string; row: string; seat: string } | null;
    /** When the ticket was (first) used. */
    checkedInAt: Date | null;
  } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireEvent(db: Db, ctx: OrgContext, eventId: string): Promise<void> {
  const rows = UUID.test(eventId)
    ? await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.organizationId, ctx.organization.id), eq(events.id, eventId)))
    : [];
  if (rows.length === 0) throw notFound("event");
}

/**
 * Checks a scanned code and, if it is a valid unused ticket for this event, uses it.
 *
 * Admission is a single conditional update, so when two scanners read the same ticket at
 * the same moment exactly one of them is told to let the holder in. `scanId` identifies
 * the attempt: if the answer to a scan is lost on a bad connection and the device asks
 * again, it gets the same answer rather than a false "already used".
 */
export async function scanTicket(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
  input: { code: string; scanId: string },
): Promise<ScanOutcome> {
  authorizeOrg(ctx, "checkin.scan");
  await requireEvent(deps.db, ctx, eventId);
  const now = deps.clock.now();
  const organizationId = ctx.organization.id;

  const log = async (result: ScanResult, ticketId: string | null) => {
    await deps.db
      .insert(checkIns)
      .values({
        organizationId,
        eventId,
        ticketId,
        scanId: input.scanId,
        result,
        scannedBy: ctx.actor.userId,
        createdAt: now,
      })
      .onConflictDoNothing({ target: [checkIns.organizationId, checkIns.scanId] });
  };

  const parsed = parseTicketCode(input.code);
  // Look the ticket up inside this organization only: another organization's ticket is
  // simply unknown here.
  const [found] = parsed
    ? await deps.db
        .select({
          ticket: tickets,
          description: orderItems.description,
          buyerName: orders.buyerName,
          reference: orders.publicId,
          section: eventSections.name,
          row: eventSeats.rowLabel,
          seat: eventSeats.seatLabel,
        })
        .from(tickets)
        .innerJoin(orderItems, eq(orderItems.id, tickets.orderItemId))
        .innerJoin(orders, eq(orders.id, tickets.orderId))
        .leftJoin(eventSeats, eq(eventSeats.id, tickets.eventSeatId))
        .leftJoin(eventSections, eq(eventSections.id, eventSeats.eventSectionId))
        .where(and(eq(tickets.id, parsed.ticketId), eq(tickets.organizationId, organizationId)))
    : [];

  if (
    !parsed ||
    !found ||
    !ticketCodeMatches(deps.signingSecret, parsed, found.ticket.tokenVersion)
  ) {
    await log("not_found", null);
    return { result: "not_found", ticket: null };
  }

  const view = (checkedInAt: Date | null) => ({
    id: found.ticket.id,
    description: found.description,
    buyerName: found.buyerName,
    reference: found.reference,
    seat:
      found.section !== null && found.row !== null && found.seat !== null
        ? { section: found.section, row: found.row, seat: found.seat }
        : null,
    checkedInAt,
  });

  if (found.ticket.eventId !== eventId) {
    await log("wrong_event", found.ticket.id);
    return { result: "wrong_event", ticket: null };
  }
  // A retry of the scan that admitted this ticket: same answer as the first time.
  if (found.ticket.checkInScanId === input.scanId) {
    return { result: "accepted", ticket: view(found.ticket.checkedInAt) };
  }

  const admitted = await deps.db.transaction(async (tx) => {
    const rows = await tx
      .update(tickets)
      .set({ checkedInAt: now, checkedInBy: ctx.actor.userId, checkInScanId: input.scanId })
      .where(
        and(
          eq(tickets.id, found.ticket.id),
          eq(tickets.organizationId, organizationId),
          eq(tickets.eventId, eventId),
          eq(tickets.status, "valid"),
          isNull(tickets.checkedInAt),
        ),
      )
      .returning({ id: tickets.id });
    if (rows.length === 1) {
      await tx
        .insert(checkIns)
        .values({
          organizationId,
          eventId,
          ticketId: found.ticket.id,
          scanId: input.scanId,
          result: "accepted",
          scannedBy: ctx.actor.userId,
          createdAt: now,
        })
        .onConflictDoNothing({ target: [checkIns.organizationId, checkIns.scanId] });
    }
    return rows.length === 1;
  });
  if (admitted) return { result: "accepted", ticket: view(now) };

  // Not admitted: read the ticket again to say why.
  const [current] = await deps.db.select().from(tickets).where(eq(tickets.id, found.ticket.id));
  if (current?.checkInScanId === input.scanId) {
    return { result: "accepted", ticket: view(current.checkedInAt) };
  }
  const result: ScanResult = current?.status === "void" ? "void" : "duplicate";
  await log(result, found.ticket.id);
  return { result, ticket: view(current?.checkedInAt ?? null) };
}

/** Lets a ticket be used again, for when someone was checked in by mistake. */
export async function undoCheckIn(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
  ticketId: string,
): Promise<void> {
  authorizeOrg(ctx, "checkin.undo");
  await requireEvent(deps.db, ctx, eventId);
  await deps.db.transaction(async (tx) => {
    const rows = await tx
      .update(tickets)
      .set({ checkedInAt: null, checkedInBy: null, checkInScanId: null })
      .where(
        and(
          UUID.test(ticketId) ? eq(tickets.id, ticketId) : sql`false`,
          eq(tickets.organizationId, ctx.organization.id),
          eq(tickets.eventId, eventId),
          sql`${tickets.checkedInAt} is not null`,
        ),
      )
      .returning({ id: tickets.id });
    if (rows.length === 0) throw notFound("ticket");
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: ctx.actor.userId,
      action: "checkin.undone",
      entityType: "ticket",
      entityId: ticketId,
    });
  });
}

/** How many of the event's valid tickets have come through the door. */
export async function getCheckInProgress(
  deps: Pick<Deps, "db">,
  ctx: OrgContext,
  eventId: string,
): Promise<{ checkedIn: number; total: number }> {
  authorizeOrg(ctx, "checkin.scan");
  await requireEvent(deps.db, ctx, eventId);
  const [row] = await deps.db
    .select({
      total: sql<number>`count(*)::int`,
      checkedIn: sql<number>`count(${tickets.checkedInAt})::int`,
    })
    .from(tickets)
    .where(
      and(
        eq(tickets.organizationId, ctx.organization.id),
        eq(tickets.eventId, eventId),
        eq(tickets.status, "valid"),
      ),
    );
  return { checkedIn: row?.checkedIn ?? 0, total: row?.total ?? 0 };
}
