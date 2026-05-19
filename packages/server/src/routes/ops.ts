import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { and, eq, sql, desc, asc, ilike } from 'drizzle-orm';
import { env } from '../lib/env.js';
import { db, schema } from '../db/client.js';
import { SESSION_COOKIE, verifyJwt } from '../lib/jwt.js';
import { isFounderEmail } from '../lib/access-role.js';

export const opsRouter = new Hono();

async function authorized(c: Context): Promise<boolean> {
  const configured = env.OPS_API_KEY;
  const bearer = c.req.header('authorization')?.replace('Bearer ', '');
  const header = c.req.header('x-ops-key');
  if (configured && (bearer ?? header ?? '') === configured) return true;

  const token = getCookie(c, SESSION_COOKIE) ?? bearer;
  if (!token) return false;
  const payload = verifyJwt(token);
  if (!payload?.userId) return false;
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, payload.userId),
    columns: { email: true },
  });
  return isFounderEmail(user?.email);
}

// ─── T4.8 Context Drill-down Routes ────────────────────────────────────────

/**
 * GET /api/ops/sessions/:id/context/overview
 * DAG shape: depth distribution, node count, fresh tail size.
 */
opsRouter.get('/sessions/:id/context/overview', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'unauthorized' }, 401);

  const sessionId = c.req.param('id');

  // Validate session exists
  const session = await db.query.chatSessions.findFirst({
    where: eq(schema.chatSessions.id, sessionId),
    columns: { id: true, turnCount: true, title: true },
  });
  if (!session) return c.json({ error: 'session_not_found' }, 404);

  // Depth distribution
  const depthDist = await db
    .select({
      depth: schema.contextNodes.depth,
      count: sql<number>`count(*)::int`,
      avgSalience: sql<number>`round(avg(${schema.contextNodes.salience})::numeric, 3)::float`,
      totalTokens: sql<number>`sum(${schema.contextNodes.tokenCount})::int`,
    })
    .from(schema.contextNodes)
    .where(eq(schema.contextNodes.sessionId, sessionId))
    .groupBy(schema.contextNodes.depth)
    .orderBy(asc(schema.contextNodes.depth));

  // Total node count
  const totalNodes = depthDist.reduce((s, d) => s + d.count, 0);

  // Fresh tail: turns NOT yet covered by any context node
  const lastCompactedTurn = await db
    .select({ maxTurn: sql<number>`coalesce(max(${schema.contextNodes.turnEnd}), -1)::int` })
    .from(schema.contextNodes)
    .where(eq(schema.contextNodes.sessionId, sessionId));
  const freshTailSize = session.turnCount - ((lastCompactedTurn[0]?.maxTurn ?? -1) + 1);

  return c.json({
    sessionId,
    title: session.title,
    turnCount: session.turnCount,
    totalNodes,
    freshTailSize: Math.max(0, freshTailSize),
    depthDistribution: depthDist,
    generatedAt: new Date().toISOString(),
  });
});

/**
 * GET /api/ops/sessions/:id/context/grep?q=...
 * Full-text search over context node summaries + raw messages.
 */
