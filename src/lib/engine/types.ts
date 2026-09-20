/**
 * A single page of a Keystone site.
 */
export interface Page {
  html: string;
  css: string;
  js?: string;
}

/**
 * The complete file set for a Keystone site.
 *
 * The model is deliberately split so global and local edits are structurally
 * separate: brand/color lives in `theme`, shared chrome in `shell`, and page
 * content in `pages`.
 */
export interface SiteFiles {
  /** Global design tokens as a CSS custom-property block */
  theme: string;
  /** Shared chrome rendered around every page */
  shell: { header: string; footer: string };
  /** Per-page content, keyed by page id */
  pages: Record<string, Page>;
}

const isPage = (value: unknown): value is Page => {
  if (typeof value !== "object" || value === null) return false;

  const page = value as Record<string, unknown>;

  return typeof page.html === "string" && typeof page.css === "string";
};

/**
 * Runtime guard for a {@link SiteFiles} value. Used to validate model output
 * before it is ever persisted or rendered, so malformed generations are
 * rejected rather than stored.
 */
export const isSiteFiles = (value: unknown): value is SiteFiles => {
  if (typeof value !== "object" || value === null) return false;

  const site = value as Record<string, unknown>;

  if (typeof site.theme !== "string") return false;

  const shell = site.shell as Record<string, unknown> | undefined;

  if (
    !shell ||
    typeof shell.header !== "string" ||
    typeof shell.footer !== "string"
  ) {
    return false;
  }

  const pages = site.pages as Record<string, unknown> | undefined;

  if (!pages || typeof pages !== "object") return false;

  const ids = Object.keys(pages);

  if (ids.length === 0) return false;

  return ids.every((id) => isPage(pages[id]));
};
