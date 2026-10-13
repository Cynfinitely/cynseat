"use server";

import { z } from "zod";
import { runAction, type ActionResult } from "@/app/_lib/action";
import { getActor } from "@/app/_lib/session";
import type { ScanResult } from "@/domain/checkin/types";
import { getApp } from "@/server";
import { getCheckInProgress, scanTicket, undoCheckIn } from "@/server/modules/checkin/service";
import { getOrgContext } from "@/server/modules/orgs/service";

const scanSchema = z.object({ code: z.string().max(200), scanId: z.uuid() });

export type ScanResponse = {
  result: ScanResult;
  ticket: {
    id: string;
    description: string;
    buyerName: string;
    reference: string;
    seat: { section: string; row: string; seat: string } | null;
    checkedInAt: string | null;
  } | null;
  progress: { checkedIn: number; total: number };
};

export async function scanTicketAction(
  orgSlug: string,
  eventId: string,
  input: unknown,
): Promise<ActionResult<ScanResponse>> {
  return runAction(scanSchema, input, async (data) => {
    const app = getApp();
    const ctx = await getOrgContext(app.db, await getActor(), orgSlug);
    const outcome = await scanTicket(app, ctx, eventId, data);
    return {
      result: outcome.result,
      ticket: outcome.ticket && {
        ...outcome.ticket,
        checkedInAt: outcome.ticket.checkedInAt?.toISOString() ?? null,
      },
      progress: await getCheckInProgress(app, ctx, eventId),
    };
  });
}

export async function undoCheckInAction(
  orgSlug: string,
  eventId: string,
  ticketId: string,
): Promise<ActionResult<{ checkedIn: number; total: number }>> {
  return runAction(z.undefined(), undefined, async () => {
    const app = getApp();
    const ctx = await getOrgContext(app.db, await getActor(), orgSlug);
    await undoCheckIn(app, ctx, eventId, ticketId);
    return getCheckInProgress(app, ctx, eventId);
  });
}
