/**
 * Content Detection Utilities
 * Emotion detection and content analysis for the chat experience
 */

import type { Emotion, MessageType } from './chat-experience';

// ============================================================================
// Emotion Detection
// ============================================================================

// Keywords that indicate specific emotions
const EMOTION_KEYWORDS: Record<Emotion, RegExp[]> = {
  // Positive emotions
  happy: [
    /\b(bahagia|senang|gembira|happy|joy|glee|delighted)\b/i,
    /\b(senang|pleased|glad)\b/i,
  ],
  smile: [
    /\b(senyum|smiling?|grin)\b/i,
    /[:;]-?\)/
  ],
  laugh: [
    /\b(tawa|tertawa|laugh|laughing|chuckle|giggle|ha ha|hehe|haha)\b/i,
    / lol | lmao /i
  ],
  tender: [
    /\b(lembut|sayang|sentuh|tender|gentle|affection)\b/i,
    /\b(meluk|peluk|em braces?|holds?)\b/i,
  ],
  warm: [
    /\b(hangat|warm|cozy|comfort)\b/i,
  ],

  // Complex emotions
  curious: [
    /\b(tahu|tanya|curious|wonder|ask|ingin)/i,
    /\b(bingung|confused|puzzled)/i,
    /\b(mikir|think|consider|ponder|wondering)/i,
  ],
  playful: [
    /\b(bermain|playful|tease|jokes?|banter)/i,
    /\b(mengeluh|coquette|flirt)/i,
  ],
  vulnerable: [
    /\b(menangis|cry|weep|tears?|soba| Vulner)/i,
    /\b(rapuh|fragile|weak|broken)/i,
  ],
  conflicted: [
    /\b(bimbang|conflict|dilemma|torn|struggle)/i,
    /\b(tapi|tetapi|however|but)/i,
  ],

  // Negative emotions
  angry: [
    /\b(marah|angry|rage|furious|annoyed|kesal)/i,
    /\b(benci|hate|despise)/i,
    /\b(geram|frustrat|frustrat)/i,
  ],
  sad: [
    /\b(sedih|sad|decline|mourn|sorrow)/i,
    /\b(menangis|cry|weep|tears?)/i,
  ],
  anxious: [
    /\b(cemas|anxious|worried|nervous|panic)/i,
    /\b(gugup|tense|uneasy)/i,
  ],
  cold: [
    /\b(dingin|cold|distant|aloof|frigid)/i,
  ],

  // Neutral/思考
  neutral: [
    /\b(netral|neutral|calm|平静)/i,
  ],
  thinking: [
    /\b(mikir|thinking|consider|ponder|思索)/i,
    /\b(沉吟|murmur|hm|erum)/i,
  ],
  surprised: [
    /\b(terkejut|surprised|shock|astounded|amazed)/i,
    /\b(what|wow|oh!|ah!|oho)/i,
  ],
  confused: [
    /\b(bingung|confused|puzzled|lost)/i,
    /\b(tidak tahu|don'?t know|unclear)/i,
  ],

  // Additional emotions
  focused: [
    /\b(fokus|focus|concentrate|attention)/i,
    /\b(认真|serius|serious)/i,
  ],
};

// Fallback emotion detection based on punctuation and context
const EMOTION_CONTEXT_PATTERNS: Record<Emotion, RegExp[]> = {
  happy: [/\!$/],
  sad: [/,$/, /\b(belum|jangan|tidak mau)\b/],
  surprised: [/\?{2,}/, /\!\!/],
  angry: [/!\.$/],
  thinking: [/\.{3}$/, /\?\s*$/],
  confused: [/\?\s*$/],
  // Others - empty arrays for pattern fallback
  smile: [],
  laugh: [],
  tender: [],
  warm: [],
  curious: [],
  playful: [],
  vulnerable: [],
  conflicted: [],
  cold: [],
  anxious: [],
  focused: [],
  neutral: [],
};

/**
 * Detect emotion from text content
 */
export function detectEmotion(text: string): Emotion | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const normalizedText = text.trim().toLowerCase();

  // Check for explicit emotion keywords
  const scores: Partial<Record<Emotion, number>> = {};

  for (const [emotion, patterns] of Object.entries(EMOTION_KEYWORDS)) {
    const emotionKey = emotion as Emotion;
    scores[emotionKey] = 0;

    for (const pattern of patterns) {
      const matches = normalizedText.match(pattern);
      if (matches) {
        scores[emotionKey]! += matches.length;
      }
    }
  }

  // Find the emotion with highest score
  let maxScore = 0;
  let detectedEmotion: Emotion | null = null;

  for (const [emotion, score] of Object.entries(scores)) {
    if (score !== undefined && score > maxScore) {
      maxScore = score;
      detectedEmotion = emotion as Emotion;
    }
  }

  // If no clear emotion found, use context patterns
  if (!detectedEmotion || maxScore < 1) {
    for (const [emotion, patterns] of Object.entries(EMOTION_CONTEXT_PATTERNS)) {
      const emotionKey = emotion as Emotion;
      for (const pattern of patterns) {
        if (pattern.test(normalizedText)) {
          return emotionKey;
        }
      }
    }
  }

  return detectedEmotion ?? null;
}

// ============================================================================
// Message Type Detection
// ============================================================================

