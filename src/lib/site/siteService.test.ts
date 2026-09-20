import { describe, expect, it } from "bun:test";

import { appendTurn, runSiteGeneration } from "./siteService";

import type { GenerateResult, ProviderClient } from "../engine/generator";
import type { SiteState, SiteStore, StoredSite } from "./siteService";

const state: SiteState = {
  files: {
    theme: "old",
    shell: { header: "", footer: "" },
    pages: { home: { html: "<main>old</main>", css: "" } },
  },
  transcript: [{ role: "user", content: "first", at: "t0" }],
};

const result: GenerateResult = {
  files: {
    theme: "new",
    shell: { header: "", footer: "" },
    pages: { home: { html: "<main>new</main>", css: "" } },
  },
  reply: "updated the hero",
  changed: ["home"],
  credits: 3,
  model: "claude-sonnet-5",
};

describe("appendTurn", () => {
  it("replaces files with the generation result", () => {
    expect(appendTurn(state, "make it pop", result).files.theme).toBe("new");
  });

  it("appends the user request and assistant reply, preserving prior turns", () => {
    const next = appendTurn(state, "make it pop", result, () => "t1");

    expect(next.transcript).toEqual([
      { role: "user", content: "first", at: "t0" },
      { role: "user", content: "make it pop", at: "t1" },
      { role: "assistant", content: "updated the hero", at: "t1" },
    ]);
  });

  it("does not mutate the input state", () => {
    const before = state.transcript.length;

    appendTurn(state, "x", result);

    expect(state.transcript.length).toBe(before);
  });
});

describe("runSiteGeneration", () => {
  const validPayload = JSON.stringify({
    files: {
      theme: "t",
      shell: { header: "", footer: "" },
      pages: { home: { html: "<main>new</main>", css: "" } },
    },
    reply: "did it",
    changed: ["home"],
  });

  const mockClient: ProviderClient = {
    complete: async () => ({
      text: validPayload,
      usage: { inputTokens: 1000, outputTokens: 1000 },
    }),
  };

  const makeStore = (initial: StoredSite | null) => {
    let saved: SiteState | null = null;

    const store: SiteStore = {
      load: async () => initial,
      save: async (_id, next) => {
        saved = next;
      },
    };

    return { store, getSaved: () => saved };
  };

  it("generates, persists the merged result, and returns credits", async () => {
    const { store, getSaved } = makeStore({
      files: {
        theme: "old",
        shell: { header: "", footer: "" },
        pages: { home: { html: "<main>old</main>", css: "" } },
      },
      transcript: [],
    });

    const result = await runSiteGeneration({
      store,
      siteId: "s1",
      request: "update the page",
      client: mockClient,
    });

    expect(result.credits).toBeGreaterThan(0);
    expect(getSaved()?.files.pages.home?.html).toBe("<main>new</main>");
    expect(getSaved()?.transcript.length).toBe(2);
  });

  it("throws when the site does not exist", async () => {
    const { store } = makeStore(null);

    await expect(
      runSiteGeneration({
        store,
        siteId: "missing",
        request: "x",
        client: mockClient,
      }),
    ).rejects.toThrow(/not found/);
  });
});
