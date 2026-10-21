import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { parseMoneyInput } from "../../../domain/money/money";
import {
  countSeats,
  emptyLayout,
  layoutSchema,
  seatsOf,
  type Layout,
} from "../../../domain/seatmap/layout";
import { authorizeOrg } from "../../authz/authorize";
import type { Db } from "../../db/client";
import {
  events,
  eventSeatMaps,
  eventSeats,
  eventSections,
  holds,
  orders,
  seatMaps,
  ticketTypes,
  ticketTypeSections,
  venues,
} from "../../db/schema";
import { conflict, invalid, notFound } from "../../errors";
import type { Clock } from "../../ports/clock";
import { recordAudit } from "../audit/service";
import type { DbOrTx } from "../notifications/service";
import type { OrgContext } from "../orgs/service";

type Deps = { db: Db; clock: Clock };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string) => UUID.test(value);

export type SeatMapSummary = {
  id: string;
  name: string;
  venueId: string;
  venueName: string;
  seatCount: number;
  updatedAt: Date;
};

// ---- Maps (templates) --------------------------------------------------------------------

const ownMap = (ctx: OrgContext, id: string) =>
  and(
    eq(seatMaps.organizationId, ctx.organization.id),
    eq(seatMaps.id, id),
    isNull(seatMaps.archivedAt),
  );

export async function createSeatMap(
  deps: Deps,
  ctx: OrgContext,
  input: { venueId: string; name: string },
): Promise<{ id: string }> {
  authorizeOrg(ctx, "seatmap.manage");
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) throw invalid("invalid_name", { name: "required" });
  const [venue] = isUuid(input.venueId)
    ? await deps.db
        .select({ id: venues.id })
        .from(venues)
        .where(and(eq(venues.id, input.venueId), eq(venues.status, "active")))
    : [];
  if (!venue) throw notFound("venue");

  const now = deps.clock.now();
  const [row] = await deps.db
    .insert(seatMaps)
    .values({
      organizationId: ctx.organization.id,
      venueId: venue.id,
      name,
      layout: emptyLayout,
      createdBy: ctx.actor.userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: seatMaps.id });
  return { id: row!.id };
}

/** Replaces a map's drawing. Events that already copied the map are not affected. */
export async function saveSeatMap(
  deps: Deps,
  ctx: OrgContext,
  seatMapId: string,
  input: { name: string; layout: unknown },
): Promise<void> {
  authorizeOrg(ctx, "seatmap.manage");
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) throw invalid("invalid_name", { name: "required" });
  const parsed = layoutSchema.safeParse(input.layout);
  if (!parsed.success) {
    throw invalid(
      parsed.error.issues.find((issue) => issue.code === "custom")?.message ?? "invalid_layout",
    );
  }
  const rows = isUuid(seatMapId)
    ? await deps.db
        .update(seatMaps)
        .set({
          name,
          layout: parsed.data,
          seatCount: countSeats(parsed.data),
          updatedAt: deps.clock.now(),
        })
        .where(ownMap(ctx, seatMapId))
        .returning({ id: seatMaps.id })
    : [];
  if (rows.length === 0) throw notFound("seat_map");
}

export async function archiveSeatMap(
  deps: Deps,
  ctx: OrgContext,
  seatMapId: string,
): Promise<void> {
  authorizeOrg(ctx, "seatmap.manage");
  const rows = isUuid(seatMapId)
    ? await deps.db
        .update(seatMaps)
        .set({ archivedAt: deps.clock.now() })
        .where(ownMap(ctx, seatMapId))
        .returning({ id: seatMaps.id })
    : [];
  if (rows.length === 0) throw notFound("seat_map");
}

export async function listSeatMaps(
  db: Db,
  ctx: OrgContext,
  filter: { venueId?: string } = {},
): Promise<SeatMapSummary[]> {
  authorizeOrg(ctx, "seatmap.manage");
  return db
    .select({
      id: seatMaps.id,
      name: seatMaps.name,
      venueId: seatMaps.venueId,
      venueName: venues.name,
      seatCount: seatMaps.seatCount,
      updatedAt: seatMaps.updatedAt,
    })
    .from(seatMaps)
    .innerJoin(venues, eq(venues.id, seatMaps.venueId))
    .where(
      and(
        eq(seatMaps.organizationId, ctx.organization.id),
        isNull(seatMaps.archivedAt),
        filter.venueId && isUuid(filter.venueId) ? eq(seatMaps.venueId, filter.venueId) : undefined,
      ),
    )
    .orderBy(desc(seatMaps.updatedAt));
}

