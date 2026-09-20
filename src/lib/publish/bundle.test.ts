import { describe, expect, it } from "bun:test";

import { buildImageContext, buildStaticBundle } from "./bundle";

import type { SiteFiles } from "../engine/types";

const site: SiteFiles = {
  theme: ":root{--kx-bg:#fff}",
  shell: { header: "<header>H</header>", footer: "<footer>F</footer>" },
  pages: {
    home: {
      html: "<main>Home</main><script>bad()</script>",
      css: "",
    },
    about: { html: "<main>About</main>", css: "" },
  },
};

describe("buildStaticBundle", () => {
  it("maps home to index.html and other pages to clean-url paths", () => {
    const bundle = buildStaticBundle(site);

    expect(Object.keys(bundle).sort()).toEqual([
      "about/index.html",
      "index.html",
    ]);
  });

  it("emits sanitized full documents", () => {
    const bundle = buildStaticBundle(site);

    expect(bundle["index.html"]).toContain("<!doctype html>");
    expect(bundle["index.html"]).not.toContain("bad()");
    expect(bundle["index.html"]).not.toContain("kx-nav-guard");
  });
});

describe("buildImageContext", () => {
  it("nests site files under site/ and includes a Dockerfile and nginx config", () => {
    const context = buildImageContext(site);

    expect(context["site/index.html"]).toBeDefined();
    expect(context["site/about/index.html"]).toBeDefined();
    expect(context.Dockerfile).toContain("nginx");
    expect(context["nginx.conf"]).toContain("try_files");
  });
});
