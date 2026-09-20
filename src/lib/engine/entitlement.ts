export interface EntitlementInput {
  /** Whether the account's plan permits AI generation at all */
  canGenerate: boolean;
  /** Credits the account has left this period */
  creditsRemaining: number;
  /** Whether the account supplied its own LLM key (bypasses credit checks) */
  byok: boolean;
}

export class EntitlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntitlementError";
  }
}

/**
 * Server-side gate for a generation. BYOK bypasses plan and credit checks
 * entirely. Otherwise the plan must permit generation and the account must have
 * credits remaining. Throws {@link EntitlementError} when generation is not
 * allowed. There is no dev bypass here; enforcement is always on.
 */
export const assertCanGenerate = (input: EntitlementInput): void => {
  if (input.byok) return;

  if (!input.canGenerate) {
    throw new EntitlementError("your plan does not include AI generation");
  }

  if (input.creditsRemaining <= 0) {
    throw new EntitlementError("no generation credits remaining");
  }
};
