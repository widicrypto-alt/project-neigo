/**
 * Parse `[MISTAKE: original | correction | explanation]` tags from learner-mode outputs.
 */
const MISTAKE_RE = /\[MISTAKE:\s*([^|]+?)\s*\|\s*([^|]+?)\s*(?:\|\s*([^\]]+?))?\]/gi;

export interface ParsedMistake {
  original: string;
  correction: string;
  explanation: string;
}

export function parseAndStripMistakes(raw: string): {
  clean: string;
  mistakes: ParsedMistake[];
} {
  const mistakes: ParsedMistake[] = [];
  const clean = raw.replace(MISTAKE_RE, (_m, original, correction, explanation) => {
    mistakes.push({
      original: String(original ?? '').trim(),
      correction: String(correction ?? '').trim(),
      explanation: String(explanation ?? '').trim(),
    });
    return '';
  });
  return { clean: clean.replace(/\n{3,}/g, '\n\n').trim(), mistakes };
}
