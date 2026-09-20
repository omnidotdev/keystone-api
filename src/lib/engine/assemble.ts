import type { SiteFiles } from "./types";

export interface AssembleOptions {
  /** Preview mode injects a navigation guard and skips publish hardening. Defaults to true */
  preview?: boolean;
}

/**
 * Suppresses in-preview navigation so clicking a generated link does not
 * escape the sandboxed iframe. Only injected in preview mode. The marker
 * comment `kx-nav-guard` is asserted by tests and by the publish path, which
 * must never contain it.
 */
const NAV_GUARD = `<!-- kx-nav-guard --><script>document.addEventListener("click",(event)=>{const anchor=event.target&&event.target.closest&&event.target.closest("a");if(anchor)event.preventDefault();},true)</script>`;

/**
 * Composes a site's theme, shell, and a single page into one HTML document.
 *
 * Preview mode (the default) injects the navigation guard for the sandboxed
 * iframe. Publish mode omits it; publish-time sanitization is layered on in a
 * later milestone and is intentionally not part of this pure composition step.
 */
export const assembleDocument = (
  site: SiteFiles,
  pageId: string,
  options: AssembleOptions = {},
): string => {
  const page = site.pages[pageId];

  if (!page) throw new Error(`unknown page: ${pageId}`);

  const preview = options.preview ?? true;

  const script = page.js ? `<script>${page.js}</script>` : "";

  const guard = preview ? NAV_GUARD : "";

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${site.theme}\n${page.css}</style></head><body>${site.shell.header}${page.html}${site.shell.footer}${script}${guard}</body></html>`;
};
