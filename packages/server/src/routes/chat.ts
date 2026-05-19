import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq, inArray, count, asc, ne } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { zSendTurn, AI_MODEL_CONFIG, DEFAULT_AI_MODEL } from '@neigo/shared';
import type { Character, ChatSession } from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { attachTier, canAddTurn, canAddTurnBudget, type TierVars } from '../middleware/tier.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { decryptByokKey } from '../lib/byok-crypto.js';
import { sseResponse, sseResumeResponse } from '../lib/sse.js';
import { BaseOrchestrator } from '../services/orchestrator/BaseOrchestrator.js';
import { Orchestrator } from '../services/orchestrator.js';
import { AiProxy, type AiMessage } from '../services/ai-proxy.js';
import { logSessionEvent } from '../services/session-event-log.js';

import {
  assertBudget,
  assertGlobalBudget,
  CostBudgetExceededError,
  GlobalCostBudgetExceededError,
  getUserDaily,
  getGlobalDaily,
} from '../services/cost-tracker.js';

import { runRegexScripts } from '@neigo/shared';
import { loadRegexScripts } from '../services/regex-scripts-loader.js';


export const chatRouter = new Hono<{ Variables: AuthVars & TierVars }>();
chatRouter.use('*', requireAuth);
chatRouter.use('*', attachTier);

// Per-user burst limiter for LLM-burning endpoints. Keyed on userId (set by
// requireAuth). Generous enough for normal typing, tight enough to stop abuse.
const perUserTurnLimiter = rateLimit({
  name: 'chat:turn',
  windowMs: 60_000,
  max: 20,
  keyFn: (c) => {
    const u = c.get('user') as { userId?: string } | undefined;
    return u?.userId ?? 'anon';
  },
});

