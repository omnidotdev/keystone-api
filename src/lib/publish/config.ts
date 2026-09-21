/**
 * Wires the hosted-publish collaborators from environment config. Returns null
 * when hosted publishing is not configured (any of the Fractal or content-repo
 * vars unset), so the publish route degrades to the read-only preview instead
 * of failing.
 */

import {
  FRACTAL_API_TOKEN,
  FRACTAL_API_URL,
  GITHUB_CONTENT_TOKEN,
  KEYSTONE_PROJECT,
  KEYSTONE_SITES_REPO,
} from "../config/env.config";
import { createGithubContentRepo } from "./contentRepo";
import { createFractalGraphqlClient } from "./fractalClient";

import type { ContentRepo } from "./contentRepo";
import type { FractalClient } from "./fractal";

export interface HostedPublisher {
  contentRepo: ContentRepo;
  client: FractalClient;
  project: string;
}

/**
 * Builds a {@link HostedPublisher} from env, or null when hosted publishing is
 * not fully configured. Parses `KEYSTONE_SITES_REPO` as `owner/name`.
 */
export const hostedPublisherFromEnv = (): HostedPublisher | null => {
  if (
    !FRACTAL_API_URL ||
    !FRACTAL_API_TOKEN ||
    !KEYSTONE_SITES_REPO ||
    !GITHUB_CONTENT_TOKEN
  ) {
    return null;
  }

  const [owner, repo] = KEYSTONE_SITES_REPO.split("/");

  if (!owner || !repo) return null;

  return {
    contentRepo: createGithubContentRepo({
      owner,
      repo,
      token: GITHUB_CONTENT_TOKEN,
    }),
    client: createFractalGraphqlClient(FRACTAL_API_URL, FRACTAL_API_TOKEN),
    project: KEYSTONE_PROJECT,
  };
};
