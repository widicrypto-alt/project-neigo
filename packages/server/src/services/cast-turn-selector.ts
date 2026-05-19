/**
 * Weighted turn selector for HAREM mode.
 * Score = affection*2 + jealousy*1.5 + loyalty - cooldownPenalty
 * Port of HaremTurnSelector.kt
 */
import type { Character, HaremStats } from '@neigo/shared';

export type ParticipationType =
  | 'MAIN_SPEAKER'
  | 'REACTOR'
  | 'SILENT'
  | 'ABSENT';

export interface TurnAssignment {
  character: Character;
  participation: ParticipationType;
}

export interface TurnPlan {
  assignments: TurnAssignment[];
  whisperPair: [Character, Character] | null;
}

const COOLDOWN_PENALTIES = [40, 25, 10];
const MAX_REACTORS = 2;
const MAX_SILENTS = 2;
const WHISPER_DRAMA_FLOOR = 3;

function charScore(c: Character, s: HaremStats | undefined, cooldownIdx: number): number {
  const affection = s?.affection ?? 0;
  const jealousy = s?.jealousy ?? 0;
  const loyalty = s?.loyalty ?? 0;
  const penalty =
    cooldownIdx >= 0 && cooldownIdx < COOLDOWN_PENALTIES.length
      ? (COOLDOWN_PENALTIES[cooldownIdx] ?? 0)
      : 0;
  return affection * 2 + jealousy * 1.5 + loyalty - penalty;
}

export function planHaremTurn(input: {
  cast: Character[];
  presentIds: ReadonlyArray<string>;
  stats: ReadonlyMap<string, HaremStats>;
  recentSpeakerIds: ReadonlyArray<string>; // most-recent first
  dramaIntensity: number;
}): TurnPlan {
  const { cast, presentIds, stats, recentSpeakerIds, dramaIntensity } = input;
  const present = cast.filter((c) => presentIds.includes(c.id));
  if (present.length === 0) return { assignments: [], whisperPair: null };

  const scored = present
    .map((c) => {
      const idx = recentSpeakerIds.indexOf(c.id);
      return { c, score: charScore(c, stats.get(c.id), idx) };
    })
    .sort((a, b) => b.score - a.score);

  const assignments: TurnAssignment[] = [];
  for (let i = 0; i < scored.length; i++) {
    const entry = scored[i];
    if (!entry) continue;
    let participation: ParticipationType;
    if (i === 0) participation = 'MAIN_SPEAKER';
    else if (i <= MAX_REACTORS) participation = 'REACTOR';
    else if (i <= MAX_REACTORS + MAX_SILENTS) participation = 'SILENT';
    else participation = 'ABSENT';
    assignments.push({ character: entry.c, participation });
  }

  let whisperPair: [Character, Character] | null = null;
  if (dramaIntensity >= WHISPER_DRAMA_FLOOR && present.length >= 2) {
    const byJealousy = [...present].sort(
      (a, b) => (stats.get(b.id)?.jealousy ?? 0) - (stats.get(a.id)?.jealousy ?? 0),
    );
    const [a, b] = byJealousy;
    if (a && b) whisperPair = [a, b];
  }

  return { assignments, whisperPair };
}

export function mainSpeaker(plan: TurnPlan): Character | null {
  return plan.assignments.find((a) => a.participation === 'MAIN_SPEAKER')?.character ?? null;
}
export function reactors(plan: TurnPlan): Character[] {
  return plan.assignments.filter((a) => a.participation === 'REACTOR').map((a) => a.character);
}
export function silents(plan: TurnPlan): Character[] {
  return plan.assignments.filter((a) => a.participation === 'SILENT').map((a) => a.character);
}
