import { describe, expect, it } from "vitest";
import { createUpstashRateLimiter } from "../upstash/rate-limiter";
import { createMemoryRateLimiter } from "./rate-limiter";

const rule = { limit: 3, windowSeconds: 60 };

describe("in-memory rate limiter", () => {
  it("allows the limit, refuses the rest, and starts over in the next window", async () => {
    let now = 1_000_000;
    const limiter = createMemoryRateLimiter({ now: () => new Date(now) });
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push((await limiter.check("ip:1", rule)).allowed);
    expect(results).toEqual([true, true, true, false, false]);
    expect((await limiter.check("ip:1", rule)).retryAfterSeconds).toBe(60);

    // Another caller is counted separately.
    expect((await limiter.check("ip:2", rule)).allowed).toBe(true);

    now += 61_000;
    expect((await limiter.check("ip:1", rule)).allowed).toBe(true);
  });
});

describe("Upstash rate limiter", () => {
  const limiterWith = (respond: () => Promise<Response>) =>
    createUpstashRateLimiter({
      url: "https://redis.test",
      token: "t",
      fetch: respond as typeof fetch,
    });

  it("follows the shared counter", async () => {
    let count = 0;
    const limiter = limiterWith(async () =>
      Response.json([{ result: (count += 1) }, { result: 1 }]),
    );
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push((await limiter.check("ip:1", rule)).allowed);
    expect(results).toEqual([true, true, true, false]);
  });

  it("lets requests through when the counter is unreachable", async () => {
    expect(
      (await limiterWith(async () => new Response("down", { status: 500 })).check("k", rule))
        .allowed,
    ).toBe(true);
    expect(
      (
        await limiterWith(async () => {
          throw new Error("network");
        }).check("k", rule)
      ).allowed,
    ).toBe(true);
  });
});
