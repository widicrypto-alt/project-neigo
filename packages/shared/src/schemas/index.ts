import { z } from 'zod';
import {
  ALL_CHAT_MODES,
  ALL_AI_MODELS,
  AiModel,
  ChatMode,
  MessageRole,
  NarratorVoicePreset,
  SpeakerType,
  PassType,
  TonePreset,
} from '../enums/index.js';

const nonEmpty = (min = 1) => z.string().min(min);
const zAssetLocation = z
  .string()
  .trim()
  .refine(
    (value) => value.startsWith('/') || /^https?:\/\//i.test(value),
    'Must be an absolute http(s) URL or a root-relative path starting with /',
  );

export const zAiModel = z.enum(ALL_AI_MODELS as [AiModel, ...AiModel[]]);

export const zTonePreset = z.enum([
  'NONE',
  'TSUNDERE',
  'STOIC',
  'ENERGETIC',
  'MELANCHOLIC',
  'PLAYFUL',
  'FORMAL',
  'NURTURING',
  'MYSTERIOUS',
  'VILLAIN',
]);

export const zChatMode = z.enum(ALL_CHAT_MODES as [ChatMode, ...ChatMode[]]);

export const zCreateCharacter = z.object({
  name: nonEmpty().max(200),
  personality: nonEmpty(10),
  age: z.string().default(''),
  gender: z.string().default(''),
  speechStyle: z.string().default(''),
  likes: z.string().default(''),
  dislikes: z.string().default(''),
  background: z.string().default(''),
  worldInfo: z.string().default(''),
  exampleDialogues: z.string().default(''),
  jealousyExpression: z.string().default(''),
  forbiddenTopics: z.string().default(''),
  relationshipType: z.string().default(''),
  relationshipDescription: z.string().default(''),
  tags: z.array(z.string()).default([]),
  folder: z.string().nullable().default(null),
  tonePreset: zTonePreset.default('NONE'),
  avatarUrl: z.string().url().nullable().optional(),
  spriteSheetUrl: zAssetLocation.nullable().optional(),
  isPublic: z.boolean().default(false),
  birthday: z.string().nullable().default(null),
  coreTraits: z.string().default(''),
  dynamicTraits: z.string().default(''),
  verbalHabits: z.string().default(''),
  conflictStyle: z.string().default(''),
  // Optional fields accepted on create (studio wizard passes these)
  language: z.string().min(2).max(8).optional(),
  tagline: z.string().max(200).nullable().optional(),
  descriptionMd: z.string().max(32_000).nullable().optional(),
});
export type CreateCharacterInput = z.infer<typeof zCreateCharacter>;

export const zUpdateCharacter = zCreateCharacter.partial();

export const zSceneCard = z.object({
  location: z.string().nullable().default(null),
  time: z.string().nullable().default(null),
  weather: z.string().nullable().default(null),
  mood: z.string().nullable().default(null),
  pov: z.string().nullable().default(null),
  openingNote: z.string().nullable().default(null),
  userRole: z.string().nullable().default(null),
  customSceneText: z.string().nullable().default(null),
  language: z.string().nullable().default(null),
});

const zId = z.string().min(1).max(64);

export const zCreateSession = z.object({
  mode: zChatMode,
  characterId: zId,
  castCharacterIds: z.array(zId).default([]),
  title: z.string().default(''),
  sceneCard: zSceneCard.partial().default({}),
  /**
   * Optional per-session model override. Either an AI_MODEL key
   * (e.g. 'HERMES_4_405B') or a BYOK catalog slug (e.g. 'minimax/minimax-m2').
   */
  aiModel: z.string().min(1).max(120).optional(),
});
export type CreateSessionInput = z.infer<typeof zCreateSession>;

export const zSendTurn = z.object({
  content: nonEmpty(1).max(8000),
});
export type SendTurnInput = z.infer<typeof zSendTurn>;

export const zRegister = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  displayName: z.string().min(1).max(100),
});

