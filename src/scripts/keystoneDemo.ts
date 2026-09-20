/**
 * Local Keystone demo: prompt -> Claude -> a generated site you can open in a
 * browser. Exercises the real engine + Anthropic provider end to end, without
 * needing the GraphQL mutation or the builder UI.
 *
 * Usage:
 *   bun run src/scripts/keystoneDemo.ts "your prompt here" [model]
 *
 * Writes the assembled page to ~/Downloads/keystone-demo.html and prints the path.
 * Calls the real Anthropic API (uses your credits).
 */
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { assembleDocument } from "../lib/engine/assemble";
import { generate } from "../lib/engine/generator";
import { createAnthropicProviderClient } from "../lib/providers/anthropicClient";

import type { SiteFiles } from "../lib/engine/types";

const prompt =
  process.argv[2] ??
  "A bold, modern landing page for an artisanal coffee roaster called Ember: a hero with a tagline, a 'featured beans' section with three cards, an about blurb, and a newsletter signup. Warm, cozy palette.";

const model = process.argv[3];

const blank: SiteFiles = {
  theme: "",
  shell: { header: "", footer: "" },
  pages: { home: { html: "", css: "" } },
};

const client = createAnthropicProviderClient();

console.info(`\nKeystone demo`);
console.info(`Model:  ${model ?? "default (claude-opus-5)"}`);
console.info(`Prompt: ${prompt}\n`);
console.info("Generating (this can take a bit on the first turn)...");

const result = await generate({ site: blank, request: prompt, client, model });

const html = assembleDocument(result.files, "home", { preview: false });

const out = join(homedir(), "Downloads", "keystone-demo.html");
writeFileSync(out, html);

console.info(`\nDone.`);
console.info(`Reply:   ${result.reply}`);
console.info(`Model:   ${result.model}`);
console.info(`Credits: ${result.credits}`);
console.info(`Pages:   ${Object.keys(result.files.pages).join(", ")}`);
console.info(`\nOpen in your browser:\n  ${out}\n`);
