import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { BYOK_MODEL_CATALOG, BYOK_OPENROUTER_BASE_URL } from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { encryptByokKey, decryptByokKey, byokEncryptionAvailable } from '../lib/byok-crypto.js';
import { getAllLatency } from '../services/model-metrics.js';
import { env } from '../lib/env.js';
import { getQueueConnection } from '../lib/queue.js';

export const byokRouter = new Hono<{ Variables: AuthVars }>();
byokRouter.use('*', requireAuth);

// ── Validate rate limit — 5 attempts per minute per user ────────────────────
const validateLimiter = rateLimit({ name: 'byok:validate', windowMs: 60_000, max: 5 });
const saveLimiter = rateLimit({ name: 'byok:save', windowMs: 60_000, max: 10 });

/** Acceptable OpenRouter key format. */
const BYOK_KEY_RE = /^sk-or-v1-[0-9a-f]{64}$/;

const zByokSave = z.object({
  key: z.string().regex(BYOK_KEY_RE, 'Invalid OpenRouter key format. Must start with sk-or-v1-'),
  model: z.string().min(1).max(120),
});

const zByokValidate = z.object({
  key: z.string().regex(BYOK_KEY_RE, 'Invalid OpenRouter key format. Must start with sk-or-v1-'),
});

// GET /api/byok — get current BYOK status (never returns the actual key)
byokRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const row = await db.query.users.findFirst({
    columns: { byokOrKeyEnc: true, byokModel: true },
    where: eq(schema.users.id, userId),
  });
  const hasKey = Boolean(row?.byokOrKeyEnc);

  // Count BYOK-attributed AI turns in the last 24 hours for this user.
  // chat_messages.metadata->'modelKey' is set when BYOK is active (P1b).
  const usageResult = await db.execute(
    sql`SELECT COUNT(*)::int as count
        FROM chat_messages cm
        JOIN chat_sessions cs ON cs.id = cm.session_id
        WHERE cs.user_id = ${userId}
          AND cm.role = 'ASSISTANT'
          AND cm.metadata->>'modelKey' IS NOT NULL
          AND cm.created_at >= NOW() - INTERVAL '24 hours'`,
  );
  const byokTurnsToday = Number((usageResult[0] as { count: number } | undefined)?.count ?? 0);

  // Strip the OR slug (id) from catalog entries — client uses @neigo/shared directly.
  // We still send catalog so client can reconcile stored model against display labels
  // without exposing the upstream provider slug in the network response.
  const sanitizedCatalog = BYOK_MODEL_CATALOG.map(({ id: _slug, ...rest }) => rest);
  return c.json({
    hasKey,
    model: hasKey ? (row?.byokModel ?? null) : null,
    encryptionAvailable: byokEncryptionAvailable(),
    catalog: sanitizedCatalog,
    byokTurnsToday,
    // Section C: per-model latency baseline so the settings UI can render
    // "avg 3.2s" badges and surface slow/error models.
    latency: getAllLatency(),
  });
});

