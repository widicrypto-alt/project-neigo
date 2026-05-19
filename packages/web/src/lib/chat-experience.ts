/**
 * Chat Page Experience Layer - Type Definitions
 * Based on docs/PLANVN_CHAT_EXPERIENCE.md
 */

// ============================================================================
// Emotion System
// ============================================================================

export type Emotion =
  | 'neutral'
  | 'smile'
  | 'laugh'
  | 'angry'
  | 'surprised'
  | 'sad'
  | 'thinking'
  | 'confused'
  | 'happy'
  | 'warm'
  | 'curious'
  | 'playful'
  | 'tender'
  | 'vulnerable'
  | 'conflicted'
  | 'cold'
  | 'anxious'
  | 'focused';

export const DEFAULT_EMOTION: Emotion = 'neutral';

export const EMOTION_LABELS: Record<Emotion, string> = {
  neutral: 'Netral',
  smile: 'Senyum',
  laugh: 'Tawa',
  angry: 'Marah',
  surprised: 'Terkejut',
  sad: 'Sedih',
  thinking: 'Bermenung',
  confused: 'Bingung',
  happy: 'Bahagia',
  warm: 'Hangat',
  curious: 'Ingin Tahu',
  playful: 'Playful',
  tender: ' Lembut',
  vulnerable: 'Rentan',
  conflicted: 'Bercampur',
  cold: 'Dingin',
  anxious: 'Cemas',
  focused: 'Fokus',
};

// ============================================================================
// Character Theme System
// ============================================================================

export interface CharacterTheme {
  primary: string;    // Main brand/theme color
  secondary: string;  // Light/muted version for backgrounds
  border: string;     // Border color with alpha
  glow: string;       // Bloom/box-shadow color
  badge: string;      // Badge background
}

/**
 * Generates a consistent HSL color from a string (name or ID)
 */
export function getCharacterTheme(seed: string): CharacterTheme {
  // Simple hash for consistent colors
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Use the hash to get a hue between 0 and 360
  const hue = Math.abs(hash % 360);
  
  // Visual novel palettes often look better with high saturation and moderate lightness
  // Speech/UI needs to be readable against dark backgrounds
  const s = 75; // 75% saturation for vivid colors
  const l = 75; // 75% lightness for text/accents

  return {
    primary: `hsl(${hue}, ${s}%, ${l}%)`,
    secondary: `hsl(${hue}, ${s}%, 15%)`,
    border: `hsla(${hue}, ${s}%, ${l}%, 0.35)`,
    glow: `hsla(${hue}, ${s}%, ${l}%, 0.15)`,
    badge: `hsla(${hue}, ${s}%, 12%, 0.9)`,
  };
}

// ============================================================================
// Message Types
// ============================================================================

export type MessageType = 'narration' | 'dialogue' | 'thought' | 'action';

export interface MessagePart {
  kind: 'q' | 't'; // q = quoted speech, t = regular text
  text: string;
}

export interface MessageNode {
  id: string;
  type: MessageType;
  speaker?: string;
  parts?: MessagePart[];
  text?: string;
  emotion?: Emotion;
  timestamp?: number;
}

// ============================================================================
// Sprite State Machine
// ============================================================================

export type CrossfadePhase = 'idle' | 'fading-out' | 'fading-in';

export interface SpriteTransition {
  currentUrl: string | null;
  targetUrl: string | null;
  phase: CrossfadePhase;
  onComplete?: () => void;
}

export interface SpriteState {
  currentEmotion: Emotion;
  currentUrl: string | null;
  nextEmotion?: Emotion;
  nextUrl?: string | null;
  transition: SpriteTransition;
  isTransitioning: boolean;
}

// ============================================================================
// Atmosphere & Mood System
// ============================================================================

export type MoodPresetKey = 'candlelight' | 'moonlight' | 'dawn' | 'daylight' | 'dusk' | 'night';

