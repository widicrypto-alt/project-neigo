/**
 * Wk5/Wk7 PLANv2 F2 — Narrative Director (heuristic-only).
 *
 * Detects when a ROLEPLAY scene is stalling and emits a short one-line
 * directive the orchestrator injects as a system message for the next
 * turn. No LLM call — pure statistical signals over recent history so it
 * costs nothing and runs on every turn.
 *
 * Stall signals (any one of these triggers):
 *   (A) LEXICAL LOOP — recent character turns share trigram Jaccard ≥ 0.35
 *       with each other (topic hasn't moved).
 *   (B) NO NEW ACTION — last N character turns contain no *action prose*
 *       (no `*...*` italics or strong verb phrases), only dialogue.
 *   (C) QUESTION PING-PONG — last 3 turns are all questions, no commit.
 *   (D) LOW AFFECT — trust hasn't moved in ≥ 8 turns AND last 4 character
 *       turns have no stats-detected emotional delta signal (we trust the
 *       caller to pass recent statsDeltas if available).
 *
 * The hint is ONE line, ≤ 80 chars, never prescriptive of dialogue. Verbs
 * like "change the location", "introduce a new prop", "resolve the
 * pending question" — scaffolding the model can interpret.
 */

export interface RecentTurn {
  role: 'USER' | 'CHARACTER';
  text: string;
}

export interface NarrativeDirectorInput {
  /** Recent transcript, oldest → newest. Only last ~12 are considered. */
  recent: RecentTurn[];
  /** Current turn count (0-based). Hints are suppressed for turn < 5. */
  turnCount: number;
  /** Trust history over the last N turns; used only for low-affect detection. */
  trustHistory?: number[];
  /**
   * Sum of absolute trust/affection/tension deltas over last 4 turns.
   * If omitted, the low-affect check degrades to trust-only.
   */
  recentAffectDelta?: number;
}

export interface NarrativeHint {
  /** One-line hint body (no `NARRATIVE HINT:` prefix). */
  body: string;
  /** Which signal triggered the hint — used for F4 prompt inspector. */
  reason: 'lexical_loop' | 'no_new_action' | 'question_pingpong' | 'low_affect';
}

const HINT_MIN_TURN = 5;
const LOOP_WINDOW = 4;
const LOOP_THRESHOLD = 0.35;
const ACTION_WINDOW = 3;
const QUESTION_WINDOW = 3;
const LOW_AFFECT_WINDOW = 8;
const LOW_AFFECT_DELTA_THRESHOLD = 2;

function tokenize(text: string): string[] {
  return text
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function trigrams(text: string): Set<string> {
  const tokens = tokenize(text);
  const out = new Set<string>();
  for (let i = 0; i <= tokens.length - 3; i++) {
    out.add(tokens.slice(i, i + 3).join(' '));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function hasAction(text: string): boolean {
  // Italic stage directions.
  if (/\*[^*]{4,}\*/.test(text)) return true;
  // Strong physical-action verbs outside quotes.
  const stripped = text.replace(/"[^"]*"/g, ' ');
  return /\b(stood|stands|walked|walks|moved|moves|sat|sits|reached|reaches|turned|turns|grabbed|grabs|leaned|leans|pulled|pulls|pushed|pushes|glanced|glances|shifted|shifts|stepped|steps|crossed|crosses|dropped|drops|lifted|lifts|opened|opens|closed|closes|pressed|presses|touched|touches|gripped|grips)\b/i.test(
    stripped,
  );
}

function looksLikeQuestion(text: string): boolean {
  // Any sentence ending in ?, weighted so dialogue counts.
  const dialogue = text.match(/"[^"]+"/g)?.join(' ') ?? '';
  const probe = dialogue || text;
  return /\?\s*(?:$|["\n])/m.test(probe) || /\?/.test(probe.slice(-60));
}

export function planNarrativeHint(input: NarrativeDirectorInput): NarrativeHint | null {
  if (input.turnCount < HINT_MIN_TURN) return null;
  const recent = input.recent.slice(-12);
  const charTurns = recent.filter((t) => t.role === 'CHARACTER');

  // (A) Lexical loop — compare each pair in the last LOOP_WINDOW.
  if (charTurns.length >= LOOP_WINDOW) {
    const window = charTurns.slice(-LOOP_WINDOW).map((t) => trigrams(t.text));
    let maxSim = 0;
    for (let i = 0; i < window.length; i++) {
      for (let j = i + 1; j < window.length; j++) {
        const s = jaccard(window[i]!, window[j]!);
        if (s > maxSim) maxSim = s;
      }
    }
    if (maxSim >= LOOP_THRESHOLD) {
      return {
        reason: 'lexical_loop',
        body: 'Shift the topic or setting — current exchange is circling the same ground.',
      };
    }
  }

  // (B) No new action — last ACTION_WINDOW character turns are pure dialogue.
  if (charTurns.length >= ACTION_WINDOW) {
    const tail = charTurns.slice(-ACTION_WINDOW);
    const actionCount = tail.filter((t) => hasAction(t.text)).length;
    if (actionCount === 0) {
      return {
        reason: 'no_new_action',
        body: 'Ground the next reply in a physical action or change in the environment.',
      };
    }
  }

  // (C) Question ping-pong — last QUESTION_WINDOW turns of either role are all questions.
  if (recent.length >= QUESTION_WINDOW) {
    const tail = recent.slice(-QUESTION_WINDOW);
    if (tail.every((t) => looksLikeQuestion(t.text))) {
      return {
        reason: 'question_pingpong',
        body: 'Stop asking questions — commit to a small, concrete choice or observation.',
      };
    }
  }

  // (D) Low affect — trust flat for a while AND recent delta small.
  if (input.trustHistory && input.trustHistory.length >= LOW_AFFECT_WINDOW) {
    const tail = input.trustHistory.slice(-LOW_AFFECT_WINDOW);
    const min = Math.min(...tail);
    const max = Math.max(...tail);
    const flat = max - min <= 1;
    const lowDelta =
      input.recentAffectDelta === undefined ||
      input.recentAffectDelta <= LOW_AFFECT_DELTA_THRESHOLD;
    if (flat && lowDelta) {
      return {
        reason: 'low_affect',
        body: 'Raise emotional stakes — surface an unspoken feeling or a small vulnerability.',
      };
    }
  }

  return null;
}

/**
 * Format the hint as a single system-prompt block. Callers push this onto
 * the `extraSystem` array. The `reason` tag is included so F4 prompt
 * snapshots are easy to grep.
 */
export function formatNarrativeHintBlock(hint: NarrativeHint): string {
  return `NARRATIVE HINT [${hint.reason}]: ${hint.body}`;
}