/** Row → domain hydrators */
function rowToCharacter(row: typeof schema.characters.$inferSelect): Character {
  const persona = (row.persona ?? {}) as Record<string, unknown>;
  const asStr = (v: unknown) => (typeof v === 'string' ? v : '');
  const backstoryTiers = Array.isArray(persona.backstoryTiers)
    ? (persona.backstoryTiers as Array<{ minTrust: number; text: string }>)
    : undefined;
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    avatarUrl: row.avatarUrl,
    spriteSheetUrl: asStr(persona.spriteSheetUrl) || null,
    age: asStr(persona.age),
    gender: asStr(persona.gender),
    personality: asStr(persona.personality),
    speechStyle: asStr(persona.speechStyle),
    likes: asStr(persona.likes),
    dislikes: asStr(persona.dislikes),
    background: asStr(persona.background),
    worldInfo: asStr(persona.worldInfo),
    exampleDialogues: asStr(persona.exampleDialogues),
    jealousyExpression: asStr(persona.jealousyExpression),
    forbiddenTopics: asStr(persona.forbiddenTopics),
    relationshipType: asStr(persona.relationshipType),
    relationshipDescription: asStr(persona.relationshipDescription),
    tags: (row.tags as string[]) ?? [],
    folder: row.folder,
    tonePreset: row.tonePreset as Character['tonePreset'],
    isBuiltIn: row.isBuiltIn,
    isPublic: row.isPublic,
    birthday: asStr(persona.birthday) || null,
    coreTraits: asStr(persona.coreTraits),
    dynamicTraits: asStr(persona.dynamicTraits),
    verbalHabits: asStr(persona.verbalHabits),
    conflictStyle: asStr(persona.conflictStyle),
    backstoryTiers,
    language: (row.language ?? 'id') as Character['language'],
    languagesSpoken: Array.isArray(row.languagesSpoken) ? (row.languagesSpoken as string[]) : ['id'],
    isRetired: row.isRetired,
    allowInStories: row.allowInStories,
    contentRating: (row.contentRating ?? 'SFW') as 'SFW' | 'NSFW' | 'EXPLICIT',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToSession(row: typeof schema.chatSessions.$inferSelect): ChatSession {
  return {
    id: row.id,
    userId: row.userId,
    mode: row.mode as ChatSession['mode'],
    title: row.title,
    characterId: row.characterId,
    castCharacterIds: (row.castCharacterIds as string[]) ?? [],
    sceneCard: (row.sceneCard as ChatSession['sceneCard']) ?? ({} as ChatSession['sceneCard']),
    arcId: row.arcId,
    autoMoodEnabled: row.autoMoodEnabled,
    turnCount: row.turnCount,
    dramaIntensity: row.dramaIntensity,
    lastContextTokens: row.lastContextTokens,
    moodState: row.moodState,
    narratorVoice: row.narratorVoice as ChatSession['narratorVoice'],
    ragEnabled: row.ragEnabled,
    sessionDate: row.sessionDate,
    sessionTime: row.sessionTime,
    aiModel: row.aiModel,
    unresolvedBeat: row.unresolvedBeat,
    latentQuestion: row.latentQuestion,
    callbackCandidate: row.callbackCandidate,
    moodNoise: row.moodNoise,
    activePersonaId: row.activePersonaId ?? null,
    activePresetId: row.activePresetId ?? null,
    folderId: row.folderId ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    createdAt: row.createdAt.toISOString(),
    lastMessageAt: row.lastMessageAt.toISOString(),
  };
}

/**
 * GET /api/chat/stream/:streamId/resume?since=<n>
 *
 * Resume endpoint for a dropped SSE stream. Replays any buffered frames
 * with id > `since` from Redis and closes. Does NOT attach to an in-flight
 * orchestrator — if the original handler is still running the client sees
 * a `resume_paused` marker and should poll again with the latest event id.
 *
 * Auth: the streamId is a 16-char nanoid that is only emitted to the
 * authenticated client that opened the stream, so it functions as a
 * capability token. We still require a session to reject anonymous pokes.
 */
chatRouter.get('/stream/:streamId/resume', async (c) => {
  const streamId = c.req.param('streamId');
  if (!streamId || streamId.length < 8 || streamId.length > 64) {
    return c.json({ error: 'invalid_stream_id' }, 400);
  }
  const sinceRaw = c.req.query('since');
  const since = sinceRaw ? Math.max(0, Number.parseInt(sinceRaw, 10) || 0) : 0;
  return sseResumeResponse(c, streamId, since);
});

chatRouter.post('/:sessionId/turn', perUserTurnLimiter, zValidator('json', zSendTurn), async (c) => {
  const { userId } = c.get('user');
  const sessionId = c.req.param('sessionId');
  if (!sessionId) return c.json({ error: 'session_id_required' }, 400);
  const { content } = c.req.valid('json');
  if (typeof content !== 'string' || content.trim().length === 0) {
    return c.json({ error: 'invalid_content', message: 'Message content cannot be empty.' }, 400);
  }

  const sessionRow = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.userId, userId)),
  });
  if (!sessionRow) return c.json({ error: 'session_not_found' }, 404);

  const tier = c.get('tier');
  const turnCheck = canAddTurn(sessionRow.turnCount, tier);
  if (!turnCheck.allowed) {
    return c.json({ error: 'tier_limit', message: turnCheck.reason }, 403);
  }
  const dailyCheck = await canAddTurnBudget(userId, tier);
  if (!dailyCheck.allowed) {
    return c.json({ error: 'tier_limit', message: dailyCheck.reason }, 403);
  }
  // v7 circuit breaker: per-user daily cost cap.
  try {
    assertGlobalBudget();
    assertBudget(userId);
  } catch (err) {
    if (err instanceof GlobalCostBudgetExceededError) {
      const snap = getGlobalDaily();
      return c.json(
        {
          error: 'global_cost_budget_exceeded',
          message: 'Global AI budget is currently exhausted. Please try again later.',
          usedCents: snap.cents,
          resetAt: snap.resetAt,
        },
        503,
      );
    }
    if (err instanceof CostBudgetExceededError) {
      const snap = getUserDaily(userId);
      return c.json(
        {
          error: 'cost_budget_exceeded',
          message: 'Daily cost budget reached. Try again tomorrow.',
          usedCents: snap.cents,
          resetAt: snap.resetAt,
        },
        402,
      );
    }
    throw err;
  }

  const mainCharRow = await db.query.characters.findFirst({
    where: eq(schema.characters.id, sessionRow.characterId),
  });
  if (!mainCharRow) return c.json({ error: 'character_not_found' }, 404);

  const castIds = (sessionRow.castCharacterIds as string[]) ?? [];
  const castRows = castIds.length
    ? await db.query.characters.findMany({ where: inArray(schema.characters.id, castIds) })
    : [];

  const userRow = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });

  // Resolve BYOK credentials (decrypt only if key is stored and encryption is available)
  let byokKey: string | undefined;
  let byokModel: string | undefined;
  if (userRow?.byokOrKeyEnc) {
    try {
      byokKey = decryptByokKey(userRow.byokOrKeyEnc);
      byokModel = userRow.byokModel ?? undefined;
    } catch {
      // Decryption failed (e.g. key rotation) — silently fall back to server key
      byokKey = undefined;
    }
  }

  const session = rowToSession(sessionRow);
  const character = rowToCharacter(mainCharRow);
  const castCharacters = castRows.map(rowToCharacter);
  const history = await BaseOrchestrator.loadHistory(sessionId);

  // PLANv3 X2.5 — edit_input regex stage: mutate the stored user turn.
  // Prompt-only scripts are skipped here (excludePromptOnly) — they fire
  // later during edit_process so DB keeps the raw text.
  const inputScripts = await loadRegexScripts({
    userId,
    placement: 'edit_input',
    characterId: sessionRow.characterId,
  });
  const editedContent = inputScripts.length
    ? runRegexScripts(content, inputScripts, {
        turnIndex: sessionRow.turnCount,
        excludePromptOnly: true,
      }).text
    : content;

  logSessionEvent({
    sessionId,
    userId,
    characterId: sessionRow.characterId,
    eventType: 'turn_submitted',
    payload: { contentLen: editedContent.length },
    turnIndex: sessionRow.turnCount,
  });

  return sseResponse(c, async (emit, { streamId }) => {
    // Advertise the streamId so a client that loses its connection mid-turn
    // can reconnect via /api/chat/stream/:streamId/resume?since=<lastEventId>.
    await emit({ type: 'stream_ready', streamId });
    await Orchestrator.runTurn({
      ctx: {
        session,
        character,
        castCharacters,
        userName: userRow?.displayName ?? 'User',
        userId,
        history,
        byokKey,
        byokModel,
        nsfwEnabled: (userRow?.nsfwEnabled ?? false) && (userRow?.ageConfirmed ?? false),
      },
      userText: editedContent,
      emit: async (evt) => emit(evt as unknown as Parameters<typeof emit>[0]),
    });
  });
});