export interface MoodPreset {
  key: MoodPresetKey;
  name: string;
  colors: {
    key: string;       // Key light color
    rim: string;       // Rim/edge light
    ambient: string;   // Ambient gradient
    tint: string;      // Color tint overlay
  };
  dustParticles: {
    count: number;
    opacity: [number, number]; // min, max
    size: [number, number];    // min, max
    duration: [number, number]; // min, max seconds
  };
}

export const MOOD_PRESETS: Record<MoodPresetKey, MoodPreset> = {
  candlelight: {
    key: 'candlelight',
    name: 'Sinar Lilin',
    colors: {
      key: 'rgba(255, 178, 110, 0.55)',
      rim: 'rgba(255, 200, 130, 0.35)',
      ambient: 'radial-gradient(ellipse 75% 60% at 50% 60%, rgba(80, 40, 18, 0.4) 0%, rgba(20, 12, 8, 0.85) 60%, rgba(8, 5, 3, 1) 100%)',
      tint: 'rgba(255, 160, 80, 0.10)',
    },
    dustParticles: {
      count: 14,
      opacity: [0.3, 0.7],
      size: [1, 3.5],
      duration: [18, 40],
    },
  },
  moonlight: {
    key: 'moonlight',
    name: 'Cahaya Bulan',
    colors: {
      key: 'rgba(180, 210, 240, 0.45)',
      rim: 'rgba(220, 235, 255, 0.30)',
      ambient: 'radial-gradient(ellipse 80% 70% at 50% 30%, rgba(30, 50, 80, 0.5) 0%, rgba(15, 20, 35, 0.85) 50%, rgba(8, 10, 18, 1) 100%)',
      tint: 'rgba(100, 150, 200, 0.08)',
    },
    dustParticles: {
      count: 10,
      opacity: [0.2, 0.5],
      size: [1, 2.5],
      duration: [20, 35],
    },
  },
  dawn: {
    key: 'dawn',
    name: 'Fajar',
    colors: {
      key: 'rgba(255, 180, 130, 0.50)',
      rim: 'rgba(255, 220, 170, 0.35)',
      ambient: 'radial-gradient(ellipse 70% 60% at 50% 20%, rgba(100, 60, 40, 0.4) 0%, rgba(50, 35, 30, 0.8) 50%, rgba(25, 18, 15, 1) 100%)',
      tint: 'rgba(255, 180, 120, 0.12)',
    },
    dustParticles: {
      count: 8,
      opacity: [0.25, 0.55],
      size: [1.5, 3],
      duration: [22, 38],
    },
  },
  daylight: {
    key: 'daylight',
    name: 'Siang',
    colors: {
      key: 'rgba(255, 250, 230, 0.60)',
      rim: 'rgba(255, 255, 240, 0.40)',
      ambient: 'radial-gradient(ellipse 90% 80% at 50% 10%, rgba(200, 190, 160, 0.3) 0%, rgba(150, 140, 120, 0.6) 50%, rgba(80, 75, 65, 1) 100%)',
      tint: 'rgba(255, 250, 220, 0.08)',
    },
    dustParticles: {
      count: 6,
      opacity: [0.15, 0.40],
      size: [1, 2],
      duration: [25, 45],
    },
  },
  dusk: {
    key: 'dusk',
    name: 'Senja',
    colors: {
      key: 'rgba(255, 140, 100, 0.50)',
      rim: 'rgba(255, 180, 140, 0.35)',
      ambient: 'radial-gradient(ellipse 75% 65% at 50% 25%, rgba(100, 50, 40, 0.45) 0%, rgba(50, 30, 25, 0.8) 50%, rgba(20, 15, 12, 1) 100%)',
      tint: 'rgba(255, 130, 80, 0.10)',
    },
    dustParticles: {
      count: 12,
      opacity: [0.25, 0.60],
      size: [1, 3],
      duration: [18, 32],
    },
  },
  night: {
    key: 'night',
    name: 'Malam',
    colors: {
      key: 'rgba(100, 120, 160, 0.35)',
      rim: 'rgba(150, 170, 200, 0.25)',
      ambient: 'radial-gradient(ellipse 85% 75% at 50% 40%, rgba(20, 25, 40, 0.5) 0%, rgba(10, 12, 20, 0.85) 50%, rgba(5, 6, 10, 1) 100%)',
      tint: 'rgba(80, 100, 140, 0.06)',
    },
    dustParticles: {
      count: 16,
      opacity: [0.2, 0.5],
      size: [0.8, 2.5],
      duration: [22, 42],
    },
  },
};

