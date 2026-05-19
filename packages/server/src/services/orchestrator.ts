import { nanoid } from 'nanoid';
import { eq, asc, sql, and } from 'drizzle-orm';
import {
  PassType,
  AI_MODEL_CONFIG,
  DEFAULT_AI_MODEL,
  BYOK_MODEL_CATALOG,
  type ChatMode,
  type ChatSession,
  type Character,
  type ByokModelPromptStyle,
  runRegexScripts,
} from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { loadRegexScripts } from './regex-scripts-loader.js';
import { AiProxy, AiUpstreamError, type AiMessage } from './ai-proxy.js';
import { isSlowVsBaseline } from './model-metrics.js';
import { PromptBuilder } from '../prompts/builder.js';
import { getMcProfileById } from './mc-service.js';
import { parseAndStripStats, parseAndStripEmotion, parseAndStripArcSave, type ParsedStats } from './stats-parser.js';
import { saveArcCheckpoint, shouldAutoTriggerArc } from './arc-manager.js';
import { sanitizePassOutput, detectRefusal } from './pass-output-sanitizer.js';
import { validatePass } from './pass-validator.js';
import { detectRepetition } from './repetition-detector.js';
import { detectFormatDrift } from './format-drift-detector.js';
import { detectContinuityRegression } from './continuity-guard.js';
import { checkToneDrift } from './tone-drift-detector.js';
import {
  buildAnchorInjection,
  shouldAnchor,
  buildAuthorsNote,
  injectAuthorsNoteAtDepth,
} from './personality-anchor.js';
import { checkCrossPassConsistency, type CrossPassAnchor } from './cross-pass-consistency.js';
import { characterFallback, narratorFallback } from './safe-fallback-generator.js';
import { determineStage, buildStagePromptInjection } from './relationship-stage.js';
import { adaptiveTemperature } from './hallucination-log.js';
import { DynamicStateManager } from './dynamic-state-manager.js';
import { HaremStatsRepo } from './cast-stats-repo.js';
import { MemoryRetriever } from './memory-retriever.js';
import { parseAndStripMistakes } from './mistake-parser.js';
import { planHaremTurn, type TurnPlan } from './cast-turn-selector.js';
import { evaluateMoodEscalation, checkStatMilestone, checkTensionRelease, updateEscalationCounter } from './mood-escalation.js';
import {
  shouldSummarize,
  buildSummaryPrompt,
  buildCrystallizationPrompt,
  parseCrystallizationResponse,
  type CrystallizedMemory,
} from './memory-manager.js';
import {
  extractLatentQuestion,
  extractUnresolvedBeat,
  extractCallbackCandidate,
  scoreLatentQuestion,
  extractFactsFromTurn,
} from './session-meta-extractor.js';
import { extractAndPinPromises } from './promise-extractor.js';
import { detectPromises } from './promise-extractor.js';
import {
  recordPromises,
  recordUnresolvedEvent,
  recordRelationshipSnapshot,
} from './graph-writer.js';
import { queryGraph, type GraphSliceEdge } from './memory-graph.js';
import { evaluateToolCalls } from './tool-call-router.js';
import { capturePromptSnapshot } from './prompt-snapshot.js';
import { retrieveActiveLore } from './lorebook/retriever.js';
import { parseAndStripSceneState, mergeSceneState, parseAndStripTrackers, mergeTrackers } from './scene-state-parser.js';
import { detectPovDrift, type PovMode } from './pov-drift-detector.js';
import { compactSessionContext, retrieveCompactedContext, condenseDepth } from './context-compaction.js';
import { recentMistakes, recordMistake, buildMistakesPromptBlock } from './mistakes-registry.js';
import {
  shouldWriteDiary,
  writeDiaryEntry,
  retrieveDiaryEntries,
  buildDiaryPromptBlock,
} from './character-diary.js';
import { buildSessionSnapshot } from './session-snapshot.js';
import { generateCyoaChoices } from './cyoa-generator.js';
import { planNarrativeHint, formatNarrativeHintBlock } from './story-beat-planner.js';
import { env } from '../lib/env.js';
import { shouldRecall } from './memory-policy.js';
import { expandQuery, isRecallQuery } from './context-retrieval.js';
import { estimateTokensFast } from './tokenizer.js';
import { isCompleteSentence } from '@neigo/shared';
import { BaseOrchestrator } from './orchestrator/BaseOrchestrator.js';
import { CastOrchestrator } from './orchestrator/CastOrchestrator.js';


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

