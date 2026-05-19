/**
 * Scene state parser — extracts `[STATE:…]` tags from model output.
 *
 * The model is prompted to emit scene state changes like:
 *   [STATE: location=café rooftop|weather=rain|holding=umbrella|companion=cat]
 *
 * These are stripped from the visible text and returned as a Record<string, string>
 * to be merged into session.metadata.sceneState.
 */

export interface SceneStateUpdate {
  /** Parsed key-value pairs from the [STATE:] tag. */
  entries: Record<string, string>;
}

const STATE_TAG_RE = /\[STATE:\s*([^\]]+)\]/gi;

/**
 * MARINARA H6 — Custom trackers. Same pipe-separated k=v shape as
 * [STATE:…] but a separate tag so scene facts and gameplay counters
 * stay in distinct buckets of session.metadata. Example:
 *
 *   [TRACK: hp=80|mana=40|affection=+2]
 *
 * Numeric deltas (`+2`, `-5`) are supported by mergeTrackers() when the
 * existing value parses as a number; otherwise the new value replaces.
 */
const TRACK_TAG_RE = /\[TRACK:\s*([^\]]+)\]/gi;

/**
 * Wk1 P0 cache-bust audit (PLANv2 §6 item 5).
 *
 * Some upstream inference routes (and, for our single-model case, older
 * replay fixtures) leak reasoning-model scratch tags into the visible
 * stream. We strip them defensively BEFORE scanning for `[STATE:]` so:
 *
 *   (a) the scene-state regex never matches text inside a thought block,
 *   (b) validators/format-drift see the same clean surface the user sees,
 *   (c) the parser remains idempotent if called twice.
 *
 * This only runs on model output inside the orchestrator — user-typed
 * `<think>` in their own message is never routed through here.
 *
 * Patterns handled:
 *   <think> ... </think>
 *   <thought> ... </thought>
 *   <reasoning> ... </reasoning>
 *   <|think|> ... <|/think|>          (DeepSeek / Gemma style sentinels)
 *   <|channel|>analysis<|message|>... ... <|end|>
 */
const THINKING_TAG_RE =
  /<(think|thought|reasoning)>[\s\S]*?<\/\1>|<\|think\|>[\s\S]*?<\|\/think\|>|<\|channel\|>\s*analysis[\s\S]*?<\|end\|>/gi;

export function stripThinkingTags(raw: string): string {
  if (!raw) return raw;
  if (!/<\/?(?:think|thought|reasoning)|<\|(?:think|\/think|channel)\|>/i.test(raw)) {
    return raw; // fast path — most model outputs don't contain any tag
  }
  return raw.replace(THINKING_TAG_RE, '');
}

/**
 * Max keys we'll store to prevent unbounded growth.
 */
const MAX_KEYS = 30;

/**
 * Parse and strip [STATE:] tags from raw model output.
 * Returns cleaned text + extracted state entries.
 */
export function parseAndStripSceneState(raw: string): {
  clean: string;
  stateUpdate: SceneStateUpdate | null;
} {
  // Defensive: remove reasoning-model scratch tags before any other pass.
  const sanitised = stripThinkingTags(raw);
  const entries: Record<string, string> = {};
  let found = false;

  let clean = sanitised.replace(STATE_TAG_RE, (_m, body: string) => {
    found = true;
    for (const pair of body.split('|').map((s) => s.trim())) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx < 1) continue;
      const key = pair.slice(0, eqIdx).trim().toLowerCase().replace(/\s+/g, '_');
      const val = pair.slice(eqIdx + 1).trim();
      if (key && val) {
        entries[key] = val;
      }
    }
    return '';
  });

  clean = clean.replace(/\n{3,}/g, '\n\n').trim();

  if (!found || Object.keys(entries).length === 0) {
    return { clean, stateUpdate: null };
  }

  // Cap keys to prevent runaway
  const capped: Record<string, string> = {};
  let count = 0;
  for (const [k, v] of Object.entries(entries)) {
    if (count >= MAX_KEYS) break;
    capped[k] = v;
    count++;
  }

  return { clean, stateUpdate: { entries: capped } };
}

/**
 * Merge new scene state entries into existing state, preserving old keys
 * unless explicitly overwritten. A value of "none" or "null" removes the key.
 */
export function mergeSceneState(
  existing: Record<string, string> | undefined,
  update: Record<string, string>,
): Record<string, string> {
  const merged = { ...(existing ?? {}) };
  for (const [k, v] of Object.entries(update)) {
    if (v === 'none' || v === 'null' || v === '') {
      delete merged[k];
    } else {
      merged[k] = v;
    }
  }
  // Cap total keys
  const keys = Object.keys(merged);
  if (keys.length > MAX_KEYS) {
    for (const k of keys.slice(0, keys.length - MAX_KEYS)) {
      delete merged[k];
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// MARINARA H6 — Custom trackers
// ---------------------------------------------------------------------------

export interface TrackerUpdate {
  entries: Record<string, string>;
}

/**
 * Parse and strip [TRACK:] tags from raw model output.
 * Must run AFTER parseAndStripSceneState on the same input so the
 * [STATE:] / [TRACK:] tags don't contaminate each other's capture.
 */
export function parseAndStripTrackers(raw: string): {
  clean: string;
  trackerUpdate: TrackerUpdate | null;
} {
  const entries: Record<string, string> = {};
  let found = false;

  let clean = raw.replace(TRACK_TAG_RE, (_m, body: string) => {
    found = true;
    for (const pair of body.split('|').map((s) => s.trim())) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx < 1) continue;
      const key = pair.slice(0, eqIdx).trim().toLowerCase().replace(/\s+/g, '_');
      const val = pair.slice(eqIdx + 1).trim();
      if (key && val) {
        entries[key] = val;
      }
    }
    return '';
  });

  clean = clean.replace(/\n{3,}/g, '\n\n').trim();

  if (!found || Object.keys(entries).length === 0) {
    return { clean, trackerUpdate: null };
  }

  const capped: Record<string, string> = {};
  let count = 0;
  for (const [k, v] of Object.entries(entries)) {
    if (count >= MAX_KEYS) break;
    capped[k] = v;
    count++;
  }
  return { clean, trackerUpdate: { entries: capped } };
}

/**
 * Merge tracker updates with numeric-delta support. If the new value
 * matches /^[+-]\d+(\.\d+)?$/ and the existing value parses as a
 * finite number, the delta is applied. Otherwise the new value
 * overwrites. Values "none"/"null"/"" remove the key.
 */
export function mergeTrackers(
  existing: Record<string, string> | undefined,
  update: Record<string, string>,
): Record<string, string> {
  const merged = { ...(existing ?? {}) };
  const deltaRe = /^[+-]\d+(?:\.\d+)?$/;
  for (const [k, v] of Object.entries(update)) {
    if (v === 'none' || v === 'null' || v === '') {
      delete merged[k];
      continue;
    }
    if (deltaRe.test(v)) {
      const base = Number(merged[k]);
      if (Number.isFinite(base)) {
        const next = base + Number(v);
        merged[k] = String(Number.isInteger(next) ? next : +next.toFixed(4));
        continue;
      }
    }
    merged[k] = v;
  }
  const keys = Object.keys(merged);
  if (keys.length > MAX_KEYS) {
    for (const k of keys.slice(0, keys.length - MAX_KEYS)) {
      delete merged[k];
    }
  }
  return merged;
}
