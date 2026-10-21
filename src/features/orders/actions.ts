"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/app/_lib/action";
import { getActor } from "@/app/_lib/session";
import { getApp } from "@/server";
import { getOrgContext } from "@/server/modules/orgs/service";
import { refundOrder, retryRefund } from "@/server/modules/refunds/service";

const refundSchema = z.object({
  orderId: z.uuid(),
  /** Omitted to refund every remaining ticket. */
  ticketIds: z.array(z.uuid()).min(1).max(50).optional(),
  restock: z.boolean(),
});

type Outcome = { status: "succeeded" | "pending" | "failed" };

export async function refundOrderAction(
  orgSlug: string,
  input: unknown,
): Promise<ActionResult<Outcome>> {
  return runAction(refundSchema, input, async (data) => {
    const app = getApp();
    const ctx = await getOrgContext(app.db, await getActor(), orgSlug);
    const { status } = await refundOrder(app, ctx, data.orderId, data);
    revalidatePath("/[locale]/dashboard/[orgSlug]", "layout");
    return { status };
  });
}

export async function retryRefundAction(
  orgSlug: string,
  refundId: unknown,
): Promise<ActionResult<Outcome>> {
  return runAction(z.uuid(), refundId, async (id) => {
    const app = getApp();
    const ctx = await getOrgContext(app.db, await getActor(), orgSlug);
    const { status } = await retryRefund(app, ctx, id);
    revalidatePath("/[locale]/dashboard/[orgSlug]", "layout");
    return { status };
  });
}