import { StoryOrchestrator } from './orchestrator/StoryOrchestrator.js';
import { PostTurnProcessor } from './orchestrator/PostTurnProcessor.js';
export class Orchestrator {

  static async runTurn(opts: {
    ctx: OrchestratorContext;
    userText: string;
    emit: EmitSse;
    /** Section B: regenerate bumps temperature for a different draft. */
    initialTempBoost?: number;
    /**
     * Wk10 G3a — external turn id. Used by the regenerate route so it can
     * tag the newly-inserted assistant rows with swipe family metadata
     * after the orchestrator completes (by filtering on this turn id).
     * When omitted, a fresh nanoid is generated (original behavior).
     */
    overrideTurnId?: string;
  }) {
    const { ctx, userText, emit } = opts;
    const initialTempBoost = opts.initialTempBoost;
    const { session, character } = ctx;
    const mode = session.mode as ChatMode;
    const messageIds: string[] = [];
    const allStats: ParsedStats[] = [];
    const turnId = opts.overrideTurnId ?? nanoid();

    const sessionMeta = (session.metadata ?? {}) as Record<string, unknown>;
    const mcProfileId = sessionMeta.mcProfileId as string | null | undefined;
    const mcType = sessionMeta.mcType as string | undefined;

    const dyn = await DynamicStateManager.getOrCreate(session.id, character.id);
    const stage = determineStage(dyn.trustScore);

    const recallPolicy = shouldRecall(userText, session);
    const effectiveRagEnabled =
      session.ragEnabled &&
      (env.SMART_RECALL_POLICY_ENABLED ? recallPolicy.recall : true);

    const scanTail = ctx.history
      .slice(-4)
      .map((m) => m.content)
      .join('\n');

    const [
      personaResult,
      mcProfileResult,
      presetResult,
      pinnedResult,
      retrievedResult,
      transcriptRecallResult,
      loreResultSettled,
      memoryGraphResult,
    ] = await Promise.allSettled([
      (async () => {
        if (session.activePersonaId) {
          const row = await db.query.personas.findFirst({
            where: eq(schema.personas.id, session.activePersonaId),
            columns: { name: true, description: true, userId: true },
          });
          if (row && row.userId === ctx.userId) return { name: row.name, description: row.description };
        }
        const row = await db.query.personas.findFirst({
          where: and(
            eq(schema.personas.userId, ctx.userId),
            eq(schema.personas.isDefault, true),
          ),
          columns: { name: true, description: true },
        });
        return row ? { name: row.name, description: row.description } : null;
      })(),
      (async () => {
        if (mcProfileId && mcType === 'profile') {
          return await getMcProfileById(mcProfileId);
        }
        return null;
      })(),
      (async () => {
        if (session.activePresetId) {
          const row = await db.query.promptPresets.findFirst({
            where: eq(schema.promptPresets.id, session.activePresetId),
          });
          if (row && row.userId === ctx.userId) return row;
        }
        return await db.query.promptPresets.findFirst({
          where: and(
            eq(schema.promptPresets.userId, ctx.userId),
            eq(schema.promptPresets.isDefault, true),
          ),
        });
      })(),
      MemoryRetriever.listPinned(ctx.userId, character.id),
      effectiveRagEnabled
        ? MemoryRetriever.hybridSearchRRF({
            userId: ctx.userId,
            sessionId: session.id,
            characterId: character.id,
            query: userText,
            limit: 5,
            currentMood: session.moodState,
          })
        : Promise.resolve([]),
      (env.TRANSCRIPT_RECALL_ENABLED && effectiveRagEnabled && session.turnCount > 5 && isRecallQuery(userText))
        ? expandQuery(session.id, ctx.userId, userText, 3)
        : Promise.resolve([]),
      retrieveActiveLore({
        sessionId: session.id,
        userId: ctx.userId,
        scanText: `${scanTail}\n${userText}`.trim(),
        turnCount: session.turnCount,
        vectorSearch: effectiveRagEnabled,
      }),
      env.MEMORY_GRAPH_PROMPT_ENABLED
        ? queryGraph({
            userId: ctx.userId,
            characterNames: [character.name, `user:${ctx.userId}`],
            limit: 8,
            minConfidence: 0.4,
          })
        : Promise.resolve(null),
    ]);

    const activePersona = personaResult.status === 'fulfilled' ? personaResult.value : null;
    const mcProfile = mcProfileResult.status === 'fulfilled' ? mcProfileResult.value : null;
    const activePreset = presetResult.status === 'fulfilled' ? presetResult.value : null;
    const pinned = pinnedResult.status === 'fulfilled' ? pinnedResult.value : [];
    const retrieved = retrievedResult.status === 'fulfilled' ? retrievedResult.value : [];

    const effectiveUserName = activePersona?.name ?? ctx.userName;
    const effectiveUserPersonality = activePersona?.description ?? '';
    const storyMcPersonality = mcProfile
      ? [
          mcProfile.persona.personality,
          mcProfile.persona.appearance ? `Appearance: ${mcProfile.persona.appearance}` : null,
          mcProfile.persona.background ? `Background: ${mcProfile.persona.background}` : null,
          mcProfile.persona.speechStyle ? `Speech Style: ${mcProfile.persona.speechStyle}` : null,
        ].filter(Boolean).join('\n\n')
      : null;
    const effectiveMcName = mcProfile?.name ?? effectiveUserName;

    const userMsgId = nanoid();
    await db.insert(schema.chatMessages).values({
      id: userMsgId,
      sessionId: session.id,
      turnIndex: session.turnCount * 2,
      role: 'USER',
      speakerType: 'USER',
      speakerId: null,
      content: userText,
      passType: null,
      turnId,
      tokenCount: 0,
    });
    messageIds.push(userMsgId);

    let transcriptRecallSnippets: string[] = [];
    if (transcriptRecallResult.status === 'fulfilled' && transcriptRecallResult.value) {
      transcriptRecallSnippets = transcriptRecallResult.value.map((h) => {
        const prefix = `Turn ${h.turnIndex}`;
        if (h.kind === 'message') return `${prefix}: "${h.snippet.trim()}"`;
        const blob = h.expanded?.blobContent ? ` (full text available)` : '';
        return `${prefix} (summary): ${h.snippet.trim()}${blob}`;
      });
    }

    if (env.TRANSCRIPT_RECALL_ENABLED && isRecallQuery(userText) && session.turnCount > 5) {
      db.insert(schema.sessionEvents)
        .values({
          id: nanoid(),
          sessionId: session.id,
          userId: ctx.userId,
          characterId: character.id,
          eventType: 'transcript_recall',
          payload: {
            hits: transcriptRecallSnippets.length,
            gated: !effectiveRagEnabled,
          },
          turnIndex: session.turnCount,
        })
        .catch(() => {});
    }

    const loreResult = loreResultSettled.status === 'fulfilled' ? loreResultSettled.value : { entries: [], usedTokens: 0, lorebookIds: [], skipped: 0 };
    
    let memoryGraphLines: string[] | undefined;
    if (memoryGraphResult.status === 'fulfilled' && memoryGraphResult.value) {
      memoryGraphLines = memoryGraphResult.value.edges
        .map((e) => BaseOrchestrator.renderGraphEdge(e))
        .filter((s): s is string => !!s)
        .slice(0, 8);
      if (memoryGraphLines.length === 0) memoryGraphLines = undefined;
    }

    // Use MC profile personality for story sessions (overrides persona).
    // For anonymous or non-story sessions, fall back to persona personality.
    const finalUserPersonality = storyMcPersonality ?? effectiveUserPersonality;
    const finalUserName = mcProfile ? effectiveMcName : effectiveUserName;

    const systemPrompt = PromptBuilder.buildSystemPrompt({
      character,
      session,
      mode,
      userName: finalUserName,
      userPersonality: finalUserPersonality,
      personaName: activePersona?.name ?? null,
      castCharacters: ctx.castCharacters,
      trustScore: dyn.trustScore,
      nsfwEnabled: ctx.nsfwEnabled ?? false,
      turnCount: session.turnCount,
      language: (session.metadata?.language as string) || character.language || 'en',
      pinnedMemories: pinned,
      emotionalMemories: retrieved
        .filter((r) => r.emotionalTag)
        .map((r) => `[${r.emotionalTag}] ${r.content}`),
      memorySummary:
        retrieved
          .filter((r) => r.type === 'SUMMARY')
          .slice(0, 2)
          .map((r) => r.content)
          .join('\n\n') || undefined,
      loreFacts: retrieved.filter((r) => r.type === 'LORE').map((r) => r.content),
      loreContext: loreResult.entries,
      transcriptRecall: transcriptRecallSnippets.length ? transcriptRecallSnippets : undefined,
      memoryGraph: memoryGraphLines,
      promptStyle: ctx.byokModel
        ? (BYOK_MODEL_CATALOG.find((m) => m.id === ctx.byokModel)?.promptStyle as ByokModelPromptStyle | undefined)
        : undefined,
    });

    // PLANv3 X2.5 — edit_process regex stage: transform the assembled system
    // prompt. Applied after macros/lore assembly so scripts can rewrite
    // resolved text. Runs before extraSystem injection.
    const processScripts = await loadRegexScripts({
      userId: ctx.userId,
      placement: 'edit_process',
      characterId: character.id,
    });
    const finalSystemPrompt = processScripts.length
      ? runRegexScripts(systemPrompt, processScripts, { turnIndex: session.turnCount }).text
      : systemPrompt;

    const extraSystem: AiMessage[] = [];
    
    // PLANIMPv7 §2.1 — Halo 2.0 Drift Detection
    // Check last 2 assistant messages for tone drift. If found, inject a pro-active anchor.
    const recentAssistant = ctx.history
      .filter((m) => m.role === 'assistant')
      .slice(-2)
      .map((m) => m.content);
    let driftFound = false;
    for (const content of recentAssistant) {
      const drift = checkToneDrift(content, character, dyn.trustScore);
      if (drift.kind === 'drifting') {
        driftFound = true;
        extraSystem.push({
          role: 'system',
          content: `⚠️ [IDENTITY GUARD] Recent messages showed a drift in tone: "${drift.excerpt}". RE-ANCHOR NOW: ${drift.correctionText}`,
        });
        break;
      }
    }

    if (shouldAnchor(session.turnCount) && !driftFound) {
      extraSystem.push({
        role: 'system',
        content: buildAnchorInjection(character, stage, session.moodState),
      });
    }
    extraSystem.push({
      role: 'system',
      content: buildStagePromptInjection(stage, dyn.trustScore, character.name, {
        previousTrustScore: (session.metadata as Record<string, number> | null)?.previousTrust ?? dyn.trustScore,
        coreWound: character.background?.slice(0, 300) || undefined,
      }),
    });
    const continuityGuard = BaseOrchestrator.buildContinuityGuard(ctx.history, {
      characterName: character.name,
      stage,
      trustScore: dyn.trustScore,
      mood: session.moodState ?? dyn.mood,
      sceneState: ((session.metadata as Record<string, unknown> | null)?.sceneState ?? undefined) as Record<string, string> | undefined,
    });
    if (continuityGuard) {
      extraSystem.push({ role: 'system', content: continuityGuard });
    }

    // Day-3 callback injection: if a callback candidate was tagged earlier,
    // inject it as a subtle nudge once the conversation is well underway.
    if (session.callbackCandidate && session.turnCount >= 8 && session.turnCount % 8 === 0) {
      extraSystem.push({
        role: 'system',
        content: [
          `[CALLBACK] The user once said: "${session.callbackCandidate}"`,
          `Find a natural moment to reference this — as if you remembered on your own.`,
          `Do NOT quote it verbatim. Weave it into your response organically.`,
        ].join('\n'),
      });
    }

    // Session tick: time gap injection.
    const metadata = (session.metadata ?? {}) as Record<string, unknown>;
    const timeGapMinutes = Number(metadata.timeGapMinutes ?? 0);

    // ── Tension release for 1:1 ROLEPLAY ──
    if (mode === 'STORY') {
      const consecutiveEscalating = Number(metadata.consecutiveEscalatingTurns ?? 0);
      const tensionResult = checkTensionRelease({
        consecutiveEscalatingTurns: consecutiveEscalating,
        currentMood: session.moodState,
        characterName: character.name,
      });
      if (tensionResult.shouldRelease && tensionResult.promptInjection) {
        extraSystem.push({ role: 'system', content: tensionResult.promptInjection });
      }
      // Update counter for next turn.
      const newCount = updateEscalationCounter(consecutiveEscalating, session.moodState);
      db.execute(
        sql`UPDATE chat_sessions
            SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ consecutiveEscalatingTurns: newCount })}::jsonb
            WHERE id = ${session.id}`,
      ).catch(() => {});
    }
    if (timeGapMinutes >= 30) {
      const label =
        timeGapMinutes >= 1440
          ? `${Math.round(timeGapMinutes / 1440)} days`
          : timeGapMinutes >= 60
            ? `${Math.round(timeGapMinutes / 60)} hours`
            : `${timeGapMinutes} minutes`;
      extraSystem.push({
        role: 'system',
        content: `[TIME] It's been ${label} since the user last spoke. Acknowledge the gap naturally — don't say "welcome back." Perhaps reference what you were doing or thinking in the meantime.`,
      });
    }

    // ── Context compaction retrieval ─────────────────────────────────────
    // Inject highest-salience summaries of older transcript that was trimmed from history.
    if (session.turnCount >= 20) {
      const compactedSummaries = await retrieveCompactedContext(session.id, 4000);
      if (compactedSummaries.length > 0) {
        extraSystem.push({
          role: 'system',
          content: [
            '## Earlier Scene Context (summarized from older turns)',
            'These are compressed recaps of earlier events in this session. Use them for continuity but do NOT repeat them verbatim.',
            '',
            ...compactedSummaries.map((s, i) => `[${i + 1}] ${s}`),
          ].join('\n'),
        });
      }
    }

    // ── T4.1: Mistakes Registry injection ────────────────────────────────
    const mistakes = await recentMistakes(session.id, 3);
    const mistakesBlock = buildMistakesPromptBlock(mistakes);
    if (mistakesBlock) {
      extraSystem.push({ role: 'system', content: mistakesBlock });
    }

    // ── T4.3: Character Diary injection (cross-session) ──────────────────
    const diaryEntries = await retrieveDiaryEntries({
      characterId: character.id,
      userId: ctx.userId,
      limit: 2,
    });
    const diaryBlock = buildDiaryPromptBlock(diaryEntries, character.name);
    if (diaryBlock) {
      extraSystem.push({ role: 'system', content: diaryBlock });
    }

    // ── Wk7 F2: Narrative Director (heuristic stall detection) ───────────
    // ROLEPLAY only; pure statistical, no upstream call. One-line hint is
    // injected as a system message so F4 prompt snapshots can audit it.
    if (mode === 'STORY') {
      const recent = ctx.history.slice(-12).map<{ role: 'USER' | 'CHARACTER'; text: string }>((m) => ({
        role: m.role === 'user' ? 'USER' : 'CHARACTER',
        text: m.content,
      }));
      const hint = planNarrativeHint({
        recent,
        turnCount: session.turnCount,
      });
      if (hint) {
        extraSystem.push({
          role: 'system',
          content: formatNarrativeHintBlock(hint),
        });
      }
    }

    // Wk11 G2 — preset prelude is the last thing appended to extraSystem
    // so users can override/extend prior guards when they author a preset.
    if (activePreset && activePreset.systemPrelude.trim()) {
      extraSystem.push({
        role: 'system',
        content: `[PRESET PRELUDE]\n${activePreset.systemPrelude.trim()}`,
      });
    }

    const baseHistory: AiMessage[] = [
      { role: 'system', content: finalSystemPrompt },
      ...extraSystem,
      ...ctx.history,
      { role: 'user', content: userText },
    ];

    // v7 Bet C — Author's Note at depth. Inject a short in-character anchor 4
    // messages from the end so it dominates recency-biased attention. Skip for
    // very young sessions (no real history) where the system preamble is
    // already adjacent to the user turn.
    const baseAuthorsNote = buildAuthorsNote(character, stage);
    const presetAuthorsNote = activePreset?.authorsNote.trim() ?? '';
    const mergedAuthorsNote = presetAuthorsNote
      ? `${baseAuthorsNote}\n\n[PRESET AUTHOR'S NOTE]\n${presetAuthorsNote}`
      : baseAuthorsNote;
    const history: AiMessage[] =
      ctx.history.length >= 2
        ? injectAuthorsNoteAtDepth(baseHistory, mergedAuthorsNote)
        : baseHistory;

    if (mode === 'CAST') {
      await CastOrchestrator.execute({ ctx, emit, history, turnId, messageIds, allStats });
    } else {
      await StoryOrchestrator.execute({
        emit,
        history,
        session,
        character,
        turnId,
        messageIds,
        allStats,
        mode,
        userId: ctx.userId,
        userText,
        stage,
        byokKey: ctx.byokKey,
        byokModel: ctx.byokModel,
        initialTempBoost,
        trustScore: dyn.trustScore,
        presetSampling: activePreset
          ? { temperature: activePreset.temperature, topP: activePreset.topP }
          : null,
      });
    }

    // Stats → persistent state
    const relEvents: Array<{ characterId: string; newTrust: number; newStage: string }> = [];
    const aggregated: Array<{ characterId: string; key: string; delta: number; value: number }> = [];
    // Capture current trust before deltas for wound-disclosure detection next turn.
    const preTrustScore = dyn.trustScore;
    for (const s of allStats) {
      const targetCharId = s.characterId ?? character.id;
      if (s.trust !== undefined) {
        const res = await DynamicStateManager.applyStatDelta({
          sessionId: session.id,
          characterId: targetCharId,
          trustDelta: s.trust,
          moodLabel: s.mood ?? null,
        });
        aggregated.push({ characterId: targetCharId, key: 'trust', delta: s.trust, value: res.newTrust });
        if (res.stageChanged) {
          relEvents.push({ characterId: targetCharId, newTrust: res.newTrust, newStage: res.newStage });
        }
      }
      if (mode === 'CAST') {
        const { old, updated } = await HaremStatsRepo.applyDelta({
          sessionId: session.id,
          characterId: targetCharId,
          affection: s.affection,
          loyalty: s.loyalty,
          jealousy: s.jealousy,
          voice: s.voice,
        });
        for (const k of ['affection', 'loyalty', 'jealousy'] as const) {
          if (s[k] !== undefined) {
            aggregated.push({ characterId: targetCharId, key: k, delta: s[k] ?? 0, value: updated[k] });
          }
        }
        const targetChar = ctx.castCharacters.find((c) => c.id === targetCharId) ?? character;
        const milestone = checkStatMilestone(targetCharId, targetChar.name, old, updated);
        if (milestone.event) {
          await emit({
            type: 'milestone',
            characterId: targetCharId,
            event: milestone.event,
            message: milestone.diaryToastMessage,
          });
          // Section B: persist for timeline panel.
          db.insert(schema.sessionEvents).values({
            id: nanoid(),
            sessionId: session.id,
            userId: ctx.userId,
            characterId: targetCharId,
            eventType: 'milestone',
            payload: { event: milestone.event, message: milestone.diaryToastMessage },
            turnIndex: session.turnCount,
          }).catch(() => {});
        }
      }
    }
    if (aggregated.length) await emit({ type: 'stats', updates: aggregated });
    for (const ev of relEvents) {
      await emit({ type: 'relationship', ...ev });
      db.insert(schema.sessionEvents).values({
        id: nanoid(),
        sessionId: session.id,
        userId: ctx.userId,
        characterId: ev.characterId,
        eventType: 'relationship',
        payload: { newTrust: ev.newTrust, newStage: ev.newStage },
        turnIndex: session.turnCount,
      }).catch(() => {});
    }

    // Mood escalation (cast)
    if (mode === 'CAST') {
      const haremStatsNow = await HaremStatsRepo.list(session.id);
      const mood = evaluateMoodEscalation({
        turnCount: session.turnCount + 1,
        autoMoodEnabled: session.autoMoodEnabled,
        currentSceneTime: session.sessionTime,
        haremStats: haremStatsNow,
        moodNoise: session.moodNoise,
      });
      if (mood.newMood && mood.newMood !== session.moodState) {
        await db
          .update(schema.chatSessions)
          .set({ moodState: mood.newMood })
          .where(eq(schema.chatSessions.id, session.id));
        await emit({ type: 'mood', moodState: mood.newMood });
        db.insert(schema.sessionEvents).values({
          id: nanoid(),
          sessionId: session.id,
          userId: ctx.userId,
          characterId: character.id,
          eventType: 'mood',
          payload: { newMood: mood.newMood, previousMood: session.moodState },
          turnIndex: session.turnCount,
        }).catch(() => {});
      }
    }

    await db
      .update(schema.chatSessions)
      .set({ turnCount: session.turnCount + 1, lastMessageAt: new Date() })
      .where(eq(schema.chatSessions.id, session.id));

    // Persist previousTrust for wound-disclosure detection on next turn.
    db.execute(
      sql`UPDATE chat_sessions
          SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ previousTrust: preTrustScore })}::jsonb
          WHERE id = ${session.id}`,
    ).catch(() => {});

    // Clear time-gap marker after use so it doesn't re-inject next turn.
    if (timeGapMinutes >= 30) {
      db.execute(
        sql`UPDATE chat_sessions
            SET metadata = metadata::jsonb - 'timeGapMinutes'
            WHERE id = ${session.id}`,
      ).catch(() => {});
    }

    if (shouldSummarize(session.turnCount + 1)) {
      BaseOrchestrator.scheduleSummary(session, character, ctx.userId).catch(() => {});
    }

    await emit({ type: 'done', turnIndex: session.turnCount + 1, messageIds });

    PostTurnProcessor.execute({
      ctx,
      userText,
      messageIds,
      emit,
    });
  }
}