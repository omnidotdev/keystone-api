import { afterEach, describe, expect, it } from "bun:test";

import { createArborContentRepo, repoSlugForSite } from "./contentRepo";

import type { Spawn } from "./git";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Fake spawn: never runs git, always succeeds. */
const okSpawn = () => {
  const pushed: string[][] = [];
  const spawn = ((_c: string, args: string[]) => {
    pushed.push(args);
    return {
      stderr: { on: () => {} },
      on: (e: string, cb: (code?: number) => void) => {
        if (e === "close") queueMicrotask(() => cb(0));
      },
    };
  }) as unknown as Spawn;
  return { spawn, pushed };
};

/** Stub arbor-api GraphQL: returns the given createRepositoryWithGit payload. */
const stubArbor = (payload: {
  slug?: string | null;
  ownerUsername?: string | null;
  error?: string | null;
}) => {
  const requests: unknown[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    return new Response(
      JSON.stringify({ data: { createRepositoryWithGit: payload } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  return { requests };
};

describe("repoSlugForSite", () => {
  it("produces a stable url-safe slug", () => {
    expect(repoSlugForSite("Abc_123")).toBe("site-abc-123");
  });
});

describe("createArborContentRepo", () => {
  it("creates the repo as the service account and returns its arbor clone url on master", async () => {
    const { requests } = stubArbor({
      slug: "site-abc",
      ownerUsername: "keystone",
    });
    const { spawn, pushed } = okSpawn();

    const repo = createArborContentRepo({
      apiUrl: "https://api.arbor.omni.dev/graphql",
      gitBase: "https://api.arbor.omni.dev/git",
      serviceToken: "svc-tok",
      serviceOwner: "keystone",
      spawn,
    });

    const source = await repo.publish({
      siteId: "abc",
      files: { "index.html": "x", Dockerfile: "FROM nginx" },
    });

    // repo lives under the service account's owner path, not the end user's
    expect(source.git.url).toBe(
      "https://api.arbor.omni.dev/git/keystone/site-abc",
    );
    expect(source.git.branch).toBe("master");
    // repo created public; no per-user workspace association is sent
    const input = (
      requests[0] as { variables: { input: Record<string, unknown> } }
    ).variables.input;
    expect(input.slug).toBe("site-abc");
    expect(input.visibility).toBe("PUBLIC");
    expect(input.organizationId).toBeUndefined();
    // both the create and the push use the service token
    const pushArgs = pushed.find((a) => a.includes("push"));
    expect(pushArgs).toBeDefined();
  });

  it("treats an already-exists create as success (re-publish is idempotent)", async () => {
    stubArbor({ error: "repository slug already exists" });
    const { spawn, pushed } = okSpawn();

    const repo = createArborContentRepo({
      apiUrl: "https://api.arbor.omni.dev/graphql",
      gitBase: "https://api.arbor.omni.dev/git",
      serviceToken: "svc-tok",
      serviceOwner: "keystone",
      spawn,
    });

    const source = await repo.publish({
      siteId: "abc",
      files: { "index.html": "x" },
    });

    expect(source.git.url).toBe(
      "https://api.arbor.omni.dev/git/keystone/site-abc",
    );
    // still pushed content despite the create being a no-op
    expect(pushed.some((a) => a[0] === "push")).toBe(true);
  });
});