export async function getSeatMap(
  db: Db,
  ctx: OrgContext,
  seatMapId: string,
): Promise<SeatMapSummary & { layout: Layout }> {
  authorizeOrg(ctx, "seatmap.manage");
  const [row] = isUuid(seatMapId)
    ? await db
        .select({
          id: seatMaps.id,
          name: seatMaps.name,
          venueId: seatMaps.venueId,
          venueName: venues.name,
          seatCount: seatMaps.seatCount,
          updatedAt: seatMaps.updatedAt,
          layout: seatMaps.layout,
        })
        .from(seatMaps)
        .innerJoin(venues, eq(venues.id, seatMaps.venueId))
        .where(ownMap(ctx, seatMapId))
    : [];
  if (!row) throw notFound("seat_map");
  return row;
}

// ---- An event's own copy -----------------------------------------------------------------

/** The draft event, locked, if nothing has been sold or reserved for it yet. */
async function lockUnsoldDraft(tx: DbOrTx, ctx: OrgContext, eventId: string) {
  const [event] = isUuid(eventId)
    ? await tx
        .select()
        .from(events)
        .where(and(eq(events.organizationId, ctx.organization.id), eq(events.id, eventId)))
        .for("update")
    : [];
  if (!event) throw notFound("event");
  if (event.status !== "draft") throw conflict("not_draft");
  const [busy] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.eventId, eventId));
  const [held] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(holds)
    .where(and(eq(holds.eventId, eventId), eq(holds.status, "active")));
  if ((busy?.n ?? 0) > 0 || (held?.n ?? 0) > 0) throw conflict("has_sales");
  return event;
}

/**
 * Gives a draft event its own copy of a seat map: the drawing, one row per section and
 * one row per seat. From then on the event's seating is independent of the map.
 */
export async function attachSeatMap(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
  seatMapId: string,
): Promise<{ seats: number }> {
  authorizeOrg(ctx, "event.manage");
  return deps.db.transaction(async (tx) => {
    const event = await lockUnsoldDraft(tx, ctx, eventId);
    const [map] = isUuid(seatMapId)
      ? await tx.select().from(seatMaps).where(ownMap(ctx, seatMapId))
      : [];
    if (!map) throw notFound("seat_map");
    // A plan of one hall says nothing about another.
    if (map.venueId !== event.venueId) throw conflict("venue_mismatch");
    const seats = seatsOf(map.layout);
    if (seats.length === 0) throw conflict("seat_map_empty");

    await removeSeating(tx, ctx, eventId);
    await tx.insert(eventSeatMaps).values({
      eventId,
      organizationId: ctx.organization.id,
      layout: map.layout,
      sourceSeatMapId: map.id,
      createdAt: deps.clock.now(),
    });
    const sections = await tx
      .insert(eventSections)
      .values(
        map.layout.sections
          .filter((section) => section.kind === "seated")
          .map((section, index) => ({
            organizationId: ctx.organization.id,
            eventId,
            sectionKey: section.key,
            name: section.name,
            sortOrder: index,
          })),
      )
      .returning({ id: eventSections.id, sectionKey: eventSections.sectionKey });
    const sectionId = new Map(sections.map((section) => [section.sectionKey, section.id]));

    // In batches: one statement cannot carry five thousand rows' worth of parameters.
    for (let start = 0; start < seats.length; start += 500) {
      await tx.insert(eventSeats).values(
        seats.slice(start, start + 500).map((seat) => ({
          organizationId: ctx.organization.id,
          eventId,
          eventSectionId: sectionId.get(seat.sectionKey)!,
          seatKey: seat.key,
          rowLabel: seat.rowLabel,
          seatLabel: seat.seatLabel,
          accessible: seat.accessible,
        })),
      );
    }
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: ctx.actor.userId,
      action: "event.seat_map_attached",
      entityType: "event",
      entityId: eventId,
      data: { seatMapId: map.id, seats: seats.length },
    });
    return { seats: seats.length };
  });
}

async function removeSeating(tx: DbOrTx, ctx: OrgContext, eventId: string): Promise<void> {
  const org = ctx.organization.id;
  // Seated ticket types are meaningless without their sections.
  await tx
    .delete(ticketTypes)
    .where(
      and(
        eq(ticketTypes.organizationId, org),
        eq(ticketTypes.eventId, eventId),
        eq(ticketTypes.kind, "seated"),
      ),
    );
  await tx
    .delete(eventSeats)
    .where(and(eq(eventSeats.organizationId, org), eq(eventSeats.eventId, eventId)));
  await tx
    .delete(eventSections)
    .where(and(eq(eventSections.organizationId, org), eq(eventSections.eventId, eventId)));
  await tx
    .delete(eventSeatMaps)
    .where(and(eq(eventSeatMaps.organizationId, org), eq(eventSeatMaps.eventId, eventId)));
}

