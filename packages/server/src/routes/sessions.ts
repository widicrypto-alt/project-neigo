import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { zCreateSession, DEFAULT_AI_MODEL, AI_MODEL_CONFIG, BETA_CHAT_MODES, BYOK_MODEL_CATALOG, TIER_CONFIG } from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { attachTier, canCreateSession, type TierVars } from '../middleware/tier.js';
import { formatAutoSessionTitle } from '../lib/session-title.js';
import { AiProxy } from '../services/ai-proxy.js';
import { logSessionEvent } from '../services/session-event-log.js';
import { cancelSessionJobs, scheduleNudge, scheduleReturn } from '../lib/session-workers.js';
import { retrieveActiveLore } from '../services/lorebook/retriever.js';
import { readFreshWakeUpPacket } from '../services/context-maintenance.js';

export const sessionsRouter = new Hono<{ Variables: AuthVars & TierVars }>();
sessionsRouter.use('*', requireAuth);
sessionsRouter.use('*', attachTier);

// GET /api/sessions/quick-nav
sessionsRouter.get('/quick-nav', async (c) => {
  const { userId } = c.get('user');
  
  // Return limit 10 sessions, sorted by lastMessageAt, prioritizing pinned sessions.
  const rows = await db
    .select()
    .from(schema.chatSessions)
    .where(eq(schema.chatSessions.userId, userId))
    .orderBy(desc(schema.chatSessions.isPinned), desc(schema.chatSessions.lastMessageAt))
    .limit(10);

  const sessions = await Promise.all(
    rows.map(async (row) => {
      const lastMessage = await db.query.chatMessages.findFirst({
        where: eq(schema.chatMessages.sessionId, row.id),
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
      });
      const character = await db.query.characters.findFirst({
        where: and(
          eq(schema.characters.id, row.characterId),
          sql`${schema.characters.deletedAt} IS NULL`,
        ),
        columns: { name: true },
      });
      return {
        id: row.id,
        title: row.title,
        characterId: row.characterId,
        characterName: character?.name ?? null,
        mode: row.mode,
        isPinned: row.isPinned,
        lastMessagePreview: lastMessage?.content.slice(0, 100) ?? null,
        lastMessageSpeakerType: lastMessage?.speakerType ?? null,
        lastMessageAt: lastMessage?.createdAt ?? null,
        autoMoodEnabled: row.autoMoodEnabled,
      };
    }),
  );

  return c.json({ sessions });
});

sessionsRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const folderParam = c.req.query('folderId');
  // "null" or "none" query value asks for sessions without a folder.
  const whereClause =
    folderParam === 'null' || folderParam === 'none'
      ? and(
          eq(schema.chatSessions.userId, userId),
          sql`${schema.chatSessions.folderId} IS NULL`,
        )
      : folderParam
        ? and(
            eq(schema.chatSessions.userId, userId),
            eq(schema.chatSessions.folderId, folderParam),
          )
        : eq(schema.chatSessions.userId, userId);
  const rows = await db
    .select()
    .from(schema.chatSessions)
    .where(whereClause)
    .orderBy(desc(schema.chatSessions.lastMessageAt))
    .limit(100);

  const sessions = await Promise.all(
    rows.map(async (row) => {
      const lastMessage = await db.query.chatMessages.findFirst({
        where: eq(schema.chatMessages.sessionId, row.id),
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
      });
      const character = await db.query.characters.findFirst({
        where: and(
          eq(schema.characters.id, row.characterId),
          sql`${schema.characters.deletedAt} IS NULL`,
        ),
      });
      const lastMsg = lastMessage?.createdAt ?? row.lastMessageAt;
      const daysSinceActivity = Math.floor(
        (Date.now() - new Date(lastMsg).getTime()) / (24 * 60 * 60 * 1000),
      );
      return {
        ...row,
        title: formatAutoSessionTitle({
          title: row.title,
          mode: row.mode,
          characterName: character?.name ?? null,
          createdAt: row.createdAt,
        }),
        characterName: character?.name ?? null,
        lastMessagePreview: lastMessage?.content ?? null,
        lastMessageSpeakerType: lastMessage?.speakerType ?? null,
        lastMessageAt: lastMsg,
        expiringInDays: daysSinceActivity >= 5 ? 7 - daysSinceActivity : null,
      };
    }),
  );

  return c.json({ sessions });
});

