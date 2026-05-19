/**
 * Trust→stage mapping and prompt injection.
 * Port of RelationshipStageEngine.kt (logic only; repo is in routes layer).
 */
import type { RelationshipStage } from '@neigo/shared';
import { relationshipStageFromTrust } from '@neigo/shared';

export function determineStage(trustScore: number): RelationshipStage {
  return relationshipStageFromTrust(Math.max(0, Math.min(100, trustScore)));
}

const DESCRIPTIONS: Record<RelationshipStage, string> = {
  STRANGER:
    'Just met. Guarded, wary, polite distance. Hides personal details. Uses formal address.',
  ACQUAINTANCE:
    'Warming up. Small talk and surface-level shared interests. Cautious but curious.',
  FRIEND:
    'Comfortable. Trust established. Shares opinions and light personal history. Teasing appears.',
  CLOSE_FRIEND:
    'Deep trust. Shares vulnerabilities and inside jokes. May lean into physical closeness.',
  INTIMATE:
    'Unspoken understanding. Emotional/physical intimacy, deep mutual knowledge. Gentle shorthand.',
};

export function getStageDescription(stage: RelationshipStage): string {
  return DESCRIPTIONS[stage];
}

export function buildStagePromptInjection(
  stage: RelationshipStage,
  trustScore: number,
  characterName: string,
  opts?: { previousTrustScore?: number; coreWound?: string },
): string {
  const lines = [
    `[Internal Vibe] ${characterName}'s current sentiment toward user: ${DESCRIPTIONS[stage]} (Progress: ${trustScore}/100)`,
  ];

  // ── Trust=51 wound disclosure beat ──
  // Keep this as it is a critical narrative milestone, but frame it as a 'natural impulse'
  const prev = opts?.previousTrustScore ?? trustScore;
  if (prev < 51 && trustScore >= 51 && opts?.coreWound) {
    lines.push('');
    lines.push(`[Narrative Impulse] ${characterName} feels a rare moment of trust. A crack in their armor appears regarding: "${opts.coreWound}".`);
    lines.push('Consider showing this vulnerability subtly in your next few actions or dialogue.');
  }

  return lines.join('\n');
}

export function clampTrustDelta(delta: number): number {
  return Math.max(-10, Math.min(10, Math.round(delta)));
}

export function applyTrustDelta(current: number, delta: number): number {
  return Math.max(0, Math.min(100, current + clampTrustDelta(delta)));
}
