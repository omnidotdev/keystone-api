import { afterEach, describe, expect, it } from "bun:test";

import { branchForSite, createGithubContentRepo } from "./contentRepo";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("branchForSite", () => {
  it("namespaces each site to its own branch", () => {
    expect(branchForSite("abc")).toBe("site-abc");
  });
});

describe("createGithubContentRepo", () => {
  it("creates blobs, a tree, a commit, then force-updates the site ref", async () => {
    const paths: string[] = [];

    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      paths.push(`${init.method} ${path}`);

      // ref PATCH succeeds (branch already exists)
      const body = JSON.stringify({ sha: "deadbeef" });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;

    const repo = createGithubContentRepo({
      owner: "omnidotdev",
      repo: "keystone-sites",
      token: "t",
    });

    const source = await repo.pushSite("abc", {
      "index.html": "<h1>hi</h1>",
      Dockerfile: "FROM nginx",
    });

    expect(source.git.branch).toBe("site-abc");
    expect(source.git.url).toBe("https://github.com/omnidotdev/keystone-sites");

    // two blobs, one tree, one commit, one ref update
    expect(paths.filter((p) => p.endsWith("/git/blobs")).length).toBe(2);
    expect(paths).toContain("POST /repos/omnidotdev/keystone-sites/git/trees");
    expect(paths).toContain(
      "POST /repos/omnidotdev/keystone-sites/git/commits",
    );
    expect(paths.some((p) => p.includes("/git/refs/heads/site-abc"))).toBe(
      true,
    );
  });

  it("creates the ref when the branch does not yet exist", async () => {
    let patchCalls = 0;
    let createRefCalls = 0;

    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;

      if (init.method === "PATCH" && path.includes("/git/refs/heads/")) {
        patchCalls += 1;
        return new Response("no ref", { status: 422 });
      }

      if (init.method === "POST" && path.endsWith("/git/refs")) {
        createRefCalls += 1;
      }

      return new Response(JSON.stringify({ sha: "abc" }), { status: 200 });
    }) as unknown as typeof fetch;

    const repo = createGithubContentRepo({
      owner: "o",
      repo: "r",
      token: "t",
    });

    await repo.pushSite("new", { "index.html": "x" });

    expect(patchCalls).toBe(1);
    expect(createRefCalls).toBe(1);
  });

  it("throws a sanitized error (no response body) on failure", async () => {
    globalThis.fetch = (async () =>
      new Response("secret-token-leak", {
        status: 500,
      })) as unknown as typeof fetch;

    const repo = createGithubContentRepo({ owner: "o", repo: "r", token: "t" });

    await expect(repo.pushSite("x", { a: "b" })).rejects.toThrow(
      /failed \(500\)/,
    );
    await expect(repo.pushSite("x", { a: "b" })).rejects.not.toThrow(
      /secret-token-leak/,
    );
  });
});
