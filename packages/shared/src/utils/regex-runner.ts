/**
 * PLANv3 X2.5 — Regex runner (safe native-RegExp w/ bounds).
 *
 * Applies a list of regex scripts to a text blob in deterministic order.
 * Safety model (intentionally simpler than re2-wasm for Day 7):
 *
 *   1. HARD input length cap (default 200 KB) — protects against DoS via
 *      catastrophic backtracking on long haystacks.
 *   2. HARD per-script wall-clock budget (default 10 ms) checked after each
 *      replace call. A slow pattern is marked errored and skipped but the
 *      pipeline continues with the previous text.
 *   3. HARD find_regex source length cap (default 256 chars).
 *   4. Flags whitelist — only `g`, `i`, `m`, `s`, `u`, `y` allowed.
 *   5. `new RegExp(...)` wrapped in try/catch — malformed patterns emit an
 *      error entry and are skipped.
 *
 * If abuse patterns emerge we can swap the native RegExp for a linear-time
 * engine (re2-wasm) without changing this surface.
 */

export interface RegexScript {
  id: string;
  findRegex: string;
  replaceString: string;
  trimStrings: string[];
  flags: string;
  /** Inclusive. Script applies when ctx.turnIndex >= minDepth. */
  minDepth?: number | null;
  /** Inclusive. Script applies when ctx.turnIndex <= maxDepth. */
  maxDepth?: number | null;
  /** When true, script is skipped at storage-write stage (edit_input) and
   *  only applied at assembly time (edit_process). */
  promptOnly?: boolean;
}

export interface RegexRunOptions {
  turnIndex: number;
  /** Override input length cap (default 200 KB). */
  maxInputBytes?: number;
  /** Override per-script wall-clock budget in ms (default 10). */
  budgetMs?: number;
  /** Override find_regex source length cap (default 256 chars). */
  maxPatternLength?: number;
  /** When true, skip scripts with promptOnly=true (used by edit_input). */
  excludePromptOnly?: boolean;
}

export interface RegexRunResult {
  text: string;
  applied: string[];
  errors: Array<{ id: string; reason: string }>;
}

const FLAG_ALLOWED = new Set(['g', 'i', 'm', 's', 'u', 'y']);

function sanitiseFlags(raw: string): { flags: string; addedGlobal: boolean } {
  const seen = new Set<string>();
  const keep: string[] = [];
  for (const ch of raw) {
    if (!FLAG_ALLOWED.has(ch)) continue;
    if (seen.has(ch)) continue;
    seen.add(ch);
    keep.push(ch);
  }
  // Regex-replace without /g only replaces first match, which is almost
  // never what users want for transformation scripts. We force /g here but
  // flag it so callers/UI can warn on first save.
  const addedGlobal = !seen.has('g');
  if (addedGlobal) keep.push('g');
  return { flags: keep.join(''), addedGlobal };
}

export function runRegexScripts(
  text: string,
  scripts: readonly RegexScript[],
  opts: RegexRunOptions,
): RegexRunResult {
  const maxBytes = opts.maxInputBytes ?? 200_000;
  const budgetMs = opts.budgetMs ?? 10;
  const maxPattern = opts.maxPatternLength ?? 256;

  const applied: string[] = [];
  const errors: RegexRunResult['errors'] = [];
  let current = text ?? '';
  if (current.length > maxBytes) {
    // Truncate rather than reject outright; callers feeding user-supplied
    // payloads can check `errors` for the truncation signal.
    current = current.slice(0, maxBytes);
    errors.push({ id: '*', reason: 'input_truncated' });
  }
  if (!scripts.length) return { text: current, applied, errors };

  for (const s of scripts) {
    if (opts.excludePromptOnly && s.promptOnly) continue;
    if (s.minDepth != null && opts.turnIndex < s.minDepth) continue;
    if (s.maxDepth != null && opts.turnIndex > s.maxDepth) continue;
    if (!s.findRegex) {
      errors.push({ id: s.id, reason: 'empty_pattern' });
      continue;
    }
    if (s.findRegex.length > maxPattern) {
      errors.push({ id: s.id, reason: 'pattern_too_long' });
      continue;
    }

    let re: RegExp;
    try {
      const { flags, addedGlobal } = sanitiseFlags(s.flags);
      re = new RegExp(s.findRegex, flags);
      if (addedGlobal) {
        // Non-fatal advisory so callers can surface this in the editor.
        errors.push({ id: s.id, reason: 'flag_global_added' });
      }
    } catch (err) {
      errors.push({
        id: s.id,
        reason: `invalid_pattern:${(err as Error).message.slice(0, 40)}`,
      });
      continue;
    }

    const started = Date.now();
    let replaced: string;
    try {
      replaced = current.replace(re, s.replaceString);
    } catch (err) {
      errors.push({
        id: s.id,
        reason: `replace_error:${(err as Error).message.slice(0, 40)}`,
      });
      continue;
    }
    if (Date.now() - started > budgetMs) {
      errors.push({ id: s.id, reason: 'timeout' });
      continue;
    }

    let trimmed = replaced;
    for (const t of s.trimStrings ?? []) {
      if (!t) continue;
      trimmed = trimmed.split(t).join('');
    }
    current = trimmed;
    applied.push(s.id);
  }

  return { text: current, applied, errors };
}
