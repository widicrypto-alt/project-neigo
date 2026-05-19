
import { db, schema } from '../../db/client.js';
import { sql, asc, eq, inArray, and } from 'drizzle-orm';
import {
  PassType,
  AI_MODEL_CONFIG,
  DEFAULT_AI_MODEL,
  BYOK_MODEL_CATALOG,
  type ChatSession,
  type ChatMode,
  type Character,
  type ByokModelPromptStyle
} from '@neigo/shared';
import { AiProxy, type AiMessage } from '../ai-proxy.js';
import { sanitizePassOutput, detectRefusal } from '../pass-output-sanitizer.js';
import { validatePass } from '../pass-validator.js';
import { checkToneDrift } from '../tone-drift-detector.js';
import { characterFallback, narratorFallback } from '../safe-fallback-generator.js';
import { checkCrossPassConsistency, type CrossPassAnchor } from '../cross-pass-consistency.js';
import { determineStage } from '../relationship-stage.js';
import { MemoryRetriever } from '../memory-retriever.js';
import {
  buildSummaryPrompt,
  buildCrystallizationPrompt,
  parseCrystallizationResponse,
  type CrystallizedMemory,
} from '../memory-manager.js';
import { type GraphSliceEdge } from '../memory-graph.js';
import { estimateTokensFast } from '../tokenizer.js';

export class BaseOrchestrator {
  

/**
 * Story Orchestrator — two modes: STORY (1:1 VN/RP) and CAST (ensemble).
 *
 * Pipeline per turn (STORY mode):
 *   1 LLM call → Hermes-4-405B ("Crescent")
 *   Post-processing: regex sanitizer, repetition detector, tone drift check
 *   If refusal detected → 1 retry with stronger preamble (max 1 retry)
 *
 * CAST mode: multi-pass (DIRECTOR → NARRATOR → CHARACTER × N).
 */

// PLANBv4 §4.2 — Render one graph edge into a single prompt bullet.
// Edges are ordered by recency; promises and unresolved events read best
// as subject-verb-object, relationship stage snapshots as declarative.
public static renderGraphEdge(e: GraphSliceEdge): string | null {
  const pred = e.predicate;
  const from = e.fromNode.canonicalName;
  const to = e.toNode.canonicalName;
  const meta = (e.toNode.metadata ?? {}) as { text?: string; summary?: string };
  if (pred === 'promised' && meta.text) {
    return `- You promised: "${meta.text.slice(0, 160)}"`;
  }
  if (pred === 'promised_to') return null; // folded into `promised`
  if (pred === 'witnessed' && meta.summary) return null; // covered by `unresolved`
  if (pred === 'unresolved' && meta.summary) {
    return `- Unresolved: ${meta.summary.slice(0, 160)}`;
  }
  if (
    pred === 'strangers' || pred === 'acquaintance' || pred === 'acquaintances' ||
    pred === 'friend' || pred === 'friends' || pred === 'close_friend' ||
    pred === 'close_friends' || pred === 'intimate' || pred === 'lovers'
  ) {
    const conf = Math.round(e.confidence * 100);
    return `- Relationship stage with ${to}: ${pred.replace(/_/g, ' ')} (~${conf}%)`;
  }
  // Generic fallback for future predicates.
  return `- ${from} → ${pred.replace(/_/g, ' ')} → ${to}`;
}

  
  /**
   * Resolve the upstream model slug. Preference order:
   *   1. BYOK is active and the user picked a model on settings → handled
   *      separately via ctx.byokModel (this method isn't consulted).
   *   2. session.aiModel overrides per-session:
   *        - matches an AI_MODEL key (e.g. 'HERMES_4_405B') → use its slug.
   *        - contains a '/' → treat as a raw OpenRouter slug.
   *   3. Fall back to the default server model (Hermes-4-405B).
   */
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

