import Anthropic from "@anthropic-ai/sdk";

/**
 * Central Anthropic config. Model parameter rules (verified against the
 * current API — violations return 400):
 * - Opus 4.8: adaptive thinking must be set explicitly; `display` defaults to
 *   "omitted" (empty thinking text) so we opt into "summarized" for the UI.
 * - Never send temperature / top_p / top_k / budget_tokens.
 * - Haiku 4.5: no `thinking`, no `effort`.
 */
export const ANALYST_MODEL = "claude-opus-4-8";
export const EXPLAIN_MODEL = "claude-haiku-4-5";

export const ANALYST_THINKING = {
  type: "adaptive",
  display: "summarized",
} as const;

export const ANALYST_MAX_TOKENS = 16000;
export const ANALYST_MAX_ITERATIONS = 12;

const globalForAnthropic = globalThis as unknown as { __lsAnthropic?: Anthropic };

/** Resolves credentials from the environment (ANTHROPIC_API_KEY etc.). */
export function anthropic(): Anthropic {
  if (!globalForAnthropic.__lsAnthropic) {
    globalForAnthropic.__lsAnthropic = new Anthropic();
  }
  return globalForAnthropic.__lsAnthropic;
}

export function hasAnthropicCredentials(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  );
}