const MESSAGE_TYPE_PATTERNS: Record<MessageType, RegExp[]> = {
  // Narration - scene descriptions, actions in third person
  narration: [
    /^(scene|background|setting):/i,
    /^(camera|angle|fade|transition):/i,
    /^\[.*\]$/, // [Scene description]
    /^\*.*\*$/, // *Narration text*
  ],

  // Dialogue - character speech
  dialogue: [
    /^[""„](.+?)["""]$/, // "Quoted speech"
    /^['‘’‚](.+?)['‘’']$/, // 'Single quoted'
    /^[-–—](.+?)$/, // - Speech dash
  ],

  // Thought - internal monologue
  thought: [
    /^\((.+?)\)$/, // (Internal thought)
    /^\[(.+?)\]$/, // [Internal thought variant]
    /^\*(.+?)\*$/, // *Italicized thought*
    /\b(kupikir|mikir|aku rasa|aku berpikir|I think|I feel)\b/i,
  ],

  // Action - stage directions
  action: [
    /^\[(.+?)\]$/, // [Action]
    /^\/(\w+)\s*(.+)?$/, // /action params
    /\b(berjalan|pergi|datang|mengambil|melihat|membuka)\b/i,
  ],
};

/**
 * Detect message type from text content
 */
export function detectMessageType(text: string): MessageType {
  if (!text || typeof text !== 'string') {
    return 'dialogue'; // Default to dialogue
  }

  const normalizedText = text.trim();

  // Check patterns in order of specificity
  for (const [type, patterns] of Object.entries(MESSAGE_TYPE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedText)) {
        return type as MessageType;
      }
    }
  }

  // Default heuristics
  if (normalizedText.includes('*') && normalizedText.startsWith('*')) {
    return 'thought';
  }

  if (normalizedText.length < 20 && normalizedText.endsWith('...')) {
    return 'thought';
  }

  return 'dialogue';
}

// ============================================================================
// Speaker Detection
// ============================================================================

/**
 * Extract speaker name from dialogue text
 * e.g., "Character Name: Hello" -> "Character Name"
 */
export function extractSpeaker(text: string): { speaker: string | null; content: string } {
  const patterns = [
    /^([^:]+):\s*(.+)$/, // "Name: content"
    /^[""„]([^""„]+)["""]\s*(.+)?$/, // ""Name"" content
    /^['‘’‚]([^''‘’‚]+)[''‘’']\s*(.+)?$/, // 'Name' content
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
      if (match) {
        return {
          speaker: match[1]?.trim() ?? null,
          content: (match[2] || '').trim(),
        };
      }
  }

  return { speaker: null, content: text };
}

// ============================================================================
// Content Processing
// ============================================================================

export interface ParsedContent {
  speaker: string | null;
  type: MessageType;
  emotion: Emotion | null;
  content: string;
  parts: Array<{ kind: 'q' | 't'; text: string }>;
}

/**
 * Parse message content with full analysis
 */
export function parseContent(text: string, characterName?: string): ParsedContent {
  const { speaker, content } = extractSpeaker(text);
  const type = detectMessageType(text);
  const emotion = detectEmotion(text);

  // Parse content parts (quoted speech vs regular text)
  const parts: ParsedContent['parts'] = [];

  // Simple quote parsing
  const quotePattern = /["""]([^"""]+)["""]/g;
  let lastIndex = 0;
  let match;

  while ((match = quotePattern.exec(content)) !== null) {
    // Add text before the quote
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index).trim();
      if (textBefore) {
        parts.push({ kind: 't', text: textBefore });
      }
    }
    // Add the quoted text
    parts.push({ kind: 'q', text: match[1] ?? '' });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) {
      parts.push({ kind: 't', text: remaining });
    }
  }

  // If no parts found, use the whole content
  if (parts.length === 0) {
    parts.push({ kind: 't', text: content });
  }

  return {
    speaker: speaker ?? characterName ?? null,
    type,
    emotion,
    content,
    parts,
  };
}

// ============================================================================
// Sprite Emotion Constants (for sprite studio)
// ============================================================================

/**
 * Sprite emotion types for character sprite sheets
 */
export type SpriteEmotion = 
  | 'neutral' 
  | 'happy' 
  | 'sad' 
  | 'angry' 
  | 'surprised' 
  | 'thinking' 
  | 'curious'
  | 'tender'
  | 'cold';

export const SPRITE_EMOTIONS: SpriteEmotion[] = [
  'neutral', 'happy', 'sad', 'angry', 'surprised', 'thinking', 'curious', 'tender', 'cold',
];

export const SPRITE_EMOTION_LABELS: Record<SpriteEmotion, string> = {
  neutral: 'Neutral',
  happy: 'Happy',
  sad: 'Sad',
  angry: 'Angry',
  surprised: 'Surprised',
  thinking: 'Thinking',
  curious: 'Curious',
  tender: 'Tender',
  cold: 'Cold',
};

// ============================================================================
// Text Analysis Utilities
// ============================================================================

/**
 * Check if text contains strong emotional content
 */
export function hasStrongEmotion(text: string): boolean {
  const emotion = detectEmotion(text);
  if (!emotion) return false;

  const strongEmotions: Emotion[] = ['angry', 'sad', 'surprised', 'happy', 'vulnerable'];
  return strongEmotions.includes(emotion);
}

/**
 * Check if text indicates a scene transition
 */
export function isSceneTransition(text: string): boolean {
  const patterns = [
    /^scene:?\s*/i,
    /^background:?\s*/i,
    /^setting:?\s*/i,
    /^\[cut to /i,
    /\bfade (in|out)\b/i,
    /\btransition to\b/i,
  ];

  return patterns.some(pattern => pattern.test(text.trim()));
}

/**
 * Calculate text intensity (for animations)
 */
export function getTextIntensity(text: string): 'low' | 'medium' | 'high' {
  const hasExclamation = (text.match(/!/g) || []).length > 2;
  const hasQuestion = (text.match(/\?/g) || []).length > 1;
  const hasEllipsis = text.includes('...');
  const isLong = text.length > 200;

  if (hasExclamation || hasQuestion || isLong) {
    return 'high';
  }

  if (hasEllipsis || text.length > 100) {
    return 'medium';
  }

  return 'low';
}
