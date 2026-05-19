import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, schema } from '../../db/client.js';
import { type AuthVars } from '../../middleware/auth.js';
import { canCreateSession, type TierVars } from '../../middleware/tier.js';
import { formatAutoSessionTitle } from '../../lib/session-title.js';
import { searchTranscript } from '../../services/transcript-search.js';

export const searchRouter = new Hono<{ Variables: AuthVars & TierVars }>();

const zSearchQuery = z.object({
  q: z.string().min(1).max(200),
  sessionId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

searchRouter.get('/search', zValidator('query', zSearchQuery), async (c) => {
  const { userId } = c.get('user');
  const { q, sessionId, limit } = c.req.valid('query');

  if (sessionId) {
    const session = await db.query.chatSessions.findFirst({
      where: and(
        eq(schema.chatSessions.id, sessionId),
        eq(schema.chatSessions.userId, userId),
      ),
    });
    if (!session) return c.json({ error: 'not_found' }, 404);
  }

  const results = await searchTranscript({ userId, sessionId, query: q, limit });
  return c.json({ results });
});

const zBranchSession = z.object({
  atTurnIndex: z.number().int().nonnegative(),
  title: z.string().max(300).optional(),
});

// ── Section B: Branch from turn ───────────────────────────────────────
searchRouter.post('/:id/branch', zValidator('json', zBranchSession), async (c) => {
  const { userId } = c.get('user');
  const tier = c.get('tier');
  const sourceId = c.req.param('id');
  const { atTurnIndex, title: titleInput } = c.req.valid('json');

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

  const dyn = await db.query.characterDynamicStates.findMany({
    where: eq(schema.characterDynamicStates.sessionId, sourceId),
  });
  if (dyn.length > 0) {
    await db.insert(schema.characterDynamicStates).values(
      dyn.map((d) => ({ ...d, id: nanoid(), sessionId: newId })),
    );
  }

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
