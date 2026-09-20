import { generate } from "../engine/generator";

import type { TranscriptEntry } from "../db/schema/site.table";
import type { GenerateResult, ProviderClient } from "../engine/generator";
import type { DesignSystem } from "../engine/manifest";
import type { SiteFiles } from "../engine/types";

export interface SiteState {
  files: SiteFiles;
  transcript: TranscriptEntry[];
}

/** The parts of a stored site a generation turn reads and writes */
export interface StoredSite extends SiteState {
  designSystem?: DesignSystem;
}

/**
 * Persistence port for generation. Backed by Drizzle in production; an in-memory
 * implementation makes the orchestration testable without a database.
 */
export interface SiteStore {
  load(siteId: string): Promise<StoredSite | null>;
  save(siteId: string, state: SiteState): Promise<void>;
}

/**
 * Merges a generation result into a site's stored state: the returned files
 * replace the current ones (the model always returns the complete site) and the
 * user request plus the assistant reply are appended to the transcript. Pure so
 * the Postgraphile generation mutation can compute the new row and persist it in
 * one place.
 */
export const appendTurn = (
  state: SiteState,
  request: string,
  result: GenerateResult,
  now: () => string = () => new Date().toISOString(),
): SiteState => ({
  files: result.files,
  transcript: [
    ...state.transcript,
    { role: "user", content: request, at: now() },
    { role: "assistant", content: result.reply, at: now() },
  ],
});

export interface RunSiteGenerationArgs {
  store: SiteStore;
  siteId: string;
  request: string;
  client: ProviderClient;
  model?: string;
}

/**
 * Loads a site, runs one generation turn (mode chosen by whether the site has a
 * design system attached), persists the merged result, and returns the credit
 * cost. This is the reusable orchestration a Postgraphile generation mutation
 * calls; keeping it here keeps the resolver thin and this logic testable.
 */
export const runSiteGeneration = async (
  args: RunSiteGenerationArgs,
): Promise<{ credits: number; reply: string }> => {
  const site = await args.store.load(args.siteId);

  if (!site) throw new Error("site not found");

  const result = await generate({
    site: site.files,
    request: args.request,
    client: args.client,
    model: args.model,
    designSystem: site.designSystem,
  });

  await args.store.save(args.siteId, appendTurn(site, args.request, result));

  return { credits: result.credits, reply: result.reply };
};
