import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { zCreateSession, DEFAULT_AI_MODEL, AI_MODEL_CONFIG, BETA_CHAT_MODES, BYOK_MODEL_CATALOG, TIER_CONFIG } from '@neigo/shared';
import { db, schema } from '../../db/client.js';
import { type AuthVars } from '../../middleware/auth.js';
import { canCreateSession, type TierVars } from '../../middleware/tier.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { formatAutoSessionTitle } from '../../lib/session-title.js';
import { cancelSessionJobs } from '../../lib/session-workers.js';
import { readFreshWakeUpPacket } from '../../services/context-maintenance.js';

export const crudRouter = new Hono<{ Variables: AuthVars & TierVars }>();

// GET /api/sessions/quick-nav
crudRouter.get('/quick-nav', async (c) => {
  const { userId } = c.get('user');

  const rows = await db
    .select()
    .from(schema.chatSessions)
    .where(eq(schema.chatSessions.userId, userId))
    .orderBy(desc(schema.chatSessions.isPinned), desc(schema.chatSessions.lastMessageAt))
    .limit(10);

  if (rows.length === 0) return c.json({ sessions: [] });

  const sessionIds = rows.map((r) => r.id);
  const charIds = [...new Set(rows.map((r) => r.characterId).filter(Boolean))] as string[];

  const [chars, lastMsgs] = await Promise.all([
    charIds.length > 0
      ? db.select({ id: schema.characters.id, name: schema.characters.name })
          .from(schema.characters)
          .where(and(
            inArray(schema.characters.id, charIds),
            sql`${schema.characters.deletedAt} IS NULL`,
          ))
      : Promise.resolve([]),
    db.execute<{ session_id: string; content: string; speaker_type: string; created_at: Date }>(
      sql`SELECT DISTINCT ON (session_id)
            session_id, content, speaker_type, created_at
          FROM chat_messages
          WHERE session_id = ANY(${sessionIds})
          ORDER BY session_id, created_at DESC`,
    ),
  ]);

  const charMap = new Map(chars.map((c) => [c.id, c]));
  type LastMsgRow = { session_id: string; content: string; speaker_type: string; created_at: Date };
  const msgMap = new Map((lastMsgs as unknown as LastMsgRow[]).map((m) => [m.session_id, m]));

  const sessions = rows.map((row) => {
    const character = charMap.get(row.characterId);
    const lastMessage = msgMap.get(row.id);
    return {
      id: row.id,
      title: row.title,
      characterId: row.characterId,
      characterName: character?.name ?? null,
      mode: row.mode,
      isPinned: row.isPinned,
      lastMessagePreview: lastMessage ? String(lastMessage.content).slice(0, 100) : null,
      lastMessageSpeakerType: lastMessage?.speaker_type ?? null,
      lastMessageAt: lastMessage?.created_at ?? null,
      autoMoodEnabled: row.autoMoodEnabled,
    };
  });

  return c.json({ sessions });
});

crudRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const folderParam = c.req.query('folderId');
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

  if (rows.length === 0) return c.json({ sessions: [] });

  const sessionIds = rows.map((r) => r.id);
  const charIds = [...new Set(rows.map((r) => r.characterId).filter(Boolean))] as string[];

  const [chars, lastMsgs] = await Promise.all([
    charIds.length > 0
      ? db.select()
          .from(schema.characters)
          .where(and(
            inArray(schema.characters.id, charIds),
            sql`${schema.characters.deletedAt} IS NULL`,
          ))
      : Promise.resolve([]),
    db.execute<{ session_id: string; content: string; speaker_type: string; created_at: Date }>(
      sql`SELECT DISTINCT ON (session_id)
            session_id, content, speaker_type, created_at
          FROM chat_messages
          WHERE session_id = ANY(${sessionIds})
          ORDER BY session_id, created_at DESC`,
    ),
  ]);

  const charMap = new Map(chars.map((c) => [c.id, c]));
  type LastMsgRow = { session_id: string; content: string; speaker_type: string; created_at: Date };
  const msgMap = new Map((lastMsgs as unknown as LastMsgRow[]).map((m) => [m.session_id, m]));

  const sessions = rows.map((row) => {
    const character = charMap.get(row.characterId);
    const lastMsg = msgMap.get(row.id);
    const lastMsgAt = (lastMsg?.created_at as Date | undefined) ?? row.lastMessageAt;
    const daysSinceActivity = lastMsgAt
      ? Math.floor((Date.now() - new Date(lastMsgAt).getTime()) / (24 * 60 * 60 * 1000))
      : null;
    return {
      ...row,
      title: formatAutoSessionTitle({
        title: row.title,
        mode: row.mode,
        characterName: character?.name ?? null,
        createdAt: row.createdAt,
      }),
      characterName: character?.name ?? null,
      lastMessagePreview: lastMsg ? String(lastMsg.content) : null,
      lastMessageSpeakerType: lastMsg?.speaker_type ?? null,
      lastMessageAt: lastMsgAt,
      expiringInDays: daysSinceActivity != null && daysSinceActivity >= 5 ? 7 - daysSinceActivity : null,
    };
  });

  return c.json({ sessions });
});