/** Turns a draft event back into one without reserved seating. */
export async function detachSeatMap(deps: Deps, ctx: OrgContext, eventId: string): Promise<void> {
  authorizeOrg(ctx, "event.manage");
  await deps.db.transaction(async (tx) => {
    await lockUnsoldDraft(tx, ctx, eventId);
    await removeSeating(tx, ctx, eventId);
  });
}

async function requireEvent(
  db: DbOrTx,
  ctx: OrgContext,
  eventId: string,
  options: { lock?: boolean } = {},
) {
  const query = db
    .select()
    .from(events)
    .where(and(eq(events.organizationId, ctx.organization.id), eq(events.id, eventId)));
  const [event] = isUuid(eventId) ? await (options.lock ? query.for("update") : query) : [];
  if (!event) throw notFound("event");
  if (event.status === "cancelled") throw conflict("event_cancelled");
  return event;
}

export type SeatedTicketTypeInput = {
  name: string;
  description?: string;
  /** As typed, e.g. "25" or "12,50". */
  price: string;
  /** Sections this price applies to. */
  sectionIds: string[];
};

/** Creates or updates a ticket type sold by seat, for the given sections of the event. */
export async function saveSeatedTicketType(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
  ticketTypeId: string | null,
  input: SeatedTicketTypeInput,
): Promise<{ id: string }> {
  authorizeOrg(ctx, "event.manage");
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) throw invalid("invalid_name", { name: "required" });

  return deps.db.transaction(async (tx) => {
    const event = await requireEvent(tx, ctx, eventId, { lock: true });
    const priceAmount = parseMoneyInput(input.price, event.currency);
    if (priceAmount === null) throw invalid("invalid_price", { price: "invalid_price" });

    const wanted = [...new Set(input.sectionIds)].filter(isUuid);
    const sections = wanted.length
      ? await tx
          .select({ id: eventSections.id })
          .from(eventSections)
          .where(
            and(
              eq(eventSections.organizationId, ctx.organization.id),
              eq(eventSections.eventId, eventId),
              inArray(eventSections.id, wanted),
            ),
          )
      : [];
    if (sections.length === 0 || sections.length !== input.sectionIds.length) {
      throw invalid("invalid_sections", { sectionIds: "invalid_sections" });
    }

    const now = deps.clock.now();
    let id = ticketTypeId;
    if (id) {
      const updated = isUuid(id)
        ? await tx
            .update(ticketTypes)
            .set({
              name,
              description: input.description?.trim() || null,
              priceAmount,
              updatedAt: now,
            })
            .where(
              and(
                eq(ticketTypes.organizationId, ctx.organization.id),
                eq(ticketTypes.eventId, eventId),
                eq(ticketTypes.id, id),
                eq(ticketTypes.kind, "seated"),
                isNull(ticketTypes.archivedAt),
              ),
            )
            .returning({ id: ticketTypes.id })
        : [];
      if (updated.length === 0) throw notFound("ticket_type");
      await tx.delete(ticketTypeSections).where(eq(ticketTypeSections.ticketTypeId, id));
    } else {
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(ticketTypes)
        .where(eq(ticketTypes.eventId, eventId));
      const [created] = await tx
        .insert(ticketTypes)
        .values({
          organizationId: ctx.organization.id,
          eventId,
          kind: "seated",
          name,
          description: input.description?.trim() || null,
          priceAmount,
          capacity: null,
          sortOrder: count?.n ?? 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: ticketTypes.id });
      id = created!.id;
    }
    await tx
      .insert(ticketTypeSections)
      .values(
        sections.map((section) => ({ ticketTypeId: id!, eventSectionId: section.id, eventId })),
      );
    return { id: id! };
  });
}

/**
 * Takes seats off sale (a sound desk, a broken seat) or puts them back.
 * Only seats that are free change; held and sold seats are left alone.
 */
export async function setSeatsBlocked(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
  seatIds: string[],
  blocked: boolean,
): Promise<number> {
  authorizeOrg(ctx, "event.manage");
  await requireEvent(deps.db, ctx, eventId);
  const ids = seatIds.filter(isUuid);
  if (ids.length === 0) return 0;
  const rows = await deps.db
    .update(eventSeats)
    .set({ status: blocked ? "blocked" : "available" })
    .where(
      and(
        eq(eventSeats.organizationId, ctx.organization.id),
        eq(eventSeats.eventId, eventId),
        inArray(eventSeats.id, ids),
        eq(eventSeats.status, blocked ? "available" : "blocked"),
      ),
    )
    .returning({ id: eventSeats.id });
  return rows.length;
}

