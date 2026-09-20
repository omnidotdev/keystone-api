import Anthropic from "@anthropic-ai/sdk";

import type { ProviderClient } from "../engine/generator";

/**
 * Anthropic implementation of the engine's {@link ProviderClient}. This is the
 * LLM network boundary; the engine takes the client by injection so its logic
 * stays pure and testable.
 *
 * Notes:
 * - Streaming with a generous max_tokens: a full site can be a long generation,
 *   and streaming avoids HTTP timeouts (we only need the final message).
 * - `thinking` is intentionally omitted: the default model (claude-opus-5)
 *   reasons by default, and omitting the field keeps this client valid across
 *   every registry model (Haiku does not accept adaptive thinking).
 * - The stable, mode-specific system prompt is marked cacheable to cut cost on
 *   repeated turns.
 */
export const createAnthropicProviderClient = (
  apiKey?: string,
): ProviderClient => {
  const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();

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
