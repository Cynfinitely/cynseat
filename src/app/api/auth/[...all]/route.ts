import { toNextJsHandler } from "better-auth/next-js";
import { getApp } from "@/server";

// Share a ceiling for public authentication POSTs across server instances, in addition
// to Better Auth's tighter endpoint-specific limits within each instance.
async function handler(request: Request) {
  const app = getApp();
  if (request.method === "POST" && app.authRateLimit) {
    const address = request.headers.get("x-real-ip") ?? "unknown";
    const rule = await app.rateLimiter.check(`auth-post:${address}`, {
      limit: 30,
      windowSeconds: 60,
    });
    if (!rule.allowed) {
      return Response.json(
        { message: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rule.retryAfterSeconds) } },
      );
    }
  }
  return app.auth.handler(request);
}

export const { GET, POST } = toNextJsHandler(handler);
