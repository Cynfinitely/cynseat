import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Actor } from "../../authz/actor";
import { authorizePlatform } from "../../authz/authorize";
import type { Db } from "../../db/client";
import { events, organization, seatMaps, venues } from "../../db/schema";
import { conflict, notFound } from "../../errors";
import type { Clock } from "../../ports/clock";
import { recordAudit } from "../audit/service";

type Deps = { db: Db; clock: Clock };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export type ModeratedVenue = {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  country: string;
  status: "active" | "hidden" | "merged";
  createdByOrganization: string | null;
  /** How many events point at this venue. */
  events: number;
  createdAt: Date;
};

/** The whole directory, hidden venues included, for platform admins. */
export async function listVenuesForModeration(
  deps: Pick<Deps, "db">,
  actor: Actor,
  query: string,
): Promise<ModeratedVenue[]> {
  authorizePlatform(actor, "platform.venues.moderate");
  const pattern = `%${escapeLike(query.trim())}%`;
  return deps.db
    .select({
      id: venues.id,
      name: venues.name,
      addressLine1: venues.addressLine1,
      city: venues.city,
      country: venues.country,
      status: venues.status,
      createdByOrganization: organization.name,
      events: sql<number>`(select count(*) from ${events} where ${events.venueId} = ${venues.id})::int`,
      createdAt: venues.createdAt,
    })
    .from(venues)
    .leftJoin(organization, eq(organization.id, venues.createdByOrgId))
    .where(
      and(
        sql`${venues.status} <> 'merged'`,
        query.trim() ? or(ilike(venues.name, pattern), ilike(venues.city, pattern)) : undefined,
      ),
    )
    .orderBy(desc(venues.createdAt))
    .limit(100);
}

/** Takes a venue out of the directory (spam, a private address) or puts it back. */
export async function setVenueHidden(
  deps: Deps,
  actor: Actor,
  venueId: string,
  hidden: boolean,
): Promise<void> {
  const admin = authorizePlatform(actor, "platform.venues.moderate");
  await deps.db.transaction(async (tx) => {
    const rows = UUID.test(venueId)
      ? await tx
          .update(venues)
          .set({ status: hidden ? "hidden" : "active", updatedAt: deps.clock.now() })
          .where(and(eq(venues.id, venueId), eq(venues.status, hidden ? "active" : "hidden")))
          .returning({ id: venues.id })
      : [];
    if (rows.length === 0) throw conflict("invalid_transition");
    await recordAudit(tx, {
      actorUserId: admin.userId,
      action: hidden ? "venue.hidden" : "venue.restored",
      entityType: "venue",
      entityId: venueId,
    });
  });
}

/**
 * Folds a duplicate venue into the one to keep: events and seat maps that used the
 * duplicate now use the kept venue. Events keep their own frozen copy of the address,
 * so nothing a buyer has already been told changes.
 */
export async function mergeVenues(
  deps: Deps,
  actor: Actor,
  input: { duplicateId: string; keepId: string },
): Promise<{ events: number; seatMaps: number }> {
  const admin = authorizePlatform(actor, "platform.venues.moderate");
  if (!UUID.test(input.duplicateId) || !UUID.test(input.keepId)) throw notFound("venue");
  if (input.duplicateId === input.keepId) throw conflict("same_venue");

  return deps.db.transaction(async (tx) => {
    // Both rows locked in id order, so two opposite merges cannot deadlock.
    const locked = await tx
      .select()
      .from(venues)
      .where(inArray(venues.id, [input.duplicateId, input.keepId]))
      .orderBy(venues.id)
      .for("update");
    const duplicate = locked.find((venue) => venue.id === input.duplicateId);
    const keep = locked.find((venue) => venue.id === input.keepId);
    if (!duplicate || !keep) throw notFound("venue");
    if (duplicate.status === "merged" || keep.status === "merged")
      throw conflict("invalid_transition");

    const movedEvents = await tx
      .update(events)
      .set({ venueId: keep.id })
      .where(eq(events.venueId, duplicate.id))
      .returning({ id: events.id });
    const movedMaps = await tx
      .update(seatMaps)
      .set({ venueId: keep.id })
      .where(eq(seatMaps.venueId, duplicate.id))
      .returning({ id: seatMaps.id });
    await tx
      .update(venues)
      .set({ status: "merged", mergedIntoId: keep.id, updatedAt: deps.clock.now() })
      .where(eq(venues.id, duplicate.id));
    await recordAudit(tx, {
      actorUserId: admin.userId,
      action: "venue.merged",
      entityType: "venue",
      entityId: duplicate.id,
      data: { into: keep.id, events: movedEvents.length, seatMaps: movedMaps.length },
    });
    return { events: movedEvents.length, seatMaps: movedMaps.length };
  });
}
