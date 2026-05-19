import type {
  ChatMode,
  MemoryCategory,
  MemoryType,
  MessageRole,
  NarratorVoicePreset,
  PassType,
  SpeakerType,
  Tier,
  TonePreset,
} from '../enums/index.js';

/** Character — mirrors KMP Character data class. */
export interface Character {
  id: string;
  ownerId: string | null; // null for built-in
  name: string;
  avatarUrl: string | null;
  spriteSheetUrl: string | null;
  age: string;
  gender: string;
  personality: string;
  speechStyle: string;
  likes: string;
  dislikes: string;
  background: string;
  worldInfo: string;
  exampleDialogues: string;
  jealousyExpression: string;
  forbiddenTopics: string;
  relationshipType: string;
  relationshipDescription: string;
  tags: string[];
  folder: string | null;
  tonePreset: TonePreset;
  isBuiltIn: boolean;
  isPublic: boolean;
  birthday: string | null;
  coreTraits: string;
  dynamicTraits: string;
  verbalHabits: string;
  conflictStyle: string;
  /**
   * PLANv2 post-wk14 — Trust-gated backstory reveal tiers.
   * Ascending-sorted list of facts the character is willing to share at
   * each `minTrust` level. Empty/undefined = no tiered reveal configured
   * (the legacy coreWound beat still fires at trust=51).
   */
  backstoryTiers?: Array<{ minTrust: number; text: string }>;
  /**
   * REDESIGNv2 D1 — first-class language filter.
   * `language` is the dominant language used in persona/example dialogues.
   * `languagesSpoken` is the broader list surfaced as hints.
   */
  language: 'id' | 'en' | 'ja' | 'ko' | 'zh' | 'es' | 'pt' | 'fr' | 'de' | 'it' | 'hi' | 'th';
  languagesSpoken: string[];
  /** Soft retirement — hides character from catalog but preserves owner data. */
  isRetired: boolean;
  /** Creator opt-in for being referenced as VN cast by other creators. */
  allowInStories: boolean;
  /** PLANCHATv3 §4.6 — Content sensitivity level. Default 'SFW'. */
  contentRating: 'SFW' | 'NSFW' | 'EXPLICIT';
  /** PLANIMPv7 §2.1 — Structured persona breakdown (optional extension). */
  personaMd?: {
    coreIdentity?: string;
    physicalDescription?: string;
    mannerisms?: string;
    history?: string;
    role?: string;
    classRole?: string;
  };
  createdAt: string; // ISO
  updatedAt: string;
}

/** Chat session — mirrors KMP ChatSession data class. */
export interface ChatSession {
  id: string;
  userId: string;
  mode: ChatMode;
  title: string;
  /** Main character (for single-character modes). */
  characterId: string;
  /** Additional cast characters (CAST mode). */
  castCharacterIds: string[];
  sceneCard: SceneCard;
  arcId: string | null;
  autoMoodEnabled: boolean;
  turnCount: number;
  dramaIntensity: number;
  lastContextTokens: number;
  moodState: string;
  narratorVoice: NarratorVoicePreset;
  ragEnabled: boolean;
  sessionDate: string | null;
  sessionTime: string | null;
  /** Locked at session creation — never mutated afterwards. */
  aiModel: string;
  /** Day-2 hook: an incomplete beat left by the character at session end. */
  unresolvedBeat: string | null;
  /** Character's private question for the session (semantic-match target). */
  latentQuestion: string | null;
  /** User utterance tagged for later-day callback reference. */
  callbackCandidate: string | null;
  /** 0..1 — share of turns where character mood drifts independently of user. */
  moodNoise: number;
  /** Wk8 G1a — optional persona pin. Null = fall back to users.displayName. */
  activePersonaId: string | null;
  /** Wk11 G2 — optional prompt preset pin. Null = no preset. */
  activePresetId: string | null;
  /** Wk13 H1 — optional folder link. Null = "All chats". */
  folderId: string | null;
  /** Free-form JSON metadata (time gaps, flags, etc.). */
  metadata: Record<string, unknown> | null;
  createdAt: string;
  lastMessageAt: string;
}

