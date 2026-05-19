/**
 * PLANv2 post-wk14 — Trust-gated backstory reveal.
 *
 * Picks the appropriate backstory tier to inject into the prompt based
 * on the current trust score. Reveals cascade — a higher tier includes
 * itself plus all lower tiers already earned. The prompt builder pushes
 * the returned text into the system prompt so the character can
 * naturally allude to what they've "chosen" to share at this level of
 * closeness.
 *
 * Tiers are stored on the character persona as:
 *   persona.backstoryTiers = [
 *     { minTrust: 0,  text: "Public surface." },
 *     { minTrust: 30, text: "A hobby she's quiet about." },
 *     { minTrust: 60, text: "Why she moved to Tokyo." },
 *     { minTrust: 85, text: "The wound she never names." },
 *   ]
 *
 * If no tiers are present, returns null and the builder falls back to
 * the legacy coreWound disclosure beat at trust=51.
 */
import type { Character } from '@neigo/shared';

export interface BackstoryTier {
  minTrust: number;
  text: string;
}

function readTiers(character: Character): BackstoryTier[] | null {
  const raw = character.backstoryTiers;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const tiers: BackstoryTier[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const minTrust = typeof r.minTrust === 'number' ? r.minTrust : NaN;
    const text = typeof r.text === 'string' ? r.text : '';
    if (Number.isFinite(minTrust) && text.trim().length > 0) {
      tiers.push({ minTrust: Math.max(0, Math.min(100, minTrust)), text: text.trim() });
    }
  }
  if (tiers.length === 0) return null;
  tiers.sort((a, b) => a.minTrust - b.minTrust);
  return tiers;
}

export interface BackstoryReveal {
  unlockedTiers: BackstoryTier[];
  currentTier: BackstoryTier;
  nextTier: BackstoryTier | null;
}

/** Returns the tiers whose `minTrust <= trustScore`, plus the next locked tier. */
export function selectBackstoryReveal(
  character: Character,
  trustScore: number,
): BackstoryReveal | null {
  const tiers = readTiers(character);
  if (!tiers) return null;
  const trust = Math.max(0, Math.min(100, trustScore));
  const unlocked = tiers.filter((t) => t.minTrust <= trust);
  if (unlocked.length === 0) return null;
  const current = unlocked[unlocked.length - 1]!;
  const next = tiers.find((t) => t.minTrust > trust) ?? null;
  return { unlockedTiers: unlocked, currentTier: current, nextTier: next };
}

/** Returns a multi-line block for the prompt, or empty string if not applicable. */
export function buildBackstoryInjection(
  character: Character,
  trustScore: number,
): string {
  const reveal = selectBackstoryReveal(character, trustScore);
  if (!reveal) return '';
  const lines = [
    '',
    `## Backstory Known at Trust ${trustScore}/100`,
    'The character may reference any of the following truths naturally — only',
    'when the scene invites it. Do NOT dump these in one turn.',
  ];
  for (const t of reveal.unlockedTiers) {
    lines.push(`- (unlocked @ ${t.minTrust}) ${t.text}`);
  }
  if (reveal.nextTier) {
    lines.push(
      `(Withholding: the character still guards something they won't share until trust reaches ${reveal.nextTier.minTrust}.)`,
    );
  }
  return lines.join('\n');
}
