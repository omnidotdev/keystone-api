export type Provider = "anthropic" | "openai" | "xai";

export interface ModelInfo {
  id: string;
  provider: Provider;
  /** USD per 1M input tokens */
  inputPer1M: number;
  /** USD per 1M output tokens */
  outputPer1M: number;
}

/**
 * Model registry with per-token USD pricing (per 1M tokens) used for credit
 * accounting. Rates are the current Anthropic first-party API rates; re-confirm
 * against the claude-api reference when it changes.
 */
export const MODELS: Record<string, ModelInfo> = {
  "claude-opus-5": {
    id: "claude-opus-5",
    provider: "anthropic",
    inputPer1M: 5,
    outputPer1M: 25,
  },
  "claude-sonnet-5": {
    id: "claude-sonnet-5",
    provider: "anthropic",
    inputPer1M: 2,
    outputPer1M: 10,
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    inputPer1M: 1,
    outputPer1M: 5,
  },
};

/** Default generation model: the most capable Claude model */
export const DEFAULT_MODEL = "claude-opus-5";

export const getModel = (id: string): ModelInfo => {
  const model = MODELS[id];

  if (!model) throw new Error(`unknown model: ${id}`);

  return model;
};
