import { describe, expect, it } from "bun:test";

import {
  designSystemMode,
  extractCustomTags,
  parseDesignSystem,
  validateAgainstManifest,
} from "./manifest";

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

describe("designSystemMode", () => {
  it("is freeform with no design system", () => {
    expect(designSystemMode()).toBe("freeform");
    expect(designSystemMode(null)).toBe("freeform");
  });

  it("is themed with tokens only", () => {
    expect(designSystemMode({ tokens: "{}" })).toBe("themed");
  });

  it("is design-system when a manifest is attached", () => {
    expect(
      designSystemMode({
        manifest: { components: [{ name: "x-card", description: "card" }] },
      }),
    ).toBe("design-system");
  });
});

describe("parseDesignSystem", () => {
  it("accepts tokens only", () => {
    expect(parseDesignSystem({ tokens: '{"color":{}}' })).toEqual({
      tokens: '{"color":{}}',
    });
  });

  it("accepts a valid manifest and drops nothing", () => {
    const ds = parseDesignSystem({
      manifest: {
        components: [{ name: "sigil-button", description: "A button" }],
      },
    });
    expect(ds.manifest?.components[0]?.name).toBe("sigil-button");
  });

  it("rejects a non-object", () => {
    expect(() => parseDesignSystem("nope")).toThrow(/must be an object/);
  });

  it("rejects an empty design system", () => {
    expect(() => parseDesignSystem({})).toThrow(/tokens and\/or a manifest/);
  });

  it("rejects a manifest with no components", () => {
    expect(() => parseDesignSystem({ manifest: { components: [] } })).toThrow(
      /at least one component/,
    );
  });

  it("rejects a component tag without a hyphen", () => {
    expect(() =>
      parseDesignSystem({
        manifest: { components: [{ name: "button", description: "x" }] },
      }),
    ).toThrow(/custom-element tag/);
  });

  it("rejects a component missing a description", () => {
    expect(() =>
      parseDesignSystem({
        manifest: { components: [{ name: "x-btn" }] },
      }),
    ).toThrow(/needs a description/);
  });

  it("rejects non-string tokens", () => {
    expect(() => parseDesignSystem({ tokens: 42 })).toThrow(
      /must be a serialized string/,
    );
  });
});
