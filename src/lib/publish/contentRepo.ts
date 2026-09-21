/**
 * Git content ingress for hosted publishing, backed by Arbor (Omni's own git
 * host). Fractal builds a static site from a git source, so each published site
 * is a repo on Arbor and keystone-api pushes the static build context to it.
 *
 * Using Arbor instead of a third-party host means a non-developer publishes with
 * only their existing Omni account (no separate signup), the site's code is a
 * repo they own and can browse at arbor.omni.dev, and every credential is
 * Omni-native: keystone-api acts AS the publishing user (their own access token
 * authorizes both the repo-create and the push), so there is no service PAT or
 * app key. Fractal already treats `arbor` as a first-class git host and rebuilds
 * on Arbor's push webhook.
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
  /** Publishing user's Arbor username (the git-path owner segment) */
  owner: string;
  /** The user's workspace id; associates the repo with their workspace */
  organizationId?: string;
  /** The user's Omni access token; authorizes repo-create + push as them */
  authToken: string;
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
 * arbor-api as the publishing user, then force-pushes the build context to it.
 */
export const createArborContentRepo = (
  config: ArborContentRepoConfig,
): ContentRepo => ({
  publish: async (ctx) => {
    const slug = repoSlugForSite(ctx.siteId);
    const client = new GraphQLClient(config.apiUrl, {
      headers: { authorization: `Bearer ${ctx.authToken}` },
    });

    // 1. Ensure the repo exists (as the user). A prior existence is not an error.
    try {
      const data = await client.request<CreateRepoResult>(
        CREATE_REPO_MUTATION,
        {
          input: {
            name: slug,
            slug,
            visibility: config.visibility ?? "PUBLIC",
            ...(ctx.organizationId
              ? { organizationId: ctx.organizationId }
              : {}),
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

    // 2. Push the build context to the repo (force = snapshot), as the user.
    const url = `${config.gitBase}/${ctx.owner}/${slug}`;
    const branch = "master";

    await pushFiles({
      files: ctx.files,
      remoteUrl: url,
      branch,
      token: ctx.authToken,
      spawn: config.spawn,
    });

    return { git: { url, branch } };
  },
});
