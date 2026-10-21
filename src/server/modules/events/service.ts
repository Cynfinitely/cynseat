import { publishProblemsFor } from "../../../domain/events/rules";
import type {
  CreateEventInput,
  EventTranslationInput,
  EventVenueInput,
  TicketTypeInput,
  UpdateEventInput,
} from "../../../domain/events/schemas";
import type { ContentLocale, PublishProblem } from "../../../domain/events/types";
import { detectImageType, imageTypes, MAX_IMAGE_BYTES } from "../../../domain/images/detect";
import { parseMoneyInput } from "../../../domain/money/money";
import { slugify, SLUG_MAX_LENGTH } from "../../../domain/slug/slug";
import { fromZonedInput } from "../../../domain/time/zoned";
import { authorizeOrg } from "../../authz/authorize";
import type { Db } from "../../db/client";
import type { VenueSnapshot } from "../../db/schema";
import { conflict, invalid, notFound } from "../../errors";
import { randomBytes } from "node:crypto";
import type { Clock } from "../../ports/clock";
import type { ObjectStore } from "../../ports/object-store";
import { recordAudit } from "../audit/service";
import type { DbOrTx } from "../notifications/service";
import type { OrgContext } from "../orgs/service";
import { findVenueById, type Venue } from "../venues/repo";
import * as repo from "./repo";

type Deps = { db: Db; clock: Clock };

export type OrgEventSummary = Awaited<ReturnType<typeof repo.findOrgEvents>>[number];

export type OrgEventDetail = {
  event: repo.EventRow;
  translations: repo.TranslationRow[];
  ticketTypes: repo.TicketTypeRow[];
  venue: Venue | null;
  /** Empty when the event can be published. */
  publishProblems: PublishProblem[];
};

/** Parses a wall-clock time in the event's zone, naming the field if it is not a real time. */
function instant(local: string, timeZone: string, field: string): Date {
  const date = fromZonedInput(local, timeZone);
  if (!date) throw invalid("invalid_date", { [field]: "invalid_date" });
  return date;
}

const optionalInstant = (local: string | undefined, timeZone: string, field: string) =>
  local ? instant(local, timeZone, field) : null;

function snapshotOf(venue: Venue): VenueSnapshot {
  return {
    name: venue.name,
    addressLine1: venue.addressLine1,
    addressLine2: venue.addressLine2,
    postalCode: venue.postalCode,
    city: venue.city,
    country: venue.country,
  };
}

async function freeSlug(db: DbOrTx, organizationId: string, title: string): Promise<string> {
  const base = slugify(title) || "event";
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const suffix = attempt === 1 ? "" : `-${attempt}`;
    const slug = `${base.slice(0, SLUG_MAX_LENGTH - suffix.length)}${suffix}`;
    if (!(await repo.slugTaken(db, organizationId, slug))) return slug;
  }
  throw conflict("slug_taken");
}

/** Loads an event of the caller's organization, or reports it as not found. */
async function requireEvent(
  db: DbOrTx,
  ctx: OrgContext,
  eventId: string,
  options: { lock?: boolean; editable?: boolean } = {},
): Promise<repo.EventRow> {
  const event = await repo.findEvent(db, ctx.organization.id, eventId, options);
  if (!event) throw notFound("event");
  if (options.editable && event.status === "cancelled") throw conflict("event_cancelled");
  return event;
}

export async function createEvent(
  deps: Deps,
  ctx: OrgContext,
  input: CreateEventInput,
): Promise<{ id: string; slug: string }> {
  authorizeOrg(ctx, "event.manage");
  const startsAt = instant(input.startsAt, input.timezone, "startsAt");
  const now = deps.clock.now();

  return deps.db.transaction(async (tx) => {
    const event = await repo.insertEvent(tx, {
      organizationId: ctx.organization.id,
      slug: await freeSlug(tx, ctx.organization.id, input.title),
      category: input.category,
      defaultLocale: input.locale,
      timezone: input.timezone,
      startsAt,
      currency: ctx.profile.defaultCurrency,
      createdBy: ctx.actor.userId,
      createdAt: now,
      updatedAt: now,
    });
    await repo.upsertTranslation(tx, {
      eventId: event.id,
      organizationId: ctx.organization.id,
      locale: input.locale,
      title: input.title,
      updatedAt: now,
    });
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: ctx.actor.userId,
      action: "event.created",
      entityType: "event",
      entityId: event.id,
      data: { title: input.title },
    });
    return { id: event.id, slug: event.slug };
  });
}

