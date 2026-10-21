import type { RateLimiter } from "../../ports/rate-limiter";

/**
 * Fixed-window counters in Upstash Redis over its REST API, shared by every server
 * instance. If Redis cannot be reached the request is allowed: a counter outage must not
 * stop ticket sales.
 */
export function createUpstashRateLimiter(options: {
  url: string;
  token: string;
  fetch?: typeof fetch;
}): RateLimiter {
  const doFetch = options.fetch ?? fetch;

  return {
    async check(key, rule) {
      const windowId = Math.floor(Date.now() / (rule.windowSeconds * 1000));
      const redisKey = `rl:${key}:${rule.windowSeconds}:${windowId}`;
      try {
        const response = await doFetch(`${options.url}/pipeline`, {
          method: "POST",
          headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json" },
          body: JSON.stringify([
            ["INCR", redisKey],
            ["EXPIRE", redisKey, rule.windowSeconds],
          ]),
          signal: AbortSignal.timeout(1500),
        });
        if (!response.ok) return { allowed: true, retryAfterSeconds: 0 };
        const [incremented] = (await response.json()) as [{ result: number }];
        return {
          allowed: incremented.result <= rule.limit,
          retryAfterSeconds: rule.windowSeconds,
        };
      } catch {
        return { allowed: true, retryAfterSeconds: 0 };
      }
    },
  };
}
