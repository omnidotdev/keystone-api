import { publishDocument } from "../engine/publish";

import type { SiteFiles } from "../engine/types";

/** The home page id maps to the site root; all others get a clean-url folder */
const pathForPage = (pageId: string): string =>
  pageId === "home" ? "index.html" : `${pageId}/index.html`;

/**
 * Turns a stored site into a map of relative file path to sanitized HTML,
 * ready to write to a static host. Home becomes `index.html`; every other page
 * becomes `<id>/index.html` so `/id` resolves without a file extension.
 */
export const buildStaticBundle = (site: SiteFiles): Record<string, string> => {
  const bundle: Record<string, string> = {};

  for (const pageId of Object.keys(site.pages)) {
    bundle[pathForPage(pageId)] = publishDocument(site, pageId);
  }

  return bundle;
};

const NGINX_CONF = `server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  location / {
    try_files $uri $uri/ $uri/index.html =404;
  }
}
`;

const DOCKERFILE = `FROM nginx:alpine
COPY site /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
`;

/**
 * Builds the full Docker build context for a static-site image: the sanitized
 * pages under `site/`, a minimal nginx server config with clean-url routing,
 * and a Dockerfile. Write this map to a directory and `docker build` it, then
 * push the image and hand its ref to {@link ./fractal.deployStaticSite}.
 */
export const buildImageContext = (site: SiteFiles): Record<string, string> => {
  const context: Record<string, string> = {
    Dockerfile: DOCKERFILE,
    "nginx.conf": NGINX_CONF,
  };

  for (const [path, html] of Object.entries(buildStaticBundle(site))) {
    context[`site/${path}`] = html;
  }

  return context;
};
