import { eq } from "drizzle-orm";

import { siteTable } from "../db/schema/site.table";

import type dbPool from "../db/dbPool";
import type { SiteState, SiteStore, StoredSite } from "./siteService";

/**
 * Drizzle-backed {@link SiteStore}. Loads and persists the generation-relevant
 * columns of a site row. `siteId` is the raw uuid primary key.
 */
export const createDrizzleSiteStore = (db: typeof dbPool): SiteStore => ({
  load: async (siteId: string): Promise<StoredSite | null> => {
    const [row] = await db
      .select({
        files: siteTable.files,
        transcript: siteTable.transcript,
        designSystem: siteTable.designSystem,
      })
      .from(siteTable)
      .where(eq(siteTable.id, siteId))
      .limit(1);

    if (!row) return null;

    return {
      files: row.files,
      transcript: row.transcript,
      designSystem: row.designSystem ?? undefined,
    };
  },

  save: async (siteId: string, state: SiteState): Promise<void> => {
    await db
      .update(siteTable)
      .set({
        files: state.files,
        transcript: state.transcript,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(siteTable.id, siteId));
  },
});
