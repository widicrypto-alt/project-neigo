/**
 * Wk14 PLANv2 H7 — Scheduled autonomous messages.
 *
 * Routes (all scoped to caller's own sessions):
 *   GET    /api/schedules                 — list caller's schedules
 *   GET    /api/schedules/session/:sid    — list for one session
 *   POST   /api/schedules                 — create
 *   PATCH  /api/schedules/:id             — edit (re-queues job)
 *   DELETE /api/schedules/:id             — delete (cancels job)
 *
 * Quiet-hours are read from user.metadata.quietHoursStart /
 * quietHoursEnd by the planner; no UI here for that yet.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { enqueueSchedule } from '../services/schedule-planner.js';
import { getScheduleQueue } from '../lib/queue.js';

export const schedulesRouter = new Hono<{ Variables: AuthVars }>();
schedulesRouter.use('*', requireAuth);

const cadenceSchema = z.enum(['once', 'daily', 'weekly']);

const createSchema = z.object({
  sessionId: z.string().min(1),
  cadence: cadenceSchema.default('once'),
  fireAt: z.string().datetime().optional(),
  note: z.string().max(500).default(''),
  tz: z.string().max(64).default('UTC'),
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
  enabled: z.boolean().default(true),
});

const updateSchema = z.object({
  cadence: cadenceSchema.optional(),
  fireAt: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
  tz: z.string().max(64).optional(),
  hour: z.number().int().min(0).max(23).nullable().optional(),
  minute: z.number().int().min(0).max(59).nullable().optional(),
  enabled: z.boolean().optional(),
});

async function assertSessionOwnership(sessionId: string, userId: string) {
  const row = await db.query.chatSessions.findFirst({
    where: eq(schema.chatSessions.id, sessionId),
    columns: { id: true, userId: true },
  });
  if (!row || row.userId !== userId) {
    return null;
  }
  return row;
}

schedulesRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const rows = await db
    .select()
    .from(schema.sessionSchedules)
    .where(eq(schema.sessionSchedules.userId, userId))
    .orderBy(asc(schema.sessionSchedules.fireAt));
  return c.json({ schedules: rows });
});

schedulesRouter.post('/', zValidator('json', createSchema), async (c) => {
  const { userId } = c.get('user');
  const body = c.req.valid('json');
  const sess = await assertSessionOwnership(body.sessionId, userId);
  if (!sess) return c.json({ error: 'session not found' }, 404);

  // Resolve fireAt: prefer explicit; else next occurrence from hour/minute.
  let fireAt: Date;
  if (body.fireAt) {
    fireAt = new Date(body.fireAt);
  } else if (body.hour != null) {
    // One hour into the future as a safe default if cadence='once' without fireAt.
    const d = new Date();
    d.setUTCMinutes(d.getUTCMinutes() + 60);
    fireAt = d;
  } else {
    return c.json({ error: 'fireAt or hour required' }, 400);
  }

  const id = nanoid();
  await db.insert(schema.sessionSchedules).values({
    id,
    userId,
    sessionId: body.sessionId,
    cadence: body.cadence,
    fireAt,
    note: body.note,
    tz: body.tz,
    hour: body.hour ?? null,
    minute: body.minute ?? null,
    enabled: body.enabled,
  });
  await enqueueSchedule(id);
  return c.json({ id });
});

schedulesRouter.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const row = await db.query.sessionSchedules.findFirst({
    where: eq(schema.sessionSchedules.id, id),
  });
  if (!row || row.userId !== userId) return c.json({ error: 'not found' }, 404);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.cadence !== undefined) patch.cadence = body.cadence;
  if (body.fireAt !== undefined) patch.fireAt = new Date(body.fireAt);
  if (body.note !== undefined) patch.note = body.note;
  if (body.tz !== undefined) patch.tz = body.tz;
  if (body.hour !== undefined) patch.hour = body.hour;
  if (body.minute !== undefined) patch.minute = body.minute;
  if (body.enabled !== undefined) patch.enabled = body.enabled;

  await db
    .update(schema.sessionSchedules)
    .set(patch)
    .where(eq(schema.sessionSchedules.id, id));
  await enqueueSchedule(id);
  return c.json({ ok: true });
});

schedulesRouter.delete('/:id', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const row = await db.query.sessionSchedules.findFirst({
    where: eq(schema.sessionSchedules.id, id),
  });
  if (!row || row.userId !== userId) return c.json({ error: 'not found' }, 404);
  await db.delete(schema.sessionSchedules).where(eq(schema.sessionSchedules.id, id));
  const q = getScheduleQueue();
  if (q) {
    try {
      const j = await q.getJob(`schedule:${id}`);
      if (j) await j.remove();
    } catch {
      // ignore
    }
  }
  return c.json({ ok: true });
});
