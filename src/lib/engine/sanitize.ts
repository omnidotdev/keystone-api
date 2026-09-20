import DOMPurify from "isomorphic-dompurify";

import type { SiteFiles } from "./types";

/**
 * Sanitizes an HTML fragment for public hosting. DOMPurify removes script
 * tags, inline event handlers, and dangerous URLs by default, leaving safe
 * markup intact. This is the hardening the tvs reference documented but never
 * implemented; published output must always pass through it.
 */
export const sanitizeHtml = (html: string): string => DOMPurify.sanitize(html);

/**
 * Produces a publish-safe copy of a site: every HTML fragment (shell and pages)
 * is sanitized, and per-page JavaScript is dropped entirely. v1 does not serve
 * author-supplied JS on published sites; the theme and page CSS are preserved
 * untouched.
 */
export const sanitizeSite = (site: SiteFiles): SiteFiles => {
  const pages: SiteFiles["pages"] = {};

  for (const [id, page] of Object.entries(site.pages)) {
    pages[id] = { html: sanitizeHtml(page.html), css: page.css };
  }

  return {
    theme: site.theme,
    shell: {
      header: sanitizeHtml(site.shell.header),
      footer: sanitizeHtml(site.shell.footer),
    },
    pages,
  };
};
