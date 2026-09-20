import { describe, expect, it } from "bun:test";

import { createGenerateRateLimiter } from "./generateRateLimit";

describe("createGenerateRateLimiter", () => {
  it("allows up to max requests in the window", () => {
    const limiter = createGenerateRateLimiter({ max: 3, windowMs: 60_000 });
    const t = 1_000_000;

    expect(limiter.check("ip", t).allowed).toBe(true);
    expect(limiter.check("ip", t + 1).allowed).toBe(true);
    expect(limiter.check("ip", t + 2).allowed).toBe(true);
  });

  it("blocks the request past max and reports a positive retry-after", () => {
    const limiter = createGenerateRateLimiter({ max: 2, windowMs: 60_000 });
    const t = 1_000_000;

    limiter.check("ip", t);
    limiter.check("ip", t + 1);
    const blocked = limiter.check("ip", t + 2);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("does not count denied requests toward the window (no reset push-out)", () => {
    const limiter = createGenerateRateLimiter({ max: 1, windowMs: 10_000 });
    const t = 1_000_000;

    expect(limiter.check("ip", t).allowed).toBe(true);
    // repeated denials while blocked
    expect(limiter.check("ip", t + 1000).allowed).toBe(false);
    expect(limiter.check("ip", t + 2000).allowed).toBe(false);
    // once the original hit ages out, the caller is allowed again
    expect(limiter.check("ip", t + 10_001).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = createGenerateRateLimiter({ max: 1, windowMs: 60_000 });
    const t = 1_000_000;

    expect(limiter.check("a", t).allowed).toBe(true);
    expect(limiter.check("b", t).allowed).toBe(true);
    expect(limiter.check("a", t + 1).allowed).toBe(false);
  });

  it("slides the window as time passes", () => {
    const limiter = createGenerateRateLimiter({ max: 2, windowMs: 1_000 });
    const t = 1_000_000;

    limiter.check("ip", t);
    limiter.check("ip", t + 500);
    expect(limiter.check("ip", t + 600).allowed).toBe(false);
    // both prior hits have aged out
    expect(limiter.check("ip", t + 1_600).allowed).toBe(true);
  });
});
