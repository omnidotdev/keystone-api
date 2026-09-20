import { describe, expect, it } from "bun:test";

import { assertCanGenerate } from "./entitlement";

describe("assertCanGenerate", () => {
  it("allows a permitted plan with credits", () => {
    expect(() =>
      assertCanGenerate({
        canGenerate: true,
        creditsRemaining: 5,
        byok: false,
      }),
    ).not.toThrow();
  });

  it("allows byok regardless of plan or credits", () => {
    expect(() =>
      assertCanGenerate({
        canGenerate: false,
        creditsRemaining: 0,
        byok: true,
      }),
    ).not.toThrow();
  });

  it("blocks when the plan does not permit generation", () => {
    expect(() =>
      assertCanGenerate({
        canGenerate: false,
        creditsRemaining: 5,
        byok: false,
      }),
    ).toThrow();
  });

  it("blocks when credits are exhausted", () => {
    expect(() =>
      assertCanGenerate({
        canGenerate: true,
        creditsRemaining: 0,
        byok: false,
      }),
    ).toThrow();
  });
});