crudRouter.post(
  '/',
  rateLimit({ windowMs: 5 * 60_000, max: 10, name: 'session-create' }),
  zValidator('json', zCreateSession),
  async (c) => {
  const { userId } = c.get('user');
  const tier = c.get('tier');
  const check = await canCreateSession(userId, tier);
  if (!check.allowed) {
    return c.json({ error: 'tier_limit', message: check.reason }, 403);
  }
  const input = c.req.valid('json');
  if (!BETA_CHAT_MODES.includes(input.mode)) {
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

  if (input.mode === 'STORY') {
    const existingSession = await db.query.chatSessions.findFirst({
      where: and(
        eq(schema.chatSessions.userId, userId),
        eq(schema.chatSessions.characterId, input.characterId),
        eq(schema.chatSessions.mode, input.mode),
      ),
      columns: { id: true },
    });
    if (existingSession) {
      await db.delete(schema.chatMessages).where(eq(schema.chatMessages.sessionId, existingSession.id));
      await db.delete(schema.memories).where(eq(schema.memories.sessionId, existingSession.id));
      await db.delete(schema.characterDynamicStates).where(eq(schema.characterDynamicStates.sessionId, existingSession.id));
      await db.delete(schema.storyArcs).where(eq(schema.storyArcs.sessionId, existingSession.id));
      await db.delete(schema.chatSessions).where(eq(schema.chatSessions.id, existingSession.id));
      void cancelSessionJobs(existingSession.id);
    }
  }

  const createdAt = new Date();
  const resolvedTitle = formatAutoSessionTitle({
    title: input.title,
    mode: input.mode,
    characterName: character?.name ?? null,
    createdAt,
  });
  const moodNoise = Math.round(Math.random() * 0.15 * 1000) / 1000;
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

crudRouter.patch('/:id', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const existing = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!existing) return c.json({ error: 'not_found' }, 404);
  const updates: Partial<typeof schema.chatSessions.$inferInsert> = {};
  if (typeof body.title === 'string') updates.title = body.title.slice(0, 300);
  if (typeof body.autoMoodEnabled === 'boolean') updates.autoMoodEnabled = body.autoMoodEnabled;
  if (typeof body.ragEnabled === 'boolean') updates.ragEnabled = body.ragEnabled;
  if (typeof body.aiModel === 'string') {
    const candidate = body.aiModel;
    if (candidate in AI_MODEL_CONFIG || BYOK_MODEL_CATALOG.some((m) => m.id === candidate)) {
      updates.aiModel = candidate;
    } else {
      return c.json({ error: 'unknown_ai_model' }, 400);
    }
  }
  if (Object.keys(updates).length > 0) {
    await db
      .update(schema.chatSessions)
      .set(updates)
      .where(and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)));
  }
  const row = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  return c.json({ session: row });
});

crudRouter.get('/:id', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const row = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!row) return c.json({ error: 'not_found' }, 404);
  const wakeUpPacket = await readFreshWakeUpPacket(id);
  return c.json({ session: row, wakeUpPacket });
});

crudRouter.delete('/:id', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  await db
    .delete(schema.chatSessions)
    .where(and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)));
  void cancelSessionJobs(id);
  return c.json({ ok: true });
});

crudRouter.delete('/', async (c) => {
  const { userId } = c.get('user');
  await db
    .delete(schema.chatSessions)
    .where(eq(schema.chatSessions.userId, userId));
  return c.json({ ok: true });
});