export async function updateEvent(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
  input: UpdateEventInput,
): Promise<void> {
  authorizeOrg(ctx, "event.manage");
  const startsAt = instant(input.startsAt, input.timezone, "startsAt");
  const endsAt = optionalInstant(input.endsAt, input.timezone, "endsAt");
  const doorsAt = optionalInstant(input.doorsAt, input.timezone, "doorsAt");
  if (endsAt && endsAt <= startsAt)
    throw invalid("ends_before_start", { endsAt: "ends_before_start" });
  if (doorsAt && doorsAt > startsAt)
    throw invalid("doors_after_start", { doorsAt: "doors_after_start" });

  await deps.db.transaction(async (tx) => {
    const event = await requireEvent(tx, ctx, eventId, { lock: true, editable: true });
    // Prices are stored in the event's currency, so it is fixed once the event is public.
    if (event.status !== "draft" && input.currency !== event.currency) {
      throw conflict("currency_locked", { currency: "currency_locked" });
    }
    await repo.updateEvent(tx, ctx.organization.id, eventId, {
      category: input.category,
      visibility: input.visibility,
      timezone: input.timezone,
      startsAt,
      endsAt,
      doorsAt,
      currency: input.currency,
      maxTicketsPerOrder: input.maxTicketsPerOrder,
      updatedAt: deps.clock.now(),
    });
  });
}

export async function saveTranslation(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
  input: EventTranslationInput,
): Promise<void> {
  authorizeOrg(ctx, "event.manage");
  await deps.db.transaction(async (tx) => {
    await requireEvent(tx, ctx, eventId, { editable: true });
    await repo.upsertTranslation(tx, {
      eventId,
      organizationId: ctx.organization.id,
      locale: input.locale,
      title: input.title,
      summary: input.summary ?? null,
      description: input.description ?? null,
      updatedAt: deps.clock.now(),
    });
  });
}

export async function removeTranslation(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
  locale: ContentLocale,
): Promise<void> {
  authorizeOrg(ctx, "event.manage");
  await deps.db.transaction(async (tx) => {
    const event = await requireEvent(tx, ctx, eventId, { editable: true });
    if (event.defaultLocale === locale) throw conflict("default_translation");
    await repo.deleteTranslation(tx, ctx.organization.id, eventId, locale);
  });
}

export async function setEventVenue(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
  input: EventVenueInput,
): Promise<void> {
  authorizeOrg(ctx, "event.manage");
  await deps.db.transaction(async (tx) => {
    await requireEvent(tx, ctx, eventId, { lock: true, editable: true });
    const now = deps.clock.now();

    if (input.kind !== "venue") {
      await repo.updateEvent(tx, ctx.organization.id, eventId, {
        venueId: null,
        venueSnapshot: null,
        isOnline: input.kind === "online",
        updatedAt: now,
      });
      return;
    }

    const venue = await findVenueById(tx, input.venueId);
    if (!venue || venue.status !== "active") throw notFound("venue");
    await repo.updateEvent(tx, ctx.organization.id, eventId, {
      venueId: venue.id,
      venueSnapshot: snapshotOf(venue),
      isOnline: false,
      updatedAt: now,
    });
  });
}

// ---- Poster ------------------------------------------------------------------------------

/** Replaces the event's poster. `bytes` must be a JPEG, PNG or WebP of at most 4 MB. */
export async function setEventCover(
  deps: Deps & { store: ObjectStore },
  ctx: OrgContext,
  eventId: string,
  bytes: Uint8Array,
): Promise<{ url: string }> {
  authorizeOrg(ctx, "event.manage");
  const event = await requireEvent(deps.db, ctx, eventId, { editable: true });
  if (bytes.byteLength > MAX_IMAGE_BYTES)
    throw invalid("image_too_large", { cover: "image_too_large" });
  const type = detectImageType(bytes);
  if (!type) throw invalid("image_type", { cover: "image_type" });

  // A fresh, unguessable name per upload: stored files never change, so they cache forever.
  const key = `events/${event.id}/${randomBytes(12).toString("hex")}.${imageTypes[type]}`;
  const { url } = await deps.store.put({ key, body: bytes, contentType: type });
  await repo.updateEvent(deps.db, ctx.organization.id, eventId, {
    coverImageUrl: url,
    updatedAt: deps.clock.now(),
  });
  if (event.coverImageUrl) await deps.store.delete(event.coverImageUrl).catch(() => {});
  return { url };
}

