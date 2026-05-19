/**
 * PLANv3 X2.7 — Agent configs read/toggle routes.
 *
 * Minimal surface consumed by /settings/agents: list the user's agent
 * configs, flip enabled, and update the prompt template. Creation of
 * new agents is still done via seed / dedicated ops flow because the
 * tools/settings payload needs careful validation per agent type.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { ensureBuiltinAgents } from '../services/agents/seed.js';

export const agentConfigsRouter = new Hono<{ Variables: AuthVars }>();
agentConfigsRouter.use('*', requireAuth);

agentConfigsRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  // BACKLOG B0.1 — seed built-in agents lazily so /settings/agents has
  // something to render on a fresh account without waiting for a shadow
  // run to fire first.
  await ensureBuiltinAgents(userId);
  const rows = await db
    .select()
    .from(schema.agentConfigs)
    .where(eq(schema.agentConfigs.userId, userId))
    .orderBy(asc(schema.agentConfigs.phase), asc(schema.agentConfigs.name));
  return c.json({ agents: rows });
});

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  promptTemplate: z.string().max(20_000).optional(),
});

agentConfigsRouter.patch('/:id', zValidator('json', patchSchema), async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const row = await db.query.agentConfigs.findFirst({
    where: and(eq(schema.agentConfigs.id, id), eq(schema.agentConfigs.userId, userId)),
  });
  if (!row) return c.json({ error: 'not_found' }, 404);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (body.promptTemplate !== undefined && !row.isBuiltin) {
    // Guard: builtin prompts are owned by the server; users can only toggle.
    patch.promptTemplate = body.promptTemplate;
  }

  await db.update(schema.agentConfigs).set(patch).where(eq(schema.agentConfigs.id, id));
  return c.json({ ok: true });
});

/**
 * BACKLOG B0.1 — Recent agent runs for a session. Used by the debug view
 * in /settings/agents and by `/chat/:sessionId` when developers need to
 * compare shadow outcomes vs. the legacy validator chain.
 *
 *   GET /api/agents/runs?sessionId=<id>&limit=<n>
 */
agentConfigsRouter.get('/runs', async (c) => {
  const { userId } = c.get('user');
  const sessionId = c.req.query('sessionId');
  if (!sessionId) return c.json({ error: 'sessionId_required' }, 400);
  const limitRaw = Number(c.req.query('limit') ?? '50');
  const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 50));

  // Ownership gate: session must belong to the user.
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.userId, userId)),
    columns: { id: true },
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const runs = await db
    .select({
      id: schema.agentRuns.id,
      turnIndex: schema.agentRuns.turnIndex,
      outcome: schema.agentRuns.outcome,
      resultData: schema.agentRuns.resultData,
      latencyMs: schema.agentRuns.latencyMs,
      shadow: schema.agentRuns.shadow,
      error: schema.agentRuns.error,
      createdAt: schema.agentRuns.createdAt,
      agentType: schema.agentConfigs.type,
      agentName: schema.agentConfigs.name,
    })
    .from(schema.agentRuns)
    .leftJoin(
      schema.agentConfigs,
      eq(schema.agentConfigs.id, schema.agentRuns.agentConfigId),
    )
    .where(eq(schema.agentRuns.sessionId, sessionId))
    .orderBy(desc(schema.agentRuns.createdAt))
    .limit(limit);

  // Group by turnIndex for easy diff display.
  const byTurn = new Map<number, typeof runs>();
  for (const r of runs) {
    const arr = byTurn.get(r.turnIndex) ?? [];
    arr.push(r);
    byTurn.set(r.turnIndex, arr);
  }
  const turns = Array.from(byTurn.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([turnIndex, items]) => ({ turnIndex, agents: items }));

  return c.json({ sessionId, runs, turns });
});

/**
 * BACKLOG B0.1 — Shadow-compare endpoint.
 *
 * For a given session + optional turnIndex, pairs shadow=true and shadow=false
 * runs by (agentType, agentConfigId, turnIndex) and computes per-agent
 * agreement. An "agreement" means both paths produced the same outcome bucket
 * (pass / retry / block / error). Used by the dev debug panel.
 *
 *   GET /api/agents/compare?sessionId=<id>[&turnIndex=<n>]
 */
