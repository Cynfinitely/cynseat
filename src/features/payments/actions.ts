"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { runAction, type ActionResult } from "@/app/_lib/action";
import { getActor } from "@/app/_lib/session";
import { getApp } from "@/server";
import { getOrgContext } from "@/server/modules/orgs/service";
import { startPaymentOnboarding } from "@/server/modules/payments/service";

/** Returns the link to the payment provider's onboarding form for this organization. */
export async function startPaymentOnboardingAction(
  orgSlug: string,
): Promise<ActionResult<{ url: string }>> {
  return runAction(z.undefined(), undefined, async () => {
    const app = getApp();
    const ctx = await getOrgContext(app.db, await getActor(), orgSlug);
    return startPaymentOnboarding(app, ctx, await getLocale());
  });
}
