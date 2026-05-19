import { Hono } from 'hono';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { type AuthVars } from '../../middleware/auth.js';
import { type TierVars } from '../../middleware/tier.js';
import { logSessionEvent } from '../../services/session-event-log.js';

export const messagesRouter = new Hono<{ Variables: AuthVars & TierVars }>();

messagesRouter.get('/:id/messages', async (c) => {
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

// ── Wk10 G3a — swipe sibling listing + activation ─────────────────────
messagesRouter.get('/:id/messages/:messageId/swipes', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const messageId = c.req.param('messageId');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);
  const target = await db.query.chatMessages.findFirst({
    where: and(
      eq(schema.chatMessages.id, messageId),
      eq(schema.chatMessages.sessionId, id),
    ),
  });
  if (!target) return c.json({ error: 'not_found' }, 404);
  const rootId = target.swipeRoot ?? target.id;
  const siblings = await db
    .select()
    .from(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.sessionId, id),
        or(
          eq(schema.chatMessages.id, rootId),
          eq(schema.chatMessages.swipeRoot, rootId),
        ),
      ),
    )
    .orderBy(schema.chatMessages.swipeIndex);
  return c.json({ rootId, siblings });
});

messagesRouter.post('/:id/messages/:messageId/activate-swipe', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const messageId = c.req.param('messageId');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);
  const target = await db.query.chatMessages.findFirst({
    where: and(
      eq(schema.chatMessages.id, messageId),
      eq(schema.chatMessages.sessionId, id),
    ),
  });
  if (!target) return c.json({ error: 'not_found' }, 404);
  if (target.speakerType === 'USER') {
    return c.json({ error: 'cannot_swipe_user_message' }, 400);
  }
  const rootId = target.swipeRoot ?? target.id;
  await db.transaction(async (tx) => {
    await tx
      .update(schema.chatMessages)
      .set({ isActive: false })
      .where(
        and(
          eq(schema.chatMessages.sessionId, id),
          or(
            eq(schema.chatMessages.id, rootId),
            eq(schema.chatMessages.swipeRoot, rootId),
          ),
        ),
      );
    await tx
      .update(schema.chatMessages)
      .set({ isActive: true })
      .where(eq(schema.chatMessages.id, messageId));
  });
  return c.json({ ok: true, activeMessageId: messageId });
});

messagesRouter.delete('/:id/messages', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  await Promise.all([
    db.delete(schema.chatMessages).where(eq(schema.chatMessages.sessionId, id)),
    db.delete(schema.memories).where(eq(schema.memories.sessionId, id)),
    db.delete(schema.characterDynamicStates).where(eq(schema.characterDynamicStates.sessionId, id)),
    db.delete(schema.storyArcs).where(eq(schema.storyArcs.sessionId, id)),
    db.delete(schema.groupActivities).where(eq(schema.groupActivities.sessionId, id)),
  ]);

  await db
    .update(schema.chatSessions)
    .set({
      turnCount: 0,
      metadata: sql`jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sceneState}', 'null'::jsonb)`,
      lastMessageAt: new Date(),
    })
    .where(eq(schema.chatSessions.id, id));

  return c.json({ ok: true });
});

// ── Section B: Undo last turn ─────────────────────────────────────────
messagesRouter.delete('/:id/turns/last', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const lastUser = await db.query.chatMessages.findFirst({
    where: and(
      eq(schema.chatMessages.sessionId, id),
      eq(schema.chatMessages.speakerType, 'USER'),
    ),
    orderBy: desc(schema.chatMessages.turnIndex),
  });
  if (!lastUser) return c.json({ error: 'no_turns' }, 400);

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

messagesRouter.get('/:id/messages/:mid/prompt-info', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const mid = c.req.param('mid');

  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
    columns: { id: true },
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const message = await db.query.chatMessages.findFirst({
    where: and(eq(schema.chatMessages.id, mid), eq(schema.chatMessages.sessionId, id)),
    columns: { id: true, turnId: true, turnIndex: true, role: true, speakerId: true },
  });
  if (!message) return c.json({ error: 'message_not_found' }, 404);
  if (!message.turnId) {
    return c.json({
      available: false,
      sessionId: id,
      messageId: mid,
      reason: 'snapshot_unavailable',
    });
  }

  const snap = await db.query.promptSnapshots.findFirst({
    where: and(
      eq(schema.promptSnapshots.sessionId, id),
      eq(schema.promptSnapshots.turnId, message.turnId),
    ),
  });
  if (!snap) {
    return c.json({
      available: false,
      sessionId: id,
      messageId: mid,
      reason: 'snapshot_unavailable',
    });
  }

  const raw = snap.messages ?? [];
  let seenSystem = 0;
  const categorized = raw.map((m) => {
    if (m.role === 'system') {
      seenSystem += 1;
      return { ...m, category: seenSystem === 1 ? 'persona' : 'context' };
    }
    if (m.role === 'user') return { ...m, category: 'history_user' };
    return { ...m, category: 'history_assistant' };
  });

  return c.json({
    available: true,
    sessionId: id,
    messageId: mid,
    turnId: message.turnId,
    turnIndex: message.turnIndex,
    modelSlug: snap.modelSlug,
    totalChars: snap.totalChars,
    messageCount: snap.messageCount,
    retryCount: snap.retryCount,
    sampling: snap.sampling,
    createdAt: snap.createdAt,
    messages: categorized,
  });
});
