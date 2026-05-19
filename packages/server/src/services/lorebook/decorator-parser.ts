/**
 * PLANv3 X2.6 — Lorebook decorator parser.
 *
 * Parses inline `@@directive [value]` lines at the top of a lorebook entry's
 * content. Recognised directives are stripped from the returned `parsed`
 * string so the entry body is clean for prompt injection.
 *
 * Grammar:
 *   Line 1..K  (until first non-directive line):
 *     `^\s*@@<name>(\s+<value>)?\s*$`
 *
 * Unknown directives are preserved in-line (useful for markdown comments).
 */

export type LoreRole = 'system' | 'user' | 'assistant';
export type LorePosition = 'after_char' | 'before_char' | 'personality' | 'scenario';

export interface LoreDirectives {
  activateOnlyAfter?: number;
  activateOnlyEvery?: number;
  keepActivateAfterMatch?: boolean;
  dontActivateAfterMatch?: boolean;
  depth?: number;
  role?: LoreRole;
  scanDepth?: number;
  /** 0-100 integer. Default 100 (always-fire). */
  probability?: number;
  additionalKeys?: string[];
  excludeKeys?: string[];
  matchFullWord?: boolean;
  position?: LorePosition;
}

const INT_DIRECTIVES = [
  'activate_only_after',
  'activate_only_every',
  'depth',
  'scan_depth',
  'probability',
] as const;
const LIST_DIRECTIVES = ['additional_keys', 'exclude_keys'] as const;
const FLAG_DIRECTIVES = [
  'keep_activate_after_match',
  'dont_activate_after_match',
  'match_full_word',
] as const;
const KV_DIRECTIVES = ['role', 'position'] as const;

const ALL_KNOWN: readonly string[] = [
  ...INT_DIRECTIVES,
  ...LIST_DIRECTIVES,
  ...FLAG_DIRECTIVES,
  ...KV_DIRECTIVES,
];

const VALID_ROLES: readonly LoreRole[] = ['system', 'user', 'assistant'];
const VALID_POSITIONS: readonly LorePosition[] = [
  'after_char',
  'before_char',
  'personality',
  'scenario',
];

function parseIntClamp(raw: string | undefined, min: number, max: number): number | undefined {
  if (raw == null) return undefined;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

export function parseDirectives(content: string): { parsed: string; directives: LoreDirectives } {
  const directives: LoreDirectives = {};
  if (!content) return { parsed: '', directives };
  const rawLines = content.split('\n');
  const cleanLines: string[] = [];
  let headerDone = false;
  for (const line of rawLines) {
    if (headerDone) {
      cleanLines.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === '') {
      // Blank line is tolerated inside the directive header.
      cleanLines.push(line);
      continue;
    }
    const m = /^@@([a-z_]+)(?:\s+(.*))?$/i.exec(trimmed);
    if (!m) {
      headerDone = true;
      cleanLines.push(line);
      continue;
    }
    const key = m[1]!.toLowerCase();
    const rawVal = m[2]?.trim();
    if (!ALL_KNOWN.includes(key)) {
      // Unknown — keep in-line so author sees typo.
      cleanLines.push(line);
      continue;
    }
    switch (key) {
      case 'activate_only_after':
        directives.activateOnlyAfter = parseIntClamp(rawVal, 0, 10_000);
        break;
      case 'activate_only_every':
        directives.activateOnlyEvery = parseIntClamp(rawVal, 1, 10_000);
        break;
      case 'depth':
        directives.depth = parseIntClamp(rawVal, 0, 999);
        break;
      case 'scan_depth':
        directives.scanDepth = parseIntClamp(rawVal, 1, 40);
        break;
      case 'probability':
        directives.probability = parseIntClamp(rawVal, 0, 100);
        break;
      case 'additional_keys':
        directives.additionalKeys = rawVal
          ? rawVal.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
        break;
      case 'exclude_keys':
        directives.excludeKeys = rawVal
          ? rawVal.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
        break;
      case 'keep_activate_after_match':
        directives.keepActivateAfterMatch = true;
        break;
      case 'dont_activate_after_match':
        directives.dontActivateAfterMatch = true;
        break;
      case 'match_full_word':
        directives.matchFullWord = true;
        break;
      case 'role':
        if (rawVal && VALID_ROLES.includes(rawVal.toLowerCase() as LoreRole)) {
          directives.role = rawVal.toLowerCase() as LoreRole;
        }
        break;
      case 'position':
        if (rawVal && VALID_POSITIONS.includes(rawVal.toLowerCase() as LorePosition)) {
          directives.position = rawVal.toLowerCase() as LorePosition;
        }
        break;
    }
  }
  const parsed = cleanLines.join('\n').replace(/^\s*\n+/, '').trimEnd();
  return { parsed, directives };
}

/**
 * Filter one match against its directives. Returns true when the entry
 * should stay activated.
 *
 *  - `activate_only_after` / `activate_only_every` use `turnCount`.
 *  - `additional_keys` requires ALL extra keys to appear in haystack.
 *  - `exclude_keys` drops activation when ANY appears in haystack.
 *  - `probability` rolls Math.random().
 */
export function passesDirectiveGate(
  directives: LoreDirectives,
  ctx: { turnCount: number; haystack: string; random?: () => number },
): boolean {
  const r = ctx.random ?? Math.random;
  if (directives.activateOnlyAfter != null && ctx.turnCount < directives.activateOnlyAfter) {
    return false;
  }
  if (
    directives.activateOnlyEvery != null &&
    directives.activateOnlyEvery > 0 &&
    ctx.turnCount % directives.activateOnlyEvery !== 0
  ) {
    return false;
  }
  if (directives.additionalKeys && directives.additionalKeys.length > 0) {
    const hay = ctx.haystack.toLowerCase();
    for (const k of directives.additionalKeys) {
      if (!hay.includes(k.toLowerCase())) return false;
    }
  }
  if (directives.excludeKeys && directives.excludeKeys.length > 0) {
    const hay = ctx.haystack.toLowerCase();
    for (const k of directives.excludeKeys) {
      if (hay.includes(k.toLowerCase())) return false;
    }
  }
  if (directives.probability != null && directives.probability < 100) {
    if (r() * 100 >= directives.probability) return false;
  }
  return true;
}
