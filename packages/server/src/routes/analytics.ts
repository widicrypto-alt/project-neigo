/**
 * PLANIMPv7 §5 — Analytics stub.
 * POST /api/analytics/events — accepts batch events from web client.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db, schema } from '../db/client.js';
import { optionalAuth, type AuthVars } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

export const analyticsRouter = new Hono<{ Variables: Partial<AuthVars> }>();
analyticsRouter.use('*', optionalAuth);

const zEvent = z.object({
  name: z.string().min(1).max(50),
  entityType: z.string().max(16).nullable().optional(),
  entityId: z.string().max(36).nullable().optional(),
  props: z.record(z.unknown()).optional(),
});

const zBatch = z.object({
  events: z.array(zEvent).min(1).max(20),
});

analyticsRouter.post(
  '/events',
  rateLimit({ windowMs: 60_000, max: 60, name: 'analytics' }),
  zValidator('json', zBatch),
  async (c) => {
    const { events } = c.req.valid('json');
    const authUser = c.get('user') as { userId: string } | undefined;
    const userId = authUser?.userId ?? null;
    const rows = events.map((e) => ({
      id: nanoid(),
      eventType: e.name,
      userId,
      entityType: e.entityType ?? null,
      entityId: e.entityId ?? null,
      payload: (e.props ?? {}) as Record<string, unknown>,
    }));
    try {
      await db.insert(schema.analyticsEvents).values(rows);
    } catch {
      // non-fatal
    }
    return c.json({ ok: true, received: rows.length });
  },
);
