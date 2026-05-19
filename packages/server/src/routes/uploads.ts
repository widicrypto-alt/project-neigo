/**
 * S3 (R2) uploads — generic presigned PUT for Studio assets.
 *
 * Flow (same 3-step pattern as character-gallery):
 *   1) POST /intent  → server issues a presigned R2 PUT URL + key.
 *   2) Client PUTs   → binary goes directly to R2.
 *   3) POST /commit  → server HEADs the object, verifies, returns public URL.
 *
 * Gallery tab in v1 shows the user's own character_images rows so they can
 * re-use existing assets for story/scene uploads without re-uploading.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import {
  headObject,
  isR2Configured,
  presignPut,
  publicUrlFor,
  R2_ALLOWED_MIME,
  R2_MAX_BYTES,
} from '../services/r2-storage.js';

export const uploadsRouter = new Hono<{ Variables: Partial<AuthVars> }>();

uploadsRouter.use('*', requireAuth);

// ─── Schemas ───────────────────────────────────────────────────────────────

const zIntent = z.object({
  mime: z.string().max(32),
  size: z.number().int().min(1).max(R2_MAX_BYTES),
  kind: z.enum(['story_cover', 'story_hero', 'scene_bg', 'scene_tile', 'character_avatar']),
});

const zCommit = z.object({
  r2Key: z.string().min(1).max(256),
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function extFromMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/avif') return 'avif';
  return 'jpg';
}

function buildUploadKey(userId: string, kind: string, mime: string): string {
  const id = nanoid(12);
  const ext = extFromMime(mime);
  return `uploads/${userId}/${kind}/${id}.${ext}`;
}

// ─── Routes ────────────────────────────────────────────────────────────────

// POST /api/uploads/intent
uploadsRouter.post(
  '/intent',
  rateLimit({ name: 'uploads:intent', windowMs: 60 * 60_000, max: 20 }),
  zValidator('json', zIntent),
  async (c) => {
    if (!isR2Configured()) {
      return c.json({ error: 'storage_not_configured', message: 'Uploads are disabled on this deployment.' }, 503);
    }

    const { userId } = c.get('user') as { userId: string };
    const body = c.req.valid('json');

    if (!R2_ALLOWED_MIME.has(body.mime)) {
      return c.json({ error: 'unsupported_mime' }, 400);
    }

    const r2Key = buildUploadKey(userId, body.kind, body.mime);
    const uploadUrl = await presignPut({ key: r2Key, mime: body.mime, size: body.size });

    return c.json({
      uploadUrl,
      r2Key,
      publicUrl: publicUrlFor(r2Key),
    });
  },
);

// POST /api/uploads/commit
uploadsRouter.post(
  '/commit',
  rateLimit({ name: 'uploads:commit', windowMs: 60 * 60_000, max: 30 }),
  zValidator('json', zCommit),
  async (c) => {
    if (!isR2Configured()) return c.json({ error: 'storage_not_configured' }, 503);

    const { userId } = c.get('user') as { userId: string };
    const body = c.req.valid('json');

    // Ownership check
    if (!body.r2Key.startsWith(`uploads/${userId}/`)) {
      return c.json({ error: 'forbidden' }, 403);
    }

    const head = await headObject(body.r2Key);
    if (!head) return c.json({ error: 'upload_not_found' }, 404);

    if (!R2_ALLOWED_MIME.has(head.mime)) {
      return c.json({ error: 'unsupported_mime' }, 422);
    }
    if (head.bytes > R2_MAX_BYTES) {
      return c.json({ error: 'too_large' }, 422);
    }

    return c.json({ publicUrl: publicUrlFor(body.r2Key) });
  },
);

// GET /api/uploads/mine
// Returns the user's character_images rows as reusable gallery assets (v1).
// Skips kind filter when the kind is a story_* kind (those don't exist in character_images).
uploadsRouter.get('/mine', async (c) => {
  const { userId } = c.get('user') as { userId: string };
  const kind = c.req.query('kind') ?? '';
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);

  // For story_* kinds there are no character_images rows in v1 — return empty.
  const storyKinds = ['story_cover', 'story_hero'];
  if (storyKinds.includes(kind)) {
    return c.json({ images: [] });
  }

  const rows = await db
    .select({
      id: schema.characterImages.id,
      url: schema.characterImages.url,
      kind: schema.characterImages.kind,
      createdAt: schema.characterImages.createdAt,
    })
    .from(schema.characterImages)
    .where(
      and(
        eq(schema.characterImages.userId, userId),
        eq(schema.characterImages.moderationStatus, 'approved'),
      ),
    )
    .orderBy(desc(schema.characterImages.createdAt))
    .limit(limit);

  const images = rows.map((row) => ({
    id: row.id,
    publicUrl: row.url,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
  }));

  return c.json({ images });
});
