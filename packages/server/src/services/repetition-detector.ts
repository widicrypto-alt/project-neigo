/**
 * Stateless n-gram repetition detector.
 *
 * Two checks:
 *  1) 4-gram overlap ratio → severity levels (original).
 *  2) Trigram Jaccard similarity → `shouldReject` flag (beta extension).
 *     Jaccard > 0.4 means the new text is too similar to recent outputs;
 *     the orchestrator should retry with temp += 0.15, cap 2 retries.
 */
export type Severity = 'CLEAN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RepetitionResult {
  hasRepetition: boolean;
  repeatedPhrases: string[];
  severity: Severity;
  /** True when trigram Jaccard > 0.4 — caller should retry generation. */
  shouldReject: boolean;
  /** Trigram Jaccard similarity (0–1). */
  trigramJaccard: number;
}

const NGRAM_SIZE = 4;
const LOW = 0.15;
const MED = 0.3;
const HIGH = 0.5;
const WINDOW = 8;
const TRIGRAM_JACCARD_THRESHOLD = 0.4;

function tokenize(text: string): string[] {
  return text
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function extractNgrams(text: string, n: number = NGRAM_SIZE): string[] {
  const tokens = tokenize(text);
  if (tokens.length < n) return [];
  const grams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    grams.push(tokens.slice(i, i + n).join(' '));
  }
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

export function detectRepetition(newText: string, recent: string[]): RepetitionResult {
  const newGrams = extractNgrams(newText);
  if (newGrams.length === 0) {
    return { hasRepetition: false, repeatedPhrases: [], severity: 'CLEAN', shouldReject: false, trigramJaccard: 0 };
  }
  const window = recent.slice(-WINDOW);
  const historyGrams = new Set<string>();
  for (const r of window) for (const g of extractNgrams(r)) historyGrams.add(g);
  const repeats = newGrams.filter((g) => historyGrams.has(g));
  const overlap = repeats.length / newGrams.length;
  const severity: Severity =
    overlap >= HIGH ? 'HIGH' : overlap >= MED ? 'MEDIUM' : overlap >= LOW ? 'LOW' : 'CLEAN';
  const uniq = Array.from(new Set(repeats)).slice(0, 5);

  // Trigram Jaccard check
  const newTrigrams = new Set(extractNgrams(newText, 3));
  const historyTrigrams = new Set<string>();
  for (const r of window) for (const g of extractNgrams(r, 3)) historyTrigrams.add(g);
  const trigramJaccard = jaccard(newTrigrams, historyTrigrams);

  return {
    hasRepetition: severity !== 'CLEAN',
    repeatedPhrases: uniq,
    severity,
    shouldReject: trigramJaccard > TRIGRAM_JACCARD_THRESHOLD,
    trigramJaccard,
  };
}
