/**
 * Git content ingress for hosted publishing, backed by Arbor (Omni's own git
 * host). Fractal builds a static site from a git source, so each published site
 * is a repo on Arbor and keystone-api pushes the static build context to it.
 *
 * Keystone publishes as its OWN Arbor service account, not as the end user.
 * Arbor is a closed beta with an application waitlist; making every paying
 * Keystone customer clear that funnel just to publish would couple Keystone's
 * conversion to an unrelated product's beta. Instead Keystone is an internal
 * platform consumer of Arbor: one service account (its Omni id whitelisted in
 * Arbor once) authorizes every repo-create and push and owns every site repo.
 * Fractal treats `arbor` as a first-class git host and rebuilds on its push
 * webhook. The end user never needs their own Arbor access.
 *
 * The adapter is an interface so the publish orchestrator stays unit-testable;
 * the Arbor implementation is the network IO boundary.
 */

import { GraphQLClient } from "graphql-request";

import { pushFiles } from "./git";

import type { GitSource } from "./fractal";
import type { Spawn } from "./git";

export interface SitePublishContext {
  /** Stable site id; the repo slug derives from it */
  siteId: string;
  /** Static build context (path -> contents) from buildImageContext */
  files: Record<string, string>;
}

export interface ContentRepo {
  /**
   * Ensures the site's repo exists on the host and pushes its content, then
   * returns the git source Fractal builds from. Re-publishing force-pushes over
   * the same repo (a single-commit snapshot), so history never accumulates.
   */
  publish(ctx: SitePublishContext): Promise<GitSource>;
}

/** Repo slug for a site: DNS/URL-safe, stable, so re-publish hits the same repo. */
export const repoSlugForSite = (siteId: string): string =>
  `site-${
    siteId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "x"
  }`;

export interface ArborContentRepoConfig {
  /** arbor-api GraphQL endpoint, e.g. https://api.arbor.omni.dev/graphql */
  apiUrl: string;
  /** Git Smart-HTTP base, e.g. https://api.arbor.omni.dev/git */
  gitBase: string;
  /** Keystone's Arbor publisher token; authorizes every repo-create + push */
  serviceToken: string;
  /** The service account's Arbor username; owns the git path for every repo */
  serviceOwner: string;
  /** Published sites are public websites; their repos are public by default */
  visibility?: "PUBLIC" | "PRIVATE";
  /** Injected for testing */
  spawn?: Spawn;
}

const CREATE_REPO_MUTATION = `mutation CreateRepositoryWithGit($input: CreateRepositoryWithGitInput!) {
  createRepositoryWithGit(input: $input) {
    slug
    ownerUsername
    error
  }
}`;

interface CreateRepoResult {
  createRepositoryWithGit: {
    slug: string | null;
    ownerUsername: string | null;
    error: string | null;
  };
}

/** A create failure that just means the repo is already there (re-publish). */
const isAlreadyExists = (message: string): boolean =>
  /exist|already|duplicate|taken|unique/i.test(message);

/**
 * Arbor-backed {@link ContentRepo}. Creates the site's repo (idempotently) via
 * arbor-api as Keystone's service account, then force-pushes the build context
 * to it. The same service token authorizes both calls, so no end-user Arbor
 * access is involved.
 */
export const createArborContentRepo = (
  config: ArborContentRepoConfig,
): ContentRepo => ({
  publish: async (ctx) => {
    const slug = repoSlugForSite(ctx.siteId);
    const client = new GraphQLClient(config.apiUrl, {
      headers: { authorization: `Bearer ${config.serviceToken}` },
    });

    // 1. Ensure the repo exists (as the service account). A prior existence is
    // not an error (re-publish is idempotent over a stable slug).
    try {
      const data = await client.request<CreateRepoResult>(
        CREATE_REPO_MUTATION,
        {
          input: {
            name: slug,
            slug,
            visibility: config.visibility ?? "PUBLIC",
          },
        },
      );

      const err = data.createRepositoryWithGit.error;
      if (err && !isAlreadyExists(err)) {
        throw new Error(`arbor repo create failed: ${err}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isAlreadyExists(message))
        throw new Error("arbor repo create failed");
    }

    // 2. Push the build context to the repo (force = snapshot), as the service
    // account under its own owner path.
    const url = `${config.gitBase}/${config.serviceOwner}/${slug}`;
    const branch = "master";

    await pushFiles({
      files: ctx.files,
      remoteUrl: url,
      branch,
      token: config.serviceToken,
      spawn: config.spawn,
    });

    return { git: { url, branch } };
  },
});
