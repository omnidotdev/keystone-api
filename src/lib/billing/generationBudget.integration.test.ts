import { afterEach, describe, expect, it } from "bun:test";

import { eq } from "drizzle-orm";

import { generationUsageTable } from "lib/db/schema/generationUsage.table";
import {
  getGenerationCreditsUsed,
  recordGenerationCredits,
} from "./generationBudget";

const getDb = () => globalThis.__TEST_DATABASE__.db;

const DAY = "2026-11-06";

describe("generation spend counter", () => {
  afterEach(async () => {
    await getDb()
      .delete(generationUsageTable)
      .where(eq(generationUsageTable.day, DAY));
  });

  it("returns zero when nothing is recorded for the day", async () => {
    expect(await getGenerationCreditsUsed(getDb(), DAY)).toBe(0);
  });

  it("records credits and reads them back", async () => {
    await recordGenerationCredits(getDb(), 12.5, DAY);
    expect(await getGenerationCreditsUsed(getDb(), DAY)).toBe(12.5);
  });

  it("accumulates across generations in the same day", async () => {
    await recordGenerationCredits(getDb(), 10, DAY);
    await recordGenerationCredits(getDb(), 5.25, DAY);
    expect(await getGenerationCreditsUsed(getDb(), DAY)).toBe(15.25);
  });

  it("ignores non-positive credit amounts", async () => {
    await recordGenerationCredits(getDb(), 0, DAY);
    await recordGenerationCredits(getDb(), -3, DAY);
    expect(await getGenerationCreditsUsed(getDb(), DAY)).toBe(0);
  });

  it("isolates counters by day", async () => {
    await recordGenerationCredits(getDb(), 7, DAY);
    expect(await getGenerationCreditsUsed(getDb(), "2026-11-07")).toBe(0);
  });
});
