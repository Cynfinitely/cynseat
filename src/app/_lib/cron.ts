import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** True when the request carries the cron secret. Always false if no secret is configured. */
export function isCronRequest(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  // Compare digests so the check takes the same time whatever was sent.
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
