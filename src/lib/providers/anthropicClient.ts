import Anthropic from "@anthropic-ai/sdk";

import type { ProviderClient } from "../engine/generator";

export interface AnthropicClientOptions {
  /** Route through a gateway (Synapse) instead of api.anthropic.com */
  baseURL?: string;
  apiKey?: string;
}

/**
 * Anthropic implementation of the engine's {@link ProviderClient}, the LLM
 * network boundary (the engine takes the client by injection so its logic stays
 * pure and testable).
 *
 * In production this routes through **Synapse**, Omni's AI gateway, by setting
 * `baseURL` to the in-cluster Synapse endpoint (`SYNAPSE_BASE_URL`) and using a
 * scoped Synapse credential (`SYNAPSE_API_KEY`). Synapse holds the real provider
 * keys and enforces rate limiting, routing, and usage metering (billed via
 * Aether), so keystone-api never holds a raw provider key and spend is centrally
 * capped. When neither is set (local dev) the SDK resolves credentials normally
 * (env or `ant` profile) and talks to Anthropic directly.
 *
 * Notes:
 * - Streaming with a generous max_tokens: a full site is a long generation, and
 *   streaming avoids HTTP timeouts (we only need the final message).
 * - `thinking` is omitted so the client stays valid across every registry model
 *   (Haiku does not accept adaptive thinking); the default model reasons anyway.
 * - The stable, mode-specific system prompt is marked cacheable to cut cost.
 */
export const createAnthropicProviderClient = (
  options: AnthropicClientOptions = {},
): ProviderClient => {
  const baseURL = options.baseURL ?? process.env.SYNAPSE_BASE_URL;
  const apiKey = options.apiKey ?? process.env.SYNAPSE_API_KEY;

  const client = new Anthropic({
    ...(baseURL ? { baseURL } : {}),
    ...(apiKey ? { apiKey } : {}),
  });

  return {
    complete: async ({ system, prompt, model }) => {
      const stream = client.messages.stream({
        model,
        max_tokens: 32_000,
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: prompt }],
      });

      const message = await stream.finalMessage();

      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => (block as { text: string }).text)
        .join("");

      return {
        text,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    },
  };
};