export async function removeEventCover(
  deps: Deps & { store: ObjectStore },
  ctx: OrgContext,
  eventId: string,
): Promise<void> {
  authorizeOrg(ctx, "event.manage");
  const event = await requireEvent(deps.db, ctx, eventId, { editable: true });
  if (!event.coverImageUrl) return;
  await repo.updateEvent(deps.db, ctx.organization.id, eventId, {
    coverImageUrl: null,
    updatedAt: deps.clock.now(),
  });
  await deps.store.delete(event.coverImageUrl).catch(() => {});
}

// ---- Ticket types ------------------------------------------------------------------------

function ticketTypeValues(event: repo.EventRow, input: TicketTypeInput) {
  const priceAmount = parseMoneyInput(input.price, event.currency);
  if (priceAmount === null) throw invalid("invalid_price", { price: "invalid_price" });
  const salesStartAt = optionalInstant(input.salesStartAt, event.timezone, "salesStartAt");
  const salesEndAt = optionalInstant(input.salesEndAt, event.timezone, "salesEndAt");
  if (salesStartAt && salesEndAt && salesEndAt <= salesStartAt) {
    throw invalid("ends_before_start", { salesEndAt: "ends_before_start" });
  }
  return {
    name: input.name,
    description: input.description ?? null,
    priceAmount,
    capacity: input.capacity,
    salesStartAt,
    salesEndAt,
    maxPerOrder: input.maxPerOrder ?? null,
  };
}

export async function createTicketType(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
  input: TicketTypeInput,
): Promise<{ id: string }> {
  authorizeOrg(ctx, "event.manage");
  return deps.db.transaction(async (tx) => {
    const event = await requireEvent(tx, ctx, eventId, { lock: true, editable: true });
    const existing = await repo.findTicketTypes(tx, ctx.organization.id, eventId);
    const now = deps.clock.now();
    const created = await repo.insertTicketType(tx, {
      ...ticketTypeValues(event, input),
      organizationId: ctx.organization.id,
      eventId,
      kind: "ga",
      sortOrder: existing.length,
      createdAt: now,
      updatedAt: now,
    });
    return { id: created.id };
  });
}

export async function updateTicketType(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
  ticketTypeId: string,
  input: TicketTypeInput,
): Promise<void> {
  authorizeOrg(ctx, "event.manage");
  await deps.db.transaction(async (tx) => {
    const event = await requireEvent(tx, ctx, eventId, { editable: true });
    const current = await repo.findTicketType(tx, ctx.organization.id, eventId, ticketTypeId);
    if (!current) throw notFound("ticket_type");

    const updated = await repo.updateTicketType(tx, ctx.organization.id, eventId, ticketTypeId, {
      ...ticketTypeValues(event, input),
      updatedAt: deps.clock.now(),
    });
    // The row exists, so the only reason nothing matched is the capacity guard.
    if (!updated) throw conflict("capacity_below_sold", { capacity: "capacity_below_sold" });
  });
}

/** Removes a ticket type: deleted outright if unused, otherwise kept for its orders but hidden. */
export async function removeTicketType(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
  ticketTypeId: string,
): Promise<void> {
  authorizeOrg(ctx, "event.manage");
  await deps.db.transaction(async (tx) => {
    await requireEvent(tx, ctx, eventId, { editable: true });
    const current = await repo.findTicketType(tx, ctx.organization.id, eventId, ticketTypeId);
    if (!current) throw notFound("ticket_type");
    const deleted = await repo.deleteUnusedTicketType(
      tx,
      ctx.organization.id,
      eventId,
      ticketTypeId,
    );
    if (!deleted) {
      await repo.archiveTicketType(
        tx,
        ctx.organization.id,
        eventId,
        ticketTypeId,
        deps.clock.now(),
      );
    }
  });
}

// ---- Lifecycle ---------------------------------------------------------------------------

async function problemsFor(
  db: DbOrTx,
  ctx: OrgContext,
  event: repo.EventRow,
  now: Date,
  loaded?: { translations: repo.TranslationRow[]; ticketTypes: repo.TicketTypeRow[] },
): Promise<PublishProblem[]> {
  const translations =
    loaded?.translations ?? (await repo.findTranslations(db, ctx.organization.id, event.id));
  const types =
    loaded?.ticketTypes ?? (await repo.findTicketTypes(db, ctx.organization.id, event.id));
  return publishProblemsFor({
    orgApproved: ctx.profile.approvalStatus === "approved",
    hasDefaultTitle: translations.some((row) => row.locale === event.defaultLocale),
    hasPlace: event.isOnline || event.venueId !== null,
    startsAt: event.startsAt,
    now,
    activeTicketTypes: types.filter((type) => type.isActive).length,
    hasPaidTickets: types.some((type) => type.isActive && type.priceAmount > 0),
    paymentsReady: ctx.profile.stripeAccountId !== null && ctx.profile.stripeChargesEnabled,
  });
}

