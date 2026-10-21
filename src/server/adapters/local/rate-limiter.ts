import type { Clock } from "../../ports/clock";
import type { RateLimiter } from "../../ports/rate-limiter";

/**
 * Fixed-window counters kept in this process. Fine for development and for a single
 * server; on serverless each instance counts separately, so use a shared store there.
 */
export function createMemoryRateLimiter(clock: Clock): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    async check(key, rule) {
      const now = clock.now().getTime();
      // Keep the map from growing without bound.
      if (windows.size > 10_000) {
        for (const [entry, window] of windows) if (window.resetAt <= now) windows.delete(entry);
      }
      const id = `${key}:${rule.limit}:${rule.windowSeconds}`;
      let window = windows.get(id);
      if (!window || window.resetAt <= now) {
        window = { count: 0, resetAt: now + rule.windowSeconds * 1000 };
        windows.set(id, window);
      }
      window.count += 1;
      return {
        allowed: window.count <= rule.limit,
        retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
      };
    },
  };
}
