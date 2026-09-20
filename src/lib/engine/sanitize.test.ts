import { describe, expect, it } from "bun:test";

import { sanitizeHtml, sanitizeSite } from "./sanitize";

import type { SiteFiles } from "./types";

describe("sanitizeHtml", () => {
  it("removes script tags", () => {
    expect(sanitizeHtml("<p>ok</p><script>alert(1)</script>")).not.toContain(
      "script",
    );
  });

  it("strips inline event handlers", () => {
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).not.toContain(
      "onerror",
    );
  });

  it("strips javascript: urls", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain(
      "javascript:",
    );
  });

  it("preserves safe markup", () => {
    const clean = sanitizeHtml("<h1>Hi</h1><p>Welcome</p>");

    expect(clean).toContain("<h1>Hi</h1>");
    expect(clean).toContain("<p>Welcome</p>");
  });
});

describe("sanitizeSite", () => {
  const dirty: SiteFiles = {
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

  it("sanitizes shell and page html", () => {
    const clean = sanitizeSite(dirty);

    expect(clean.shell.header).not.toContain("script");
    expect(clean.pages.home?.html).not.toContain("onerror");
  });

  it("drops page javascript for published output", () => {
    expect(sanitizeSite(dirty).pages.home?.js).toBeUndefined();
  });

  it("preserves theme and css untouched", () => {
    const clean = sanitizeSite(dirty);

    expect(clean.theme).toBe(":root{--kx-bg:#fff}");
    expect(clean.pages.home?.css).toBe(".x{color:red}");
  });
});
