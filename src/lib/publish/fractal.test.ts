import { describe, expect, it } from "bun:test";

import { attachCustomDomain, deployStaticSite } from "./fractal";

import type { FractalClient } from "./fractal";

interface ServiceInput {
  serviceType: string;
  build: { mode: string };
  deploy: {
    replicas: number;
    autoscale?: {
      minReplicas: number;
      maxReplicas: number;
      scaleToZero: boolean;
      idleTimeoutSeconds: number;
    };
  };
  expose: {
    tls: boolean;
    domain: string;
    customHostname: { provider: string };
  };
}

/** A Fractal GraphQL client that records the last input and returns a canned service */
const mockClient = (
  service: Record<string, unknown> = {
    status: { url: "https://site-proj.omni.dev" },
  },
) => {
  const calls: { create?: unknown; update?: unknown } = {};

  const client: FractalClient = {
    createFractalService: async (input) => {
      calls.create = input;
      return { service };
    },
    updateFractalService: async (input) => {
      calls.update = input;
      return { service };
    },
  };

  return { client, calls };
};

describe("deployStaticSite", () => {
  it("creates a staticSite service from a prebuilt image and returns the url", async () => {
    const { client, calls } = mockClient();

    const result = await deployStaticSite({
      client,
      project: "proj",
      name: "site",
      source: { image: { repository: "registry/site", tag: "abc123" } },
    });

    expect(result.url).toBe("https://site-proj.omni.dev");

    const input = calls.create as ServiceInput;
    expect(input.serviceType).toBe("staticSite");
    expect(input.build.mode).toBe("none");
    expect(input.expose.tls).toBe(true);
  });

  it("uses auto build mode for a git source", async () => {
    const { client, calls } = mockClient();

    await deployStaticSite({
      client,
      project: "proj",
      name: "site",
      source: { git: { url: "https://github.com/x/y", branch: "master" } },
    });

    expect((calls.create as ServiceInput).build.mode).toBe("auto");
  });

  it("scales to zero by default (KEDA HTTP autoscale, minReplicas 0)", async () => {
    const { client, calls } = mockClient();

    await deployStaticSite({
      client,
      project: "proj",
      name: "site",
      source: { image: { repository: "r", tag: "t" } },
    });

    const { autoscale } = (calls.create as ServiceInput).deploy;
    expect(autoscale?.minReplicas).toBe(0);
    expect(autoscale?.scaleToZero).toBe(true);
  });

  it("omits autoscale when scaleToZero is false (kept warm)", async () => {
    const { client, calls } = mockClient();

    await deployStaticSite({
      client,
      project: "proj",
      name: "site",
      source: { image: { repository: "r", tag: "t" } },
      scaleToZero: false,
    });

    expect((calls.create as ServiceInput).deploy.autoscale).toBeUndefined();
  });

  it("throws when Fractal returns no url", async () => {
    const { client } = mockClient({ status: {} });

    await expect(
      deployStaticSite({
        client,
        project: "proj",
        name: "site",
        source: { image: { repository: "r", tag: "t" } },
      }),
    ).rejects.toThrow();
  });
});

describe("attachCustomDomain", () => {
  it("updates the service with a cloudflare-for-saas custom hostname and returns dns records", async () => {
    const records = [
      {
        name: "www.example.com",
        recordType: "CNAME",
        value: "site-proj.omni.dev",
        purpose: "traffic",
      },
    ];
    const { client, calls } = mockClient({
      status: { customDomainRecords: records },
    });

    const result = await attachCustomDomain({
      client,
      project: "proj",
      name: "site",
      domain: "www.example.com",
    });

    expect(result.records).toEqual(records);

    const input = calls.update as ServiceInput;
    expect(input.expose.domain).toBe("www.example.com");
    expect(input.expose.customHostname.provider).toBe("cloudflareForSaas");
    expect(input.expose.tls).toBe(true);
  });
});
