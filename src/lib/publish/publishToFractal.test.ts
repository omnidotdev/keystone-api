import { describe, expect, it } from "bun:test";

import { publishToFractal, serviceNameForSite } from "./publishToFractal";

import type { SiteFiles } from "../engine/types";
import type { ContentRepo } from "./contentRepo";
import type { FractalClient } from "./fractal";

const site: SiteFiles = {
  theme: ":root{--kx-bg:#fff}",
  shell: { header: "<header>H</header>", footer: "<footer>F</footer>" },
  pages: {
    home: { html: "<main>hi</main>", css: "" },
  },
};

const recordingRepo = () => {
  const calls: {
    siteId?: string;
    owner?: string;
    authToken?: string;
    files?: Record<string, string>;
  } = {};
  const repo: ContentRepo = {
    publish: async (ctx) => {
      calls.siteId = ctx.siteId;
      calls.owner = ctx.owner;
      calls.authToken = ctx.authToken;
      calls.files = ctx.files;
      return {
        git: {
          url: `https://api.arbor.omni.dev/git/${ctx.owner}/site-${ctx.siteId}`,
          branch: "master",
        },
      };
    },
  };
  return { repo, calls };
};

interface RecordedCreate {
  source: { git: { branch: string } };
  deploy: { autoscale?: { minReplicas: number } };
}

interface RecordedUpdate {
  expose: { domain: string; customHostname: { provider: string } };
}

const recordingClient = (
  service: Record<string, unknown> = {
    status: { url: "https://site-abc-keystone.fractal.dev" },
  },
) => {
  const calls: { create?: RecordedCreate; update?: RecordedUpdate } = {};
  const client: FractalClient = {
    createFractalService: async (input) => {
      calls.create = input as unknown as RecordedCreate;
      return { service };
    },
    updateFractalService: async (input) => {
      calls.update = input as unknown as RecordedUpdate;
      return { service };
    },
  };
  return { client, calls };
};

describe("serviceNameForSite", () => {
  it("produces a dns-safe slug within the label budget", () => {
    expect(serviceNameForSite("Abc_123")).toBe("site-abc-123");
    const long = serviceNameForSite("x".repeat(80));
    expect(long.length).toBeLessThanOrEqual(53);
    expect(long).toMatch(/^site-[a-z0-9-]+$/);
  });
});

describe("publishToFractal", () => {
  it("pushes the build context then deploys a scale-to-zero staticSite", async () => {
    const { repo, calls: repoCalls } = recordingRepo();
    const { client, calls } = recordingClient();

    const result = await publishToFractal({
      contentRepo: repo,
      client,
      project: "keystone",
      siteId: "abc",
      site,
      owner: "ada",
      authToken: "tok",
    });

    expect(result.url).toBe("https://site-abc-keystone.fractal.dev");
    expect(result.service).toBe("site-abc");
    // content pushed as the user, with a baked Dockerfile + nginx.conf
    expect(repoCalls.siteId).toBe("abc");
    expect(repoCalls.owner).toBe("ada");
    expect(repoCalls.authToken).toBe("tok");
    expect(repoCalls.files?.Dockerfile).toContain("nginx");
    // deployed from the branch the repo returned, scale to zero on
    expect(calls.create?.source.git.branch).toBe("master");
    expect(calls.create?.deploy.autoscale?.minReplicas).toBe(0);
    // no custom domain attach when none requested
    expect(calls.update).toBeUndefined();
  });

  it("attaches a custom domain and returns its dns records when requested", async () => {
    const records = [
      {
        name: "www.x.com",
        recordType: "CNAME",
        value: "site-abc-keystone.fractal.dev",
        purpose: "traffic",
      },
    ];
    const { repo } = recordingRepo();
    const { client, calls } = recordingClient({
      status: {
        url: "https://site-abc-keystone.fractal.dev",
        customDomainRecords: records,
      },
    });

    const result = await publishToFractal({
      contentRepo: repo,
      client,
      project: "keystone",
      siteId: "abc",
      site,
      owner: "ada",
      authToken: "tok",
      customDomain: "www.x.com",
    });

    expect(calls.update?.expose.domain).toBe("www.x.com");
    expect(calls.update?.expose.customHostname.provider).toBe(
      "cloudflareForSaas",
    );
    expect(result.customDomainRecords).toEqual(records);
  });
});
