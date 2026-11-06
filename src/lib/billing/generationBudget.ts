import { eq, sql } from "drizzle-orm";

import { generationUsageTable } from "lib/db/schema/generationUsage.table";

import type { dbPool } from "lib/db";

/** UTC day key ("YYYY-MM-DD"), defaulting to now. UTC so the breaker rolls over at the same instant everywhere. */
export const generationDay = (date: Date = new Date()): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

/**
 * Whether today's generation spend has hit the daily budget. A budget of 0 or
 * less means the breaker is disabled (never exceeded), so an unset/zero budget
 * is fail-open by design and the breaker ships inert until deliberately enabled.
 */
export const isGenerationBudgetExceeded = (
  used: number,
  budget: number,
): boolean => budget > 0 && used >= budget;

/** Add `credits` to a day's generation-spend counter, inserting on first write. No-op for non-positive credits. */
export const recordGenerationCredits = async (
  db: typeof dbPool,
  credits: number,
  day: string = generationDay(),
): Promise<void> => {
  if (credits <= 0) return;

  await db
    .insert(generationUsageTable)
    .values({ day, creditsUsed: credits })
    .onConflictDoUpdate({
      target: generationUsageTable.day,
      set: {
        creditsUsed: sql`${generationUsageTable.creditsUsed} + ${credits}`,
        updatedAt: sql`now()`,
      },
    });
};

/** Credits burned by generation on `day`, or 0 if none recorded. */
export const getGenerationCreditsUsed = async (
  db: typeof dbPool,
  day: string = generationDay(),
): Promise<number> => {
  const [row] = await db
    .select({ creditsUsed: generationUsageTable.creditsUsed })
    .from(generationUsageTable)
    .where(eq(generationUsageTable.day, day))
    .limit(1);

  return row?.creditsUsed ?? 0;
};