  /**
   * Pick a fallback model slug when the user's BYOK key fails. Preference:
   * user's configured fallback (stored in users.metadata.byokFallback), then
   * the free Hermes catalog entry, then the server default.
   */
  public static pickFallbackSlug(userFallback: string | undefined): string {
    if (userFallback && userFallback !== 'off') {
      const hit = BYOK_MODEL_CATALOG.find((m) => m.id === userFallback);
      if (hit) return hit.id;
    }
    const hermesFree = BYOK_MODEL_CATALOG.find(
      (m) => m.tier === 'free' && /hermes/i.test(m.id),
    );
    return hermesFree?.id ?? AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug;
  }

  /**
   * Read the user's BYOK fallback preference from users.metadata.byokFallback.
   * Returns the raw string (a catalog id, 'server', or 'off'). Defaults to
   * 'server' so a failing BYOK silently falls through to the server key.
   */
  public static async getUserFallbackPreference(userId: string): Promise<string> {
    try {
      const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
      const meta = (user?.metadata ?? {}) as Record<string, unknown>;
      const raw = typeof meta.byokFallback === 'string' ? meta.byokFallback : 'server';
      return raw;
    } catch {
      return 'server';
    }
  }

  /**
   * Temperature schedule — v7 simplified.
   *  - Turn 0-1  → 0.55  (grounded opening)
   *  - Turn 2-6  → 0.70  (mid-scene exploration)
   *  - Vulnerable mood → 0.60  (careful, deliberate)
   *  - Refusal / cold mood → 0.50  (tight, controlled)
   *  - Default   → 0.65
   */
  public static scheduledTemp(session: ChatSession): number {
    const turn = session.turnCount;
    const mood = (session.moodState ?? '').toLowerCase();
    if (['distant', 'guarded', 'cold', 'refusal'].includes(mood)) return 0.50;
    if (['vulnerable', 'tender', 'fragile'].includes(mood)) return 0.60;
    if (turn <= 1) return 0.55;
    if (turn <= 6) return 0.70;
    return 0.65;
  }

  /**
   * Run secondary tool-call routing only when likely useful, not every turn.
   * This keeps the feature while cutting average cost/latency.
   */
  public static shouldRunToolCallEvaluation(newTurnCount: number, userText: string): boolean {
    if (newTurnCount === 1) return true;
    if (newTurnCount % 4 === 0) return true;
    const signal =
      /\b(remember|don't forget|promise|i promise|we promised|trust|hurt|afraid|scared|vulnerable|i need you|leave me|i feel)\b/i;
    return signal.test(userText);
  }

  /** Fire-and-forget cross-pass consistency check (CAST mode). */
  public static async checkCrossPassForTurn(
    sessionId: string,
    messageIds: string[],
    primaryCharName: string,
  ): Promise<void> {
    if (messageIds.length < 2) return;
    const msgs = await db.query.chatMessages.findMany({
      where: (m, { inArray }) => inArray(m.id, messageIds),
    });
    const turnOutputs = new Map<string, string>();
    for (const m of msgs) {
      if (m.role !== 'ASSISTANT') continue;
      const label =
        m.speakerType === 'NARRATOR' ? 'NARRATOR' : m.speakerId ?? primaryCharName;
      turnOutputs.set(label, m.content);
    }
    if (turnOutputs.size < 2) return;
    const anchor: CrossPassAnchor = {
      location: null,
      castPresentNames: [primaryCharName],
    };
    const result = checkCrossPassConsistency(turnOutputs, anchor);
    if (!result.isConsistent) {
      console.warn(
        `[cross-pass] session=${sessionId} violations=${result.violations.length} severity=${result.severity}`,
        result.violations.map((v) => `${v.type}: ${v.excerpt}`),
      );
    }
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

  public static buildContinuityGuard(
    history: AiMessage[],
    current: {
      characterName: string;
      stage: ReturnType<typeof determineStage>;
      trustScore: number;
      mood: string | null;
      sceneState?: Record<string, string>;
    },
  ): string | null {
    const latest = history.slice(-6);
    if (latest.length === 0) return null;
    const compact = latest
      .map((msg) => `${msg.role.toUpperCase()}: ${this.clipContinuityText(msg.content, 160)}`)
      .join('\n');

    const sceneStateLines = current.sceneState && Object.keys(current.sceneState).length > 0
      ? [
          '',
          'Established scene facts (do NOT contradict):',
          ...Object.entries(current.sceneState).map(([k, v]) => `- ${k}: ${v}`),
        ]
      : [];

    return [
      '## Continuity Guard',
      `${current.characterName} must continue from the latest established state, not reset to an earlier baseline.`,
      `Current relationship stage: ${current.stage} (trust=${current.trustScore}/100). Current mood: ${current.mood ?? 'UNKNOWN'}.`,
      'Preserve cause-and-effect across scene cuts, especially after acceptance, gratitude, softening, conflict, or promises.',
      'Do not replay a beat that was already resolved unless the user explicitly reopens it with a new trigger.',
      ...sceneStateLines,
      'Recent continuity anchors:',
      compact,
    ].join('\n');
  }

  public static clipContinuityText(text: string, maxChars: number): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxChars) return normalized;
    return normalized.slice(0, maxChars - 1).trimEnd() + '…';
  }