sessionsRouter.post('/', zValidator('json', zCreateSession), async (c) => {
  const { userId } = c.get('user');
  const tier = c.get('tier');
  const check = await canCreateSession(userId, tier);
  if (!check.allowed) {
    return c.json({ error: 'tier_limit', message: check.reason }, 403);
  }
  const input = c.req.valid('json');
  const tierCfg = TIER_CONFIG[tier];
  if (input.mode === 'CAST' && !tierCfg.castModeEnabled) {
    return c.json(
      {
        error: 'mode_not_available',
        message: 'CAST mode requires a higher tier.',
        allowedModes: BETA_CHAT_MODES,
      },
      403,
    );
  }
  if (!BETA_CHAT_MODES.includes(input.mode) && input.mode !== 'CAST') {
    return c.json(
      {
        error: 'mode_not_available',
        message: `Mode ${input.mode} is not available.`,
        allowedModes: BETA_CHAT_MODES,
      },
      403,
    );
  }
  const id = nanoid();
  const character = await db.query.characters.findFirst({
    where: and(
      eq(schema.characters.id, input.characterId),
      sql`${schema.characters.deletedAt} IS NULL`,
    ),
  });
  if (!character) {
    return c.json({ error: 'character_not_found', message: 'Character is no longer available.' }, 404);
  }
  const createdAt = new Date();
  const resolvedTitle = formatAutoSessionTitle({
    title: input.title,
    mode: input.mode,
    characterName: character?.name ?? null,
    createdAt,
  });
  // Random mood noise 0..0.15 — gives each session a subtle personality variance.
  const moodNoise = Math.round(Math.random() * 0.15 * 1000) / 1000;
  // Section C: per-session model override. Accept either an AI_MODEL key
  // (default-tier) or a BYOK catalog slug. Anything else falls back to the
  // tier default so a malformed client can't wedge a session into an
  // unreachable model.
  const resolvedAiModel = (() => {
    const candidate = input.aiModel;
    if (!candidate) return DEFAULT_AI_MODEL;
    if (candidate in AI_MODEL_CONFIG) return candidate;
    if (BYOK_MODEL_CATALOG.some((m) => m.id === candidate)) return candidate;
    return DEFAULT_AI_MODEL;
  })();
  await db.insert(schema.chatSessions).values({
    id,
    userId,
    characterId: input.characterId,
    mode: input.mode,
    title: resolvedTitle,
    castCharacterIds: input.castCharacterIds,
    sceneCard: input.sceneCard,
    aiModel: resolvedAiModel,
    moodNoise,
    createdAt,
    lastMessageAt: createdAt,
    metadata: {
      contentRating: character?.contentRating ?? 'SFW',
    },
  });
  const row = await db.query.chatSessions.findFirst({ where: eq(schema.chatSessions.id, id) });
  return c.json({ session: row });
});

sessionsRouter.get('/:id', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const row = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!row) return c.json({ error: 'not_found' }, 404);
  // BACKLOG B1.5 — include pre-warmed wake-up packet when fresh, so the
  // FE can render a greeting or pass it into the first turn's system prompt.
  const wakeUpPacket = await readFreshWakeUpPacket(id);
  return c.json({ session: row, wakeUpPacket });
});

// v7 #18/#19: session state snapshot for header pill + First Meeting card.
sessionsRouter.get('/:id/state', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  // Character dynamic state (trust, stage, mood). May be absent on a fresh
  // session before the first turn — return sensible defaults in that case.
  const dyn = await db.query.characterDynamicStates.findFirst({
    where: and(
      eq(schema.characterDynamicStates.sessionId, id),
      eq(schema.characterDynamicStates.characterId, session.characterId),
    ),
  });

  // Pinned memory count for "First Meeting" card footer ("N pinned moments").
  const pinned = await db
    .select({ id: schema.memories.id, content: schema.memories.content })
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.sessionId, id),
        eq(schema.memories.type, 'PINNED'),
      ),
    )
    .orderBy(desc(schema.memories.importance), desc(schema.memories.createdAt))
    .limit(5);

  const character = await db.query.characters.findFirst({
    where: and(
      eq(schema.characters.id, session.characterId),
      sql`${schema.characters.deletedAt} IS NULL`,
    ),
    });

    return c.json({

    trustScore: dyn?.trustScore ?? 0,
    relationshipStage: dyn?.lastRelationshipStage ?? 'STRANGER',
    mood: dyn?.mood ?? session.moodState ?? 'NEUTRAL',
    pinnedMemoryCount: pinned.length,
    pinnedMoments: pinned.map((item) => item.content),
    firstMeetingAt: session.createdAt,
    characterName: character?.name ?? null,
  });
});

