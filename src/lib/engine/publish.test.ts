import { describe, expect, it } from "bun:test";

import { publishDocument } from "./publish";

import type { SiteFiles } from "./types";

const site: SiteFiles = {
  theme: ":root{--kx-bg:#fff}",
  shell: {
    header: "<header>H</header><script>steal()</script>",
    footer: "<footer>F</footer>",
  },
  pages: {
    home: {
      html: '<main>Home</main><img src="x" onerror="hack()">',
      css: ".x{color:red}",
      js: "fetch('/steal')",
    },
  },
};

describe("publishDocument", () => {
  it("produces sanitized, script-free output", () => {
    const doc = publishDocument(site, "home");

    expect(doc).not.toContain("steal()");
    expect(doc).not.toContain("onerror");
    expect(doc).not.toContain("fetch('/steal')");
  });

  it("omits the preview nav guard", () => {
    expect(publishDocument(site, "home")).not.toContain("kx-nav-guard");
  });

  it("preserves safe content and theme", () => {
    const doc = publishDocument(site, "home");

    expect(doc).toContain("<main>Home</main>");
    expect(doc).toContain("--kx-bg:#fff");
  });
});