  /**
   * v7 Bet A — structured memory crystallization.
   *
   * Replaces the legacy free-form summary with a typed JSON payload
   * (`CrystallizedMemory[]`). We map each beat to the existing MemoryType /
   * MemoryCategory space so downstream retrieval keeps working; pgvector
   * embedding is computed automatically inside `MemoryRetriever.insert`.
   *
   * If the model returns malformed JSON (or parse throws), we silently fall
   * back to the legacy summary path so the user never loses memory coverage.
   */
  public static async scheduleSummary(
    session: ChatSession,
    character: Character,
    userId: string,
  ) {
    const msgs = await db.query.chatMessages.findMany({
      where: eq(schema.chatMessages.sessionId, session.id),
      orderBy: asc(schema.chatMessages.turnIndex),
    });
    const transcript = msgs
      .slice(-40)
      .map((m) => `${m.speakerType}: ${m.content}`)
      .join('\n');

    // ---- 1. Try structured crystallization ------------------------------
    try {
      const prompt = buildCrystallizationPrompt(transcript, character.name);
      const result = await AiProxy.complete({
        model: BaseOrchestrator.modelSlugFor(session),
        messages: [{ role: 'system', content: prompt }],
        temperature: 0.3,
        maxTokens: 700,
        userId,
      });
      const parsed = parseCrystallizationResponse(result.content);
      if (parsed.memories.length > 0) {
        for (const m of parsed.memories) {
          const mapped = BaseOrchestrator.mapCrystallizedMemory(m);
          await MemoryRetriever.insert({
            userId,
            sessionId: session.id,
            characterId: character.id,
            type: mapped.type,
            category: mapped.category,
            content: m.content,
            emotionalTag: m.emotion ?? null,
            isEpisodic: mapped.isEpisodic,
            isMilestone: mapped.isMilestone,
            importance: m.salience,
            chatMode: session.mode,
          });
        }
        return;
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[memory] crystallization failed, falling back to summary:',
          (err as Error).message,
        );
      }
    }