/**
 * POST /api/chat/:sessionId/open
 *
 * Silent scene-set for a brand-new session (turnCount === 0). Streams
 * a narrator beat + character beat before the user says anything.
 * Per brainstorm Part 2, Screen 2 — the character is already mid-thought.
 * Idempotent: returns 200 {} if already opened (turnCount > 0).
 */
chatRouter.post('/:sessionId/open', perUserTurnLimiter, async (c) => {
  const { userId } = c.get('user');
  const sessionId = c.req.param('sessionId');
  if (!sessionId) return c.json({ error: 'session_id_required' }, 400);

  const sessionRow = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.userId, userId)),
  });
  if (!sessionRow) return c.json({ error: 'session_not_found' }, 404);

  // Idempotent — only fire if no messages exist yet.
  const [row] = await db
    .select({ cnt: count() })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.sessionId, sessionId));
  if (row && row.cnt > 0) return c.json({});

  const mainCharRow = await db.query.characters.findFirst({
    where: eq(schema.characters.id, sessionRow.characterId),
  });
  if (!mainCharRow) return c.json({ error: 'character_not_found' }, 404);
  const character = rowToCharacter(mainCharRow);

  const slug = AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug;

  return sseResponse(c, async (emit) => {
    // ── Narrator beat (2 sentences) ──────────────────────────────────
    const narratorPrompt = [
      `You are an omniscient narrator (voice: CINEMATIC).`,
      `Character in scene: ${character.name}. Personality: ${character.personality.slice(0, 200)}`,
      character.background ? `Background: ${character.background.slice(0, 200)}` : '',
      '',
      'Write exactly 2 sentences of atmospheric prose. Third person past tense.',
      'Set a sensory scene: mention at least one concrete detail (light, sound, temperature, smell).',
      'The character is already here, already thinking. Do NOT mention the user/reader arriving.',
      'No dialogue. No greeting. No exclamation points.',
    ].filter(Boolean).join('\n');

    const narratorMsgId = nanoid();
    let narratorBuf = '';
    for await (const chunk of AiProxy.stream({
      model: slug,
      messages: [{ role: 'system', content: narratorPrompt }],
      temperature: 0.75,
      maxTokens: 150,
    })) {
      narratorBuf += chunk;
      await emit({
        type: 'narrator',
        characterId: null,
        chunk,
        passType: 'NARRATOR',
        messageId: narratorMsgId,
      } as unknown as Parameters<typeof emit>[0]);
    }

    await db.insert(schema.chatMessages).values({
      id: narratorMsgId,
      sessionId,
      turnIndex: 0,
      role: 'ASSISTANT',
      speakerType: 'NARRATOR',
      speakerId: null,
      content: narratorBuf.trim(),
      passType: 'NARRATOR',
      turnId: nanoid(),
      tokenCount: 0,
    });

    // ── Character beat (1 sentence, mid-thought) ────────────────────
    const charPrompt = [
      `You are ${character.name}. ${character.personality.slice(0, 300)}`,
      character.speechStyle ? `Speech style: ${character.speechStyle}` : '',
      '',
      'Write ONE sentence of dialogue or internal thought. You are mid-thought.',
      'Do NOT greet the user. Do NOT introduce yourself.',
      'Use hesitation: "..." or em-dash or a half-sentence.',
      'No exclamation points. No meta-framing.',
    ].filter(Boolean).join('\n');

    const charMsgId = nanoid();
    let charBuf = '';
    for await (const chunk of AiProxy.stream({
      model: slug,
      messages: [
        { role: 'system', content: charPrompt },
        { role: 'assistant', content: narratorBuf.trim() },
      ],
      temperature: 0.85,
      maxTokens: 100,
    })) {
      charBuf += chunk;
      await emit({
        type: 'character',
        characterId: character.id,
        chunk,
        passType: 'CHARACTER_MAIN',
        messageId: charMsgId,
      } as unknown as Parameters<typeof emit>[0]);
    }

    await db.insert(schema.chatMessages).values({
      id: charMsgId,
      sessionId,
      turnIndex: 1,
      role: 'ASSISTANT',
      speakerType: 'CHARACTER',
      speakerId: character.id,
      content: charBuf.trim(),
      passType: 'CHARACTER_MAIN',
      turnId: nanoid(),
      tokenCount: 0,
    });

    // Mark session as opened (turnCount = 2 for narrator + character)
    await db.update(schema.chatSessions)
      .set({ turnCount: 2 })
      .where(eq(schema.chatSessions.id, sessionId));

    await emit({ type: 'done', turnIndex: 0, messageIds: [narratorMsgId, charMsgId] } as unknown as Parameters<typeof emit>[0]);
  });
});

