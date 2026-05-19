/**
 * Wk11 PLANv2 G2 — Prompt preset CRUD.
 *
 * A preset owns a name, a system prelude (prepended to system prompt),
 * an authors-note block, and optional sampling overrides (temperature,
 * top_p). Users can flag exactly zero or one preset default, enforced
 * by the partial unique index in migration 0020.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { isFounderEmail } from '../lib/access-role.js';

export const presetsRouter = new Hono<{ Variables: AuthVars }>();
presetsRouter.use('*', requireAuth);

async function maxPresetsFor(userId: string): Promise<number> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { email: true, tier: true },
  });
  if (isFounderEmail(user?.email)) return 1000;
  if (user?.tier && user.tier !== 'FREE') return 25;
  return 3;
}

async function assertOwnership(presetId: string, userId: string) {
  const row = await db.query.promptPresets.findFirst({
    where: eq(schema.promptPresets.id, presetId),
    columns: { id: true, userId: true },
  });
  if (!row) return { ok: false as const, status: 404 as const, error: 'not_found' };
  if (row.userId !== userId) {
    return { ok: false as const, status: 403 as const, error: 'forbidden' };
  }
  return { ok: true as const };
}

const zCreate = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).default(''),
  systemPrelude: z.string().max(16000).default(''),
  authorsNote: z.string().max(4000).default(''),
  temperature: z.number().min(0).max(2).nullish(),
  topP: z.number().min(0).max(1).nullish(),
  isDefault: z.boolean().default(false),
});

const zUpdate = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(2000).optional(),
  systemPrelude: z.string().max(16000).optional(),
  authorsNote: z.string().max(4000).optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  topP: z.number().min(0).max(1).nullable().optional(),
  isDefault: z.boolean().optional(),
});

presetsRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const rows = await db
    .select()
    .from(schema.promptPresets)
    .where(eq(schema.promptPresets.userId, userId))
    .orderBy(desc(schema.promptPresets.isDefault), desc(schema.promptPresets.createdAt))
    .limit(100);
  return c.json({ presets: rows });
});

presetsRouter.post('/', zValidator('json', zCreate), async (c) => {
  const { userId } = c.get('user');
  const input = c.req.valid('json');
  const cap = await maxPresetsFor(userId);
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.promptPresets)
    .where(eq(schema.promptPresets.userId, userId));
  const count = countRows[0]?.count ?? 0;
  if (count >= cap) {
    return c.json(
      { error: 'tier_cap_exceeded', message: `Tier cap: ${cap} presets` },
      403,
    );
  }
  const id = nanoid();
  await db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx
        .update(schema.promptPresets)
        .set({ isDefault: false })
        .where(eq(schema.promptPresets.userId, userId));
    }
    await tx.insert(schema.promptPresets).values({
      id,
      userId,
      name: input.name,
      description: input.description,
      systemPrelude: input.systemPrelude,
      authorsNote: input.authorsNote,
      temperature: input.temperature ?? null,
      topP: input.topP ?? null,
      isDefault: input.isDefault,
    });
  });
  const row = await db.query.promptPresets.findFirst({
    where: eq(schema.promptPresets.id, id),
  });
  return c.json({ preset: row }, 201);
});

presetsRouter.patch('/:id', zValidator('json', zUpdate), async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const own = await assertOwnership(id, userId);
  if (!own.ok) return c.json({ error: own.error }, own.status);
  const input = c.req.valid('json');
  await db.transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx
        .update(schema.promptPresets)
        .set({ isDefault: false })
        .where(
          and(
            eq(schema.promptPresets.userId, userId),
            eq(schema.promptPresets.isDefault, true),
          ),
        );
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.systemPrelude !== undefined) patch.systemPrelude = input.systemPrelude;
    if (input.authorsNote !== undefined) patch.authorsNote = input.authorsNote;
    if (input.temperature !== undefined) patch.temperature = input.temperature;
    if (input.topP !== undefined) patch.topP = input.topP;
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
    await tx.update(schema.promptPresets).set(patch).where(eq(schema.promptPresets.id, id));
  });
  const row = await db.query.promptPresets.findFirst({
    where: eq(schema.promptPresets.id, id),
  });
  return c.json({ preset: row });
});

presetsRouter.delete('/:id', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const own = await assertOwnership(id, userId);
  if (!own.ok) return c.json({ error: own.error }, own.status);
  await db.delete(schema.promptPresets).where(eq(schema.promptPresets.id, id));
  return c.json({ ok: true });
});


