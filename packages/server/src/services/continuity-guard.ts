import type { RelationshipStage } from '@neigo/shared';
import type { Severity } from './repetition-detector.js';

export interface ContinuityRegressionResult {
  hasRegression: boolean;
  severity: Severity;
  reasons: string[];
  shouldReject: boolean;
}

const SOFTENING_SIGNAL = [
  /\b(?:terima kasih|thanks|thank you)\b/i,
  /\b(?:lebih ramah|softened|melunak|gentler|warmer)\b/i,
  /\b(?:mengambil|took|accepted|accepts|ate|eating|memakan|menggigit|gigit)\b/i,
  /\b(?:cukup enak|lumayan enak|not bad|rather good)\b/i,
  /\b(?:mencari keberadaannya|looked for|checking whether .* there|seakan mencari)\b/i,
  /\b(?:lega|relieved|comfortable|lebih nyaman)\b/i,
];

const DISTANCE_RESET_SIGNAL = [
  /\b(?:terlalu akrab|too familiar|too close too fast)\b/i,
  /\b(?:tidak nyaman|uncomfortable|uneasy)\b/i,
  /\b(?:memutuskan untuk tidak menanggapi|did not respond|refused to respond|chose not to respond)\b/i,
  /\b(?:mengabaikan(?:nya| keberadaan)?|ignored(?: .*presence)?|dismissed)\b/i,
  /\b(?:tetap datar dan profesional|cold and professional|strictly professional)\b/i,
  /\b(?:terganggu|annoyed by the familiarity|bothered by)\b/i,
];

const STRONG_TRIGGER_SIGNAL = /\b(?:memaksa|paksa|forcing|forceful|kasar|rude|menghina|insult|ancam|threat|lie|bohong|menguntit|stalk|violent|marah besar|yelled|teriak)\b/i;

function anyMatch(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function normalize(texts: string[]): string {
  return texts.join('\n').slice(-4000);
}

export function detectContinuityRegression(input: {
  newText: string;
  recentAssistant: string[];
  recentUser: string[];
  userText: string;
  stage?: RelationshipStage | null;
}): ContinuityRegressionResult {
  const recentAssistantText = normalize(input.recentAssistant);
  const recentUserText = normalize(input.recentUser);
  const newText = input.newText;
  const reasons: string[] = [];

  const hasSofteningHistory = anyMatch(recentAssistantText, SOFTENING_SIGNAL);
  const hasDistanceResetNow = anyMatch(newText, DISTANCE_RESET_SIGNAL);
  const hasStrongTrigger = STRONG_TRIGGER_SIGNAL.test(input.userText) || STRONG_TRIGGER_SIGNAL.test(recentUserText);

  if (hasSofteningHistory && hasDistanceResetNow && !hasStrongTrigger) {
    reasons.push('output resets to colder baseline despite recent softening/acceptance');
  }

  if (
    /\b(?:onigiri|food|gift|snack|kopi|coffee)\b/i.test(recentAssistantText) &&
    /\b(?:terima kasih|thanks|accepted|ate|memakan|mengambil|gigit)\b/i.test(recentAssistantText) &&
    /\b(?:mengabaikan|ignored|did not respond|tidak menanggapi)\b/i.test(newText)
  ) {
    reasons.push('output replays an already-resolved object interaction as unresolved again');
  }

  if (
    input.stage &&
    input.stage !== 'STRANGER' &&
    /\b(?:orang itu|that person|stranger)\b/i.test(newText) &&
    /\b(?:terima kasih|thanks|accepted|lebih ramah|melunak)\b/i.test(recentAssistantText)
  ) {
    reasons.push('output uses stranger-distance framing after relationship has already advanced');
  }

  const severity: Severity = reasons.length >= 2 ? 'HIGH' : reasons.length === 1 ? 'MEDIUM' : 'CLEAN';
  return {
    hasRegression: reasons.length > 0,
    severity,
    reasons,
    shouldReject: reasons.length > 0,
  };
}