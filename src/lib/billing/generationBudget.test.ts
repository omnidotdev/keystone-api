import { describe, expect, it } from "bun:test";

import { generationDay, isGenerationBudgetExceeded } from "./generationBudget";

describe("generationDay", () => {
  it("formats a UTC YYYY-MM-DD key", () => {
    expect(generationDay(new Date("2026-11-06T12:00:00Z"))).toBe("2026-11-06");
  });

  it("zero-pads month and day", () => {
    expect(generationDay(new Date("2026-03-09T00:00:00Z"))).toBe("2026-03-09");
  });

  it("uses UTC at a day boundary", () => {
    expect(generationDay(new Date("2026-11-07T00:30:00Z"))).toBe("2026-11-07");
  });
});

describe("isGenerationBudgetExceeded", () => {
  it("is disabled when the budget is 0 (never exceeded)", () => {
    expect(isGenerationBudgetExceeded(1_000_000, 0)).toBe(false);
  });

  it("is disabled for a negative budget", () => {
    expect(isGenerationBudgetExceeded(1_000_000, -1)).toBe(false);
  });

  it("allows usage below the budget", () => {
    expect(isGenerationBudgetExceeded(99, 100)).toBe(false);
  });

  it("blocks once usage reaches the budget", () => {
    expect(isGenerationBudgetExceeded(100, 100)).toBe(true);
  });

  it("blocks when usage is over the budget", () => {
    expect(isGenerationBudgetExceeded(150, 100)).toBe(true);
  });
});
