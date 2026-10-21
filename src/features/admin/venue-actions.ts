"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/app/_lib/action";
import { getActor } from "@/app/_lib/session";
import { getApp } from "@/server";
import { mergeVenues, setVenueHidden } from "@/server/modules/venues/moderation";

export async function setVenueHiddenAction(input: unknown): Promise<ActionResult> {
  return runAction(z.object({ venueId: z.uuid(), hidden: z.boolean() }), input, async (data) => {
    await setVenueHidden(getApp(), await getActor(), data.venueId, data.hidden);
    revalidatePath("/[locale]/admin/venues", "page");
    return undefined;
  });
}

export async function mergeVenuesAction(
  input: unknown,
): Promise<ActionResult<{ events: number; seatMaps: number }>> {
  return runAction(z.object({ duplicateId: z.uuid(), keepId: z.uuid() }), input, async (data) => {
    const moved = await mergeVenues(getApp(), await getActor(), data);
    revalidatePath("/[locale]/admin/venues", "page");
    return moved;
  });
}
