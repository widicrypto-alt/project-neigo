/**
 * PLANv3 X2.5 — Regex scripts CRUD + dry-run test endpoint.
 *
 *  GET    /api/regex-scripts?placement=…&scope=…&scopeId=…
 *  POST   /api/regex-scripts                (create)
 *  PATCH  /api/regex-scripts/:id            (partial update)
 *  DELETE /api/regex-scripts/:id
 *  POST   /api/regex-scripts/:id/test       (dry-run against sampleText)
 *
 * All routes owner-scoped via requireAuth → userId. The :id routes also
 * verify row.user_id === userId before applying changes.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { runRegexScripts } from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';

export const regexScriptsRouter = new Hono<{ Variables: AuthVars }>();
regexScriptsRouter.use('*', requireAuth);

const SCOPE = z.enum(['character', 'preset', 'user']);
const PLACEMENT = z.enum(['edit_input', 'edit_output', 'edit_process', 'edit_display']);

const zCreate = z.object({
  scope: SCOPE,
  scopeId: z.string().max(36).optional().nullable(),
  name: z.string().min(1).max(200),
  findRegex: z.string().min(1).max(256),
  replaceString: z.string().max(1024).default(''),
  trimStrings: z.array(z.string().max(128)).max(10).default([]),
  placement: PLACEMENT,
  flags: z.string().max(8).default('g'),
  promptOnly: z.boolean().default(false),
  orderIndex: z.number().int().min(0).max(9999).default(0),
  minDepth: z.number().int().min(0).max(9999).optional().nullable(),
  maxDepth: z.number().int().min(0).max(9999).optional().nullable(),
  enabled: z.boolean().default(true),
});

const zPatch = zCreate.partial();

const zTest = z.object({
  sampleText: z.string().min(0).max(20_000),
});

/**
 * Validate that a regex pattern + flags actually compile before persistence.
 * Returns error message on failure, null on success.
 */
function validateRegex(findRegex: string, flags: string): string | null {
  try {
    new RegExp(findRegex, flags);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'invalid_regex';
  }
}

regexScriptsRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const placement = PLACEMENT.optional().safeParse(c.req.query('placement'));
  const scope = SCOPE.optional().safeParse(c.req.query('scope'));
  const scopeId = c.req.query('scopeId') ?? null;

  const conds = [eq(schema.regexScripts.userId, userId)];
  if (placement.success && placement.data) conds.push(eq(schema.regexScripts.placement, placement.data));
  if (scope.success && scope.data) conds.push(eq(schema.regexScripts.scope, scope.data));
  if (scopeId) conds.push(eq(schema.regexScripts.scopeId, scopeId));

  const rows = await db
    .select()
    .from(schema.regexScripts)
    .where(and(...conds))
    .orderBy(asc(schema.regexScripts.orderIndex), asc(schema.regexScripts.createdAt));
  return c.json({ scripts: rows });
});

regexScriptsRouter.post('/', zValidator('json', zCreate), async (c) => {
  const { userId } = c.get('user');
  const body = c.req.valid('json');
  // Defence in depth: reject non-scope 'user' rows without scopeId and
  // non-user rows without scopeId.
  if (body.scope !== 'user' && !body.scopeId) {
    return c.json({ error: 'scope_id_required' }, 400);
  }
  const compileErr = validateRegex(body.findRegex, body.flags);
  if (compileErr) return c.json({ error: 'invalid_regex', detail: compileErr }, 400);
  const id = nanoid();
  await db.insert(schema.regexScripts).values({
    id,
    userId,
    scope: body.scope,
    scopeId: body.scope === 'user' ? null : body.scopeId ?? null,
    name: body.name,
    findRegex: body.findRegex,
    replaceString: body.replaceString,
    trimStrings: body.trimStrings,
    placement: body.placement,
    flags: body.flags,
    promptOnly: body.promptOnly,
    orderIndex: body.orderIndex,
    minDepth: body.minDepth ?? null,
    maxDepth: body.maxDepth ?? null,
    enabled: body.enabled,
  });
  return c.json({ id }, 201);
});

regexScriptsRouter.patch('/:id', zValidator('json', zPatch), async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const row = await db.query.regexScripts.findFirst({
    where: and(eq(schema.regexScripts.id, id), eq(schema.regexScripts.userId, userId)),
  });
  if (!row) return c.json({ error: 'not_found' }, 404);

  // If either pattern or flags change, re-validate compile using the
  // effective values (falling back to stored row when unchanged).
  if (body.findRegex !== undefined || body.flags !== undefined) {
    const effFind = body.findRegex ?? row.findRegex;
    const effFlags = body.flags ?? row.flags;
    const compileErr = validateRegex(effFind, effFlags);
    if (compileErr) return c.json({ error: 'invalid_regex', detail: compileErr }, 400);
  }

  await db
    .update(schema.regexScripts)
    .set({
      ...(body.scope !== undefined ? { scope: body.scope } : {}),
      ...(body.scopeId !== undefined ? { scopeId: body.scopeId } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.findRegex !== undefined ? { findRegex: body.findRegex } : {}),
      ...(body.replaceString !== undefined ? { replaceString: body.replaceString } : {}),
      ...(body.trimStrings !== undefined ? { trimStrings: body.trimStrings } : {}),
      ...(body.placement !== undefined ? { placement: body.placement } : {}),
      ...(body.flags !== undefined ? { flags: body.flags } : {}),
      ...(body.promptOnly !== undefined ? { promptOnly: body.promptOnly } : {}),
      ...(body.orderIndex !== undefined ? { orderIndex: body.orderIndex } : {}),
      ...(body.minDepth !== undefined ? { minDepth: body.minDepth } : {}),
      ...(body.maxDepth !== undefined ? { maxDepth: body.maxDepth } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.regexScripts.id, id));
  return c.json({ ok: true });
});

regexScriptsRouter.delete('/:id', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const deleted = await db
    .delete(schema.regexScripts)
    .where(and(eq(schema.regexScripts.id, id), eq(schema.regexScripts.userId, userId)))
    .returning({ id: schema.regexScripts.id });
  if (deleted.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

regexScriptsRouter.post('/:id/test', zValidator('json', zTest), async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const { sampleText } = c.req.valid('json');
  const row = await db.query.regexScripts.findFirst({
    where: and(eq(schema.regexScripts.id, id), eq(schema.regexScripts.userId, userId)),
  });
  if (!row) return c.json({ error: 'not_found' }, 404);

  const started = performance.now();
  const result = runRegexScripts(
    sampleText,
    [
      {
        id: row.id,
        findRegex: row.findRegex,
        replaceString: row.replaceString,
        trimStrings: Array.isArray(row.trimStrings) ? (row.trimStrings as string[]) : [],
        flags: row.flags,
        minDepth: row.minDepth,
        maxDepth: row.maxDepth,
        promptOnly: row.promptOnly,
      },
    ],
    { turnIndex: 0 },
  );
  return c.json({
    before: sampleText,
    after: result.text,
    applied: result.applied.length === 1,
    errors: result.errors,
    latencyMs: Math.round(performance.now() - started),
  });
});
