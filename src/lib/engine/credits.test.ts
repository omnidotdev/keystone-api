import { describe, expect, it } from "bun:test";

import { creditsForUsage, usdForUsage } from "./credits";
import { DEFAULT_MODEL, MODELS, getModel } from "./models";

describe("models", () => {
  it("exposes a default model that exists in the registry", () => {
    expect(MODELS[DEFAULT_MODEL]).toBeDefined();
  });

  it("throws for an unknown model id", () => {
    expect(() => getModel("does-not-exist")).toThrow();
  });
});

describe("credits", () => {
  it("computes usd from token usage", () => {
    // sonnet: 2 usd/1M in, 10 usd/1M out
    // 1M in + 1M out = 2 + 10 = 12 usd
    expect(usdForUsage("claude-sonnet-5", 1_000_000, 1_000_000)).toBeCloseTo(
      12,
    );
  });

  it("rounds credits up so any nonzero cost charges at least one credit", () => {
    // tiny usage costs a fraction of a cent, still one credit
    expect(creditsForUsage("claude-sonnet-5", 100, 100)).toBe(1);
  });

  it("computes credits at one cent each", () => {
    // 12 usd / 0.01 = 1200 credits
    expect(creditsForUsage("claude-sonnet-5", 1_000_000, 1_000_000)).toBe(1200);
  });

  it("charges zero credits for zero usage", () => {
    expect(creditsForUsage("claude-sonnet-5", 0, 0)).toBe(0);
  });
});
