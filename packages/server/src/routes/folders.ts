/**
 * Wk13 PLANv2 H1 — Chat folders.
 *
 * Flat folder taxonomy. Routes:
 *   GET    /api/folders                 — list caller's folders
 *   POST   /api/folders                 — { name, color?, sortOrder? }
 *   PATCH  /api/folders/:id             — rename / recolor / reorder
 *   DELETE /api/folders/:id             — deletes folder (sessions set to NULL)
 *
 * Tier caps FREE=3 / PAID=25 / FOUNDER=1000 (mirrors personas/presets).
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { isFounderEmail } from '../lib/access-role.js';

export const foldersRouter = new Hono<{ Variables: AuthVars }>();
foldersRouter.use('*', requireAuth);

async function maxFoldersFor(userId: string): Promise<number> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { email: true, tier: true },
  });
  if (isFounderEmail(user?.email)) return 1000;
  if (user?.tier && user.tier !== 'FREE') return 25;
  return 3;
}

async function assertOwnership(folderId: string, userId: string) {
  const row = await db.query.chatFolders.findFirst({
    where: eq(schema.chatFolders.id, folderId),
    columns: { id: true, userId: true },
  });
  if (!row) return { ok: false as const, status: 404 as const, error: 'not_found' };
  if (row.userId !== userId) {
    return { ok: false as const, status: 403 as const, error: 'forbidden' };
  }
  return { ok: true as const };
}

foldersRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const rows = await db
    .select()
    .from(schema.chatFolders)
    .where(eq(schema.chatFolders.userId, userId))
    .orderBy(asc(schema.chatFolders.sortOrder), asc(schema.chatFolders.createdAt));
  return c.json({ folders: rows });
});

const zCreate = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().max(16).nullish(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

foldersRouter.post('/', zValidator('json', zCreate), async (c) => {
  const { userId } = c.get('user');
  const input = c.req.valid('json');
  const cap = await maxFoldersFor(userId);
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.chatFolders)
    .where(eq(schema.chatFolders.userId, userId));
  const count = countRows[0]?.count ?? 0;
  if (count >= cap) {
    return c.json(
      { error: 'tier_cap_exceeded', message: `Tier cap: ${cap} folders` },
      403,
    );
  }
  const id = nanoid();
  await db.insert(schema.chatFolders).values({
    id,
    userId,
    name: input.name,
    color: input.color ?? null,
    sortOrder: input.sortOrder ?? count,
  });
  const row = await db.query.chatFolders.findFirst({
    where: eq(schema.chatFolders.id, id),
  });
  return c.json({ folder: row }, 201);
});

const zUpdate = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: z.string().max(16).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

foldersRouter.patch('/:id', zValidator('json', zUpdate), async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const own = await assertOwnership(id, userId);
  if (!own.ok) return c.json({ error: own.error }, own.status);
  const input = c.req.valid('json');
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.color !== undefined) patch.color = input.color;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  await db.update(schema.chatFolders).set(patch).where(eq(schema.chatFolders.id, id));
  const row = await db.query.chatFolders.findFirst({
    where: eq(schema.chatFolders.id, id),
  });
  return c.json({ folder: row });
});

foldersRouter.delete('/:id', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const own = await assertOwnership(id, userId);
  if (!own.ok) return c.json({ error: own.error }, own.status);
  await db.delete(schema.chatFolders).where(eq(schema.chatFolders.id, id));
  return c.json({ ok: true });
});


