/**
 * wk5 F2 — Mood System taxonomy.
 *
 * Server emits free-form mood strings (e.g. "NEUTRAL", "curious", "vulnerable",
 * "conflicted"). The UI needs a finite set for consistent colouring and icons.
 * `normaliseMood()` coerces any inbound string to one of `MoodKey`.
 *
 * Keep this file framework-agnostic — it's consumed by both web and server
 * (e.g. for ops/context debug rendering).
 */

export const MOOD_KEYS = [
  'neutral',
  'warm',
  'curious',
  'playful',
  'tender',
  'vulnerable',
  'conflicted',
  'cold',
  'anxious',
  'focused',
] as const;

export type MoodKey = (typeof MOOD_KEYS)[number];

export interface MoodMeta {
  key: MoodKey;
  label: string;
  emoji: string;
  /** Tailwind ring/bg accent for MoodBadge. */
  tone: 'neutral' | 'accent' | 'iris' | 'warmth' | 'emerald' | 'sky' | 'violet' | 'rose';
}

export const MOOD_META: Record<MoodKey, MoodMeta> = {
  neutral:     { key: 'neutral',     label: 'Neutral',     emoji: '◯', tone: 'neutral' },
  warm:        { key: 'warm',        label: 'Warm',        emoji: '☀', tone: 'warmth' },
  curious:     { key: 'curious',     label: 'Curious',     emoji: '?', tone: 'violet' },
  playful:     { key: 'playful',     label: 'Playful',     emoji: '✦', tone: 'accent' },
  tender:      { key: 'tender',      label: 'Tender',      emoji: '♡', tone: 'accent' },
  vulnerable:  { key: 'vulnerable',  label: 'Vulnerable',  emoji: '◔', tone: 'rose' },
  conflicted:  { key: 'conflicted',  label: 'Conflicted',  emoji: '⚡', tone: 'warmth' },
  cold:        { key: 'cold',        label: 'Cold',        emoji: '❄', tone: 'sky' },
  anxious:     { key: 'anxious',     label: 'Anxious',     emoji: '◌', tone: 'iris' },
  focused:     { key: 'focused',     label: 'Focused',     emoji: '◆', tone: 'emerald' },
};

/**
 * Coerce any free-form mood string into a canonical {@link MoodKey}.
 * Falls back to 'neutral'. Matching is substring-based (case-insensitive),
 * ordered so that more specific keys (e.g. 'vulnerable') win before generic
 * ones ('warm' overlaps with 'lukewarm').
 */
export function normaliseMood(raw: string | null | undefined): MoodKey {
  if (!raw) return 'neutral';
  const s = raw.trim().toLowerCase();
  if (!s || s === 'neutral') return 'neutral';

  // Ordered specific → generic. Each entry: [key, substring patterns].
  const rules: Array<[MoodKey, string[]]> = [
    ['vulnerable', ['vulnerab', 'fragile', 'exposed']],
    ['tender',     ['tender', 'affection', 'gentle']],
    ['playful',    ['playful', 'teasing', 'mischiev']],
    ['curious',    ['curious', 'intrigu', 'inquisit']],
    ['conflicted', ['conflict', 'torn', 'upset', 'angry', 'frustrat']],
    ['cold',       ['cold', 'distant', 'aloof', 'guarded', 'chill']],
    ['anxious',    ['anxious', 'nervous', 'worried', 'unsettl']],
    ['focused',    ['focused', 'determin', 'sharp']],
    ['warm',       ['warm', 'open', 'soft', 'happy', 'content']],
  ];

  for (const [key, patterns] of rules) {
    if (patterns.some((p) => s.includes(p))) return key;
  }
  return 'neutral';
}

export function moodMeta(raw: string | null | undefined): MoodMeta {
  return MOOD_META[normaliseMood(raw)];
}
