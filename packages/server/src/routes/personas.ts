/**
 * Wk8 PLANv2 G1a — Personas CRUD routes.
 *
 * A user may own many personas. Exactly zero or one can be flagged as the
 * default (enforced by partial unique index in 0018_personas.sql). The
 * active persona for a session is pinned via chat_sessions.active_persona_id;
 * changing it is a dedicated endpoint here so the caller never has to
 * reach into /api/sessions/:id/patch to do it.
 *
 * All endpoints require auth. Tier caps are conservative: FREE = 3 personas;
 * PAID / FOUNDER = 25. Avatars are URLs only (no upload surface).
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { isFounderEmail } from '../lib/access-role.js';

export const personasRouter = new Hono<{ Variables: AuthVars }>();
personasRouter.use('*', requireAuth);

async function maxPersonasFor(userId: string): Promise<number> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { email: true, tier: true },
  });
  if (isFounderEmail(user?.email)) return 1000;
  if (user?.tier && user.tier !== 'FREE') return 25;
  return 3;
}

async function assertOwnership(personaId: string, userId: string) {
  const row = await db.query.personas.findFirst({
    where: eq(schema.personas.id, personaId),
    columns: { id: true, userId: true },
  });
  if (!row) return { ok: false as const, status: 404 as const, error: 'not_found' };
  if (row.userId !== userId) {
    return { ok: false as const, status: 403 as const, error: 'forbidden' };
  }
  return { ok: true as const };
}

// ─── CRUD ────────────────────────────────────────────────────────────────

const zCreate = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).default(''),
  avatarUrl: z.string().url().max(500).nullish(),
  isDefault: z.boolean().default(false),
});

const zUpdate = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(2000).optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  isDefault: z.boolean().optional(),
});

personasRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const rows = await db
    .select()
    .from(schema.personas)
    .where(eq(schema.personas.userId, userId))
    .orderBy(desc(schema.personas.isDefault), desc(schema.personas.createdAt))
    .limit(100);
  return c.json({ personas: rows });
});

personasRouter.post('/', zValidator('json', zCreate), async (c) => {
  const { userId } = c.get('user');
  const input = c.req.valid('json');
  const cap = await maxPersonasFor(userId);
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.personas)
    .where(eq(schema.personas.userId, userId));
  const count = countRows[0]?.count ?? 0;
  if (count >= cap) {
    return c.json(
      { error: 'tier_cap_exceeded', message: `Tier cap: ${cap} personas` },
      403,
    );
  }
  const id = nanoid();
  // If this row wants is_default, clear other defaults first (single txn).
  await db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx
        .update(schema.personas)
        .set({ isDefault: false })
        .where(eq(schema.personas.userId, userId));
    }
    await tx.insert(schema.personas).values({
      id,
      userId,
      name: input.name,
      description: input.description,
      avatarUrl: input.avatarUrl ?? null,
      isDefault: input.isDefault,
    });
  });
  const row = await db.query.personas.findFirst({ where: eq(schema.personas.id, id) });
  return c.json({ persona: row }, 201);
});

personasRouter.patch('/:id', zValidator('json', zUpdate), async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const own = await assertOwnership(id, userId);
  if (!own.ok) return c.json({ error: own.error }, own.status);
  const input = c.req.valid('json');
  await db.transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx
        .update(schema.personas)
        .set({ isDefault: false })
        .where(and(eq(schema.personas.userId, userId), eq(schema.personas.isDefault, true)));
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
    await tx.update(schema.personas).set(patch).where(eq(schema.personas.id, id));
  });
  const row = await db.query.personas.findFirst({ where: eq(schema.personas.id, id) });
  return c.json({ persona: row });
});

personasRouter.delete('/:id', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const own = await assertOwnership(id, userId);
  if (!own.ok) return c.json({ error: own.error }, own.status);
  await db.delete(schema.personas).where(eq(schema.personas.id, id));
  return c.json({ ok: true });
});

// ─── Session-scoped active persona ───────────────────────────────────────

const zSetActive = z.object({
  /** Pass null to clear the active persona back to users.displayName. */
  personaId: z.string().min(1).nullable(),
});

personasRouter.put(
  '/sessions/:sessionId/active',
  zValidator('json', zSetActive),
  async (c) => {
    const { userId } = c.get('user');
    const sessionId = c.req.param('sessionId');
    const sess = await db.query.chatSessions.findFirst({
      where: eq(schema.chatSessions.id, sessionId),
      columns: { id: true, userId: true },
    });
    if (!sess) return c.json({ error: 'not_found' }, 404);
    if (sess.userId !== userId) return c.json({ error: 'forbidden' }, 403);

    const { personaId } = c.req.valid('json');
    if (personaId) {
      const own = await assertOwnership(personaId, userId);
      if (!own.ok) return c.json({ error: own.error }, own.status);
    }
    await db
      .update(schema.chatSessions)
      .set({ activePersonaId: personaId })
      .where(eq(schema.chatSessions.id, sessionId));
    return c.json({ ok: true, activePersonaId: personaId });
  },
);
