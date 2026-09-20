import { assembleDocument } from "./assemble";
import { sanitizeSite } from "./sanitize";

import type { SiteFiles } from "./types";

/**
 * Assembles a publish-ready HTML document for one page: the site is sanitized
 * first, then composed in publish mode (no preview nav guard). This is the only
 * function the hosting pipeline should call to turn a stored site into hosted
 * output.
 */
export const publishDocument = (site: SiteFiles, pageId: string): string =>
  assembleDocument(sanitizeSite(site), pageId, { preview: false });

/**
 * Assembles every page of a site into a map of page id to publish-ready HTML,
 * ready to write to object storage or a static host.
 */
export const publishSite = (site: SiteFiles): Record<string, string> => {
  const clean = sanitizeSite(site);

  const output: Record<string, string> = {};

  for (const pageId of Object.keys(clean.pages)) {
    output[pageId] = assembleDocument(clean, pageId, { preview: false });
  }

  return output;
};