// ============================================================================
// Parallax System
// ============================================================================

export interface ParallaxLayer {
  id: string;
  depth: 'far' | 'mid' | 'near';
  intensity: number; // pixels of movement per 100px mouse movement
  zIndex: number;
}

export const PARALLAX_LAYERS: ParallaxLayer[] = [
  { id: 'background-far', depth: 'far', intensity: 8, zIndex: 1 },
  { id: 'background-mid', depth: 'mid', intensity: 16, zIndex: 2 },
  { id: 'foreground-near', depth: 'near', intensity: 4, zIndex: 3 },
  { id: 'sprite-layer', depth: 'near', intensity: 6, zIndex: 10 },
];

// ============================================================================
// Animation Timings
// ============================================================================

export const ANIMATION_TIMINGS = {
  spriteCrossfade: {
    opacity: 700,
    filter: 900,
    transform: 900,
  },
  parallax: 400,
  inputFocus: 220,
  buttonHover: 180,
  paragraphReveal: {
    min: 380,
    max: 760,
  },
  breathe: {
    duration: 4000,
    translateY: -3,
    scale: 1.006,
  },
} as const;

// ============================================================================
// SSE Event Types
// ============================================================================

export interface SSEEmotionEvent {
  type: 'emotion';
  emotion: Emotion;
}

export interface SSETokenEvent {
  type: 'token';
  token: string;
  isComplete: boolean;
}

export interface SSEParagraphEvent {
  type: 'paragraph';
  content: string;
  isFinal: boolean;
}

export interface SSEMessageEvent {
  type: 'message';
  message: MessageNode;
}

export type SSEEvent = SSEEmotionEvent | SSETokenEvent | SSEParagraphEvent | SSEMessageEvent;

// ============================================================================
// Sprite Manifest (character sprite URLs by emotion)
// ============================================================================

export interface SpriteManifest {
  [emotion: string]: string;
}

export const CRITICAL_EMOTIONS: Emotion[] = ['neutral', 'smile', 'surprised'];

// ============================================================================
// Component Props Types
// ============================================================================

export interface CharacterStageProps {
  characterName: string;
  spriteManifest?: SpriteManifest | null;
  currentEmotion: Emotion;
  moodPreset?: MoodPresetKey;
  backgroundUrl?: string;
  className?: string;
}

export interface AtmosphereLayerProps {
  moodPreset: MoodPreset;
  backgroundUrl?: string;
  mousePosition?: { x: number; y: number };
  reducedMotion?: boolean;
}

export interface SpriteLayerProps {
  currentUrl: string | null;
  nextUrl?: string | null;
  currentEmotion: Emotion;
  isTransitioning: boolean;
  reducedMotion?: boolean;
}

export interface ExpressionGalleryProps {
  recentEmotions: Emotion[];
  currentEmotion: Emotion;
  onSelectEmotion: (emotion: Emotion) => void;
}

export interface MessageBubbleProps {
  message: MessageNode;
  isStreaming?: boolean;
  onComplete?: () => void;
}

export interface MessageStreamProps {
  messages: MessageNode[];
  isLoading?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export interface ChatColumnProps {
  characterName: string;
  messages: MessageNode[];
  isLoading?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export interface InputBarProps {
  onSubmit: (text: string) => void;
  onContinue?: () => void;
  onRetry?: () => void;
  onClear?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export interface ActionButtonsProps {
  onSend: () => void;
  onContinue?: () => void;
  onRetry?: () => void;
  onClear?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}