// POST /api/byok/validate — test a key without saving it
byokRouter.post(
  '/validate',
  validateLimiter,
  zValidator('json', zByokValidate),
  async (c) => {
    if (!byokEncryptionAvailable()) {
      return c.json({ error: 'byok_encryption_not_configured' }, 503);
    }
    const { key } = c.req.valid('json');

    // Cheap ping: 1 max_token with a tiny free model
    try {
      const res = await fetch(`${BYOK_OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://neigo.app',
          'X-Title': 'Project Neigo',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1,
          stream: false,
        }),
      });

      if (res.status === 401 || res.status === 403) {
        return c.json({ valid: false, error: 'invalid_key' });
      }
      if (!res.ok) {
        const body = await res.text();
        return c.json({ valid: false, error: 'openrouter_error', detail: body.slice(0, 200) });
      }

      // Try to read remaining credits from headers
      const credits = res.headers.get('x-ratelimit-remaining-tokens') ?? null;
      return c.json({ valid: true, credits });
    } catch {
      return c.json({ valid: false, error: 'network_error' });
    }
  },
);

// PATCH /api/byok — save (or update) BYOK key + model
byokRouter.patch(
  '/',
  saveLimiter,
  zValidator('json', zByokSave),
  async (c) => {
    if (!byokEncryptionAvailable()) {
      return c.json({ error: 'byok_encryption_not_configured' }, 503);
    }
    const { userId } = c.get('user');
    const { key, model } = c.req.valid('json');

    const encrypted = encryptByokKey(key.trim());
    await db
      .update(schema.users)
      .set({ byokOrKeyEnc: encrypted, byokModel: model })
      .where(eq(schema.users.id, userId));

    return c.json({ set: true, model });
  },
);

// DELETE /api/byok — remove stored key
byokRouter.delete('/', async (c) => {
  const { userId } = c.get('user');
  await db
    .update(schema.users)
    .set({ byokOrKeyEnc: null, byokModel: null })
    .where(eq(schema.users.id, userId));
  return c.json({ removed: true });
});

// POST /api/byok/test — PLANv3 X2.2. Ping the currently-saved BYOK key
// with the saved model (1 max_token) so users can verify the key still
// works without re-pasting it. Cached in Redis for 5 minutes (success)
// or 60 seconds (failure) so hammering the button doesn't burn quota.
//
// Gated by BYOK_TEST_PING_ENABLED (default true). Rate-limited to 10
// per minute per user in addition to the Redis cache.
const testLimiter = rateLimit({ name: 'byok:test', windowMs: 60_000, max: 10 });

type ByokTestResult =
  | { ok: true; latencyMs: number; model: string; testedAt: string }
  | { ok: false; reason: 'invalid_key' | 'invalid_model' | 'timeout' | 'network_error' | 'openrouter_error'; message: string; testedAt: string };

byokRouter.post('/test', testLimiter, async (c) => {
  if (!env.BYOK_TEST_PING_ENABLED) {
    return c.json({ error: 'byok_test_disabled' }, 503);
  }
  if (!byokEncryptionAvailable()) {
    return c.json({ error: 'byok_encryption_not_configured' }, 503);
  }
  const { userId } = c.get('user');
  const row = await db.query.users.findFirst({
    columns: { byokOrKeyEnc: true, byokModel: true },
    where: eq(schema.users.id, userId),
  });
  if (!row?.byokOrKeyEnc || !row.byokModel) {
    return c.json({ error: 'no_byok_key_configured' }, 404);
  }

  const redis = getQueueConnection();
  const cacheKey = `byok:test:${userId}`;
  if (redis) {
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return c.json(JSON.parse(cached) as ByokTestResult);
      } catch {
        // fall-through: ignore corrupt cache entry
      }
    }
  }

  let apiKey: string;
  try {
    apiKey = decryptByokKey(row.byokOrKeyEnc);
  } catch {
    return c.json({ error: 'byok_decrypt_failed' }, 500);
  }

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 10_000);
  const testedAt = new Date().toISOString();
  const start = Date.now();
  let result: ByokTestResult;
  try {
    const res = await fetch(`${BYOK_OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://neigo.app',
        'X-Title': 'Project Neigo',
      },
      body: JSON.stringify({
        model: row.byokModel,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      result = { ok: false, reason: 'invalid_key', message: 'Key rejected by OpenRouter.', testedAt };
    } else if (res.status === 404 || res.status === 400) {
      const body = await res.text().catch(() => '');
      result = {
        ok: false,
        reason: 'invalid_model',
        message: body.slice(0, 200) || `Model "${row.byokModel}" not available.`,
        testedAt,
      };
    } else if (!res.ok) {
      const body = await res.text().catch(() => '');
      result = {
        ok: false,
        reason: 'openrouter_error',
        message: body.slice(0, 200) || `OpenRouter returned ${res.status}.`,
        testedAt,
      };
    } else {
      // Best-effort body read so we raise visibility into silent upstream errors.
      await res.text().catch(() => '');
      result = { ok: true, latencyMs: Date.now() - start, model: row.byokModel, testedAt };
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'AbortError') {
      result = { ok: false, reason: 'timeout', message: 'OpenRouter did not reply within 10s.', testedAt };
    } else {
      result = {
        ok: false,
        reason: 'network_error',
        message: err instanceof Error ? err.message : 'Network error reaching OpenRouter.',
        testedAt,
      };
    }
  } finally {
    clearTimeout(abortTimer);
  }

  if (redis) {
    const ttl = result.ok ? 300 : 60;
    await redis.set(cacheKey, JSON.stringify(result), 'EX', ttl).catch(() => null);
  }
  return c.json(result, result.ok ? 200 : 400);
});
