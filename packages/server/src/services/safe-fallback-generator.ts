/**
 * Safe fallback generator. Port of SafeFallbackGenerator.kt
 */
import type { Character, PassType, TonePreset } from '@neigo/shared';

export type NarratorVoicePreset = 'CINEMATIC' | 'INTIMATE' | 'OBSERVATIONAL' | 'ACTION' | 'POETIC';

export function narratorFallback(preset: NarratorVoicePreset, location?: string | null): string {
  const loc = location?.trim() || 'the place';
  switch (preset) {
    case 'CINEMATIC':
      return `Cut to ${loc}. Nothing moves for a moment.`;
    case 'INTIMATE':
      return `A soft quiet settles over ${loc}.`;
    case 'OBSERVATIONAL':
      return `In ${loc}, time seems to pause.`;
    case 'ACTION':
      return `The moment holds. A breath is drawn in ${loc}.`;
    case 'POETIC':
      return `Silence, like breath held, fills ${loc}.`;
  }
}

const CHARACTER_MAIN: Record<TonePreset, string> = {
  NONE: '…',
  TSUNDERE: 'I wasn\'t going to comment.',
  STOIC: '*nods slowly*',
  ENERGETIC: 'Wait, wait — let me think.',
  MELANCHOLIC: '*eyes distant*',
  PLAYFUL: '*smirks but says nothing*',
  FORMAL: 'I shall reflect before replying.',
  NURTURING: 'Are you alright?',
  MYSTERIOUS: '*an enigmatic pause*',
  VILLAIN: 'How amusing.',
};

const CHARACTER_REACT: Record<TonePreset, string> = {
  NONE: '*glances over*',
  TSUNDERE: '*huffs*',
  STOIC: '*expression unreadable*',
  ENERGETIC: '*gasp*',
  MELANCHOLIC: '*sighs softly*',
  PLAYFUL: '*grins*',
  FORMAL: '*adjusts posture*',
  NURTURING: '*reaches out, almost*',
  MYSTERIOUS: '*eyes narrow thoughtfully*',
  VILLAIN: '*smirk curls*',
};

const WHISPER: Record<TonePreset, string> = {
  NONE: '(she says nothing audible)',
  TSUNDERE: '(you catch a faint "whatever…")',
  STOIC: '(a barely-there sigh)',
  ENERGETIC: '(a muffled giggle)',
  MELANCHOLIC: '(soft humming)',
  PLAYFUL: '(a quiet chuckle)',
  FORMAL: '(a measured breath)',
  NURTURING: '(a soft, worried hum)',
  MYSTERIOUS: '(an indecipherable murmur)',
  VILLAIN: '(a low, amused breath)',
};

export function characterFallback(character: Character, passType: PassType): string {
  const preset: TonePreset = character.tonePreset ?? 'NONE';
  switch (passType) {
    case 'CHARACTER_MAIN':
      return CHARACTER_MAIN[preset];
    case 'CHARACTER_REACT':
      return CHARACTER_REACT[preset];
    case 'WHISPER':
      return WHISPER[preset];
    case 'SILENT_REACT':
      return silentFallback(character);
    default:
      return CHARACTER_MAIN[preset];
  }
}

const SILENT_ACTIONS = [
  'crosses her arms',
  'watches silently',
  'shifts her weight',
  'glances away',
  'draws a slow breath',
];

export function silentFallback(character: Character): string {
  const i = Math.abs(character.name.length) % SILENT_ACTIONS.length;
  return `*${character.name} ${SILENT_ACTIONS[i]}*`;
}

export function directorFallback(): string {
  return JSON.stringify({ action: 'none', reason: 'director_pass_failed' });
}
