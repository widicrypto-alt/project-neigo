import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { type AuthVars } from '../../middleware/auth.js';
import { type TierVars } from '../../middleware/tier.js';
import { scheduleNudge, scheduleReturn } from '../../lib/session-workers.js';

export const stateRouter = new Hono<{ Variables: AuthVars & TierVars }>();

// PLANCHATv3 §4.1 — Arc checkpoints for session
stateRouter.get('/:id/arcs', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');

  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const { getArcCheckpoints } = await import('../../services/arc-manager.js');
  const checkpoints = await getArcCheckpoints(id);
  return c.json({ arcs: checkpoints });
});

// v7 #18/#19: session state snapshot for header pill + First Meeting card.
stateRouter.get('/:id/state', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const dyn = await db.query.characterDynamicStates.findFirst({
    where: and(
      eq(schema.characterDynamicStates.sessionId, id),
      eq(schema.characterDynamicStates.characterId, session.characterId),
    ),
  });

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

// ── Section E: Session heartbeat ─────────────────────────────────────
stateRouter.post('/:id/heartbeat', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  void scheduleReturn({ sessionId: id, userId });

  if (session.turnCount === 2) {
    void scheduleNudge({ sessionId: id, userId });
  }
  return c.json({ ok: true });
});

// ─── MC Profile — story-mc info ───────────────────────────────────────────
stateRouter.get('/:id/story-mc', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');

  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
    columns: { id: true },
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

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

// ─── Cast Tracker ─────────────────────────────────────────────────────────
stateRouter.get('/:id/cast-tracker', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');

  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
    columns: { id: true },
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const run = await db.query.storyRuns.findFirst({
    where: eq(schema.storyRuns.seededSessionId, id),
    columns: { storyId: true },
  });

  if (!run) {
    return c.json({ error: 'not_a_story_session' }, 400);
  }

  const { getFullCastStatus } = await import('../../services/cast-tracker.js');
  try {
    const status = await getFullCastStatus(userId, run.storyId);
    return c.json(status);
  } catch (error) {
    console.error('[sessions] Failed to get cast tracker status:', error);
    return c.json({ error: 'failed_to_get_status' }, 500);
  }
});

// PUT /:id/mc — apply MC profile to session (stored in metadata)
stateRouter.put(
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

// ─── Wk13 PLANv2 H12 — Chat summary popover ──────────────────────────────
stateRouter.get('/:id/summary', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const force = c.req.query('force') === '1';
  const { summariseSession } = await import('../../services/chat-summary.js');
  const summary = await summariseSession(id, userId, { force });
  if (!summary) return c.json({ error: 'not_found_or_empty' }, 404);
  return c.json({ summary });
});