agentConfigsRouter.get('/compare', async (c) => {
  const { userId } = c.get('user');
  const sessionId = c.req.query('sessionId');
  if (!sessionId) return c.json({ error: 'sessionId_required' }, 400);

  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.userId, userId)),
    columns: { id: true },
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const turnIndexRaw = c.req.query('turnIndex');
  const turnFilter = turnIndexRaw != null ? Number(turnIndexRaw) : null;

  const rows = await db
    .select({
      id: schema.agentRuns.id,
      turnIndex: schema.agentRuns.turnIndex,
      agentConfigId: schema.agentRuns.agentConfigId,
      outcome: schema.agentRuns.outcome,
      shadow: schema.agentRuns.shadow,
      latencyMs: schema.agentRuns.latencyMs,
      resultData: schema.agentRuns.resultData,
      agentType: schema.agentConfigs.type,
      agentName: schema.agentConfigs.name,
    })
    .from(schema.agentRuns)
    .leftJoin(schema.agentConfigs, eq(schema.agentConfigs.id, schema.agentRuns.agentConfigId))
    .where(
      turnFilter != null
        ? and(eq(schema.agentRuns.sessionId, sessionId), eq(schema.agentRuns.turnIndex, turnFilter))
        : eq(schema.agentRuns.sessionId, sessionId),
    )
    .orderBy(desc(schema.agentRuns.turnIndex))
    .limit(500);

  // Group by (turnIndex, agentConfigId) → {shadow, live}
  type RunRow = (typeof rows)[number];
  const key = (r: RunRow) => `${r.turnIndex}::${r.agentConfigId}`;
  const pairs = new Map<string, { shadow: RunRow | null; live: RunRow | null; turnIndex: number; agentType: string; agentName: string }>();

  for (const r of rows) {
    const k = key(r);
    const existing = pairs.get(k) ?? { shadow: null, live: null, turnIndex: r.turnIndex, agentType: r.agentType ?? '', agentName: r.agentName ?? '' };
    if (r.shadow) existing.shadow = r;
    else existing.live = r;
    pairs.set(k, existing);
  }

  const comparisons = Array.from(pairs.values())
    .sort((a, b) => b.turnIndex - a.turnIndex)
    .map((p) => ({
      turnIndex: p.turnIndex,
      agentType: p.agentType,
      agentName: p.agentName,
      shadowOutcome: p.shadow?.outcome ?? null,
      liveOutcome: p.live?.outcome ?? null,
      agree: p.shadow != null && p.live != null
        ? p.shadow.outcome === p.live.outcome
        : null,
      shadowLatencyMs: p.shadow?.latencyMs ?? null,
      liveLatencyMs: p.live?.latencyMs ?? null,
    }));

  const agreed = comparisons.filter((c) => c.agree === true).length;
  const paired = comparisons.filter((c) => c.agree !== null).length;
  const agreementRate = paired > 0 ? agreed / paired : null;

  return c.json({ sessionId, comparisons, agreementRate, agreed, paired });
});

/**
 * BACKLOG B0.1 — Per-agent agreement stats across all turns in a session.
 *
 *   GET /api/agents/stats?sessionId=<id>
 */
agentConfigsRouter.get('/stats', async (c) => {
  const { userId } = c.get('user');
  const sessionId = c.req.query('sessionId');
  if (!sessionId) return c.json({ error: 'sessionId_required' }, 400);

  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.userId, userId)),
    columns: { id: true },
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  // Use raw SQL aggregation to count agreements per agentType efficiently.
  const result = await db.execute(sql`
    SELECT
      ac.type                                           AS agent_type,
      ac.name                                           AS agent_name,
      COUNT(DISTINCT ar.turn_index)                     AS turns_ran,
      COUNT(DISTINCT CASE WHEN ar.shadow = true THEN ar.turn_index END)  AS shadow_turns,
      COUNT(DISTINCT CASE WHEN ar.shadow = false THEN ar.turn_index END) AS live_turns,
      SUM(CASE WHEN ar.outcome = 'pass'  THEN 1 ELSE 0 END)             AS pass_count,
      SUM(CASE WHEN ar.outcome = 'retry' THEN 1 ELSE 0 END)             AS retry_count,
      SUM(CASE WHEN ar.outcome = 'block' THEN 1 ELSE 0 END)             AS block_count,
      SUM(CASE WHEN ar.outcome = 'error' THEN 1 ELSE 0 END)             AS error_count,
      AVG(ar.latency_ms)                                                 AS avg_latency_ms
    FROM agent_runs ar
    LEFT JOIN agent_configs ac ON ac.id = ar.agent_config_id
    WHERE ar.session_id = ${sessionId}
    GROUP BY ac.type, ac.name
    ORDER BY ac.name
  `);

  const byAgent = (result as unknown as { rows: Record<string, unknown>[] }).rows ?? [];
  return c.json({ sessionId, byAgent });
});

