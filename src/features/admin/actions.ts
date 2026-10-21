"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/app/_lib/action";
import { getActor } from "@/app/_lib/session";
import { reviewOrganizationSchema } from "@/domain/orgs/schemas";
import { getApp } from "@/server";
import { dispatchEmails } from "@/server/modules/notifications/service";
import { reviewOrganization } from "@/server/modules/orgs/service";

export async function reviewOrganizationAction(input: unknown): Promise<ActionResult> {
  return runAction(reviewOrganizationSchema, input, async (data) => {
    const app = getApp();
    const { jobIds } = await reviewOrganization(app, await getActor(), data);
    // The decision is committed; a failed send here is retried by the outbox sweep.
    if (jobIds.length > 0) await dispatchEmails(app, { ids: jobIds });
    revalidatePath("/[locale]/admin/organizations", "page");
    return undefined;
  });
}
