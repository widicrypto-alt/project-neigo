/**
 * PLANv3 X4.6 — Smart-trigger memory recall/save heuristic policy.
 *
 * Cheap, deterministic gate before the RRF recall pipeline and the post-turn
 * save cascade (summary/promise/diary). Goal: skip expensive operations for
 * obviously trivial turns while remaining safe-by-default.
 *
 * Upgrade path: swap heuristics for a small classifier LLM if miss-rate
 * on "should have recalled" > 20% in telemetry.
 */

export interface RecallDecision {
  recall: boolean;
  reason:
    | 'too_short'
    | 'greeting_only'
    | 'early_turn'
    | 'default';
}

export interface SaveDecision {
  save: boolean;
  reason:
    | 'promise_detected'
    | 'mood_spike'
    | 'too_short'
    | 'smalltalk'
    | 'default';
}

const GREETING_RE =
  /^(?:hai|halo|hi|hey|pagi|siang|sore|malam|konbanwa|ohayou|otsu|good\s*(?:morning|night))[\s\W]*$/i;

function isGreetingOnly(t: string): boolean {
  return GREETING_RE.test(t);
}

const SMALLTALK_RE = /^(?:ok(?:e|ay)?|yeah|iya|hmm+|nah|alright|baik|sip|oh)[\s\W]*$/i;
function isSmalltalkPattern(response: string): boolean {
  // Measure the first sentence only — narrative smalltalk often expands later.
  const firstSentence = response.split(/[.!?。！？]/, 1)[0]?.trim() ?? '';
  return firstSentence.length <= 20 && SMALLTALK_RE.test(firstSentence);
}

export function shouldRecall(
  userMsg: string,
  session: { turnCount: number },
): RecallDecision {
  const trimmed = userMsg.trim();
  if (trimmed.length < 20) return { recall: false, reason: 'too_short' };
  if (isGreetingOnly(trimmed)) return { recall: false, reason: 'greeting_only' };
  if (session.turnCount < 3) return { recall: true, reason: 'early_turn' };
  return { recall: true, reason: 'default' };
}

export function shouldSave(
  response: string,
  priorMood: number,
  newMood: number,
  hadPromise: boolean,
): SaveDecision {
  if (hadPromise) return { save: true, reason: 'promise_detected' };
  if (Math.abs(newMood - priorMood) > 0.4) return { save: true, reason: 'mood_spike' };
  if (response.length < 50) return { save: false, reason: 'too_short' };
  if (isSmalltalkPattern(response)) return { save: false, reason: 'smalltalk' };
  return { save: true, reason: 'default' };
}