export async function publishEvent(deps: Deps, ctx: OrgContext, eventId: string): Promise<void> {
  authorizeOrg(ctx, "event.publish");
  await deps.db.transaction(async (tx) => {
    const event = await requireEvent(tx, ctx, eventId, { lock: true });
    if (event.status !== "draft") throw conflict("not_draft");

    const now = deps.clock.now();
    const problems = await problemsFor(tx, ctx, event, now);
    if (problems.length > 0) {
      throw conflict("cannot_publish", Object.fromEntries(problems.map((p) => [p, p])));
    }

    // Freeze the venue details buyers will see on their tickets.
    const venue = event.venueId ? await findVenueById(tx, event.venueId) : undefined;
    await repo.updateEvent(tx, ctx.organization.id, eventId, {
      status: "published",
      publishedAt: event.publishedAt ?? now,
      venueSnapshot: venue ? snapshotOf(venue) : event.venueSnapshot,
      updatedAt: now,
    });
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: ctx.actor.userId,
      action: "event.published",
      entityType: "event",
      entityId: eventId,
    });
  });
}

/** Takes a published event back to draft. Only possible while nothing has been sold. */
export async function unpublishEvent(deps: Deps, ctx: OrgContext, eventId: string): Promise<void> {
  authorizeOrg(ctx, "event.publish");
  await deps.db.transaction(async (tx) => {
    const event = await requireEvent(tx, ctx, eventId, { lock: true });
    if (event.status !== "published") throw conflict("not_published");
    const types = await repo.findTicketTypes(tx, ctx.organization.id, eventId);
    if (types.some((type) => type.qtySold > 0 || type.qtyHeld > 0)) throw conflict("has_sales");

    await repo.updateEvent(tx, ctx.organization.id, eventId, {
      status: "draft",
      updatedAt: deps.clock.now(),
    });
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: ctx.actor.userId,
      action: "event.unpublished",
      entityType: "event",
      entityId: eventId,
    });
  });
}

export async function cancelEvent(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
  reason: string | undefined,
): Promise<void> {
  authorizeOrg(ctx, "event.publish");
  await deps.db.transaction(async (tx) => {
    const event = await requireEvent(tx, ctx, eventId, { lock: true });
    if (event.status !== "published") throw conflict("not_published");
    const now = deps.clock.now();
    await repo.updateEvent(tx, ctx.organization.id, eventId, {
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: reason ?? null,
      updatedAt: now,
    });
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: ctx.actor.userId,
      action: "event.cancelled",
      entityType: "event",
      entityId: eventId,
      data: { reason: reason ?? null },
    });
  });
}

/** Deletes a draft that was never published. */
export async function deleteDraftEvent(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
): Promise<void> {
  authorizeOrg(ctx, "event.manage");
  await deps.db.transaction(async (tx) => {
    const event = await requireEvent(tx, ctx, eventId, { lock: true });
    if (event.status !== "draft" || event.publishedAt) throw conflict("not_draft");
    await repo.deleteEvent(tx, ctx.organization.id, eventId);
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: ctx.actor.userId,
      action: "event.deleted",
      entityType: "event",
      entityId: eventId,
    });
  });
}

// ---- Reads -------------------------------------------------------------------------------

export async function listOrgEvents(db: Db, ctx: OrgContext): Promise<OrgEventSummary[]> {
  authorizeOrg(ctx, "event.view");
  return repo.findOrgEvents(db, ctx.organization.id);
}

export async function getOrgEvent(
  deps: Deps,
  ctx: OrgContext,
  eventId: string,
): Promise<OrgEventDetail> {
  authorizeOrg(ctx, "event.view");
  const event = await requireEvent(deps.db, ctx, eventId);
  const [translations, ticketTypes, venue] = await Promise.all([
    repo.findTranslations(deps.db, ctx.organization.id, eventId),
    repo.findTicketTypes(deps.db, ctx.organization.id, eventId),
    event.venueId ? findVenueById(deps.db, event.venueId) : undefined,
  ]);
  return {
    event,
    translations,
    ticketTypes,
    venue: venue ?? null,
    publishProblems:
      event.status === "draft"
        ? await problemsFor(deps.db, ctx, event, deps.clock.now(), { translations, ticketTypes })
        : [],
  };
}
