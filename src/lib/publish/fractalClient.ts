import { GraphQLClient } from "graphql-request";

import type { FractalClient, FractalServiceResult } from "./fractal";

/**
 * Real fractal-api GraphQL client. This is the network IO boundary for
 * publishing (the pure adapter in `./fractal` takes an injected client so it
 * stays testable). Verified against fractal-api `schema.graphql`: both mutations
 * return `FractalService!` and `FractalServiceStatus` exposes `url` and
 * `customDomainRecords { name recordType value purpose }`.
 *
 * The nested shapes of `CreateFractalServiceInput` / `UpdateFractalServiceInput`
 * (source union, build, deploy, expose) should be re-verified against the
 * schema's input types before the first live deploy.
 */

const SERVICE_SELECTION = `{
  url
  status {
    url
    customDomainRecords { name recordType value purpose }
  }
}`;

const CREATE_MUTATION = `mutation CreateFractalService($input: CreateFractalServiceInput!) {
  createFractalService(input: $input) ${SERVICE_SELECTION}
}`;

const UPDATE_MUTATION = `mutation UpdateFractalService($input: UpdateFractalServiceInput!) {
  updateFractalService(input: $input) ${SERVICE_SELECTION}
}`;

/**
 * Builds a {@link FractalClient} backed by the fractal-api GraphQL endpoint,
 * authenticated with a bearer token minted via `createFractalApiToken`.
 */
export const createFractalGraphqlClient = (
  endpoint: string,
  token: string,
): FractalClient => {
  const client = new GraphQLClient(endpoint, {
    headers: { authorization: `Bearer ${token}` },
  });

  return {
    createFractalService: async (input) => {
      const data = await client.request<{
        createFractalService: FractalServiceResult["service"];
      }>(CREATE_MUTATION, { input });

      return { service: data.createFractalService };
    },
    updateFractalService: async (input) => {
      const data = await client.request<{
        updateFractalService: FractalServiceResult["service"];
      }>(UPDATE_MUTATION, { input });

      return { service: data.updateFractalService };
    },
  };
};
