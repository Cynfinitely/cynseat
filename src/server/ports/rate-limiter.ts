export type RateLimit = {
  /** Requests allowed per window. */
  limit: number;
  windowSeconds: number;
};

export type RateLimiter = {
  /**
   * Counts one request against `key` and says whether it is within the limit.
   * Implementations must fail open: if the counter cannot be reached, allow the request.
   */
  check(key: string, rule: RateLimit): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
};
