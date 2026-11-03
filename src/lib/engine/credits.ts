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
 *
 * A credit is a retail unit, not raw cost: `markup` scales model spend into
 * billable credits so the included allowance can carry gross margin. The
 * default 1.0 bills at cost (today's behavior, no change for existing
 * subscribers); raise it (e.g. 2.0 for ~50% gross margin) via CREDIT_COGS_MARKUP
 * when grandfathering/announcing to live users. Fleet credit-economics standard,
 * shared with Facet (see plans/2026-11-03-fleet-credit-economics-markup.md).
 */
export const creditsForUsage = (
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  markup = 1,
): number =>
  Math.ceil(
    (usdForUsage(modelId, inputTokens, outputTokens) * markup) / USD_PER_CREDIT,
  );