    // ---- 2. Fallback: legacy free-form summary --------------------------
    const prompt = buildSummaryPrompt(transcript, character.name);
    const result = await AiProxy.complete({
      model: BaseOrchestrator.modelSlugFor(session),
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.4,
      maxTokens: 400,
      userId,
    });
    if (result.content.trim().length < 10) return;
    await MemoryRetriever.insert({
      userId,
      sessionId: session.id,
      characterId: character.id,
      type: 'SUMMARY',
      category: 'GENERAL',
      content: result.content.trim(),
      isEpisodic: true,
      importance: 0.6,
      chatMode: session.mode,
    });
  }

  /**
   * Project a CrystallizedMemory (v7 typed JSON) onto the existing
   * MemoryType / MemoryCategory pair the storage layer understands.
   */
  public static mapCrystallizedMemory(m: CrystallizedMemory): {
    type: 'PINNED' | 'SUMMARY' | 'LORE';
    category: 'GENERAL' | 'IMPORTANT_FACT' | 'RELATIONSHIP_NOTE' | 'WORLD_EVENT' | 'SECRET';
    isEpisodic: boolean;
    isMilestone: boolean;
  } {
    const milestone = m.salience >= 0.8;
    switch (m.type) {
      case 'promise':
        return { type: 'PINNED', category: 'IMPORTANT_FACT', isEpisodic: false, isMilestone: true };
      case 'relationship_shift':
        return { type: 'SUMMARY', category: 'RELATIONSHIP_NOTE', isEpisodic: true, isMilestone: milestone };
      case 'factual':
        return { type: 'SUMMARY', category: 'IMPORTANT_FACT', isEpisodic: true, isMilestone: milestone };
      case 'lore':
        return { type: 'LORE', category: 'WORLD_EVENT', isEpisodic: false, isMilestone: milestone };
      case 'scene_anchor':
        return { type: 'SUMMARY', category: 'GENERAL', isEpisodic: true, isMilestone: milestone };
      case 'emotional_beat':
      default:
        return { type: 'SUMMARY', category: 'GENERAL', isEpisodic: true, isMilestone: milestone };
    }
  }

  /**
   * Load conversation history with a token budget.
   * Loads messages newest-first, then trims from the oldest until the total
   * estimated token count fits within the budget. ~4 chars per token.
   *
   * @param sessionId
   * @param tokenBudget  Max estimated tokens for history. Default 60 000 (~240k chars).
   *                     With 128k context, leaves ~68k for system prompt + memories + generation.
   *
   * Wk1 P0 cache-bust audit (PLANv2 §6 item 6): defensively clamp the
   * caller-supplied budget against the active model's context window so a
   * future multi-model config can't accidentally overflow the provider.
   */
  public static async loadHistory(sessionId: string, tokenBudget = 60_000): Promise<AiMessage[]> {
    // PLANBv1 §4.2 / BACKLOG B2.1 — reuse the shared fast estimator so every
    // history-budget decision stays consistent with the rest of the codebase.
    const MAX_ROWS = 200; // safety cap to avoid loading entire huge sessions
    // Reserve headroom for system prompt, memory cards, scene state, and the
    // model's own generation. Anything above this would truncate *output*.
    const GENERATION_RESERVE_TOKENS = 8_000;
    const modelContext =
      AI_MODEL_CONFIG[DEFAULT_AI_MODEL]?.contextWindow ?? 128_000;
    const hardCap = Math.max(4_000, modelContext - GENERATION_RESERVE_TOKENS);
    if (tokenBudget > hardCap) tokenBudget = hardCap;
    const rows = await db.query.chatMessages.findMany({
      where: and(
        eq(schema.chatMessages.sessionId, sessionId),
        eq(schema.chatMessages.isActive, true),
      ),
      orderBy: asc(schema.chatMessages.turnIndex),
      limit: MAX_ROWS,
    });

    const mapped = rows
      .filter((r) => r.speakerType !== 'SYSTEM')
      .map((r) => ({
        role: r.role === 'USER' ? ('user' as const) : ('assistant' as const),
        content: r.content,
      }));

    // Trim from the oldest messages until within budget
    let totalTokens = 0;
    for (const m of mapped) totalTokens += estimateTokensFast(m.content);
    let startIdx = 0;
    while (totalTokens > tokenBudget && startIdx < mapped.length - 2) {
      totalTokens -= estimateTokensFast(mapped[startIdx]!.content);
      startIdx++;
    }
    return mapped.slice(startIdx);
  }
}
