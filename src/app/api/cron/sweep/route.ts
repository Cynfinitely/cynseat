import { isCronRequest } from "@/app/_lib/cron";
import { getApp } from "@/server";
import { sweepExpiredHolds } from "@/server/modules/inventory/service";

export const dynamic = "force-dynamic";

/**
 * Housekeeping: frees the tickets of reservations that have run out. Buyers never depend
 * on this having run, because every cart request frees lapsed reservations first.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isCronRequest(request)) return new Response("Unauthorized", { status: 401 });
  const released = await sweepExpiredHolds(getApp());
  return Response.json({ released }, { headers: { "Cache-Control": "no-store" } });
}
