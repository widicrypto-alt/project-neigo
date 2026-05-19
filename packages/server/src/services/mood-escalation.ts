/**
 * Mood / drama / milestone detection for HAREM mode.
 * Port of MoodEscalationManager.kt (essentials).
 */
import type { HaremStats } from '@neigo/shared';

export interface MoodResult {
  newMood: string | null;
  newTurnCount: number;
  newSceneTime: string | null;
  timeProgressionMessage: string | null;
}

export interface DramaEscalationResult {
  newDramaIntensity: number;
  reason: string | null;
}

export interface DetectedMood {
  moodKeyword: string | null;
  confidence: number;
}

export interface MilestoneResult {
  event: string | null;
  hiddenThoughtInjection: string | null;
  milestoneChoices: string[];
  shouldGenerateDiary: boolean;
  diaryToastMessage: string | null;
}

const JEALOUSY_HIGH = ['tense', 'brooding', 'possessive'];
const JEALOUSY_MID = ['uneasy', 'watchful'];
const AFFECTION_HIGH = ['tender', 'warm', 'affectionate'];
const AFFECTION_MID = ['friendly', 'content'];
const COLD_MOODS = ['distant', 'quiet', 'guarded'];

const AFFECTION_MILESTONES = [250, 500, 750, 1000];
const LOYALTY_MILESTONE = 800;
const JEALOUSY_CRISIS = 90;

export function evaluateMoodEscalation(input: {
  turnCount: number;
  autoMoodEnabled: boolean;
  currentSceneTime: string | null;
  haremStats: ReadonlyArray<HaremStats>;
  moodNoise?: number;
}): MoodResult {
  const { turnCount, autoMoodEnabled, currentSceneTime, haremStats, moodNoise = 0 } = input;
  const empty: MoodResult = {
    newMood: null,
    newTurnCount: turnCount,
    newSceneTime: currentSceneTime,
    timeProgressionMessage: null,
  };
  if (!autoMoodEnabled || turnCount === 0 || turnCount % 5 !== 0) return empty;
  const engaged = haremStats.filter((s) => s.affection >= 200);
  if (engaged.length === 0) return { ...empty, newMood: COLD_MOODS[0] ?? 'quiet' };
  const avgJealousy = avg(engaged.map((s) => s.jealousy));
  const avgAffection = avg(engaged.map((s) => s.affection));
  // moodNoise shifts thresholds down, making the character feel "warmer" or "edgier" sooner.
  const shift = moodNoise * 100; // 0..15 points
  let mood: string;
  if (avgJealousy > 70 - shift) mood = pick(JEALOUSY_HIGH, turnCount);
  else if (avgJealousy > 50 - shift) mood = pick(JEALOUSY_MID, turnCount);
  else if (avgAffection > 800 - shift * 10) mood = pick(AFFECTION_HIGH, turnCount);
  else if (avgAffection > 600 - shift * 10) mood = pick(AFFECTION_MID, turnCount);
  else mood = pick(COLD_MOODS, turnCount);
  return { ...empty, newMood: mood };
}

export function evaluateDramaAutoEscalation(
  currentDrama: number,
  haremStats: ReadonlyArray<HaremStats>,
  turnCount: number,
): DramaEscalationResult {
  if (turnCount === 0 || turnCount % 8 !== 0)
    return { newDramaIntensity: currentDrama, reason: null };
  if (haremStats.length === 0) return { newDramaIntensity: currentDrama, reason: null };
  const maxJealousy = Math.max(...haremStats.map((s) => s.jealousy));
  const avgJealousy = avg(haremStats.map((s) => s.jealousy));
  if (maxJealousy >= 80 && avgJealousy > 50)
    return { newDramaIntensity: 4, reason: 'jealousy spike across cast' };
  if (maxJealousy < 30 && currentDrama > 1)
    return { newDramaIntensity: Math.max(1, currentDrama - 1), reason: 'cooling period' };
  return { newDramaIntensity: currentDrama, reason: null };
}

const ROMANTIC_KW = ['kiss', 'blush', 'hold', 'tender', 'smile', 'whisper'];
const TENSE_KW = ['glare', 'snap', 'clench', 'sharp', 'silent'];
const COMEDY_KW = ['laugh', 'giggle', 'joke', 'tease', 'wink'];
const DARK_KW = ['shadow', 'cold', 'bitter', 'grim', 'fear'];

export function detectSceneMood(text: string): DetectedMood {
  const t = text.toLowerCase();
  const words = t.split(/\s+/).length;
  const scores = {
    romantic: countMatches(t, ROMANTIC_KW),
    tense: countMatches(t, TENSE_KW),
    comedy: countMatches(t, COMEDY_KW),
    dark: countMatches(t, DARK_KW),
  };
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!top || words === 0) return { moodKeyword: null, confidence: 0 };
  const conf = top[1] / Math.max(1, Math.sqrt(words));
  if (conf < 0.2) return { moodKeyword: null, confidence: 0 };
  return { moodKeyword: top[0], confidence: conf };
}

