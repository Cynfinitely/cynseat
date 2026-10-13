"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { runAction, type ActionResult } from "@/app/_lib/action";
import { enforceRateLimit } from "@/app/_lib/rate-limit";
import { getApp } from "@/server";
import { sendOrderLinks } from "@/server/modules/checkout/service";

const schema = z.object({ email: z.email("invalid_email").max(254, "too_long") });

/** Always answers the same way, whether or not the address has orders. */
export async function sendOrderLinksAction(input: unknown): Promise<ActionResult> {
  return runAction(schema, input, async ({ email }) => {
    // Per caller, and per address asked about, so nobody's inbox can be flooded.
    await enforceRateLimit("orderLinks");
    await enforceRateLimit("orderLinks", email.toLowerCase());
    await sendOrderLinks(getApp(), email, await getLocale());
    return undefined;
  });
}
