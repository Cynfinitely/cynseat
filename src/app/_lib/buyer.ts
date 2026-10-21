import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { Buyer } from "@/server/modules/inventory/service";
import { getActor } from "./session";

const COOKIE = "cynseat_buyer";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function userId(): Promise<string | null> {
  const actor = await getActor();
  return actor.kind === "user" ? actor.userId : null;
}

/** The shopper behind this request, if their browser already has a cart identity. */
export async function getBuyer(): Promise<Buyer | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  return value && UUID.test(value) ? { sessionId: value, userId: await userId() } : null;
}

/**
 * The shopper behind this request, giving their browser a cart identity if it has none.
 * Sets a cookie, so it can only be called from a server action or route handler.
 */
export async function ensureBuyer(): Promise<Buyer> {
  const existing = await getBuyer();
  if (existing) return existing;
  const sessionId = randomUUID();
  (await cookies()).set(COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { sessionId, userId: await userId() };
}
