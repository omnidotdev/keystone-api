import { doublePrecision, pgTable, text } from "drizzle-orm/pg-core";

import { generateDefaultDate, generateDefaultId } from "lib/db/util";

import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

/**
 * Global daily generation-spend counter, one row per UTC day.
 *
 * Backs a durable daily breaker on AI site generation: `/generate` spends real
 * model dollars via Synapse, so this caps total credits burned per day as a
 * circuit breaker against runaway or automated abuse (proxy-rotated anonymous
 * calls that the per-IP limiter alone cannot bound). Durable (not in-memory) so
 * the ceiling holds across replicas and restarts. Enforcement is opt-in via
 * `DAILY_GENERATION_CREDIT_BUDGET`; when unset the counter is not even written.
 */
export const generationUsageTable = pgTable("generation_usage", {
  id: generateDefaultId(),
  /** UTC day key, "YYYY-MM-DD" */
  day: text().notNull().unique(),
  /** Credits (retail units) burned by generation on this day */
  creditsUsed: doublePrecision().notNull().default(0),
  createdAt: generateDefaultDate(),
  updatedAt: generateDefaultDate(),
});

export type InsertGenerationUsage = InferInsertModel<
  typeof generationUsageTable
>;
export type SelectGenerationUsage = InferSelectModel<
  typeof generationUsageTable
>;
