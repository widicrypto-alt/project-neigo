import {
  PassType,
  AI_MODEL_CONFIG,
  DEFAULT_AI_MODEL,
  BYOK_MODEL_CATALOG,
  type ChatSession,
  type Character,
} from '@neigo/shared';
import { eq, asc } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { sanitizePassOutput, detectRefusal } from '../pass-output-sanitizer.js';
import { validatePass } from '../pass-validator.js';
import { checkToneDrift } from '../tone-drift-detector.js';
import { characterFallback, narratorFallback } from '../safe-fallback-generator.js';
import type { AiMessage } from '../ai-proxy.js';
import type { ParsedStats } from '../stats-parser.js';

export type EmitSse = (event: {
  type: string;
  [key: string]: unknown;
}) => Promise<void> | void;

export interface OrchestratorContext {
  session: ChatSession;
  character: Character;
  castCharacters: Character[];
  userName: string;
  userId: string;
  history: AiMessage[];
  /** BYOK: user's own OpenRouter key (plaintext). When set, bypasses server budget. */
  byokKey?: string;
  /** BYOK: model slug chosen by user. Only used when byokKey is set. */
  byokModel?: string;
  /** Whether the user has confirmed age (18+) and enabled NSFW in their profile. */
  nsfwEnabled?: boolean;
}

export abstract class BasePassAgent {
  public static modelSlugFor(session: ChatSession): string {
    const override = session.aiModel;
    if (override) {
      if (override in AI_MODEL_CONFIG) {
        return AI_MODEL_CONFIG[override as keyof typeof AI_MODEL_CONFIG].slug;
      }
      if (override.includes('/')) return override;
    }
    return AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug;
  }

  public static scheduledTemp(session: ChatSession): number {
    const turn = session.turnCount;
    const mood = (session.moodState ?? '').toLowerCase();
    if (['distant', 'guarded', 'cold', 'refusal'].includes(mood)) return 0.50;
    if (['vulnerable', 'tender', 'fragile'].includes(mood)) return 0.60;
    if (turn <= 1) return 0.55;
    if (turn <= 6) return 0.70;
    return 0.65;
  }

  public static applyHygiene(
    rawText: string,
    opts: {
      passType: PassType;
      character?: Character | null;
      knownNouns?: ReadonlyArray<string>;
      trustScore?: number;
    },
  ): { text: string; toneDrifted: boolean; toneDriftCorrection?: string } {
    const { text: sanitized } = sanitizePassOutput(rawText, opts.knownNouns ?? []);
    const validation = validatePass({
      text: sanitized,
      passType: opts.passType,
      character: opts.character ?? null,
    });
    if (!validation.isValid) {
      if (
        opts.character &&
        (opts.passType === PassType.CHARACTER_MAIN ||
          opts.passType === PassType.CHARACTER_REACT ||
          opts.passType === PassType.WHISPER ||
          opts.passType === PassType.SILENT_REACT)
      ) {
        return { text: characterFallback(opts.character, opts.passType), toneDrifted: false };
      }
      if (opts.passType === PassType.NARRATOR) {
        return { text: narratorFallback('CINEMATIC', null), toneDrifted: false };
      }
    }
    const finalText = validation.repairedText ?? sanitized;
    if (opts.character) {
      const drift = checkToneDrift(finalText, opts.character, opts.trustScore ?? 0);
      if (drift.kind === 'drifting') {
        return { text: finalText, toneDrifted: true, toneDriftCorrection: drift.correctionText };
      }
    }
    return { text: finalText, toneDrifted: false };
  }

  public static async recentAssistantContents(
    sessionId: string,
    n: number,
  ): Promise<string[]> {
    const rows = await db.query.chatMessages.findMany({
      where: eq(schema.chatMessages.sessionId, sessionId),
      orderBy: asc(schema.chatMessages.turnIndex),
    });
    return rows
      .filter((r) => r.role === 'ASSISTANT')
      .slice(-n)
      .map((r) => r.content);
  }

  public static async recentUserContents(
    sessionId: string,
    n: number,
  ): Promise<string[]> {
    const rows = await db.query.chatMessages.findMany({
      where: eq(schema.chatMessages.sessionId, sessionId),
      orderBy: asc(schema.chatMessages.turnIndex),
    });
    return rows
      .filter((r) => r.role === 'USER')
      .slice(-n)
      .map((r) => r.content);
  }
}
