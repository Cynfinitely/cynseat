"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/app/_lib/action";
import { getActor } from "@/app/_lib/session";
import { registerOrganizationSchema, updateOrgProfileSchema } from "@/domain/orgs/schemas";
import { getApp } from "@/server";
import {
  getOrgContext,
  registerOrganization,
  updateOrgProfile,
} from "@/server/modules/orgs/service";

export async function registerOrganizationAction(
  input: unknown,
): Promise<ActionResult<{ slug: string }>> {
  return runAction(registerOrganizationSchema, input, async (data) => {
    const org = await registerOrganization(getApp(), await getActor(), data);
    revalidatePath("/[locale]/dashboard", "layout");
    return { slug: org.slug };
  });
}

export async function updateOrgProfileAction(
  orgSlug: string,
  input: unknown,
): Promise<ActionResult> {
  return runAction(updateOrgProfileSchema, input, async (data) => {
    const app = getApp();
    const ctx = await getOrgContext(app.db, await getActor(), orgSlug);
    await updateOrgProfile(app.db, ctx, data);
    revalidatePath("/[locale]/dashboard/[orgSlug]", "layout");
    return undefined;
  });
}
