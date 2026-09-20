export interface RateLimitResult {
  /** Whether the caller may proceed */
  allowed: boolean;
  /** Seconds until the caller should retry (0 when allowed) */
  retryAfterSeconds: number;
}

export interface GenerateRateLimiter {
  check: (key: string, now?: number) => RateLimitResult;
}

/**
 * Per-key sliding-window limiter for the expensive /generate route (each call
 * spends Synapse credits). Defense in depth on top of the global request-rate
 * limiter and Synapse's central spend cap: it bounds how many generations a
 * single client (keyed by IP) can trigger in a window, so one abuser cannot
 * burn the shared budget by scripting rapid-fire requests. In-memory and
 * per-instance (a coarse guard); the hard spend ceiling stays enforced
 * centrally by Synapse. Denied requests do not count toward the window, so a
 * blocked caller cannot indefinitely push their own reset forward.
 */
export const createGenerateRateLimiter = (
  options: { max?: number; windowMs?: number } = {},
): GenerateRateLimiter => {
  const max = options.max ?? 8;
  const windowMs = options.windowMs ?? 5 * 60_000;
  const hits = new Map<string, number[]>();

  return {
    check: (key, now = Date.now()) => {
      const cutoff = now - windowMs;
      const recent = (hits.get(key) ?? []).filter(
        (timestamp) => timestamp > cutoff,
      );

      if (recent.length >= max) {
        const oldest = recent[0] ?? now;

        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((oldest + windowMs - now) / 1000),
          ),
        };
      }

      recent.push(now);
      hits.set(key, recent);

      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
};
