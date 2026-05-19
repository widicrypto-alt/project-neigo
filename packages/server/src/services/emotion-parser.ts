/**
 * Emotion Parser
 * 
 * Parses [EMOTION: emotionName] tags from LLM output.
 * Used for sprite rendering and mood lighting in the VN chat experience.
 */

// Valid emotion keywords (English, per spec)
export const VALID_EMOTIONS = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised',
  'thinking',
  'curious',
  'tender',
  'warm',
  'playful',
  'vulnerable',
  'conflicted',
  'cold',
  'anxious',
  'focused',
  'smile',
  'laugh',
  'confused',
] as const;

export type EmotionKeyword = (typeof VALID_EMOTIONS)[number];

// Emotion → Mood Lighting mapping
export const EMOTION_MOOD_MAP: Record<EmotionKeyword, {
  /** Mood preset key for AtmosphereLayer */
  moodPreset: string;
  /** Tint intensity (0-1) */
  tintIntensity: number;
  /** Additional CSS class for special effects */
  effect?: 'flash' | 'pulse' | 'shake';
}> = {
  // Positive emotions - brighter, warmer
  happy: { moodPreset: 'daylight', tintIntensity: 0.8, effect: 'pulse' },
  smile: { moodPreset: 'candlelight', tintIntensity: 0.6 },
  laugh: { moodPreset: 'daylight', tintIntensity: 0.9, effect: 'flash' },
  warm: { moodPreset: 'candlelight', tintIntensity: 0.85 },
  tender: { moodPreset: 'candlelight', tintIntensity: 0.7 },
  
  // Neutral emotions - balanced
  neutral: { moodPreset: 'candlelight', tintIntensity: 0.5 },
  thinking: { moodPreset: 'moonlight', tintIntensity: 0.4 },
  focused: { moodPreset: 'daylight', tintIntensity: 0.55 },
  
  // Negative emotions - dimmer, cooler or harsh
  sad: { moodPreset: 'night', tintIntensity: 0.6 },
  vulnerable: { moodPreset: 'night', tintIntensity: 0.5 },
  anxious: { moodPreset: 'dusk', tintIntensity: 0.65, effect: 'pulse' },
  
  // Complex emotions
  surprised: { moodPreset: 'dawn', tintIntensity: 0.7, effect: 'flash' },
  curious: { moodPreset: 'moonlight', tintIntensity: 0.6 },
  playful: { moodPreset: 'candlelight', tintIntensity: 0.65 },
  conflicted: { moodPreset: 'dusk', tintIntensity: 0.7, effect: 'shake' },
  
  // Strong negative - harsh
  angry: { moodPreset: 'night', tintIntensity: 0.9, effect: 'shake' },
  cold: { moodPreset: 'night', tintIntensity: 0.85 },
  
  // Special
  confused: { moodPreset: 'dusk', tintIntensity: 0.5 },
};

export interface ParsedEmotion {
  emotion: EmotionKeyword;
  startIndex: number;
  endIndex: number;
}

/**
 * Parse [EMOTION: emotionName] from text
 * 
 * @param text - LLM output text
 * @returns Parsed emotion or null if not found
 */
export function parseAndStripEmotion(text: string): { emotion: EmotionKeyword | null; cleanedText: string } {
  // Pattern: [EMOTION: emotion] (case-insensitive, allows whitespace)
  const emotionPattern = /\[EMOTION:\s*([a-zA-Z]+)\s*\]/i;
  const match = text.match(emotionPattern);
  
  if (!match || !match[1]) {
    return { emotion: null, cleanedText: text };
  }
  
  const rawEmotion = match[1].toLowerCase();
  
  // Validate against allowed emotions
  if (!VALID_EMOTIONS.includes(rawEmotion as EmotionKeyword)) {
    console.warn(`[emotion-parser] Unknown emotion: "${rawEmotion}", valid emotions: ${VALID_EMOTIONS.join(', ')}`);
    return { emotion: null, cleanedText: text };
  }
  
  // Remove the tag from text (with surrounding whitespace)
  const cleanedText = text.replace(match[0] ?? '', '').trim();
  
  return {
    emotion: rawEmotion as EmotionKeyword,
    cleanedText,
  };
}

/**
 * Check if text contains a valid emotion tag
 */
export function hasEmotionTag(text: string): boolean {
  const emotionPattern = /\[EMOTION:\s*[a-zA-Z]+\s*\]/i;
  return emotionPattern.test(text);
}

/**
 * Extract just the emotion (without modifying text)
 */
export function extractEmotion(text: string): EmotionKeyword | null {
  const emotionPattern = /\[EMOTION:\s*([a-zA-Z]+)\s*\]/i;
  const match = text.match(emotionPattern);
  
  if (!match || !match[1]) return null;
  
  const rawEmotion = match[1].toLowerCase();
  if (!VALID_EMOTIONS.includes(rawEmotion as EmotionKeyword)) return null;
  
  return rawEmotion as EmotionKeyword;
}

/**
 * Get mood preset info for an emotion
 */
export function getMoodForEmotion(emotion: EmotionKeyword) {
  return EMOTION_MOOD_MAP[emotion] ?? EMOTION_MOOD_MAP.neutral;
}