opsRouter.get('/sessions/:id/context/grep', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'unauthorized' }, 401);

  const sessionId = c.req.param('id');
  const query = c.req.query('q')?.trim();
  if (!query || query.length < 2) {
    return c.json({ error: 'query_too_short', message: 'q must be ≥2 characters' }, 400);
  }
  // Limit query length to prevent abuse
  const safeQuery = query.slice(0, 200);
  const pattern = `%${safeQuery}%`;

  // Search context node summaries
  const nodeHits = await db
    .select({
      id: schema.contextNodes.id,
      depth: schema.contextNodes.depth,
      turnStart: schema.contextNodes.turnStart,
      turnEnd: schema.contextNodes.turnEnd,
      summary: schema.contextNodes.summary,
      salience: schema.contextNodes.salience,
    })
    .from(schema.contextNodes)
    .where(
      and(
        eq(schema.contextNodes.sessionId, sessionId),
        ilike(schema.contextNodes.summary, pattern),
      ),
    )
    .orderBy(desc(schema.contextNodes.turnEnd))
    .limit(20);

  // Search raw messages
  const messageHits = await db
    .select({
      id: schema.chatMessages.id,
      turnIndex: schema.chatMessages.turnIndex,
      role: schema.chatMessages.role,
      speakerType: schema.chatMessages.speakerType,
      content: schema.chatMessages.content,
    })
    .from(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.sessionId, sessionId),
        ilike(schema.chatMessages.content, pattern),
      ),
    )
    .orderBy(desc(schema.chatMessages.turnIndex))
    .limit(30);

  return c.json({
    query: safeQuery,
    nodes: nodeHits.map((n) => ({
      ...n,
      summary: n.summary.slice(0, 500), // Cap for readability
    })),
    messages: messageHits.map((m) => ({
      ...m,
      content: m.content.slice(0, 300), // Excerpt
    })),
  });
});

/**
 * GET /api/ops/sessions/:id/context/node/:nodeId
 * Full node content + source message refs.
 */
opsRouter.get('/sessions/:id/context/node/:nodeId', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'unauthorized' }, 401);

  const sessionId = c.req.param('id');
  const nodeId = c.req.param('nodeId');

  const node = await db.query.contextNodes.findFirst({
    where: and(
      eq(schema.contextNodes.id, nodeId),
      eq(schema.contextNodes.sessionId, sessionId),
    ),
  });
  if (!node) return c.json({ error: 'node_not_found' }, 404);

  // Fetch children (nodes that have this as parent)
  const children = await db
    .select({
      id: schema.contextNodes.id,
      depth: schema.contextNodes.depth,
      turnStart: schema.contextNodes.turnStart,
      turnEnd: schema.contextNodes.turnEnd,
      salience: schema.contextNodes.salience,
      tokenCount: schema.contextNodes.tokenCount,
    })
    .from(schema.contextNodes)
    .where(eq(schema.contextNodes.parentId, nodeId))
    .orderBy(asc(schema.contextNodes.turnStart));

  // Fetch source messages within the node's turn range
  const sourceMessages = await db
    .select({
      id: schema.chatMessages.id,
      turnIndex: schema.chatMessages.turnIndex,
      role: schema.chatMessages.role,
      speakerType: schema.chatMessages.speakerType,
      content: schema.chatMessages.content,
      createdAt: schema.chatMessages.createdAt,
    })
    .from(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.sessionId, sessionId),
        sql`${schema.chatMessages.turnIndex} >= ${node.turnStart}`,
        sql`${schema.chatMessages.turnIndex} <= ${node.turnEnd}`,
      ),
    )
    .orderBy(asc(schema.chatMessages.turnIndex))
    .limit(100);

  return c.json({
    node,
    children,
    sourceMessages: sourceMessages.map((m) => ({
      ...m,
      content: m.content.slice(0, 1000), // Cap large messages
    })),
  });
});



// ─── Wk2 F4 Prompt Snapshots ──────────────────────────────────────────────

/**
 * GET /api/ops/sessions/:id/prompt-snapshots?limit=20
 * List recent prompt snapshots (headers only) for a session.
 */
opsRouter.get('/sessions/:id/prompt-snapshots', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'unauthorized' }, 401);
  const sessionId = c.req.param('id');
  const limitRaw = Number(c.req.query('limit') ?? 20);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.trunc(limitRaw))) : 20;

  const session = await db.query.chatSessions.findFirst({
    where: eq(schema.chatSessions.id, sessionId),
    columns: { id: true },
  });
  if (!session) return c.json({ error: 'session_not_found' }, 404);

  const { listPromptSnapshots } = await import('../services/prompt-snapshot.js');
  const rows = await listPromptSnapshots(sessionId, limit);
  return c.json({ sessionId, count: rows.length, snapshots: rows });
});

