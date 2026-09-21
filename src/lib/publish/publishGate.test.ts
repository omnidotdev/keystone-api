import { describe, expect, it } from "bun:test";

import { allowsCustomDomain, resolvePublishEntitlement } from "./publishGate";

import type { BillingProvider } from "@omnidotdev/providers";

/** Minimal billing provider stub returning a canned entitlements result */
const stubBilling = (result: unknown): BillingProvider =>
  ({
    getEntitlementsResult: async () => result,
  }) as unknown as BillingProvider;

const entitlements = (map: Record<string, string>) => ({
  status: "success" as const,
  data: {
    billingAccountId: "b",
    entityType: "organization",
    entityId: "o",
    entitlementVersion: 1,
    entitlements: Object.entries(map).map(([featureKey, value]) => ({
      id: featureKey,
      productId: "keystone",
      featureKey,
      value,
      source: "plan",
      validFrom: "2026-01-01",
      validUntil: null,
    })),
  },
});

describe("resolvePublishEntitlement", () => {
  it("grants hosted publish and unlimited domains for a paid plan", async () => {
    const billing = stubBilling(
      entitlements({ hosted_publish: "1", custom_domains: "-1" }),
    );

    const result = await resolvePublishEntitlement(billing, "o");

    expect(result.hostedPublish).toBe(true);
    expect(result.customDomains).toBe(-1);
    expect(allowsCustomDomain(result)).toBe(true);
  });

  it("is preview-only when hosted_publish is off (free plan)", async () => {
    const billing = stubBilling(
      entitlements({ hosted_publish: "0", custom_domains: "0" }),
    );

    const result = await resolvePublishEntitlement(billing, "o");

    expect(result.hostedPublish).toBe(false);
    expect(allowsCustomDomain(result)).toBe(false);
  });

  it("fails safe to preview-only when billing has no account", async () => {
    const billing = stubBilling({ status: "not_found" });

    const result = await resolvePublishEntitlement(billing, "o");

    expect(result.hostedPublish).toBe(false);
  });

  it("fails safe to preview-only when billing is unavailable", async () => {
    const billing = stubBilling({ status: "unavailable", error: "down" });

    const result = await resolvePublishEntitlement(billing, "o");

    expect(result.hostedPublish).toBe(false);
    expect(result.customDomains).toBe(0);
  });
});
