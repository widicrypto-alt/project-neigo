/**
 * Format drift detector — catches dialogue-in-italics violations.
 *
 * The Format Contract in the system prompt requires:
 *   *italics* = narration only, "quotes" = dialogue only
 * This detector flags responses where quoted dialogue appears inside italic blocks.
 */

export interface FormatDriftResult {
  /** True when dialogue-in-italics pattern detected — caller should retry. */
  shouldReject: boolean;
  /** Matched violations (for logging). */
  violations: string[];
}

/**
 * Pattern: `*.....".....".....*` — dialogue quotes inside an italic block.
 * Catches both `*She smiled. "Hello," she said.*` and `*"Hello."*` etc.
 */
const DIALOGUE_IN_ITALICS = /\*[^*]*"[^"]*"[^*]*\*/g;

/**
 * Minimum number of violations before triggering a reject.
 * A single stray occurrence could be an edge case; 2+ is a clear pattern.
 */
const MIN_VIOLATIONS = 2;

export function detectFormatDrift(text: string): FormatDriftResult {
  const matches = text.match(DIALOGUE_IN_ITALICS) ?? [];
  return {
    shouldReject: matches.length >= MIN_VIOLATIONS,
    violations: matches.slice(0, 5), // cap for logging
  };
}