sessionsRouter.get('/:id/messages', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);
  const rows = await db
    .select()
    .from(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.sessionId, id),
        eq(schema.chatMessages.isActive, true),
      ),
    )
    .orderBy(schema.chatMessages.turnIndex);

  // Wk10 G3a — attach swipe family counts so the client can render "N/M"
  // chevrons without an extra round-trip per bubble. Only rows that have
  // siblings get annotated; everything else keeps count=1.
  const rootIds = new Set<string>();
  for (const r of rows) {
    if (r.speakerType === 'USER') continue;
    rootIds.add(r.swipeRoot ?? r.id);
  }
  let familyCounts = new Map<string, number>();
  if (rootIds.size > 0) {
    const roots = Array.from(rootIds);
    const countRows = await db
      .select({
        rootId: sql<string>`COALESCE(${schema.chatMessages.swipeRoot}, ${schema.chatMessages.id})`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.chatMessages)
      .where(
        and(
          eq(schema.chatMessages.sessionId, id),
          or(
            inArray(schema.chatMessages.id, roots),
            inArray(schema.chatMessages.swipeRoot, roots),
          ),
        ),
      )
      .groupBy(
        sql`COALESCE(${schema.chatMessages.swipeRoot}, ${schema.chatMessages.id})`,
      );
    familyCounts = new Map(countRows.map((r) => [r.rootId, r.count]));
  }
  const messages = rows.map((r) => ({
    ...r,
    swipeCount:
      r.speakerType === 'USER' ? 1 : familyCounts.get(r.swipeRoot ?? r.id) ?? 1,
  }));
  return c.json({ messages });
});

// ── MARINARA H2 — World Info Inspector ───────────────────────────────
// GET /:id/active-lore
//   Returns the lorebook entries that WOULD be injected given the last
//   N messages as scan haystack. Used by the Inspector side-panel so
//   creators can see which keywords/entries matched and what the token
//   budget is consuming.
sessionsRouter.get('/:id/active-lore', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
    columns: { id: true, turnCount: true },
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  // Scan haystack = last 8 messages concatenated.
  const recent = await db
    .select({ content: schema.chatMessages.content })
    .from(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.sessionId, id),
        eq(schema.chatMessages.isActive, true),
      ),
    )
    .orderBy(desc(schema.chatMessages.createdAt))
    .limit(8);
  const scanText = recent.map((r) => r.content).reverse().join('\n\n');

  const result = await retrieveActiveLore({
    sessionId: id,
    userId,
    scanText: scanText || '(empty)',
    turnCount: session.turnCount,
  });
  return c.json(result);
});

// POST /api/sessions/suggest-scene
// Generates scene fields (location, time, weather, mood, userRole, language)
// from a character persona + optional premise using the AI.
const zSuggestScene = z.object({
  characterId: z.string().min(1),
  premise: z.string().max(400).optional(),
  mode: z.string().optional(),
});

