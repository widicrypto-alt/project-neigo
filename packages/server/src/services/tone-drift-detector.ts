/**
 * Tone drift detector — flags cold-preset characters using warm language
 * or formal characters using casual slang.
 * Port of Kotlin shared/.../manager/ToneDriftDetector.kt
 */
import type { Character, TonePreset } from '@neigo/shared';

const COLD: TonePreset[] = ['STOIC', 'TSUNDERE', 'FORMAL', 'VILLAIN', 'MYSTERIOUS'];

const WARMTH: RegExp[] = [
  /\bi love you\b/i,
  /\bi missed you\b/i,
  /\bi care about you\b/i,
  /\byou mean so much\b/i,
  /\bmy darling\b/i,
  /\bmy dear\b/i,
  /\baku cinta (?:kamu|padamu)\b/i,
  /\baku rindu (?:kamu|padamu)\b/i,
  /\baku peduli\b/i,
  /\bsayangku\b/i,
  /\bkamu berarti (?:segalanya|banyak)\b/i,
  /\bpelukan hangat\b/i,
];

const CASUAL_IN_FORMAL: RegExp[] = [
  /\b(?:hey|yo|lmao|lol|gimme|gonna|wanna|kinda|sorta|ya'?ll)\b/i,
  /\b(?:gaes|cuy|gue|lo|bro|sis)\b/i,
];

export type ToneDriftResult =
  | { kind: 'none' }
  | { kind: 'drifting'; excerpt: string; correctionText: string };

export function checkToneDrift(
  responseContent: string,
  character: Pick<Character, 'name' | 'tonePreset'>,
  trustScore = 0,
): ToneDriftResult {
  const tone = character.tonePreset;
  if (!tone) return { kind: 'none' };

  if (COLD.includes(tone)) {
    for (const p of WARMTH) {
      const m = responseContent.match(p);
      if (!m) continue;
      if (tone === 'TSUNDERE' && trustScore >= 70) continue;
      return {
        kind: 'drifting',
        excerpt: m[0],
        correctionText: `${character.name} has a ${tone} tone and would not speak this warmly yet (trust=${trustScore}). Rewrite with restraint.`,
      };
    }
  }
  if (tone === 'FORMAL') {
    for (const p of CASUAL_IN_FORMAL) {
      const m = responseContent.match(p);
      if (m)
        return {
          kind: 'drifting',
          excerpt: m[0],
          correctionText: `${character.name} is FORMAL — drop slang ("${m[0]}") and use measured diction.`,
        };
    }
  }
  return { kind: 'none' };
}
