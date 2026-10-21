import { isCronRequest } from "@/app/_lib/cron";
import { getApp } from "@/server";
import { sweepExpiredHolds } from "@/server/modules/inventory/service";
import { reconcilePendingOrders } from "@/server/modules/payments/service";
import { settleOutstandingRefunds } from "@/server/modules/refunds/service";

export const dynamic = "force-dynamic";

/**
 * Housekeeping: settles orders whose payment notification never arrived, and frees the
 * tickets of reservations that have run out. Buyers never depend on this having run.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isCronRequest(request)) return new Response("Unauthorized", { status: 401 });
  const app = getApp();
  // Orders first: one whose payment arrived unnoticed must be completed, not swept away.
  const settled = await reconcilePendingOrders(app);
  const released = await sweepExpiredHolds(app);
  const refunds = await settleOutstandingRefunds(app);
  return Response.json(
    { settled, released, refunds },
    { headers: { "Cache-Control": "no-store" } },
  );
}
