import { creditsForUsage } from "./credits";
import { validateAgainstManifest } from "./manifest";
import { DEFAULT_MODEL, getModel } from "./models";
import { buildSystemPrompt } from "./prompt";
import { isSiteFiles } from "./types";

import type { DesignSystem } from "./manifest";
import type { SiteFiles } from "./types";

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderResult {
  text: string;
  usage: ProviderUsage;
}

/**
 * Provider abstraction. The engine never talks to an LLM SDK directly; a client
 * is injected so generation is pure and unit-testable.
 */
export interface ProviderClient {
  complete(args: {
    system: string;
    prompt: string;
    model: string;
  }): Promise<ProviderResult>;
}

export interface GenerateArgs {
  site: SiteFiles;
  request: string;
  client: ProviderClient;
  model?: string;
  designSystem?: DesignSystem;
}

export interface GenerateResult {
  files: SiteFiles;
  reply: string;
  changed: string[];
  credits: number;
  model: string;
}

/**
 * Extracts the JSON object from raw model text by slicing from the first brace
 * to the last. Throws when no object is present, so malformed output fails loud
 * rather than silently.
 */
export const extractJson = (text: string): unknown => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("no JSON object found in model output");
  }

  return JSON.parse(text.slice(start, end + 1));
};

/**
 * Runs one generation turn. Builds a mode-aware prompt, calls the injected
 * provider, validates the returned site files (and, in Design-System mode, the
 * manifest contract), and computes the credit cost from real token usage.
 * Invalid output throws; a generation is never faked.
 */
export const generate = async (args: GenerateArgs): Promise<GenerateResult> => {
  const model = args.model ?? DEFAULT_MODEL;

  getModel(model);

  const system = buildSystemPrompt({ manifest: args.designSystem?.manifest });

  const prompt = [
    "Current files:",
    JSON.stringify({
      theme: args.site.theme,
      shell: args.site.shell,
      pages: args.site.pages,
    }),
    "",
    `Request: ${args.request}`,
  ].join("\n");

  const result = await args.client.complete({ system, prompt, model });

  const parsed = extractJson(result.text) as Record<string, unknown>;

  const files = parsed.files;

  if (!isSiteFiles(files)) throw new Error("model returned invalid site files");

  if (args.designSystem?.manifest) {
    validateAgainstManifest(files, args.designSystem.manifest);
  }

  const changed = Array.isArray(parsed.changed)
    ? parsed.changed.filter((id): id is string => typeof id === "string")
    : [];

  return {
    files,
    reply: typeof parsed.reply === "string" ? parsed.reply : "",
    changed,
    credits: creditsForUsage(
      model,
      result.usage.inputTokens,
      result.usage.outputTokens,
    ),
    model,
  };
};