/**
 * GET /api/ops/sessions/:id/prompt-snapshots/:snapshotId
 * Return the full prompt payload for a single snapshot.
 */
opsRouter.get('/sessions/:id/prompt-snapshots/:snapshotId', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'unauthorized' }, 401);
  const sessionId = c.req.param('id');
  const snapshotId = c.req.param('snapshotId');

  const { getPromptSnapshot } = await import('../services/prompt-snapshot.js');
  const snap = await getPromptSnapshot(snapshotId);
  if (!snap || snap.sessionId !== sessionId) {
    return c.json({ error: 'snapshot_not_found' }, 404);
  }
  return c.json(snap);
});

// ── Moderation admin (PLANIMPv7 §2.3) ────────────────────────────────

opsRouter.get('/moderation/flagged', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'forbidden' }, 403);
  const [flaggedChars, flaggedStories, recentReports] = await Promise.all([
    db.query.characters.findMany({
      where: eq(schema.characters.isFlaggedForReview, true),
      columns: { id: true, name: true, ownerId: true, isPublic: true, createdAt: true },
      limit: 100,
    }),
    db.query.stories.findMany({
      where: eq(schema.stories.isFlaggedForReview, true),
      columns: { id: true, title: true, authorId: true, status: true, createdAt: true },
      limit: 100,
    }),
    db.execute(sql`
      SELECT entity_type, entity_id, COUNT(DISTINCT reporter_id) AS reports
      FROM content_reports
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY entity_type, entity_id
      ORDER BY reports DESC LIMIT 100
    `),
  ]);
  return c.json({
    characters: flaggedChars,
    stories: flaggedStories,
    recentReports: (recentReports as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [],
  });
});

opsRouter.post('/moderation/action', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'forbidden' }, 403);
  const body = await c.req.json().catch(() => null) as {
    entityType?: 'character' | 'story';
    entityId?: string;
    action?: 'clear_flag' | 'hide' | 'restore' | 'soft_delete' | 'ban_author';
    reason?: string;
  } | null;
  if (!body?.entityType || !body.entityId || !body.action) {
    return c.json({ error: 'bad_request' }, 400);
  }
  const { entityType, entityId, action, reason } = body;
  const table = entityType === 'character' ? schema.characters : schema.stories;
  const entity = entityType === 'character'
    ? await db.query.characters.findFirst({ where: eq(schema.characters.id, entityId), columns: { id: true, ownerId: true } })
    : await db.query.stories.findFirst({ where: eq(schema.stories.id, entityId), columns: { id: true, authorId: true } });
  if (!entity) return c.json({ error: 'not_found' }, 404);

  const now = new Date();
  switch (action) {
    case 'clear_flag':
      await db.update(table).set({ isFlaggedForReview: false }).where(eq(table.id, entityId));
      break;
    case 'hide':
      if (entityType === 'character') {
        await db.update(schema.characters).set({ isPublic: false }).where(eq(schema.characters.id, entityId));
      } else {
        await db.update(schema.stories).set({ status: 'draft' }).where(eq(schema.stories.id, entityId));
      }
      break;
    case 'restore':
      await db.update(table).set({ isFlaggedForReview: false, deletedAt: null }).where(eq(table.id, entityId));
      break;
    case 'soft_delete':
      await db.update(table).set({ deletedAt: now }).where(eq(table.id, entityId));
      break;
    case 'ban_author': {
      const authorId = entityType === 'character' ? (entity as { ownerId: string }).ownerId : (entity as { authorId: string }).authorId;
      const u = await db.query.users.findFirst({ where: eq(schema.users.id, authorId), columns: { metadata: true } });
      const meta = (u?.metadata ?? {}) as Record<string, unknown>;
      await db.update(schema.users).set({
        metadata: { ...meta, banned: true, bannedAt: now.toISOString(), banReason: reason ?? null },
        profileIsPublic: false,
      }).where(eq(schema.users.id, authorId));
      break;
    }
  }
  // Audit log.
  await db.insert(schema.moderationActions).values({
    id: crypto.randomUUID().slice(0, 36),
    adminUserId: null,
    entityType,
    entityId,
    action,
    reason: reason ?? null,
  });
  return c.json({ ok: true });
});