// ── Continue truncated response ──────────────────────────────────────
// POST /api/chat/:sessionId/continue
// When the model's response was cut off (max tokens or network), the user
// can request a continuation. This appends to the last AI message.
chatRouter.post('/:sessionId/continue', perUserTurnLimiter, async (c) => {
  const { userId } = c.get('user');
  const sessionId = c.req.param('sessionId');
  if (!sessionId) return c.json({ error: 'session_id_required' }, 400);

  const sessionRow = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.userId, userId)),
  });
  if (!sessionRow) return c.json({ error: 'session_not_found' }, 404);

  // Guard: session must have at least one completed turn
  if (sessionRow.turnCount === 0) {
    return c.json({ error: 'session_not_started', message: 'No conversation to continue. Send a message first.' }, 400);
  }

  // Get the last AI message
  const lastMsg = await db.query.chatMessages.findFirst({
    where: and(
      eq(schema.chatMessages.sessionId, sessionId),
      eq(schema.chatMessages.role, 'ASSISTANT'),
    ),
    orderBy: (m, { desc }) => [desc(m.turnIndex)],
  });
  if (!lastMsg) return c.json({ error: 'no_message_to_continue', message: 'No AI response found to continue.' }, 400);

  const mainCharRow = await db.query.characters.findFirst({
    where: eq(schema.characters.id, sessionRow.characterId),
  });
  if (!mainCharRow) return c.json({ error: 'character_not_found' }, 404);
  const character = rowToCharacter(mainCharRow);

  // Load recent history for context
  const recentMsgs = await db.query.chatMessages.findMany({
    where: eq(schema.chatMessages.sessionId, sessionId),
    orderBy: asc(schema.chatMessages.turnIndex),
    limit: 20,
  });
  const history = recentMsgs.map((m) => ({
    role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }));

  const slug = AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug;

  return sseResponse(c, async (emit) => {
    const continuePrompt: AiMessage = {
      role: 'system',
      content: [
        `You are ${character.name}. Continue the scene from where the previous response ended.`,
        'Start a NEW paragraph — do NOT repeat anything already written.',
        'Do NOT add meta-commentary or summaries of what happened before.',
        'Write the next beat of the scene: advance the action, dialogue, or emotion naturally.',
        `The previous response ended with: "...${lastMsg.content.slice(-200)}"`,
        'Begin a fresh paragraph continuing from there:',
      ].join('\n'),
    };

    const result = AiProxy.stream({
      model: slug,
      messages: [...history, continuePrompt],
      temperature: 0.6,
      maxTokens: 1500,
    });

    const chunks: string[] = [];
    for await (const chunk of result) {
      chunks.push(chunk);
      await emit({ type: 'character', messageId: lastMsg.id, chunk, characterId: character.id, passType: 'CHARACTER_MAIN' });
    }

    const continuation = chunks.join('');
    if (continuation.length > 0) {
      // Append continuation as a new paragraph to the existing message.
      await db
        .update(schema.chatMessages)
        .set({ content: lastMsg.content + '\n\n' + continuation })
        .where(eq(schema.chatMessages.id, lastMsg.id));
    }

    await emit({ type: 'done', continued: true, turnIndex: -1, messageIds: [lastMsg.id] });
  });
});