sessionsRouter.post('/suggest-scene', zValidator('json', zSuggestScene), async (c) => {
  const { userId } = c.get('user');
  const { characterId, premise, mode } = c.req.valid('json');

  const char = await db.query.characters.findFirst({
    where: and(
      eq(schema.characters.id, characterId),
      or(eq(schema.characters.ownerId, userId), eq(schema.characters.isPublic, true)),
    ),
  });
  if (!char) return c.json({ error: 'not_found' }, 404);

  // persona is jsonb — extract text fields for the AI prompt
  const personaObj = (char.persona ?? {}) as Record<string, unknown>;
  const personaText = [
    personaObj.personality,
    personaObj.speechStyle,
    personaObj.worldInfo,
    personaObj.background,
  ]
    .filter((v) => typeof v === 'string' && (v as string).length > 0)
    .map((v) => v as string)
    .join('\n')
    .slice(0, 800);

  const systemPrompt = `You are a creative writing assistant. Generate a brief scene setup for a ${mode ?? 'STORY'} session with a character named "${char.name}".
Respond ONLY with valid JSON matching this exact schema:
{"location":"string","time":"string","weather":"string","mood":"string","userRole":"string","language":"string"}
- location: a specific place (e.g. "Rain-soaked rooftop garden")
- time: time of day/night (e.g. "Late midnight")
- weather: weather condition (e.g. "Light drizzle")
- mood: emotional atmosphere (e.g. "Tense but tender")
- userRole: who the user plays (e.g. "A colleague she barely trusts yet")
- language: language for the scene (e.g. "Indonesian" or "English")
Keep each field to 1-6 words. Match the character's tone and world.`;

  const userMsg = premise
    ? `Character persona: ${personaText}\n\nPremise: ${premise}\n\nGenerate a scene setup that fits this premise and character.`
    : `Character persona: ${personaText}\n\nGenerate a scene setup that suits this character's personality and setting.`;

  try {
    const result = await AiProxy.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.85,
      maxTokens: 200,
      model: AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug,
    });

    // Parse the JSON from the AI response (strip markdown fences if present)
    const raw = result.content.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    let scene: Record<string, string>;
    try {
      scene = JSON.parse(raw) as Record<string, string>;
    } catch {
      // Fallback: extract any JSON object from the response
      const match = raw.match(/\{[^}]+\}/s);
      scene = match ? (JSON.parse(match[0]) as Record<string, string>) : {};
    }

    return c.json({
      location: String(scene.location ?? ''),
      time: String(scene.time ?? ''),
      weather: String(scene.weather ?? ''),
      mood: String(scene.mood ?? ''),
      userRole: String(scene.userRole ?? ''),
      language: String(scene.language ?? ''),
    });
  } catch (err) {
    console.error('[suggest-scene] AI error:', err);
    return c.json({ error: 'ai_failed' }, 500);
  }
});

sessionsRouter.delete('/:id', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  await db
    .delete(schema.chatSessions)
    .where(and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)));
  // Clean up any BullMQ jobs that might still fire for a now-deleted session.
  void cancelSessionJobs(id);
  return c.json({ ok: true });
});

// ── Section B: Undo last turn ─────────────────────────────────────────
// DELETE /api/sessions/:id/turns/last
// Hard-deletes the most recent turn (user + all assistant/narrator rows
// sharing the same turnId) and decrements chat_sessions.turn_count.
// Hard delete keeps message-history queries simple and lets the 5-hour /
// weekly USER-message budget auto-refund.
sessionsRouter.delete('/:id/turns/last', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  // Find the last USER message to identify the turn.
  const lastUser = await db.query.chatMessages.findFirst({
    where: and(
      eq(schema.chatMessages.sessionId, id),
      eq(schema.chatMessages.speakerType, 'USER'),
    ),
    orderBy: desc(schema.chatMessages.turnIndex),
  });
  if (!lastUser) return c.json({ error: 'no_turns' }, 400);

  // Prefer turnId grouping (covers narrator / reactor / multi-pass rows);
  // fall back to turnIndex range when turnId is null on older rows.
  if (lastUser.turnId) {
    await db
      .delete(schema.chatMessages)
      .where(
        and(
          eq(schema.chatMessages.sessionId, id),
          eq(schema.chatMessages.turnId, lastUser.turnId),
        ),
      );
  } else {
    await db
      .delete(schema.chatMessages)
      .where(
        and(
          eq(schema.chatMessages.sessionId, id),
          sql`${schema.chatMessages.turnIndex} >= ${lastUser.turnIndex}`,
        ),
      );
  }

  // Decrement turnCount (floor at 0).
  await db
    .update(schema.chatSessions)
    .set({ turnCount: Math.max(0, session.turnCount - 1), lastMessageAt: new Date() })
    .where(eq(schema.chatSessions.id, id));

  logSessionEvent({
    sessionId: id,
    userId,
    characterId: session.characterId,
    eventType: 'undo',
    payload: { turnId: lastUser.turnId ?? null },
    turnIndex: lastUser.turnIndex,
  });

  return c.json({ ok: true, undoneTurnId: lastUser.turnId ?? null });
});

// ── Section B: Branch from turn ───────────────────────────────────────
// POST /api/sessions/:id/branch  { atTurnIndex, title? }
// Forks a session: copies messages (turnIndex <= atTurnIndex), pinned
// memories, and character dynamic state into a fresh session. Stores
// `branchedFrom` in the new session's metadata for UI breadcrumbs.
const zBranchSession = z.object({
  atTurnIndex: z.number().int().nonnegative(),
  title: z.string().max(300).optional(),
});

