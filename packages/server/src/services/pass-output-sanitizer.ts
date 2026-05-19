/**
 * Pass output sanitizer: strips system tokens, OOC blocks, AI disclaimers,
 * prompt echo, and normalizes whitespace. Port of PassOutputSanitizer.kt
 */
export interface SanitizedOutput {
  text: string;
  stripped: string[];
  newProperNouns: string[];
  flagged: boolean;
}

const SYSTEM_TOKENS: RegExp[] = [
  /\[INST\][^]*?\[\/INST\]/g,
  /<\|im_start\|>[^]*?<\|im_end\|>/g,
  /<s>|<\/s>/g,
  /═══[^\n]*═══/g,
  /###\s*REALITY\s*ANCHOR[^\n]*/gi,
  /^\s*assistant\s*:\s*/gim,
  /^\s*system\s*:\s*/gim,
  /^\s*user\s*:\s*/gim,
];

const OOC_PATTERNS: RegExp[] = [
  /\(OOC:[^)]*\)/gi,
  /\[OOC:[^\]]*\]/gi,
  /\*OOC:[^*]*\*/gi,
  /^\s*OOC:[^\n]*/gim,
  /\{OOC:[^}]*\}/gi,
];

const AI_DISCLAIMERS: RegExp[] = [
  /\bI(?:'m| am)\s+(?:an?\s+)?AI[^.]*\./gi,
  /\bAs an AI[^,.]*[,.]/gi,
  /\bI cannot (?:generate|provide|create|produce)[^.]*\./gi,
  /\bNote:\s*[^.]*\./g,
];

const PROMPT_ECHO: RegExp[] = [
  /^\s*###[^\n]*$/gm,
  /^(?:Character|Location|Scene|Mood)\s*:\s*[^\n]*$/gim,
];

const KNOWN_COMMON = new Set([
  'User', 'You', 'I', 'Me', 'He', 'She', 'They', 'The', 'This', 'That',
]);

export function sanitizePassOutput(
  rawText: string,
  knownNouns: ReadonlyArray<string> = [],
): SanitizedOutput {
  const stripped: string[] = [];
  let text = rawText;

  const runAll = (patterns: RegExp[]) => {
    for (const p of patterns) {
      text = text.replace(p, (m) => {
        stripped.push(m);
        return '';
      });
    }
  };
  runAll(SYSTEM_TOKENS);
  runAll(OOC_PATTERNS);
  runAll(AI_DISCLAIMERS);
  runAll(PROMPT_ECHO);

  text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();

  const known = new Set<string>([...KNOWN_COMMON, ...knownNouns.map((n) => n.trim()).filter(Boolean)]);
  const properNounRegex = /\b([A-Z][a-zA-Z]{3,})\b/g;
  const nouns = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = properNounRegex.exec(text)) !== null) {
    const word = m[1];
    if (word && !known.has(word)) nouns.add(word);
  }
  const newNouns = Array.from(nouns);
  return { text, stripped, newProperNouns: newNouns, flagged: newNouns.length > 0 };
}

/**
 * v7 refusal guard — detects common assistant-style refusal preambles that
 * leak through even after the persona system prompt. Returns a match-reason
 * or null. The orchestrator uses this to trigger one retry with a tighter
 * preamble before surfacing content to the user.
 */
const REFUSAL_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bI can(?:'|no)t (?:help with|assist with|provide|generate|create|write|engage)\b/i, reason: 'refusal_cant_help' },
  { re: /\bI(?:'m| am) (?:unable|not able) to\b/i, reason: 'refusal_unable' },
  { re: /\bAs an AI\b/i, reason: 'refusal_as_ai' },
  { re: /\bI(?:'m| am) (?:an? )?(?:AI|language model|assistant)\b/i, reason: 'refusal_identity' },
  { re: /\bI (?:don(?:'|no)t|won(?:'|no)t) (?:feel comfortable|engage|participate)\b/i, reason: 'refusal_uncomfortable' },
  { re: /\bI must (?:decline|refuse)\b/i, reason: 'refusal_decline' },
  { re: /\bI apologize,? but\b/i, reason: 'refusal_apologize' },
];

export function detectRefusal(text: string): { refused: boolean; reason?: string } {
  if (!text) return { refused: false };
  // Only scan the opening ~400 chars — refusals almost always lead the output.
  const head = text.slice(0, 400);
  for (const { re, reason } of REFUSAL_PATTERNS) {
    if (re.test(head)) return { refused: true, reason };
  }
  return { refused: false };
}
