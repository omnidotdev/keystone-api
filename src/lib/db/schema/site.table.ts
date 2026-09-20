import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateDefaultDate, generateDefaultId } from "lib/db/util";

import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { DesignSystem } from "lib/engine/manifest";
import type { SiteFiles } from "lib/engine/types";

/**
 * One turn of the builder conversation.
 */
export interface TranscriptEntry {
  role: "user" | "assistant";
  content: string;
  at: string;
}

/**
 * Site table. One row per Keystone site, scoped to the workspace (Gatekeeper
 * organization) that owns it. The generated file set and the builder transcript
 * are stored as jsonb; publish state and hosting details track the Fractal
 * deployment.
 */
export const siteTable = pgTable(
  "site",
  {
    id: generateDefaultId(),
    /** Owning workspace (Gatekeeper organization id) */
    organizationId: text().notNull(),
    /** Slug used for the service name and default subdomain */
    name: text().notNull(),
    displayName: text(),
    files: jsonb().$type<SiteFiles>().notNull(),
    transcript: jsonb().$type<TranscriptEntry[]>().notNull().default([]),
    /** Attached design system; presence switches generation into Design-System mode */
    designSystem: jsonb().$type<DesignSystem>(),
    /** "draft" or "published"; validated app-side (no pgEnum for business logic) */
    publishState: text().notNull().default("draft"),
    /** Live subdomain returned by Fractal once deployed */
    deployedUrl: text(),
    /** Custom domain, once attached */
    domain: text(),
    createdAt: generateDefaultDate(),
    updatedAt: generateDefaultDate(),
  },
  (table) => [
    uniqueIndex().on(table.id),
    uniqueIndex().on(table.organizationId, table.name),
    index().on(table.organizationId),
  ],
);

export type InsertSite = InferInsertModel<typeof siteTable>;
export type SelectSite = InferSelectModel<typeof siteTable>;
