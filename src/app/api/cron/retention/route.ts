import { isCronRequest } from "@/app/_lib/cron";
import { env } from "@/lib/env";
import { getApp } from "@/server";
import { applyRetention } from "@/server/modules/privacy/service";

export const dynamic = "force-dynamic";

/** Daily: removes personal data that has outlived its purpose. */
export async function GET(request: Request): Promise<Response> {
  if (!isCronRequest(request)) return new Response("Unauthorized", { status: 401 });
  const result = await applyRetention(getApp(), {
    personalDataDays: env.RETENTION_PERSONAL_DATA_DAYS,
    sentEmailDays: env.RETENTION_SENT_EMAIL_DAYS,
    paymentEventDays: env.RETENTION_PAYMENT_EVENT_DAYS,
  });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
