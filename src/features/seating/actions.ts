"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/app/_lib/action";
import { getActor } from "@/app/_lib/session";
import { getApp } from "@/server";
import type { App } from "@/server/app";
import { getOrgContext, type OrgContext } from "@/server/modules/orgs/service";
import * as seatmaps from "@/server/modules/seatmaps/service";

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

const nameSchema = z.string().trim().min(1, "required").max(80, "too_long");

export async function createSeatMapAction(orgSlug: string, input: unknown) {
  return orgAction(
    orgSlug,
    z.object({ venueId: z.uuid(), name: nameSchema }),
    input,
    (app, ctx, data) => seatmaps.createSeatMap(app, ctx, data),
  );
}

export async function saveSeatMapAction(orgSlug: string, seatMapId: string, input: unknown) {
  // The drawing is validated in full by the use-case, against the seat-map schema.
  return orgAction(
    orgSlug,
    z.object({ name: nameSchema, layout: z.unknown() }),
    input,
    (app, ctx, data) => seatmaps.saveSeatMap(app, ctx, seatMapId, data),
  );
}

export async function attachSeatMapAction(orgSlug: string, eventId: string, seatMapId: unknown) {
  return orgAction(orgSlug, z.uuid(), seatMapId, (app, ctx, id) =>
    seatmaps.attachSeatMap(app, ctx, eventId, id),
  );
}

export async function detachSeatMapAction(orgSlug: string, eventId: string) {
  return orgAction(orgSlug, z.undefined(), undefined, (app, ctx) =>
    seatmaps.detachSeatMap(app, ctx, eventId),
  );
}

const seatedTypeSchema = z.object({
  id: z.uuid().nullable(),
  name: nameSchema,
  price: z.string().trim().min(1, "required").max(12, "invalid_price"),
  sectionIds: z.array(z.uuid()).min(1, "invalid_sections").max(60),
});

export async function saveSeatedTicketTypeAction(orgSlug: string, eventId: string, input: unknown) {
  return orgAction(orgSlug, seatedTypeSchema, input, (app, ctx, { id, ...data }) =>
    seatmaps.saveSeatedTicketType(app, ctx, eventId, id, data),
  );
}

const blockSchema = z.object({ seatIds: z.array(z.uuid()).min(1).max(500), blocked: z.boolean() });

export async function setSeatsBlockedAction(orgSlug: string, eventId: string, input: unknown) {
  return orgAction(orgSlug, blockSchema, input, (app, ctx, data) =>
    seatmaps.setSeatsBlocked(app, ctx, eventId, data.seatIds, data.blocked),
  );
}
