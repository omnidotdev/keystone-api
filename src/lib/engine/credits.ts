import { getModel } from "./models";

/** One credit is worth this many USD of model spend */
export const USD_PER_CREDIT = 0.01;

/**
 * Raw USD cost of a generation given a model and its token usage.
 */
export const usdForUsage = (
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number => {
  const model = getModel(modelId);

  return (
    (inputTokens / 1_000_000) * model.inputPer1M +
    (outputTokens / 1_000_000) * model.outputPer1M
  );
};

/**
 * Credits charged for a generation, rounded up so a nonzero cost always
 * charges at least one credit.
 */
export const creditsForUsage = (
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number =>
  Math.ceil(usdForUsage(modelId, inputTokens, outputTokens) / USD_PER_CREDIT);
