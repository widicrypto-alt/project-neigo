/**
 * Sprite Manifest routes — /api/characters/:id/sprite-manifest
 *
 * GET    /               → current manifest + slot definitions
 * PUT    /               → replace full manifest (admin / owner)
 * POST   /presign        → issue R2 presigned PUT URL for a single slot
 * POST   /commit         → confirm upload, update manifest entry
 * DELETE /:slot/:name    → remove one slot entry + delete R2 object
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import sharp from 'sharp';
import {
  buildSpriteKey,
  deleteObject,
  getObjectBytes,
  headObject,
  isR2Configured,
  putObjectBytes,
  presignPut,
  publicUrlFor,
  SpriteManifest,
  SPRITE_EXPRESSION_SLOTS,
  SPRITE_OUTFIT_SLOTS,
  SPRITE_POSE_SLOTS,
} from '../services/r2-storage.js';

export const spriteManifestRouter = new Hono<{ Variables: AuthVars }>();
spriteManifestRouter.use('*', requireAuth);

// ─── Helpers ─────────────────────────────────────────────────────────────────

type SlotCategory = 'expressions' | 'poses' | 'outfits';
const SLOT_NAMES: Record<SlotCategory, readonly string[]> = {
  expressions: SPRITE_EXPRESSION_SLOTS,
  poses: SPRITE_POSE_SLOTS,
  outfits: SPRITE_OUTFIT_SLOTS,
};

const SLOT_LABELS: Record<string, string> = {
  // expressions
  neutral: 'Neutral', happy: 'Happy / Smile', sad: 'Sad / Hurt',
  surprised: 'Surprised / Shocked', angry: 'Angry / Frustrated',
  embarrassed: 'Embarrassed / Flustered', curious: 'Curious / Interested',
  scared: 'Scared / Fearful', smug: 'Smug / Confident',
  tender: 'Tender / Warm', conflicted: 'Conflicted / Uncertain', shy: 'Shy / Bashful',
  // poses
  standing: 'Standing', sitting: 'Sitting', leaning: 'Leaning',
  action: 'Action', intimate: 'Intimate',
  // outfits
  default: 'Default', casual: 'Casual', formal: 'Formal',
};

async function getCharacter(id: string, userId: string) {
  const c = await db.query.characters.findFirst({
    where: eq(schema.characters.id, id),
    columns: { id: true, ownerId: true, persona: true },
  });
  if (!c) return { error: 'not_found' as const };
  if (c.ownerId !== userId) return { error: 'forbidden' as const };
  return { character: c };
}

function getManifest(persona: unknown): SpriteManifest {
  const p = (persona ?? {}) as Record<string, unknown>;
  const m = (p.spriteManifest ?? {}) as Partial<SpriteManifest>;
  return {
    expressions: (m.expressions ?? {}) as Record<string, string>,
    poses: (m.poses ?? {}) as Record<string, string>,
    outfits: (m.outfits ?? {}) as Record<string, string>,
    updatedAt: m.updatedAt,
  };
}

async function saveManifest(characterId: string, manifest: SpriteManifest) {
  const current = await db.query.characters.findFirst({
    where: eq(schema.characters.id, characterId),
    columns: { persona: true },
  });
  if (!current) return;
  const persona = (current.persona ?? {}) as Record<string, unknown>;
  await db.update(schema.characters)
    .set({ persona: { ...persona, spriteManifest: { ...manifest, updatedAt: new Date().toISOString() } }, updatedAt: new Date() })
    .where(eq(schema.characters.id, characterId));
}

function buildSlotDefs(manifest: SpriteManifest) {
  const slots: Array<{
    slot: SlotCategory; name: string; label: string; url: string | null;
  }> = [];
  for (const [cat, names] of Object.entries(SLOT_NAMES) as Array<[SlotCategory, readonly string[]]>) {
    for (const name of names) {
      slots.push({
        slot: cat,
        name,
        label: SLOT_LABELS[name] ?? name,
        url: manifest[cat][name] ?? null,
      });
    }
  }
  return slots;
}

// ─── GET / — fetch manifest ───────────────────────────────────────────────────

spriteManifestRouter.get('/', async (c) => {
  const characterId = c.req.param('id')!;
  const { userId } = c.get('user');
  const result = await getCharacter(characterId, userId);
  if ('error' in result) return c.json({ error: result.error }, result.error === 'not_found' ? 404 : 403);
  const manifest = getManifest(result.character.persona);
  return c.json({ manifest, slots: buildSlotDefs(manifest) });
});

// ─── PUT / — replace full manifest ───────────────────────────────────────────

const zManifestBody = z.object({
  expressions: z.record(z.string(), z.string().url()).optional(),
  poses: z.record(z.string(), z.string().url()).optional(),
  outfits: z.record(z.string(), z.string().url()).optional(),
});

spriteManifestRouter.put('/', zValidator('json', zManifestBody), async (c) => {
  const characterId = c.req.param('id')!;
  const { userId } = c.get('user');
  const result = await getCharacter(characterId, userId);
  if ('error' in result) return c.json({ error: result.error }, result.error === 'not_found' ? 404 : 403);
  const body = c.req.valid('json');
  const current = getManifest(result.character.persona);
  const updated: SpriteManifest = {
    expressions: { ...current.expressions, ...(body.expressions ?? {}) },
    poses: { ...current.poses, ...(body.poses ?? {}) },
    outfits: { ...current.outfits, ...(body.outfits ?? {}) },
  };
  await saveManifest(characterId, updated);
  return c.json({ manifest: updated, slots: buildSlotDefs(updated) });
});

// ─── POST /presign — get upload URL ──────────────────────────────────────────

const SLOT_VALUES = ['expressions', 'poses', 'outfits'] as const;

const zPresign = z.object({
  slot: z.enum(SLOT_VALUES),
  name: z.string().min(1).max(64),
  size: z.number().int().min(1).max(20 * 1024 * 1024),
});

spriteManifestRouter.post('/presign', zValidator('json', zPresign), async (c) => {
  if (!isR2Configured()) return c.json({ error: 'storage_not_configured' }, 503);
  const characterId = c.req.param('id')!;
  const { userId } = c.get('user');
  const result = await getCharacter(characterId, userId);
  if ('error' in result) return c.json({ error: result.error }, result.error === 'not_found' ? 404 : 403);
  const { slot, name, size } = c.req.valid('json');

  // Validate slot name
  const validNames = SLOT_NAMES[slot];
  if (!validNames.includes(name)) {
    return c.json({ error: 'invalid_slot_name', validNames }, 400);
  }

  const key = buildSpriteKey({ characterId, slot, name });
  const url = await presignPut({
    key,
    mime: 'image/webp',
    size,
    expiresInSeconds: 900,
    cacheControl: 'public, max-age=31536000, immutable',
  });
  const publicUrl = publicUrlFor(key);
  return c.json({ uploadUrl: url, key, publicUrl });
});

// ─── POST /commit — confirm upload, update manifest ──────────────────────────

const zCommit = z.object({
  slot: z.enum(SLOT_VALUES),
  name: z.string().min(1).max(64),
  key: z.string().min(1).max(256),
});

spriteManifestRouter.post('/commit', zValidator('json', zCommit), async (c) => {
  if (!isR2Configured()) return c.json({ error: 'storage_not_configured' }, 503);
  const characterId = c.req.param('id')!;
  const { userId } = c.get('user');
  const result = await getCharacter(characterId, userId);
  if ('error' in result) return c.json({ error: result.error }, result.error === 'not_found' ? 404 : 403);
  const { slot, name, key } = c.req.valid('json');

  const head = await headObject(key);
  if (!head) return c.json({ error: 'object_not_found' }, 404);

  // Async: strip EXIF + re-encode as WebP quality 85, max 1024px wide.
  // Fire-and-forget — client gets the URL immediately, optimized version lands shortly.
  void (async () => {
    try {
      const raw = await getObjectBytes(key);
      if (!raw) return;
      const optimized = await sharp(raw)
        .resize({ width: 1024, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      await putObjectBytes({ key, body: optimized, mime: 'image/webp' });
    } catch {
      // Non-fatal: original upload stays if sharp fails
    }
  })();

  const publicUrl = publicUrlFor(key);
  const manifest = getManifest(result.character.persona);
  manifest[slot][name] = publicUrl;
  await saveManifest(characterId, manifest);

  return c.json({ url: publicUrl, slot, name, manifest });
});

// ─── DELETE /:slot/:name — remove entry ──────────────────────────────────────

spriteManifestRouter.delete('/:slot/:name', async (c) => {
  if (!isR2Configured()) return c.json({ error: 'storage_not_configured' }, 503);
  const characterId = c.req.param('id')!;
  const { userId } = c.get('user');
  const slot = c.req.param('slot')! as SlotCategory;
  const name = c.req.param('name')!;
  const result = await getCharacter(characterId, userId);
  if ('error' in result) return c.json({ error: result.error }, result.error === 'not_found' ? 404 : 403);

  const manifest = getManifest(result.character.persona);
  const key = buildSpriteKey({ characterId, slot, name });
  await deleteObject(key);
  delete manifest[slot][name];
  await saveManifest(characterId, manifest);

  return c.json({ ok: true, slot, name });
});
