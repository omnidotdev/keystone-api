import Anthropic from "@anthropic-ai/sdk";

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
  "claude-opus-5": "anthropic/claude-opus-4-5",
  "claude-sonnet-5": "anthropic/claude-sonnet-5",
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

  const client = new Anthropic({
    ...(baseURL ? { baseURL } : {}),
    // Gateway wants a Bearer token; direct Anthropic wants x-api-key (apiKey)
    ...(viaGateway && key ? { authToken: key } : key ? { apiKey: key } : {}),
  });

  return {
    complete: async ({ system, prompt, model }) => {
      const routedModel = viaGateway
        ? (SYNAPSE_MODEL_MAP[model] ?? model)
        : model;

      // Non-streaming with a long timeout: the Synapse gateway's streaming SSE
      // does not match the SDK's stream-event parser ("unexpected event order"),
      // and a full-site generation still completes well within the timeout.
      const message = await client.messages.create(
        {
          model: routedModel,
          max_tokens: 32_000,
          // Plain string: the Synapse gateway rejects the content-block array
          // form (used for cache_control) with a 422.
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
