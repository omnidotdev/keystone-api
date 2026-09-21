/**
 * Entitlement gate for hosted publishing. Hosted publishing (a dedicated
 * FractalService deploy on an isolated domain, with custom domains and scale to
 * zero) is a paid feature; the free tier gets a read-only preview link served
 * by the API instead. The gate reads the org's entitlements from the billing
 * provider (Aether), which syncs from the omni-api catalog `operationalLimits`.
 *
 * It never blocks a publish: a non-entitled or unverifiable org falls back to
 * the preview path. It only grants the hosted deploy on a positive entitlement,
 * so an Aether outage can never accidentally hand out paid hosting.
 */

import type { BillingProvider } from "@omnidotdev/providers";

/** Catalog product id whose entitlements gate Keystone publishing */
const PRODUCT_ID = "keystone";

/** Operational-limit feature keys, mirrored from omni-api planConfigs */
const HOSTED_PUBLISH_KEY = "hosted_publish";
const CUSTOM_DOMAINS_KEY = "custom_domains";

export interface PublishEntitlement {
  /** Whether the org may deploy a hosted site (vs. preview only) */
  hostedPublish: boolean;
  /** Custom-domain allowance: 0 none, -1 unlimited, or a positive cap */
  customDomains: number;
}

const PREVIEW_ONLY: PublishEntitlement = {
  hostedPublish: false,
  customDomains: 0,
};

/**
 * Resolves an org's publish entitlement. Returns preview-only when the org has
 * no hosted-publish entitlement or when billing cannot be reached (fail safe:
 * degrade to preview, never grant hosting on an error).
 */
export const resolvePublishEntitlement = async (
  billing: BillingProvider,
  organizationId: string,
  accessToken?: string,
): Promise<PublishEntitlement> => {
  const result = await billing.getEntitlementsResult(
    "organization",
    organizationId,
    PRODUCT_ID,
    accessToken,
  );

  if (result.status !== "success") return PREVIEW_ONLY;

  const byKey = new Map(
    result.data.entitlements.map((e) => [e.featureKey, e.value]),
  );

  const hostedPublish = byKey.get(HOSTED_PUBLISH_KEY) === "1";
  const customDomains = Number.parseInt(
    byKey.get(CUSTOM_DOMAINS_KEY) ?? "0",
    10,
  );

  return {
    hostedPublish,
    customDomains: Number.isNaN(customDomains) ? 0 : customDomains,
  };
};

/** Whether an entitlement permits attaching at least one custom domain */
export const allowsCustomDomain = (entitlement: PublishEntitlement): boolean =>
  entitlement.customDomains === -1 || entitlement.customDomains > 0;
