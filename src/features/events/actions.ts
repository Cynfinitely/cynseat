"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/app/_lib/action";
import { getActor } from "@/app/_lib/session";
import {
  cancelEventSchema,
  createEventSchema,
  eventTranslationSchema,
  eventVenueSchema,
  ticketTypeSchema,
  updateEventSchema,
} from "@/domain/events/schemas";
import { contentLocales } from "@/domain/events/types";
import { venueSchema, venueSearchSchema } from "@/domain/venues/schemas";
import { getApp } from "@/server";
import type { App } from "@/server/app";
import * as events from "@/server/modules/events/service";
import { getOrgContext, type OrgContext } from "@/server/modules/orgs/service";
import { createVenue, searchVenues } from "@/server/modules/venues/service";

const nothing = z.undefined();

/** Runs an organizer action for the organization in the URL, then refreshes its pages. */
async function orgAction<Schema extends z.ZodType, T>(
  orgSlug: string,
  schema: Schema,
  input: unknown,
  run: (app: App, ctx: OrgContext, data: z.output<Schema>) => Promise<T>,
): Promise<ActionResult<T>> {
  return runAction(schema, input, async (data) => {
    const app = getApp();
    const ctx = await getOrgContext(app.db, await getActor(), orgSlug);
    const result = await run(app, ctx, data);
    revalidatePath("/[locale]/dashboard/[orgSlug]", "layout");
    return result;
  });
}

export async function createEventAction(orgSlug: string, input: unknown) {
  return orgAction(orgSlug, createEventSchema, input, (app, ctx, data) =>
    events.createEvent(app, ctx, data),
  );
}

export async function updateEventAction(orgSlug: string, eventId: string, input: unknown) {
  return orgAction(orgSlug, updateEventSchema, input, (app, ctx, data) =>
    events.updateEvent(app, ctx, eventId, data),
  );
}

export async function saveTranslationAction(orgSlug: string, eventId: string, input: unknown) {
  return orgAction(orgSlug, eventTranslationSchema, input, (app, ctx, data) =>
    events.saveTranslation(app, ctx, eventId, data),
  );
}

export async function removeTranslationAction(orgSlug: string, eventId: string, locale: unknown) {
  return orgAction(orgSlug, z.enum(contentLocales), locale, (app, ctx, data) =>
    events.removeTranslation(app, ctx, eventId, data),
  );
}

export async function setEventVenueAction(orgSlug: string, eventId: string, input: unknown) {
  return orgAction(orgSlug, eventVenueSchema, input, (app, ctx, data) =>
    events.setEventVenue(app, ctx, eventId, data),
  );
}

export type VenueOption = {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  country: string;
  capacity: number | null;
};

export async function searchVenuesAction(
  orgSlug: string,
  input: unknown,
): Promise<ActionResult<VenueOption[]>> {
  return orgAction(orgSlug, venueSearchSchema, input, async (app, ctx, data) => {
    const found = await searchVenues(app.db, ctx, data.query);
    return found.map(({ id, name, addressLine1, city, country, capacity }) => ({
      id,
      name,
      addressLine1,
      city,
      country,
      capacity,
    }));
  });
}

/** Adds a venue to the shared directory and puts the event there. */
export async function createVenueForEventAction(orgSlug: string, eventId: string, input: unknown) {
  return orgAction(orgSlug, venueSchema, input, async (app, ctx, data) => {
    const venue = await createVenue(app, ctx, data);
    await events.setEventVenue(app, ctx, eventId, { kind: "venue", venueId: venue.id });
    return undefined;
  });
}

export async function createTicketTypeAction(orgSlug: string, eventId: string, input: unknown) {
  return orgAction(orgSlug, ticketTypeSchema, input, (app, ctx, data) =>
    events.createTicketType(app, ctx, eventId, data),
  );
}

export async function updateTicketTypeAction(
  orgSlug: string,
  eventId: string,
  ticketTypeId: string,
  input: unknown,
) {
  return orgAction(orgSlug, ticketTypeSchema, input, (app, ctx, data) =>
    events.updateTicketType(app, ctx, eventId, ticketTypeId, data),
  );
}

export async function removeTicketTypeAction(
  orgSlug: string,
  eventId: string,
  ticketTypeId: string,
) {
  return orgAction(orgSlug, nothing, undefined, (app, ctx) =>
    events.removeTicketType(app, ctx, eventId, ticketTypeId),
  );
}

export async function publishEventAction(orgSlug: string, eventId: string) {
  return orgAction(orgSlug, nothing, undefined, async (app, ctx) => {
    await events.publishEvent(app, ctx, eventId);
    revalidatePath("/[locale]", "layout");
  });
}

export async function unpublishEventAction(orgSlug: string, eventId: string) {
  return orgAction(orgSlug, nothing, undefined, (app, ctx) =>
    events.unpublishEvent(app, ctx, eventId),
  );
}

export async function cancelEventAction(orgSlug: string, eventId: string, input: unknown) {
  return orgAction(orgSlug, cancelEventSchema, input, (app, ctx, data) =>
    events.cancelEvent(app, ctx, eventId, data.reason),
  );
}

export async function deleteDraftEventAction(orgSlug: string, eventId: string) {
  return orgAction(orgSlug, nothing, undefined, (app, ctx) =>
    events.deleteDraftEvent(app, ctx, eventId),
  );
}
