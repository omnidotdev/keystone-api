/**
 * Wires the hosted-publish collaborators from environment config. Returns null
 * when hosted publishing is not configured (Fractal or Arbor endpoints unset),
 * so the publish route degrades to the read-only preview instead of failing.
 */

import {
  ARBOR_API_URL,
  ARBOR_GIT_BASE,
  FRACTAL_API_TOKEN,
  FRACTAL_API_URL,
  KEYSTONE_PROJECT,
} from "../config/env.config";
import { createArborContentRepo } from "./contentRepo";
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
 * not fully configured. Content lives in Arbor (Omni's git host); the per-site
 * FractalService builds from it.
 */
export const hostedPublisherFromEnv = (): HostedPublisher | null => {
  if (
    !FRACTAL_API_URL ||
    !FRACTAL_API_TOKEN ||
    !ARBOR_API_URL ||
    !ARBOR_GIT_BASE
  ) {
    return null;
  }

  return {
    contentRepo: createArborContentRepo({
      apiUrl: ARBOR_API_URL,
      gitBase: ARBOR_GIT_BASE,
    }),
    client: createFractalGraphqlClient(FRACTAL_API_URL, FRACTAL_API_TOKEN),
    project: KEYSTONE_PROJECT,
  };
};
