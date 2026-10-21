import { headers } from "next/headers";
import { getApp } from "@/server";
import { rateLimited } from "@/server/errors";
import type { RateLimit } from "@/server/ports/rate-limiter";

/** Limits for the things a stranger can do repeatedly. Generous for people, tight for scripts. */
export const limits = {
  /** Reserving tickets: each call can tie up stock for ten minutes. */
  cart: { limit: 30, windowSeconds: 60 },
  checkout: { limit: 10, windowSeconds: 60 },
  /** Asking for order links by email: each call can send mail to someone else. */
  orderLinks: { limit: 5, windowSeconds: 600 },
} satisfies Record<string, RateLimit>;

/** The caller's address as the hosting platform reports it. */
async function clientAddress(): Promise<string> {
  const list = await headers();
  return list.get("x-real-ip") ?? list.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Throws RATE_LIMITED if this caller has done `name` too often lately. */
export async function enforceRateLimit(name: keyof typeof limits, extraKey = ""): Promise<void> {
  const key = `${name}:${await clientAddress()}:${extraKey}`;
  const { allowed } = await getApp().rateLimiter.check(key, limits[name]);
  if (!allowed) throw rateLimited();
}
