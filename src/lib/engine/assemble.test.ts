import { describe, expect, it } from "bun:test";

import { assembleDocument } from "./assemble";

import type { SiteFiles } from "./types";

const site: SiteFiles = {
  theme: ":root{--kx-bg:#fff}",
  shell: { header: "<header>H</header>", footer: "<footer>F</footer>" },
  pages: {
    home: { html: "<main>Home</main>", css: ".x{color:red}" },
    about: { html: "<main>About</main>", css: "", js: "console.log('hi')" },
  },
};

describe("assembleDocument", () => {
  it("composes theme, shell, and page into one document", () => {
    const doc = assembleDocument(site, "home");

    expect(doc).toContain("--kx-bg:#fff");
    expect(doc).toContain(".x{color:red}");
    expect(doc).toContain("<header>H</header>");
    expect(doc).toContain("<main>Home</main>");
    expect(doc).toContain("<footer>F</footer>");
  });

  it("injects the nav guard in preview mode (default)", () => {
    expect(assembleDocument(site, "home")).toContain("kx-nav-guard");
  });

  it("omits the nav guard in publish mode", () => {
    expect(assembleDocument(site, "home", { preview: false })).not.toContain(
      "kx-nav-guard",
    );
  });

  it("includes page js when present", () => {
    expect(assembleDocument(site, "about")).toContain("console.log('hi')");
  });

  it("throws for an unknown page id", () => {
    expect(() => assembleDocument(site, "missing")).toThrow();
  });
});
