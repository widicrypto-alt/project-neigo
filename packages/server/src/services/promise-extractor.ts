/**
 * Promise Extractor — detects when an AI character makes a promise or
 * commitment ("I'll remember", "next time I'll tell you", etc.) and
 * automatically pins it as a PINNED memory for future recall.
 */
import { MemoryRetriever } from './memory-retriever.js';

/**
 * Regex patterns that indicate a character promise or commitment.
 * Kept intentionally broad — false positives are low-cost (just extra pinned memory),
 * while false negatives lose continuity.
 */
const PROMISE_PATTERNS = [
  /i(?:'ll| will) remember/i,
  /i(?:'ll| will) (?:not |never )?forget/i,
  /next time (?:i(?:'ll| will)|we)/i,
  /i promise/i,
  /remind me (?:to|about|when)/i,
  /i(?:'ll| will) (?:tell|show|bring|make|get|find) (?:you|it)/i,
  /don't (?:worry|forget),? i/i,
  /i(?:'ll| will) (?:come back|return|wait)/i,
  /i(?:'ll| will) keep (?:it|this|that|your)/i,
  /when (?:you|we) (?:come back|return|meet again)/i,
];

/** Minimum character length of the surrounding sentence to avoid false positives on fragments. */
const MIN_SENTENCE_LEN = 12;

/**
 * Scan `text` (the AI character's output) for promise-like statements.
 * Returns the matching sentence(s) or `null` if none found.
 */
export function detectPromises(text: string): string[] {
  const sentences = text.split(/(?<=[.!?…])\s+/).filter((s) => s.length >= MIN_SENTENCE_LEN);
  const hits: string[] = [];
  for (const sentence of sentences) {
    if (PROMISE_PATTERNS.some((p) => p.test(sentence))) {
      hits.push(sentence.trim());
    }
  }
  return hits;
}

/**
 * Fire-and-forget: scan the character's reply for promises and pin them.
 * Safe to call with no `await` — errors are silently swallowed.
 */
export async function extractAndPinPromises(opts: {
  text: string;
  userId: string;
  sessionId: string;
  characterId: string;
  characterName: string;
}): Promise<void> {
  const promises = detectPromises(opts.text);
  if (!promises.length) return;

  for (const p of promises) {
    await MemoryRetriever.insert({
      userId: opts.userId,
      sessionId: opts.sessionId,
      characterId: opts.characterId,
      type: 'PINNED',
      category: 'PROMISE',
      content: `[${opts.characterName}] ${p}`,
      emotionalTag: 'commitment',
      importance: 0.85,
    });
  }
}