export interface SceneCard {
  location: string | null;
  time: string | null;
  weather: string | null;
  mood: string | null;
  pov: string | null;
  openingNote: string | null;
  userRole: string | null;
  customSceneText: string | null;
  language: string | null;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  turnIndex: number;
  role: MessageRole;
  speakerType: SpeakerType;
  /** Character speaking, if any. */
  speakerId: string | null;
  content: string;
  passType: PassType | null;
  reaction: string | null;
  isStarred: boolean;
  tokenCount: number;
  replyToMessageId: string | null;
  turnId: string | null;
  passIndex: number | null;
  isInstant: boolean;
  feedbackTag: string | null;
  /** Free-form JSON — e.g. { kind: 'scene_change', sceneId: string } for synthetic messages. */
  metadata?: Record<string, unknown> | null;
  /** Wk10 G3a — id of first sibling in swipe family (null = self/root). */
  swipeRoot: string | null;
  /** Wk10 G3a — 0-based rank within the swipe family. */
  swipeIndex: number;
  /** Wk10 G3a — exactly one row per swipe family is active. */
  isActive: boolean;
  /**
   * Wk10 G3a — size of this message's swipe family (1 if no siblings).
   * Server-computed and included by GET /api/sessions/:id/messages only.
   */
  swipeCount?: number;
  createdAt: string;
}

export interface Memory {
  id: string;
  userId: string;
  characterId: string | null;
  sessionId: string | null;
  type: MemoryType;
  category: MemoryCategory;
  content: string;
  emotionalTag: string | null;
  scopeCharacterId: string | null;
  isMilestone: boolean;
  isEpisodic: boolean;
  chatMode: ChatMode | null;
  importance: number; // 0-1
  /** pgvector embedding (server only). */
  embedding?: number[];
  createdAt: string;
}

/** Per-session, per-character dynamic state. */
export interface CharacterDynamicState {
  sessionId: string;
  characterId: string;
  mood: string;
  stagnation: number; // 0-10
  jealousy: number; // 0-5 (harem)
  driftScore: number; // 0-1
  trustScore: number; // 0-100
  lastRelationshipStage: string;
  repetitionScore: number;
  toneDrift: number;
  updatedAt: string;
}

/** Harem-specific stats per character. */
export interface HaremStats {
  sessionId: string;
  characterId: string;
  affection: number; // 0-1000
  loyalty: number; // 0-1000
  jealousy: number; // 0-5
  voiceScore: number; // 0-1, participation propensity
  updatedAt: string;
}

/** Cast-to-cast relationship in harem/group scene. */
export interface CastRelationship {
  sessionId: string;
  charAId: string;
  charBId: string;
  relationshipType: string;
  affinity: number; // -100..100
}

export interface GroupActivity {
  id: string;
  sessionId: string;
  activityType: string;
  participants: string[]; // character ids
  outcome: string;
  createdAt: string;
}

export interface StoryArc {
  id: string;
  sessionId: string;
  name: string;
  stage: string;
  triggers: Record<string, unknown>;
  progress: number; // 0-1
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  profileAge: number | null;
  profileGender: string | null;
  profilePronouns: string | null;
  profileBio: string | null;
  tier: Tier;
  tierExpiresAt: string | null;
  stripeCustomerId: string | null;
  /** v7: closed-alpha participants carry a permanent "Founding Reader" mark. */
  isFoundingReader: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LearnerProfile {
  userId: string;
  targetLanguage: string;
  level: string;
  goals: Record<string, unknown>;
}

export interface MistakeLog {
  id: string;
  userId: string;
  sessionId: string;
  mistake: string;
  correction: string;
  createdAt: string;
}

export interface ApiUsage {
  id: string;
  userId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costCents: number;
  createdAt: string;
}
