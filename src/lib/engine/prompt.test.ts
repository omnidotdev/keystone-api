import { describe, expect, it } from "bun:test";

import { buildSystemPrompt } from "./prompt";

import type { ComponentManifest } from "./manifest";

const manifest: ComponentManifest = {
  components: [
    { name: "hero-block", description: "A large hero section" },
    { name: "cta-block", description: "A call to action" },
  ],
};

describe("buildSystemPrompt", () => {
  it("allows freeform HTML when no manifest is supplied", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("freely");
    expect(prompt).not.toContain("DESIGN SYSTEM MODE");
  });

  it("constrains to whitelisted components when a manifest is supplied", () => {
    const prompt = buildSystemPrompt({ manifest });

    expect(prompt).toContain("DESIGN SYSTEM MODE");
    expect(prompt).toContain("Compose ONLY");
    expect(prompt).toContain("hero-block");
    expect(prompt).toContain("cta-block");
  });
});
