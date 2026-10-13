import type { VenueInput } from "../../../domain/venues/schemas";
import { authorizeOrg } from "../../authz/authorize";
import type { Db } from "../../db/client";
import { conflict, forbidden, notFound } from "../../errors";
import type { Clock } from "../../ports/clock";
import { recordAudit } from "../audit/service";
import type { OrgContext } from "../orgs/service";
import * as repo from "./repo";

export type { Venue } from "./repo";

const SEARCH_LIMIT = 20;

/** The shared directory, searchable by any organization member who can manage events. */
export async function searchVenues(db: Db, ctx: OrgContext, query: string): Promise<repo.Venue[]> {
  authorizeOrg(ctx, "event.manage");
  return repo.searchActiveVenues(db, query.trim(), SEARCH_LIMIT);
}

export async function createVenue(
  deps: { db: Db; clock: Clock },
  ctx: OrgContext,
  input: VenueInput,
): Promise<repo.Venue> {
  authorizeOrg(ctx, "venue.manage");
  return deps.db.transaction(async (tx) => {
    const duplicate = await repo.findDuplicateVenue(tx, input);
    if (duplicate) throw conflict("venue_exists", { name: "venue_exists" });

    const now = deps.clock.now();
    const venue = await repo.insertVenue(tx, {
      name: input.name,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ?? null,
      postalCode: input.postalCode ?? null,
      city: input.city,
      country: input.country,
      timezone: input.timezone,
      capacity: input.capacity ?? null,
      createdByOrgId: ctx.organization.id,
      createdByUserId: ctx.actor.userId,
      createdAt: now,
      updatedAt: now,
    });
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: ctx.actor.userId,
      action: "venue.created",
      entityType: "venue",
      entityId: venue.id,
      data: { name: venue.name, city: venue.city },
    });
    return venue;
  });
}

/** Only the organization that added a venue may change it; everyone else just uses it. */
export async function updateVenue(
  deps: { db: Db; clock: Clock },
  ctx: OrgContext,
  venueId: string,
  input: VenueInput,
): Promise<void> {
  authorizeOrg(ctx, "venue.manage");
  await deps.db.transaction(async (tx) => {
    const venue = await repo.findVenueById(tx, venueId);
    if (!venue || venue.status !== "active") throw notFound("venue");
    if (venue.createdByOrgId !== ctx.organization.id) throw forbidden("venue_not_yours");

    await repo.updateVenueById(tx, venueId, {
      name: input.name,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ?? null,
      postalCode: input.postalCode ?? null,
      city: input.city,
      country: input.country,
      timezone: input.timezone,
      capacity: input.capacity ?? null,
      updatedAt: deps.clock.now(),
    });
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actorUserId: ctx.actor.userId,
      action: "venue.updated",
      entityType: "venue",
      entityId: venueId,
    });
  });
}
