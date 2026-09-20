import { describe, expect, it } from "bun:test";

import { extractJson, generate } from "./generator";

import type { ProviderClient } from "./generator";
import type { ComponentManifest } from "./manifest";
import type { SiteFiles } from "./types";

const baseSite: SiteFiles = {
  theme: "",
  shell: { header: "", footer: "" },
  pages: { home: { html: "<main></main>", css: "" } },
};

/** A provider client that always returns the given text and a fixed usage */
const mockClient = (
  text: string,
  usage = { inputTokens: 1000, outputTokens: 1000 },
): ProviderClient => ({
  complete: async () => ({ text, usage }),
});

const validPayload = (html: string) =>
  JSON.stringify({
    files: {
      theme: ":root{}",
      shell: { header: "", footer: "" },
      pages: { home: { html, css: "" } },
    },
    reply: "done",
    changed: ["home"],
  });

describe("extractJson", () => {
  it("slices a JSON object out of surrounding prose", () => {
    expect(extractJson('here you go {"a":1} thanks')).toEqual({ a: 1 });
  });

  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("generate (freeform)", () => {
  it("returns parsed files, reply, changed, and credits", async () => {
    const result = await generate({
      site: baseSite,
      request: "make a landing page",
      client: mockClient(validPayload("<main>Hi</main>")),
    });

    expect(result.files.pages.home?.html).toBe("<main>Hi</main>");
    expect(result.reply).toBe("done");
    expect(result.changed).toEqual(["home"]);
    expect(result.credits).toBeGreaterThan(0);
    expect(result.model).toBe("claude-opus-5");
  });

  it("throws when the model returns invalid site files", async () => {
    const bad = JSON.stringify({ files: { theme: "", pages: {} }, reply: "" });

    await expect(
      generate({ site: baseSite, request: "x", client: mockClient(bad) }),
    ).rejects.toThrow();
  });

  it("throws when the model returns no JSON", async () => {
    await expect(
      generate({ site: baseSite, request: "x", client: mockClient("sorry") }),
    ).rejects.toThrow();
  });
});

describe("generate (design-system mode)", () => {
  const manifest: ComponentManifest = {
    components: [{ name: "hero-block", description: "A hero" }],
  };

  it("accepts output using only whitelisted components", async () => {
    const result = await generate({
      site: baseSite,
      request: "hero page",
      client: mockClient(validPayload("<hero-block></hero-block>")),
      designSystem: { manifest },
    });

    expect(result.files.pages.home?.html).toContain("hero-block");
  });

  it("rejects output using a component not in the manifest", async () => {
    await expect(
      generate({
        site: baseSite,
        request: "hero page",
        client: mockClient(validPayload("<rogue-block></rogue-block>")),
        designSystem: { manifest },
      }),
    ).rejects.toThrow(/rogue-block/);
  });
});
