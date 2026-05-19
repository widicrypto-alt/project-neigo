/**
 * Adaptive hallucination temperature.
 * Port of HallucinationLog.kt (logic; repo write is deferred to caller).
 */
export const TEMP_BASELINE = 0.75;
export const TEMP_PENALTY = 0.03;
export const TEMP_FLOOR = 0.45;
export const MAX_PENALTY_COUNT = 10;
export const HIGH_RISK_THRESHOLD = 5;

export function adaptiveTemperature(violationCount: number): number {
  const capped = Math.max(0, Math.min(MAX_PENALTY_COUNT, violationCount));
  return Math.max(TEMP_FLOOR, TEMP_BASELINE - capped * TEMP_PENALTY);
}

export function isHighRisk(violationCount: number): boolean {
  return violationCount >= HIGH_RISK_THRESHOLD;
}
