/**
 * PLANv3 X3.2 — Completion / sentence-cut detection.
 *
 * Used by auto-continue flow to decide whether a response was cut mid-
 * sentence. Punctuation set covers:
 *   - Western (. ! ? …)
 *   - CJK  (。 ！ ？)
 *   - Romance / narrative emotes (♡)
 * Optional trailing quote / bracket / whitespace is tolerated.
 *
 * IMPORTANT: this is a heuristic only. Real cut-detection must combine
 * isCompleteSentence(text) === false WITH the AI provider's
 * `finish_reason === 'length'`. Orchestrator wiring consumes both.
 */

const PUNCT = /[.!?。…！？♡]["')\]]?\s*$/u;

export function isCompleteSentence(text: string): boolean {
  if (!text) return false;
  return PUNCT.test(text.trimEnd());
}

/**
 * Returns the longest prefix that ends at a completed sentence boundary.
 * Useful when a draft contains a clean sentence followed by a truncated
 * fragment — we keep the clean portion and re-ask the model to continue.
 */
export function trimUntilPunctuation(text: string): string {
  const m = text.match(/^([\s\S]*[.!?。…！？♡]["')\]]?)[^.!?。…！？♡]*$/u);
  return m?.[1] ?? text;
}
