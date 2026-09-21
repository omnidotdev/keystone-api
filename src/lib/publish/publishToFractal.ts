/**
 * Hosted-publish orchestrator: turns a stored site into a live, isolated
 * FractalService deploy. The flow is git-ingress -> Fractal build -> deploy:
 *
 *   1. Bake the static build context (Dockerfile + nginx + sanitized pages).
 *   2. Push it to the site's isolated content branch (Fractal builds from git).
 *   3. Create/update the site's staticSite FractalService (scale to zero).
 *   4. Optionally attach a custom domain (edge TLS via Cloudflare-for-SaaS).
 *
 * Every collaborator is injected so the orchestrator is pure and unit-testable;
 * the network happens in the {@link ContentRepo} and {@link FractalClient}.
 */

import { buildImageContext } from "./bundle";
import { attachCustomDomain, deployStaticSite } from "./fractal";

import type { SiteFiles } from "../engine/types";
import type { ContentRepo } from "./contentRepo";
import type { CustomDomainRecord, FractalClient } from "./fractal";

export interface PublishToFractalArgs {
  contentRepo: ContentRepo;
  client: FractalClient;
  /** Parent FractalProject (namespace fractal-<project>), e.g. "keystone" */
  project: string;
  siteId: string;
  site: SiteFiles;
  /** Publishing user's Arbor username (owns the site's content repo) */
  owner: string;
  /** The user's workspace id; associates the repo with their workspace */
  organizationId?: string;
  /** The user's Omni access token; authorizes the repo-create + push as them */
  authToken: string;
  /** Human label for the service; falls back to the service name */
  displayName?: string;
  /** Custom domain to attach (only when the org's plan allows one) */
  customDomain?: string;
}

export interface PublishToFractalResult {
  /** Live isolated URL (`<name>-<project>.fractal.dev`) */
  url: string;
  /** Stable FractalService name */
  service: string;
  /** DNS records the user must set for a custom domain, when one was attached */
  customDomainRecords?: CustomDomainRecord[];
}

/**
 * Fractal service name for a site: a stable, DNS-safe slug (lowercase
 * alphanumeric and hyphens, <= 50 chars so `<name>-<project>` stays within the
 * 63-char DNS label limit). The name never changes for a site, so re-publishing
 * updates the same service and preserves any attached custom domain.
 */
export const serviceNameForSite = (siteId: string): string => {
  const slug = siteId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `site-${slug || "x"}`;
};

export const publishToFractal = async (
  args: PublishToFractalArgs,
): Promise<PublishToFractalResult> => {
  const name = serviceNameForSite(args.siteId);

  // 1 + 2: bake the build context and push it to the site's Arbor repo (as the
  // publishing user), yielding the git source Fractal builds from.
  const source = await args.contentRepo.publish({
    siteId: args.siteId,
    owner: args.owner,
    organizationId: args.organizationId,
    authToken: args.authToken,
    files: buildImageContext(args.site),
  });

  // 3: create/update the staticSite service (idempotent on name).
  const { url } = await deployStaticSite({
    client: args.client,
    project: args.project,
    name,
    displayName: args.displayName,
    source,
    scaleToZero: true,
  });

  // 4: attach the custom domain when requested.
  if (args.customDomain) {
    const { records } = await attachCustomDomain({
      client: args.client,
      project: args.project,
      name,
      domain: args.customDomain,
    });

    return { url, service: name, customDomainRecords: records };
  }

  return { url, service: name };
};
