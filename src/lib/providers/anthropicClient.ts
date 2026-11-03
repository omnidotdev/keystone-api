import Anthropic from "@anthropic-ai/sdk";
import { createSynapseClient } from "@omnidotdev/providers/ai";

import type { ProviderClient } from "../engine/generator";

export interface AnthropicClientOptions {
  /** Route through a gateway (Synapse) instead of api.anthropic.com */
  baseURL?: string;
  apiKey?: string;
}

/**
 * Maps Keystone's logical model ids to the concrete ids the Synapse gateway
 * forwards to Anthropic. Pinned to models the upstream currently serves
 * (verified live through Synapse 2026-09-20): the previous claude-4 dated ids
 * (claude-{opus,sonnet}-4-20250514) now 404 upstream. Re-confirm when Anthropic
 * rotates its lineup. Isolated here so the engine and UI keep clean logical ids.
 */
const SYNAPSE_MODEL_MAP: Record<string, string> = {
  "claude-opus-5": "anthropic/claude-opus-4-6",
  "claude-sonnet-5": "anthropic/claude-sonnet-4-5-20250929",
  "claude-haiku-4-5": "anthropic/claude-haiku-4-5-20251001",
};

/**
 * Anthropic implementation of the engine's {@link ProviderClient}, the LLM
 * network boundary (the engine takes the client by injection so its logic stays
 * pure and testable).
 *
 * In production this routes through **Synapse**, Omni's AI gateway. Synapse
 * authenticates with `Authorization: Bearer <key>` (not Anthropic's native
 * `x-api-key`), so we pass the Synapse key as `authToken`; and it uses
 * `anthropic/<id>` model names, mapped above. Synapse holds the real provider
 * keys and enforces rate limiting + usage metering (billed via Aether), so
 * keystone-api never holds a raw provider key and spend is centrally capped.
 * When no gateway is configured (local dev) the SDK resolves credentials
 * normally and talks to Anthropic directly with the given model id.
 */
export const createAnthropicProviderClient = (
  options: AnthropicClientOptions = {},
): ProviderClient => {
  const baseURL = options.baseURL ?? process.env.SYNAPSE_BASE_URL;
  const key = options.apiKey ?? process.env.SYNAPSE_API_KEY;
  const viaGateway = Boolean(baseURL);

  return {
    complete: async ({ system, prompt, model }) => {
      // Non-streaming with a long timeout: a full-site generation completes well
      // within it, and the gateway's streaming SSE does not match the SDK parser
      if (viaGateway) {
        // Production path: route through Synapse via the shared fleet client
        // (@omnidotdev/providers/ai). It sends a plain-string system (the gateway
        // rejects the content-block array form) and the provider-prefixed model
        const client = createSynapseClient({
          baseUrl: baseURL as string,
          apiKey: key,
          model: SYNAPSE_MODEL_MAP[model] ?? model,
          timeoutMs: 600_000,
        });
        const result = await client.messages({
          system,
          messages: [{ role: "user", content: prompt }],
          maxTokens: 32_000,
        });
        return {
          text: result.text,
          usage: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          },
        };
      }

      // Local-dev path: talk to Anthropic directly via the SDK (credential
      // resolution, x-api-key) with the raw model id
      const client = new Anthropic(key ? { apiKey: key } : {});
      const message = await client.messages.create(
        {
          model,
          max_tokens: 32_000,
          system,
          messages: [{ role: "user", content: prompt }],
        },
        { timeout: 600_000 },
      );

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
