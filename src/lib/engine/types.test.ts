import { describe, expect, it } from "bun:test";

import { isSiteFiles } from "./types";

describe("isSiteFiles", () => {
  it("accepts a minimal valid site", () => {
    const site = {
      theme: ":root{--kx-bg:#fff}",
      shell: { header: "<header></header>", footer: "<footer></footer>" },
      pages: { home: { html: "<main></main>", css: "" } },
    };

    expect(isSiteFiles(site)).toBe(true);
  });

  it("rejects a site with no pages", () => {
    const site = { theme: "", shell: { header: "", footer: "" }, pages: {} };

    expect(isSiteFiles(site)).toBe(false);
  });

  it("rejects a page missing html", () => {
    const site = {
      theme: "",
      shell: { header: "", footer: "" },
      pages: { home: { css: "" } },
    };

    expect(isSiteFiles(site)).toBe(false);
  });

  it("rejects a missing shell", () => {
    const site = { theme: "", pages: { home: { html: "", css: "" } } };

    expect(isSiteFiles(site)).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isSiteFiles(null)).toBe(false);
    expect(isSiteFiles("nope")).toBe(false);
    expect(isSiteFiles(42)).toBe(false);
  });
});