export const zLogin = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Server-Sent Event payload shapes emitted during a chat turn. */
export const SseEventType = {
  SCENE: 'scene',
  NARRATOR: 'narrator',
  CHARACTER: 'character',
  REACTOR: 'reactor',
  SILENT: 'silent',
  WHISPER: 'whisper',
  STATS: 'stats',
  RELATIONSHIP: 'relationship',
  MILESTONE: 'milestone',
  MOOD: 'mood',
  EMOTION: 'emotion',
  ERROR: 'error',
  DONE: 'done',
  STREAM_READY: 'stream_ready',
  RESUME_PAUSED: 'resume_paused',
  CYOA_CHOICES: 'cyoa_choices',
  VULNERABILITY_MOMENT: 'vulnerability_moment',
  SYSTEM_HINT: 'system_hint',
} as const;
export type SseEventType = (typeof SseEventType)[keyof typeof SseEventType];

export interface SseSceneEvent {
  type: 'scene';
  summary: string;
  location: string | null;
  timeOfDay: string | null;
  atmosphere: string | null;
}
export interface SseTextChunkEvent {
  type: 'narrator' | 'character' | 'reactor';
  characterId: string | null;
  chunk: string;
  passType: PassType;
  messageId: string;
}
export interface SseSingleShotEvent {
  type: 'silent' | 'whisper';
  characterId: string;
  text: string;
  messageId: string;
}
export interface SseStatsEvent {
  type: 'stats';
  updates: Array<{ characterId: string; key: string; delta: number; value: number }>;
}
export interface SseRelationshipEvent {
  type: 'relationship';
  characterId: string;
  newTrust: number;
  newStage: string;
}
export interface SseMilestoneEvent {
  type: 'milestone';
  characterId: string;
  event: string;
  message: string;
}
export interface SseMoodEvent {
  type: 'mood';
  moodState: string;
}
export interface SseEmotionEvent {
  type: 'emotion';
  /** Sprite emotion key — one of the SPRITE_EMOTIONS set. */
  emotion: string;
  /** Optional: which character this emotion belongs to (for multi-char scenes). */
  characterId?: string | null;
}
export interface SseErrorEvent {
  type: 'error';
  message: string;
}
export interface SseDoneEvent {
  type: 'done';
  turnIndex: number;
  messageIds: string[];
  continued?: boolean;
}
export interface SseVulnerabilityMomentEvent {
  type: 'vulnerability_moment';
  detail: string;
  delayMs: number;
  message: string;
}
/**
 * Non-fatal transparency signal surfaced during a turn. Emitted by the
 * orchestrator when a BYOK call falls back to the server / free tier, or
 * when the chosen model is measurably slower than its recent baseline.
 */
export interface SseSystemHintEvent {
  type: 'system_hint';
  tone: 'slow' | 'fallback' | 'info';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Emitted once at the start of a resumable stream. Carries the streamId
 * that the client can use against `/api/chat/stream/:streamId/resume?since=N`
 * when the underlying fetch drops.
 */
export interface SseStreamReadyEvent {
  type: 'stream_ready';
  streamId: string;
}

/**
 * Emitted by the resume endpoint when it has replayed every buffered frame
 * but the original handler hasn't finished yet. The client should wait and
 * poll again with the most-recent event id.
 */
export interface SseResumePausedEvent {
  type: 'resume_paused';
}

/**
 * Wk5 F3 — 2–4 in-character action choices produced by a Hermes-4-70B
 * tail-call after the main response completes. Tapping one POSTs the
 * associated `sendText` back as the user's next turn.
 *
 * Emitted AFTER `done` (fire-and-forget, non-blocking). Clients should
 * treat as optional UX; a missing event is fine.
 */
export interface SseCyoaChoicesEvent {
  type: 'cyoa_choices';
  /** The turnIndex this set of choices is anchored to (matches `done.turnIndex`). */
  turnIndex: number;
  choices: Array<{
    /** Short chip label shown to the user (≤ 32 chars). */
    label: string;
    /** Full user-authored text posted when the chip is tapped (≤ 240 chars). */
    sendText: string;
  }>;
}

export type SseEvent =
  | SseSceneEvent
  | SseTextChunkEvent
  | SseSingleShotEvent
  | SseStatsEvent
  | SseRelationshipEvent
  | SseMilestoneEvent
  | SseMoodEvent
  | SseEmotionEvent
  | SseErrorEvent
  | SseDoneEvent
  | SseVulnerabilityMomentEvent
  | SseSystemHintEvent
  | SseStreamReadyEvent
  | SseResumePausedEvent
  | SseCyoaChoicesEvent;
