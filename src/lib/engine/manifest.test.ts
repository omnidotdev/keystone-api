import { describe, expect, it } from "bun:test";

import { extractCustomTags, validateAgainstManifest } from "./manifest";

import type { ComponentManifest } from "./manifest";
import type { SiteFiles } from "./types";

const manifest: ComponentManifest = {
  components: [{ name: "hero-block", description: "A hero" }],
};

const siteWith = (html: string): SiteFiles => ({
  theme: "",
  shell: { header: "", footer: "" },
  pages: { home: { html, css: "" } },
});

describe("extractCustomTags", () => {
  it("finds hyphenated custom-element tags and ignores standard tags", () => {
    const tags = extractCustomTags(
      "<main><hero-block></hero-block><p>x</p></main>",
    );

    expect(tags).toEqual(["hero-block"]);
  });
});

describe("validateAgainstManifest", () => {
  it("passes when only whitelisted components are used", () => {
    expect(() =>
      validateAgainstManifest(siteWith("<hero-block></hero-block>"), manifest),
    ).not.toThrow();
  });

  it("throws when an unknown component is used", () => {
    expect(() =>
      validateAgainstManifest(siteWith("<bad-block></bad-block>"), manifest),
    ).toThrow(/bad-block/);
  });
});
