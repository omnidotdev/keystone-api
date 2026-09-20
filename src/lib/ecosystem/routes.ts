import { Elysia } from "elysia";
import { GraphQLClient } from "graphql-request";

import {
  resolveBuyCheckout,
  resolveSubscribe,
  resolveSupportCheckout,
} from "./broker";
import {
  CRYSTAL_API_URL,
  CRYSTAL_APP_URL,
  HALO_API_URL,
  HALO_SERVICE_KEY,
  HALO_STOREFRONT_BASE,
  HERALD_API_KEY,
  HERALD_API_URL,
} from "./config";
import { createCrystalConnection } from "./crystalConnection";
import { createHaloConnection } from "./haloConnection";
import { createHeraldConnection } from "./heraldConnection";

import type { GraphqlRequest } from "./haloConnection";

/** Build an authed GraphQL transport for a service, or undefined if unset */
const graphqlTransport = (
  url: string | undefined,
  key: string | undefined,
): GraphqlRequest | undefined => {
  if (!url) return undefined;

  const client = new GraphQLClient(url, {
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });

  return (query, variables) => client.request(query, variables);
};

const crystal = createCrystalConnection({
  apiUrl: CRYSTAL_API_URL,
  appUrl: CRYSTAL_APP_URL,
});

const halo = createHaloConnection({
  apiUrl: HALO_API_URL,
  serviceKey: HALO_SERVICE_KEY,
  storefrontBase: HALO_STOREFRONT_BASE,
  request: graphqlTransport(HALO_API_URL, HALO_SERVICE_KEY),
});

const herald = createHeraldConnection({
  apiUrl: HERALD_API_URL,
  apiKey: HERALD_API_KEY,
  request: graphqlTransport(HERALD_API_URL, HERALD_API_KEY),
});

// Startup warnings for optional integrations (house rule: degrade + warn).
for (const [feature, configured] of [
  ["Halo (buy block)", halo.configured],
  ["Crystal (support block)", crystal.configured],
  ["Herald (email block)", herald.configured],
] as const) {
  if (!configured) {
    console.warn(
      `${feature} not configured, block degrades to link-out/report`,
    );
  }
}

/**
 * Ecosystem broker routes consumed by integration blocks on published sites.
 * The block's client JS POSTs here; we resolve the target server-side and
 * return `{ url, brokered }`. `returnBase` is our own origin (open-redirect
 * defense). Blocks degrade to a link-out when an upstream is unconfigured.
 */
export const ecosystemRoutes = (returnBase: string) =>
  new Elysia({ prefix: "/api/ecosystem" })
    .post("/support/checkout", async ({ body, set }) => {
      const { slug, amountCents, email, message } = (body ?? {}) as {
        slug?: string;
        amountCents?: number;
        email?: string;
        message?: string;
      };

      if (!slug) {
        set.status = 400;

        return { error: "slug is required" };
      }

      return resolveSupportCheckout(crystal, {
        slug,
        amountCents: amountCents ?? 500,
        returnBase,
        email,
        message,
      });
    })
    .post("/buy/checkout", async ({ body, set }) => {
      const { productId, quantity, email } = (body ?? {}) as {
        productId?: string;
        quantity?: number;
        email?: string;
      };

      if (!productId) {
        set.status = 400;

        return { error: "productId is required" };
      }

      return resolveBuyCheckout(halo, {
        productId,
        quantity,
        email,
        returnBase,
      });
    })
    .post("/subscribe", async ({ body, set }) => {
      const { audienceId, email } = (body ?? {}) as {
        audienceId?: string;
        email?: string;
      };

      if (!audienceId || !email) {
        set.status = 400;

        return { error: "audienceId and email are required" };
      }

      return resolveSubscribe(herald, { audienceId, email });
    });