// ── Section B: Regenerate last assistant turn ─────────────────────────
// POST /api/chat/:sessionId/regenerate
// Hard-deletes the last turn (user + assistant rows), decrements turn_count,
// then re-runs the orchestrator with the original user text and a small
// temperature boost. Net turn-budget impact is zero (delete auto-refunds
// the window, the re-run increments it back). OR cost IS charged again.
chatRouter.post('/:sessionId/regenerate', perUserTurnLimiter, async (c) => {
  const { userId } = c.get('user');
  const sessionId = c.req.param('sessionId');
  if (!sessionId) return c.json({ error: 'session_id_required' }, 400);

  const sessionRow = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.userId, userId)),
  });
  if (!sessionRow) return c.json({ error: 'session_not_found' }, 404);

  // Budget checks — regenerate still costs OR tokens, so enforce cost gates.
  try {
    assertGlobalBudget();
    assertBudget(userId);
  } catch (err) {
    if (err instanceof GlobalCostBudgetExceededError) {
      const snap = getGlobalDaily();
      return c.json(
        {
          error: 'global_cost_budget_exceeded',
          message: 'Global AI budget is currently exhausted. Please try again later.',
          usedCents: snap.cents,
          resetAt: snap.resetAt,
        },
        503,
      );
    }
    if (err instanceof CostBudgetExceededError) {
      const snap = getUserDaily(userId);
      return c.json(
        {
          error: 'cost_budget_exceeded',
          message: 'Daily cost budget reached. Try again tomorrow.',
          usedCents: snap.cents,
          resetAt: snap.resetAt,
        },
        402,
      );
    }
    throw err;
  }

  // Find the last USER message to identify the turn to regenerate.
  const lastUser = await db.query.chatMessages.findFirst({
    where: and(
      eq(schema.chatMessages.sessionId, sessionId),
      eq(schema.chatMessages.speakerType, 'USER'),
    ),
    orderBy: (m, { desc }) => [desc(m.turnIndex)],
  });
  if (!lastUser) return c.json({ error: 'no_turns' }, 400);

  const userText = lastUser.content;

  logSessionEvent({
    sessionId,
    userId,
    characterId: sessionRow.characterId,
    eventType: 'regen',
    payload: { turnId: lastUser.turnId ?? null, tempBoost: 0.12 },
    turnIndex: lastUser.turnIndex,
  });

  // Wk10 G3a — preserve prior assistant rows as inactive swipe siblings
  // instead of hard-deleting them. We:
  //   1. Collect all current assistant rows for the last turn.
  //   2. Resolve the swipe family root (first row's id, or existing root).
  //   3. Mark them inactive and tag their swipeRoot.
  //   4. Delete ONLY the user message (orchestrator re-inserts it).
  //   5. Decrement turnCount so runTurn re-indexes correctly.
  //   6. Tag freshly-generated assistant rows (same new turnId) with
  //      the family's next swipeIndex after the orchestrator finishes.
  const priorAssistantRows = lastUser.turnId
    ? await db.query.chatMessages.findMany({
        where: and(
          eq(schema.chatMessages.sessionId, sessionId),
          eq(schema.chatMessages.turnId, lastUser.turnId),
          ne(schema.chatMessages.speakerType, 'USER'),
        ),
        orderBy: (m, { asc }) => [asc(m.swipeIndex), asc(m.turnIndex)],
      })
    : [];

  const existingRoot =
    priorAssistantRows.find((r) => r.swipeRoot)?.swipeRoot ??
    priorAssistantRows[0]?.id ??
    null;
  const maxSwipeIndex = priorAssistantRows.reduce(
    (max, r) => Math.max(max, r.swipeIndex),
    -1,
  );
  const nextSwipeIndex = maxSwipeIndex + 1;

  if (priorAssistantRows.length > 0 && existingRoot) {
    await db
      .update(schema.chatMessages)
      .set({ isActive: false, swipeRoot: existingRoot })
      .where(
        and(
          eq(schema.chatMessages.sessionId, sessionId),
          eq(schema.chatMessages.turnId, lastUser.turnId!),
          ne(schema.chatMessages.speakerType, 'USER'),
        ),
      );
  }

  // Delete ONLY the user row (orchestrator will re-insert it).
  await db
    .delete(schema.chatMessages)
    .where(eq(schema.chatMessages.id, lastUser.id));

  // Decrement turn_count so runTurn re-indexes the re-inserted user message
  // at the correct slot.
  await db
    .update(schema.chatSessions)
    .set({ turnCount: Math.max(0, sessionRow.turnCount - 1), lastMessageAt: new Date() })
    .where(eq(schema.chatSessions.id, sessionId));

  // Re-load freshest state (post-decrement).
  const freshSessionRow = await db.query.chatSessions.findFirst({
    where: eq(schema.chatSessions.id, sessionId),
  });
  if (!freshSessionRow) return c.json({ error: 'session_not_found' }, 404);

  const mainCharRow = await db.query.characters.findFirst({
    where: eq(schema.characters.id, freshSessionRow.characterId),
  });
  if (!mainCharRow) return c.json({ error: 'character_not_found' }, 404);

  const castIds = (freshSessionRow.castCharacterIds as string[]) ?? [];
  const castRows = castIds.length
    ? await db.query.characters.findMany({ where: inArray(schema.characters.id, castIds) })
    : [];

  const userRow = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  let byokKey: string | undefined;
  let byokModel: string | undefined;
  if (userRow?.byokOrKeyEnc) {
    try {
      byokKey = decryptByokKey(userRow.byokOrKeyEnc);
      byokModel = userRow.byokModel ?? undefined;
    } catch {
      byokKey = undefined;
    }
  }

  const session = rowToSession(freshSessionRow);
  const character = rowToCharacter(mainCharRow);
  const castCharacters = castRows.map(rowToCharacter);
  const history = await BaseOrchestrator.loadHistory(sessionId);

  // Wk10 G3a — new turn id threaded through so we can retag newly-inserted
  // assistant rows with swipe metadata after runTurn completes.
  const newTurnId = nanoid();

  return sseResponse(c, async (emit) => {
    await Orchestrator.runTurn({
      ctx: {
        session,
        character,
        castCharacters,
        userName: userRow?.displayName ?? 'User',
        userId,
        history,
        byokKey,
        byokModel,
        nsfwEnabled: (userRow?.nsfwEnabled ?? false) && (userRow?.ageConfirmed ?? false),
      },
      userText,
      initialTempBoost: 0.12,
      overrideTurnId: newTurnId,
      emit: async (evt) => emit(evt as unknown as Parameters<typeof emit>[0]),
    });
    // After the stream settles, tag the fresh assistant rows with the
    // swipe family metadata. (User row of the new turn shares this turnId
    // but speakerType=USER, so we scope the update to non-user rows.)
    if (existingRoot) {
      try {
        await db
          .update(schema.chatMessages)
          .set({ swipeRoot: existingRoot, swipeIndex: nextSwipeIndex, isActive: true })
          .where(
            and(
              eq(schema.chatMessages.sessionId, sessionId),
              eq(schema.chatMessages.turnId, newTurnId),
              ne(schema.chatMessages.speakerType, 'USER'),
            ),
          );
      } catch (err) {
        console.warn('[regenerate] swipe tag failed:', err);
      }
    }
  });
});



