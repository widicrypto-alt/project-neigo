/**
 * Wk3 PLANv2 F1 — Lorebook keyword scanner.
 *
 * Case-insensitive whole-word matching of a user's keyphrase list against a
 * scanning window (typically the last N chat turns). Returns the subset of
 * entries that matched plus the keywords that triggered each hit so the UI
 * and F4 Prompt Inspector can highlight them.
 *
 * Intentionally minimal: no stemming, no NLP — exact phrase boundaries only.
 * Phrases with spaces work as-is ("Shinjuku Station"). Numbers and
 * non-ASCII letters are treated as word characters.
 */

export interface KeywordEntry {
  id: string;
  keywords: string[];
}

export interface KeywordMatch<E extends KeywordEntry = KeywordEntry> {
  entry: E;
  matchedKeywords: string[];
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a single case-insensitive regex that matches any of the given
 * keyphrases with Unicode word-boundary guards on both sides.
 *
 * We avoid the ES `\b` anchor because it's ASCII-only; instead, we require
 * the surrounding characters to not be word characters (or to be string
 * boundaries). Keyphrases themselves are escaped.
 */
function compileKeywordRegex(keywords: string[]): RegExp | null {
  const cleaned = keywords
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .map(escapeRegex);
  if (cleaned.length === 0) return null;
  // Use capture groups for matched keyword extraction — outer alternation.
  const body = cleaned.map((k) => `(?:${k})`).join('|');
  return new RegExp(`(?<!${WORD_CHAR.source})(?:${body})(?!${WORD_CHAR.source})`, 'giu');
}

/**
 * Scan `text` for keyword hits across `entries`. Returns matches sorted so
 * that entries listed first in the input are also first in the output (the
 * caller, e.g. the retriever, is expected to pre-sort by priority).
 *
 * Each keyword in an entry counts at most once per scan; duplicate hits do
 * not amplify weight in this phase (F1 is coarse-grained; F1b wk5 moves
 * to RRF-blended relevance).
 */
export function scanForMatches<E extends KeywordEntry>(
  text: string,
  entries: readonly E[],
): KeywordMatch<E>[] {
  if (!text || entries.length === 0) return [];
  const haystack = text;
  const out: KeywordMatch<E>[] = [];
  for (const entry of entries) {
    const re = compileKeywordRegex(entry.keywords);
    if (!re) continue;
    const hits = new Set<string>();
    for (const m of haystack.matchAll(re)) {
      hits.add(m[0].toLowerCase());
    }
    if (hits.size > 0) {
      out.push({ entry, matchedKeywords: Array.from(hits) });
    }
  }
  return out;
}
