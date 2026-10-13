import { isCronRequest } from "@/app/_lib/cron";
import { getApp } from "@/server";
import { dispatchEmails } from "@/server/modules/notifications/service";

export const dynamic = "force-dynamic";

/** Sends emails that were queued but not delivered on the first attempt. */
export async function GET(request: Request): Promise<Response> {
  if (!isCronRequest(request)) return new Response("Unauthorized", { status: 401 });
  const result = await dispatchEmails(getApp(), { limit: 50 });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