sessionsRouter.post('/:id/branch', zValidator('json', zBranchSession), async (c) => {
  const { userId } = c.get('user');
  const tier = c.get('tier');
  const sourceId = c.req.param('id');
  const { atTurnIndex, title: titleInput } = c.req.valid('json');

  // Reuse session-creation tier guard.
  const check = await canCreateSession(userId, tier);
  if (!check.allowed) {
    return c.json({ error: 'tier_limit', message: check.reason }, 403);
  }

  const source = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, sourceId), eq(schema.chatSessions.userId, userId)),
  });
  if (!source) return c.json({ error: 'not_found' }, 404);

  const sourceMessages = await db
    .select()
    .from(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.sessionId, sourceId),
        sql`${schema.chatMessages.turnIndex} <= ${atTurnIndex}`,
      ),
    )
    .orderBy(asc(schema.chatMessages.turnIndex));

  const newId = nanoid();
  const createdAt = new Date();
  const userMsgCount = sourceMessages.filter((m) => m.speakerType === 'USER').length;
  const character = await db.query.characters.findFirst({
    where: eq(schema.characters.id, source.characterId),
  });
  const resolvedTitle = formatAutoSessionTitle({
    title: titleInput ?? (source.title ? `${source.title} (branch)` : null),
    mode: source.mode,
    characterName: character?.name ?? null,
    createdAt,
  });
  const branchedFrom = {
    sessionId: source.id,
    sessionTitle: source.title,
    atTurnIndex,
    branchedAt: createdAt.toISOString(),
  };
  const sourceMeta = (source.metadata ?? {}) as Record<string, unknown>;

  await db.insert(schema.chatSessions).values({
    id: newId,
    userId,
    characterId: source.characterId,
    mode: source.mode,
    title: resolvedTitle,
    castCharacterIds: source.castCharacterIds,
    sceneCard: source.sceneCard,
    aiModel: source.aiModel,
    moodNoise: source.moodNoise,
    moodState: source.moodState,
    autoMoodEnabled: source.autoMoodEnabled,
    ragEnabled: source.ragEnabled,
    narratorVoice: source.narratorVoice,
    sessionDate: source.sessionDate,
    sessionTime: source.sessionTime,
    chatProgressionMode: source.chatProgressionMode,
    turnCount: userMsgCount,
    metadata: { ...sourceMeta, branchedFrom },
    createdAt,
    lastMessageAt: createdAt,
  });

  // Bulk copy messages (fresh ids, preserve turnIndex + turnId + content).
  if (sourceMessages.length > 0) {
    const copies = sourceMessages.map((m) => ({
      id: nanoid(),
      sessionId: newId,
      turnIndex: m.turnIndex,
      role: m.role,
      speakerType: m.speakerType,
      speakerId: m.speakerId,
      content: m.content,
      passType: m.passType,
      passIndex: m.passIndex,
      reaction: m.reaction,
      isStarred: m.isStarred,
      isInstant: m.isInstant,
      tokenCount: m.tokenCount,
      replyToMessageId: null,
      turnId: m.turnId,
      feedbackTag: m.feedbackTag,
      metadata: m.metadata,
      createdAt: m.createdAt,
    }));
    await db.insert(schema.chatMessages).values(copies);
  }

  // Copy pinned memories scoped to this session+character.
  const pinned = await db.query.memories.findMany({
    where: and(
      eq(schema.memories.sessionId, sourceId),
      eq(schema.memories.type, 'PINNED'),
    ),
  });
  if (pinned.length > 0) {
    await db.insert(schema.memories).values(
      pinned.map((p) => ({
        ...p,
        id: nanoid(),
        sessionId: newId,
        createdAt: new Date(),
      })),
    );
  }

  // Copy character dynamic state (trust, mood, stage) so the branch
  // inherits the relationship at the fork point instead of resetting.
  const dyn = await db.query.characterDynamicStates.findMany({
    where: eq(schema.characterDynamicStates.sessionId, sourceId),
  });
  if (dyn.length > 0) {
    await db.insert(schema.characterDynamicStates).values(
      dyn.map((d) => ({ ...d, id: nanoid(), sessionId: newId })),
    );
  }

  // Timeline event on the SOURCE session.
  await db.insert(schema.sessionEvents).values({
    id: nanoid(),
    sessionId: sourceId,
    userId,
    characterId: source.characterId,
    eventType: 'branch',
    payload: { newSessionId: newId, atTurnIndex },
    turnIndex: atTurnIndex,
  }).catch(() => {});

  const row = await db.query.chatSessions.findFirst({ where: eq(schema.chatSessions.id, newId) });
  return c.json({ session: row });
});