// ---- Reading -----------------------------------------------------------------------------

export type EventSeating = {
  layout: Layout;
  sections: {
    id: string;
    key: string;
    name: string;
    /** Seated ticket types on offer in this section, cheapest first. */
    ticketTypes: { id: string; name: string; priceAmount: number }[];
  }[];
  seats: {
    id: string;
    key: string;
    sectionId: string;
    rowLabel: string;
    seatLabel: string;
    accessible: boolean;
    status: "available" | "held" | "sold" | "blocked";
  }[];
};

async function loadSeating(db: DbOrTx, eventId: string): Promise<EventSeating | null> {
  const [map] = await db.select().from(eventSeatMaps).where(eq(eventSeatMaps.eventId, eventId));
  if (!map) return null;
  const [sections, seats, prices] = await Promise.all([
    db
      .select()
      .from(eventSections)
      .where(eq(eventSections.eventId, eventId))
      .orderBy(asc(eventSections.sortOrder)),
    db
      .select({
        id: eventSeats.id,
        key: eventSeats.seatKey,
        sectionId: eventSeats.eventSectionId,
        rowLabel: eventSeats.rowLabel,
        seatLabel: eventSeats.seatLabel,
        accessible: eventSeats.accessible,
        status: eventSeats.status,
      })
      .from(eventSeats)
      .where(eq(eventSeats.eventId, eventId)),
    db
      .select({
        sectionId: ticketTypeSections.eventSectionId,
        id: ticketTypes.id,
        name: ticketTypes.name,
        priceAmount: ticketTypes.priceAmount,
      })
      .from(ticketTypeSections)
      .innerJoin(ticketTypes, eq(ticketTypes.id, ticketTypeSections.ticketTypeId))
      .where(
        and(
          eq(ticketTypeSections.eventId, eventId),
          eq(ticketTypes.isActive, true),
          isNull(ticketTypes.archivedAt),
        ),
      )
      .orderBy(asc(ticketTypes.priceAmount), asc(ticketTypes.name)),
  ]);
  return {
    layout: map.layout,
    sections: sections.map((section) => ({
      id: section.id,
      key: section.sectionKey,
      name: section.name,
      ticketTypes: prices
        .filter((price) => price.sectionId === section.id)
        .map(({ id, name, priceAmount }) => ({ id, name, priceAmount })),
    })),
    seats,
  };
}

/** The event's seating as its organizer sees it, or null if it has none. */
export async function getEventSeating(
  db: Db,
  ctx: OrgContext,
  eventId: string,
): Promise<EventSeating | null> {
  authorizeOrg(ctx, "event.view");
  await requireEventReadable(db, ctx, eventId);
  return loadSeating(db, eventId);
}

async function requireEventReadable(db: Db, ctx: OrgContext, eventId: string): Promise<void> {
  const rows = isUuid(eventId)
    ? await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.organizationId, ctx.organization.id), eq(events.id, eventId)))
    : [];
  if (rows.length === 0) throw notFound("event");
}

/**
 * The seating of an event that is on sale, for buyers. Why a seat is unavailable is
 * nobody's business, so held, sold and blocked all read as "unavailable".
 */
export async function getPublicSeating(
  db: Db,
  eventId: string,
): Promise<
  | (Omit<EventSeating, "seats"> & {
      seats: (Omit<EventSeating["seats"][number], "status"> & { available: boolean })[];
    })
  | null
> {
  if (!isUuid(eventId)) return null;
  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.status, "published")));
  if (!event) return null;
  const seating = await loadSeating(db, eventId);
  if (!seating) return null;
  return {
    ...seating,
    seats: seating.seats.map(({ status, ...seat }) => ({
      ...seat,
      available: status === "available",
    })),
  };
}

/** Ids of the seats that cannot be chosen right now. Small, for frequent polling. */
export async function getUnavailableSeatIds(db: Db, eventId: string): Promise<string[]> {
  if (!isUuid(eventId)) return [];
  const rows = await db
    .select({ id: eventSeats.id })
    .from(eventSeats)
    .innerJoin(events, eq(events.id, eventSeats.eventId))
    .where(
      and(
        eq(eventSeats.eventId, eventId),
        eq(events.status, "published"),
        sql`${eventSeats.status} <> 'available'`,
      ),
    );
  return rows.map((row) => row.id);
}