export function checkStatMilestone(
  charId: string,
  charName: string,
  oldStats: HaremStats,
  newStats: HaremStats,
): MilestoneResult {
  const empty: MilestoneResult = {
    event: null,
    hiddenThoughtInjection: null,
    milestoneChoices: [],
    shouldGenerateDiary: false,
    diaryToastMessage: null,
  };
  for (const threshold of AFFECTION_MILESTONES) {
    if (oldStats.affection < threshold && newStats.affection >= threshold) {
      return {
        event: `affection_${threshold}`,
        hiddenThoughtInjection:
          threshold >= 1000
            ? `${charName}'s heart finally speaks: she realizes she loves you.`
            : threshold >= 750
              ? `${charName}'s heart skips; she catches herself smiling.`
              : threshold >= 500
                ? `${charName} feels enchanted by your presence.`
                : `${charName} notices she looks forward to seeing you.`,
        milestoneChoices: [],
        shouldGenerateDiary: threshold >= 500,
        diaryToastMessage: threshold >= 500 ? `${charName} wrote in her diary.` : null,
      };
    }
  }
  if (oldStats.loyalty < LOYALTY_MILESTONE && newStats.loyalty >= LOYALTY_MILESTONE) {
    return {
      ...empty,
      event: `loyalty_${LOYALTY_MILESTONE}`,
      hiddenThoughtInjection: `${charName} silently vows her loyalty.`,
    };
  }
  if (oldStats.jealousy < JEALOUSY_CRISIS && newStats.jealousy >= JEALOUSY_CRISIS) {
    return {
      ...empty,
      event: `jealousy_${JEALOUSY_CRISIS}`,
      hiddenThoughtInjection: `${charName} is on the brink — jealousy consumes her.`,
    };
  }
  return empty;
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function pick<T>(list: T[], seed: number): T {
  const idx = Math.abs(seed) % list.length;
  return list[idx] as T;
}
function countMatches(text: string, words: string[]): number {
  let n = 0;
  for (const w of words) {
    const re = new RegExp(`\\b${w}\\b`, 'g');
    const m = text.match(re);
    if (m) n += m.length;
  }
  return n;
}

// ── Tension Release for 1:1 ROLEPLAY ──────────────────────────────

const ESCALATING_MOODS = new Set([
  'tense', 'brooding', 'possessive', 'sharp', 'bitter', 'angry',
  'heated', 'intense', 'desperate', 'fearful',
]);

const BREAK_TYPES = [
  'sudden laughter — involuntary, nervous, breaking the tension',
  'tears — not from sadness, but from the weight of holding everything in',
  'anger flash — a sharp word that surprises even the character',
  'physical break — turns away, presses forehead to wall, exhales',
  'soft collapse — voice drops, all pretense falls away for one sentence',
] as const;

export interface TensionReleaseResult {
  shouldRelease: boolean;
  breakType: string | null;
  promptInjection: string | null;
}

/**
 * In 1:1 ROLEPLAY: after 3+ consecutive escalating turns, there's a 30%
 * chance the character "breaks" — a moment of involuntary emotional release.
 * This prevents monotone escalation spirals.
 *
 * @param consecutiveEscalatingTurns — count of turns where mood was escalating.
 * @param currentMood — the mood label for this turn.
 * @param characterName — for the injection text.
 */
export function checkTensionRelease(opts: {
  consecutiveEscalatingTurns: number;
  currentMood: string | null;
  characterName: string;
}): TensionReleaseResult {
  const { consecutiveEscalatingTurns, currentMood, characterName } = opts;
  const isEscalating = ESCALATING_MOODS.has((currentMood ?? '').toLowerCase());

  if (!isEscalating || consecutiveEscalatingTurns < 3) {
    return { shouldRelease: false, breakType: null, promptInjection: null };
  }

  // 30% chance of break, increasing slightly per extra turn.
  const chance = 0.3 + (consecutiveEscalatingTurns - 3) * 0.05;
  if (Math.random() > chance) {
    return { shouldRelease: false, breakType: null, promptInjection: null };
  }

  const breakType = BREAK_TYPES[Math.floor(Math.random() * BREAK_TYPES.length)];
  return {
    shouldRelease: true,
    breakType: breakType ?? BREAK_TYPES[0],
    promptInjection: [
      `▓▓▓ TENSION RELEASE — ${characterName} ▓▓▓`,
      `The escalation has reached a breaking point after ${consecutiveEscalatingTurns} turns.`,
      `${characterName} MUST exhibit an involuntary emotional break this turn:`,
      `→ ${breakType}`,
      'This is NOT a decision — it happens to the character. It is a body response, not a thought.',
      'After the break, the emotional register shifts: the tension resets, the character is raw and open.',
      'Do NOT continue escalating. The break IS the scene beat.',
    ].join('\n'),
  };
}

/**
 * Count consecutive escalating turns from session metadata.
 * Returns updated count (increment if escalating, reset to 0 if not).
 */
export function updateEscalationCounter(
  currentCount: number,
  currentMood: string | null,
): number {
  const isEscalating = ESCALATING_MOODS.has((currentMood ?? '').toLowerCase());
  return isEscalating ? currentCount + 1 : 0;
}