// ── Section B: Timeline (relationship milestones, mood, branches) ─────
// GET /api/sessions/:id/timeline
sessionsRouter.get('/:id/timeline', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const rows = await db
    .select()
    .from(schema.sessionEvents)
    .where(eq(schema.sessionEvents.sessionId, id))
    .orderBy(desc(schema.sessionEvents.createdAt))
    .limit(200);

  return c.json({
    events: rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      payload: r.payload,
      turnIndex: r.turnIndex,
      characterId: r.characterId,
      createdAt: r.createdAt,
    })),
  });
});

// ── Section E: Session heartbeat ─────────────────────────────────────
// POST /api/sessions/:id/heartbeat
// Client pings this while the tab is open. Each heartbeat (re-)schedules
// the delayed background beats via BullMQ:
//   - nudge  (20s)   — only if session is still in first-open state
//                      (turnCount === 2 && no USER message).
//   - return (12h)   — regardless of state, so an idle re-open produces
//                      a day-2 message even when the user closed the tab.
// Returns quickly — scheduling is cheap, but we fire it in the background
// to keep the response under ~5 ms.
sessionsRouter.post('/:id/heartbeat', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  // Always reset the 12h return timer — every open counts as "still active".
  void scheduleReturn({ sessionId: id, userId });

  // The 20-second nudge only applies to the just-opened state. If the user
  // has already spoken or the session has advanced, skip scheduling — the
  // worker's own guard (`generateNudgeMessage` rechecks turnCount + user msg
  // count) also short-circuits if state changed between schedule and fire.
  if (session.turnCount === 2) {
    void scheduleNudge({ sessionId: id, userId });
  }
  return c.json({ ok: true });
});

// ─── MC Profile — story-mc info + apply MC to session ────────────────────
// GET /api/sessions/:id/story-mc — returns story MC config for this session
sessionsRouter.get('/:id/story-mc', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');

  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
    columns: { id: true },
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  // Find the story via story_runs.seededSessionId
  const run = await db.query.storyRuns.findFirst({
    where: eq(schema.storyRuns.seededSessionId, id),
    columns: { storyId: true },
  });

  if (!run) {
    return c.json({ hasPredefinedMc: false, requiresReplacement: false });
  }

  const story = await db.query.stories.findFirst({
    where: eq(schema.stories.id, run.storyId),
    columns: {
      hasMcSlot: true,
      mcSlotDisplayName: true,
      requiresMcReplacement: true,
      replacementCharacterId: true,
    },
  });

  if (!story) return c.json({ hasPredefinedMc: false, requiresReplacement: false });

  let predefinedMcName: string | undefined;
  if (story.replacementCharacterId) {
    const char = await db.query.characters.findFirst({
      where: eq(schema.characters.id, story.replacementCharacterId),
      columns: { name: true },
    });
    predefinedMcName = char?.name;
  }

  return c.json({
    hasPredefinedMc: !!story.replacementCharacterId,
    predefinedMcName,
    requiresReplacement: story.requiresMcReplacement ?? false,
  });
});

// PUT /api/sessions/:id/mc — apply MC profile to session (stored in metadata)
sessionsRouter.put(
  '/:id/mc',
  zValidator('json', z.object({
    profileId: z.string().nullable(),
    type: z.enum(['profile', 'character', 'anonymous']),
  })),
  async (c) => {
    const { userId } = c.get('user');
    const id = c.req.param('id');
    const { profileId, type } = c.req.valid('json');

    const session = await db.query.chatSessions.findFirst({
      where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
      columns: { id: true, metadata: true },
    });
    if (!session) return c.json({ error: 'not_found' }, 404);

    const currentMeta = (session.metadata ?? {}) as Record<string, unknown>;
    await db
      .update(schema.chatSessions)
      .set({ metadata: { ...currentMeta, mcProfileId: profileId, mcType: type } })
      .where(eq(schema.chatSessions.id, id));

    return c.json({ ok: true });
  },
);