// ── DMCA / legal takedown admin (BACKLOG B2.9) ───────────────────────
// Thin wrapper around the moderation soft-delete path, but with a
// dedicated audit trail (`action = 'dmca_takedown'`) and structured
// metadata so counsel-facing exports can filter quickly.

opsRouter.get('/dmca', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'forbidden' }, 403);
  const limitRaw = Number(c.req.query('limit') ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.trunc(limitRaw))) : 100;
  const actions = await db.query.moderationActions.findMany({
    where: eq(schema.moderationActions.action, 'dmca_takedown'),
    orderBy: [desc(schema.moderationActions.createdAt)],
    limit,
  });
  return c.json({ takedowns: actions });
});

opsRouter.post('/dmca/takedown', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'forbidden' }, 403);
  const body = await c.req.json().catch(() => null) as {
    entityType?: 'character' | 'story';
    entityId?: string;
    reason?: string;
    sourceUrl?: string;
    reporter?: string;
  } | null;
  if (!body?.entityType || !body.entityId || !body.reason) {
    return c.json({ error: 'bad_request', message: 'entityType, entityId, reason required' }, 400);
  }
  const { entityType, entityId, reason, sourceUrl, reporter } = body;
  const table = entityType === 'character' ? schema.characters : schema.stories;
  const entity = entityType === 'character'
    ? await db.query.characters.findFirst({ where: eq(schema.characters.id, entityId), columns: { id: true } })
    : await db.query.stories.findFirst({ where: eq(schema.stories.id, entityId), columns: { id: true } });
  if (!entity) return c.json({ error: 'not_found' }, 404);

  const now = new Date();
  // Soft-delete (deleted_at) + mark non-public / draft so it leaves every
  // discover surface immediately.
  if (entityType === 'character') {
    await db
      .update(schema.characters)
      .set({ deletedAt: now, isPublic: false, isFlaggedForReview: true })
      .where(eq(schema.characters.id, entityId));
  } else {
    await db
      .update(schema.stories)
      .set({ deletedAt: now, status: 'draft', isFlaggedForReview: true })
      .where(eq(schema.stories.id, entityId));
  }

  await db.insert(schema.moderationActions).values({
    id: crypto.randomUUID().slice(0, 36),
    adminUserId: null,
    entityType,
    entityId,
    action: 'dmca_takedown',
    reason,
    metadata: { sourceUrl: sourceUrl ?? null, reporter: reporter ?? null },
  });

  // Void the moderation-actions "table" reference so TS knows we used it
  // (some linters otherwise complain in single-use branches).
  void table;

  return c.json({ ok: true, entityType, entityId, takedownAt: now.toISOString() });
});

opsRouter.post('/dmca/restore', async (c) => {
  if (!(await authorized(c))) return c.json({ error: 'forbidden' }, 403);
  const body = await c.req.json().catch(() => null) as {
    entityType?: 'character' | 'story';
    entityId?: string;
    reason?: string;
  } | null;
  if (!body?.entityType || !body.entityId) {
    return c.json({ error: 'bad_request' }, 400);
  }
  const { entityType, entityId, reason } = body;
  const table = entityType === 'character' ? schema.characters : schema.stories;
  await db
    .update(table)
    .set({ deletedAt: null, isFlaggedForReview: false })
    .where(eq(table.id, entityId));
  await db.insert(schema.moderationActions).values({
    id: crypto.randomUUID().slice(0, 36),
    adminUserId: null,
    entityType,
    entityId,
    action: 'dmca_restore',
    reason: reason ?? null,
    metadata: {},
  });
  return c.json({ ok: true });
});


