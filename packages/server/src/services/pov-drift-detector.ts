/**
 * POV drift detector — flags when AI output switches POV mid-response.
 *
 * Works by checking the dominant POV mode in the output against the
 * session's configured POV setting. If the output has significant
 * markers of a different POV, it flags the drift for retry.
 */

export type PovMode = 'third_person_limited' | 'third_person_omniscient' | 'first_person_character';

export interface PovDriftResult {
  /** True when significant POV drift detected — caller should retry. */
  shouldReject: boolean;
  /** Detected dominant POV in the output. */
  detectedPov: PovMode | null;
  /** Human-readable correction for the retry system message. */
  correctionText: string;
}

/**
 * First-person markers: "I", "my", "me", "myself" as subject/object
 * Must be careful not to match dialogue quotes — only match unquoted text.
 */
const FIRST_PERSON_NARRATION = /(?<!\")(?<!\u201C)\b(?:I\s+(?:looked|felt|thought|knew|wanted|reached|stepped|turned|watched|noticed|heard|could|couldn't|didn't|was|am|have|had|said|whispered))\b/g;

/**
 * Third-person markers: "She/He + verb" patterns in narration.
 */
const THIRD_PERSON_NARRATION = /\b(?:She|He)\s+(?:looked|felt|thought|knew|wanted|reached|stepped|turned|watched|noticed|heard|could|couldn't|didn't|was|had|said|whispered|murmured|smiled|frowned|sighed|shook|nodded|tilted|leaned|crossed|narrowed|softened|paused)\b/g;

/**
 * Strip quoted dialogue before analysis, since characters
 * speak in first person inside quotes regardless of narrative POV.
 */
function stripDialogue(text: string): string {
  // Remove "..." and \u201C...\u201D (smart quotes)
  return text
    .replace(/"[^"]*"/g, '')
    .replace(/\u201C[^\u201D]*\u201D/g, '');
}

const MIN_MARKERS = 3;
const DRIFT_RATIO = 0.6;

export function detectPovDrift(
  text: string,
  expectedPov: PovMode,
): PovDriftResult {
  const narration = stripDialogue(text);

  const firstPersonHits = (narration.match(FIRST_PERSON_NARRATION) ?? []).length;
  const thirdPersonHits = (narration.match(THIRD_PERSON_NARRATION) ?? []).length;
  const total = firstPersonHits + thirdPersonHits;

  if (total < MIN_MARKERS) {
    return { shouldReject: false, detectedPov: null, correctionText: '' };
  }

  const firstRatio = firstPersonHits / total;
  const thirdRatio = thirdPersonHits / total;

  let detectedPov: PovMode | null = null;
  if (firstRatio >= DRIFT_RATIO) detectedPov = 'first_person_character';
  else if (thirdRatio >= DRIFT_RATIO) detectedPov = 'third_person_limited';
  else detectedPov = null; // Mixed — can't determine clearly

  // No clear detection → no rejection
  if (!detectedPov) {
    return { shouldReject: false, detectedPov: null, correctionText: '' };
  }

  // Check if detected matches expected
  if (expectedPov === 'first_person_character' && detectedPov === 'first_person_character') {
    return { shouldReject: false, detectedPov, correctionText: '' };
  }
  if (
    (expectedPov === 'third_person_limited' || expectedPov === 'third_person_omniscient') &&
    (detectedPov === 'third_person_limited')
  ) {
    return { shouldReject: false, detectedPov, correctionText: '' };
  }

  // POV mismatch detected
  const expectedLabel = expectedPov.replace(/_/g, ' ');
  const detectedLabel = detectedPov.replace(/_/g, ' ');
  return {
    shouldReject: true,
    detectedPov,
    correctionText:
      `POV DRIFT: Expected ${expectedLabel} but output is predominantly ${detectedLabel}. ` +
      `Rewrite the entire response in ${expectedLabel} as specified in the POV Lock.`,
  };
}
