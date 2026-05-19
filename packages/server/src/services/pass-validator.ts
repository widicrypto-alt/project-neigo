/**
 * Pass validator: identifies violations per pass type (narrator/character/director).
 * Port of PassValidator.kt
 */
import type { PassType, Character, RelationshipStage } from '@neigo/shared';
import type { Severity } from './repetition-detector.js';

export type ViolationKind =
  | 'NarratorSpeaking'
  | 'CharacterNarrating'
  | 'UserControlViolation'
  | 'KnowledgeBleed'
  | 'RelationshipJump'
  | 'InventedFact'
  | 'EmptyOrGarbage'
  | 'SystemLeak';

export interface PassViolation {
  kind: ViolationKind;
  excerpt: string;
}

export interface PassValidationResult {
  isValid: boolean;
  severity: Severity;
  violations: PassViolation[];
  repairedText?: string;
}

const SYSTEM_LEAK = /\[INST\]|<\|im_start\|>|═══|<\/?s>/i;
const USER_CONTROL =
  /\b(?:you(?:r)?\s+(?:walk|feel|are|find|eyes|heart|body|hand|mouth|lips|mind))\b/i;
const QUOTED_SPEECH = /"[^"]{2,}"|“[^”]{2,}”/;
const OMNISCIENT_PATTERNS: RegExp[] = [
  /\bthe room\b/i,
  /\boutside\b/i,
  /\bshe thinks\b/i,
  /\bhe thinks\b/i,
  /\bmeanwhile\b/i,
];
const INTIMACY = /\b(?:soulmate|love of my life|marry me|forever with you|cinta sejati)\b/i;

function severityScore(s: Severity): number {
  return { CLEAN: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[s];
}
function maxSeverity(a: Severity, b: Severity): Severity {
  return severityScore(a) >= severityScore(b) ? a : b;
}

export function validatePass(input: {
  text: string;
  passType: PassType;
  character?: Character | null;
  stage?: RelationshipStage | null;
  allowQuotedSpeech?: boolean;
}): PassValidationResult {
  const { text, passType, character, stage } = input;
  const violations: PassViolation[] = [];
  let severity: Severity = 'CLEAN';

  const trimmed = text.trim();
  if (trimmed.length < 5 || /^[.\s…]+$/.test(trimmed)) {
    return {
      isValid: false,
      severity: 'CRITICAL',
      violations: [{ kind: 'EmptyOrGarbage', excerpt: trimmed.slice(0, 40) }],
    };
  }

  const leakMatch = text.match(SYSTEM_LEAK);
  if (leakMatch) {
    violations.push({ kind: 'SystemLeak', excerpt: leakMatch[0] });
    severity = maxSeverity(severity, 'HIGH');
  }

  const ucMatch = text.match(USER_CONTROL);
  if (ucMatch) {
    violations.push({ kind: 'UserControlViolation', excerpt: ucMatch[0] });
    severity = maxSeverity(severity, 'HIGH');
  }

  if (passType === 'NARRATOR' || passType === 'DIRECTOR') {
    const q = text.match(QUOTED_SPEECH);
    if (q) {
      violations.push({ kind: 'NarratorSpeaking', excerpt: q[0].slice(0, 60) });
      severity = maxSeverity(severity, 'MEDIUM');
    }
  } else if (passType.startsWith('CHARACTER') || passType === 'WHISPER') {
    let hits = 0;
    for (const p of OMNISCIENT_PATTERNS) if (p.test(text)) hits++;
    if (hits >= 3) {
      violations.push({ kind: 'CharacterNarrating', excerpt: text.slice(0, 80) });
      severity = maxSeverity(severity, 'MEDIUM');
    }
  }

  if (stage === 'STRANGER' || stage === 'ACQUAINTANCE') {
    const im = text.match(INTIMACY);
    if (im) {
      violations.push({ kind: 'RelationshipJump', excerpt: im[0] });
      severity = maxSeverity(severity, 'HIGH');
    }
  }

  let repaired: string | undefined;
  if (leakMatch && !ucMatch) {
    repaired = text.replace(new RegExp(SYSTEM_LEAK.source, 'gi'), '').trim();
  }

  const fatal = violations.some((v) => v.kind === 'UserControlViolation');
  return {
    isValid: !fatal && severity !== 'CRITICAL',
    severity,
    violations,
    repairedText: repaired,
  };
}
