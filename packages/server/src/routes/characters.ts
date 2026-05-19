import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, count, desc, eq, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { zCreateCharacter, TIER_CONFIG } from '@neigo/shared';
import type { Character } from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { requireAuth, optionalAuth, type AuthVars } from '../middleware/auth.js';
import { resolveAccessRole, resolveEffectiveTier } from '../lib/access-role.js';
import { generateOpeningLinePreview } from '../services/character-opening-line.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { renderAndSanitize } from '../services/rich-content.js';
import { saveRevision } from '../services/content-revisions.js';
import { computeCharacterTokenCache, mergePersona } from '../services/detail-extensions.js';

/**
 * BACKLOG B2.6 — Returns true when the character's primary avatar exists
 * but is not yet `approved`. Used to gate `isPublic = true` transitions:
 * we hold the publish until moderation clears.
 */
async function isPublishBlockedByPendingAvatar(characterId: string): Promise<boolean> {
  const primary = await db.query.characterImages.findFirst({
    where: and(
      eq(schema.characterImages.characterId, characterId),
      eq(schema.characterImages.isPrimary, true),
    ),
    columns: { id: true, moderationStatus: true },
  });
  // No primary image at all → nothing to block on (avatar is optional).
  if (!primary) return false;
  return primary.moderationStatus !== 'approved';
}

export const charactersRouter = new Hono<{ Variables: Partial<AuthVars> }>();

// Public read uses optionalAuth; write routes enforce requireAuth inline.
charactersRouter.use('*', optionalAuth);

async function isFounderUser(userId: string): Promise<boolean> {
  const userRow = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  const role = resolveAccessRole({
    email: userRow?.email,
    isFoundingReader: userRow?.isFoundingReader,
  });
  return role === 'FOUNDER';
}

function rowToCharacter(row: typeof schema.characters.$inferSelect): Character {
  const persona = (row.persona ?? {}) as Record<string, unknown>;
  const asStr = (v: unknown) => (typeof v === 'string' ? v : '');
  const backstoryTiers = Array.isArray(persona.backstoryTiers)
    ? (persona.backstoryTiers as Array<{ minTrust: number; text: string }>)
    : undefined;
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    avatarUrl: row.avatarUrl,
    spriteSheetUrl: asStr(persona.spriteSheetUrl) || null,
    age: asStr(persona.age),
    gender: asStr(persona.gender),
    personality: asStr(persona.personality),
    speechStyle: asStr(persona.speechStyle),
    likes: asStr(persona.likes),
    dislikes: asStr(persona.dislikes),
    background: asStr(persona.background),
    worldInfo: asStr(persona.worldInfo),
    exampleDialogues: asStr(persona.exampleDialogues),
    jealousyExpression: asStr(persona.jealousyExpression),
    forbiddenTopics: asStr(persona.forbiddenTopics),
    relationshipType: asStr(persona.relationshipType),
    relationshipDescription: asStr(persona.relationshipDescription),
    tags: (row.tags as string[]) ?? [],
    folder: row.folder,
    tonePreset: row.tonePreset as Character['tonePreset'],
    isBuiltIn: row.isBuiltIn,
    isPublic: row.isPublic,
    birthday: asStr(persona.birthday) || null,
    coreTraits: asStr(persona.coreTraits),
    dynamicTraits: asStr(persona.dynamicTraits),
    verbalHabits: asStr(persona.verbalHabits),
    conflictStyle: asStr(persona.conflictStyle),
    backstoryTiers,
    language: (row.language ?? 'id') as Character['language'],
    languagesSpoken: Array.isArray(row.languagesSpoken) ? (row.languagesSpoken as string[]) : ['id'],
    isRetired: row.isRetired,
    allowInStories: row.allowInStories,
    contentRating: (row.contentRating ?? 'SFW') as 'SFW' | 'NSFW' | 'EXPLICIT',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * PLANIMPv7 §1.1 — Sync persona fields to top-level Discover columns.
 * Normalizes 'age' string → int and 'gender' string → single char.
 */
function syncMetadata(input: Partial<z.infer<typeof zCreateCharacter>>) {
  const out: { age?: number | null; gender?: string | null } = {};
  if (input.age !== undefined) {
    const age = parseInt(input.age, 10);
    out.age = Number.isNaN(age) ? null : age;
  }
  if (input.gender !== undefined) {
    const g = input.gender.trim().toUpperCase().slice(0, 1);
    out.gender = ['M', 'F', 'O'].includes(g) ? g : 'O';
  }
  return out;
}

/** Build the PLANIMPv2 detail object. Applies secret-prompt projection. */
function buildCharacterDetail(row: typeof schema.characters.$inferSelect, isOwner: boolean) {
  const persona = (row.persona ?? {}) as Record<string, unknown>;
  const asStr = (v: unknown) => (typeof v === 'string' ? v : '');
  const semanticPersona = mergePersona(row.personaMd ?? null, persona);
  // Prefer cached token counts; fallback compute on-the-fly if cache is empty.
  const cache = (row.tokenCountCache ?? {}) as { description?: number; exampleDialog?: number; total?: number };
  const tokenInfo = (typeof cache.total === 'number' && cache.total > 0)
    ? { character: cache.description ?? 0, exampleDialog: cache.exampleDialog ?? 0, total: cache.total }
    : (() => {
        const c = computeCharacterTokenCache(row);
        return { character: c.description, exampleDialog: c.exampleDialog, total: c.total };
      })();
  return {
    slug: row.slug,
    tagline: row.tagline,
    descriptionMd: row.descriptionMd,
    descriptionHtml: row.descriptionHtml,
    loreSectionsMd: row.loreSectionsMd as unknown[],
    exampleDialogMd: row.exampleDialogMd,
    exampleDialogHtml: row.exampleDialogHtml,
    isSecretPromptHidden: row.isSecretPromptHidden,
    // PLANIMPv2 §3.1 — semantic persona (4-row); null-fields allowed.
    persona: semanticPersona,
    // PLANIMPv2 §3.1 — cached token estimate.
    tokenInfo,
    systemPromptPreview: isOwner || !row.isSecretPromptHidden
      ? (asStr(persona.systemPromptOverride) || null)
      : null,
    totalViews: row.totalViews,
    totalChats: row.totalChats,
    totalLikes: row.totalLikes,
    totalBookmarks: row.totalBookmarks,
    totalRatings: row.totalRatings,
    avgStars: row.avgStars,
    totalComments: row.totalComments,
    totalRoses: row.totalRoses,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedPublicAt: row.updatedPublicAt?.toISOString() ?? null,
  };
}

/** List: own + public (requires auth for owned items) */
charactersRouter.get('/', async (c) => {
  const authUser = c.get('user') as { userId: string } | undefined;
  const userId = authUser?.userId;
  if (!userId) {
    // Unauthenticated: return public characters only.
    const rows = await db
      .select()
      .from(schema.characters)
      .where(
        and(
          eq(schema.characters.isPublic, true),
          eq(schema.characters.isRetired, false),
          sql`${schema.characters.deletedAt} IS NULL`,
        ),
      )
      .orderBy(desc(schema.characters.updatedAt));
    return c.json({ characters: rows.map(rowToCharacter), ownedCount: 0, maxCharacters: 0 });
  }
  const founder = await isFounderUser(userId);
  const rows = founder
    ? await db
        .select()
        .from(schema.characters)
        .where(sql`${schema.characters.deletedAt} IS NULL`)
        .orderBy(desc(schema.characters.updatedAt))
    : await db
        .select()
        .from(schema.characters)
        .where(
          and(
            or(eq(schema.characters.ownerId, userId), eq(schema.characters.isPublic, true)),
            sql`${schema.characters.deletedAt} IS NULL`,
          ),
        )
        .orderBy(desc(schema.characters.updatedAt));
  const visibleRows = rows.filter(
    (row) => row.ownerId === userId || !row.isRetired,
  );

  // Return owned count + tier limit so the UI can show a usage indicator.
  const userRow = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  const tier = resolveEffectiveTier({
    email: userRow?.email,
    storedTier: userRow?.tier as keyof typeof TIER_CONFIG | undefined,
  });
  const ownedCount = visibleRows.filter((r) => r.ownerId === userId).length;
  const maxCharacters = TIER_CONFIG[tier]?.maxCharacters ?? 2;

  return c.json({ characters: visibleRows.map(rowToCharacter), ownedCount, maxCharacters });
});

charactersRouter.post('/', requireAuth, zValidator('json', zCreateCharacter), async (c) => {
  const { userId } = (c.get('user') as { userId: string });
  const input = c.req.valid('json');

  // Fetch user tier to enforce character limit.
  const userRow = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  const tier = resolveEffectiveTier({
    email: userRow?.email,
    storedTier: userRow?.tier as keyof typeof TIER_CONFIG | undefined,
  });
  const tierCfg = TIER_CONFIG[tier] ?? TIER_CONFIG['FREE'];

  if (tierCfg.maxCharacters !== -1) {
    const [row] = await db
      .select({ value: count() })
      .from(schema.characters)
      .where(eq(schema.characters.ownerId, userId));
    const owned = row?.value ?? 0;
    if (owned >= tierCfg.maxCharacters) {
      return c.json(
        {
          error: 'character_limit_reached',
          message: `Your ${tier} plan allows up to ${tierCfg.maxCharacters} character${tierCfg.maxCharacters === 1 ? '' : 's'}. Delete one or upgrade to create more.`,
          limit: tierCfg.maxCharacters,
          current: owned,
        },
        403,
      );
    }
  }

  const id = nanoid();
  let descriptionHtml: string | null = null;
  if (input.descriptionMd) {
    const { html } = renderAndSanitize(input.descriptionMd);
    descriptionHtml = html;
  }

  // PLANIMPv7 §1.4 — Gate initial publish if avatar is pending.
  let isPublic = input.isPublic ?? true;
  let queuedForPublish = false;
  if (isPublic) {
    const blocked = await isPublishBlockedByPendingAvatar(id);
    if (blocked) {
      isPublic = false;
      queuedForPublish = true;
    }
  }

  const metadata = syncMetadata(input);

  await db.insert(schema.characters).values({
    id,
    ownerId: userId,
    name: input.name,
    avatarUrl: input.avatarUrl ?? null,
    language: input.language ?? 'id',
    tagline: input.tagline ?? null,
    descriptionMd: input.descriptionMd ?? null,
    descriptionHtml,
    persona: {
      age: input.age,
      gender: input.gender,
      personality: input.personality,
      speechStyle: input.speechStyle,
      likes: input.likes,
      dislikes: input.dislikes,
      background: input.background,
      worldInfo: input.worldInfo,
      exampleDialogues: input.exampleDialogues,
      jealousyExpression: input.jealousyExpression,
      forbiddenTopics: input.forbiddenTopics,
      relationshipType: input.relationshipType,
      relationshipDescription: input.relationshipDescription,
      birthday: input.birthday,
      coreTraits: input.coreTraits,
      dynamicTraits: input.dynamicTraits,
      verbalHabits: input.verbalHabits,
      conflictStyle: input.conflictStyle,
      spriteSheetUrl: input.spriteSheetUrl ?? null,
    },
    ...metadata,
    tags: input.tags,
    folder: input.folder ?? null,
    tonePreset: input.tonePreset,
    isPublic,
    queuedForPublish,
    publishedAt: isPublic ? new Date() : null,
  });
  const row = await db.query.characters.findFirst({ where: eq(schema.characters.id, id) });
  return c.json({ character: row ? rowToCharacter(row) : null });
});

/**
 * Character creation wizard: preview how the character would open the very
 * first scene. Stateless — nothing persists. Rate-limited per-user to keep
 * the AI spend bounded while a creator iterates on their draft.
 */
const zOpeningPreview = z.object({
  name: z.string().min(1).max(200),
  personality: z.string().min(10),
  speechStyle: z.string().optional().nullable(),
  tonePreset: z.string().optional().nullable(),
  background: z.string().optional().nullable(),
  worldInfo: z.string().optional().nullable(),
  relationshipType: z.string().optional().nullable(),
  relationshipDescription: z.string().optional().nullable(),
});

charactersRouter.post(
  '/preview-opening',
  rateLimit({ windowMs: 60_000, max: 12 }),
  zValidator('json', zOpeningPreview),
  async (c) => {
    const input = c.req.valid('json');
    const { line } = await generateOpeningLinePreview(input);
    return c.json({ line });
  },
);

charactersRouter.get('/:id', async (c) => {
  const authUser = c.get('user') as { userId: string } | undefined;
  const userId = authUser?.userId;
  const id = c.req.param('id')!;

  if (userId) {
    const founder = await isFounderUser(userId);
    const row = founder
      ? await db.query.characters.findFirst({ where: eq(schema.characters.id, id) })
      : await db.query.characters.findFirst({
          where: and(
            eq(schema.characters.id, id),
            or(eq(schema.characters.ownerId, userId), eq(schema.characters.isPublic, true)),
          ),
        });
    if (!row) return c.json({ error: 'not_found' }, 404);
    const isOwner = row.ownerId === userId || (await isFounderUser(userId));
    // PLANIMPv7 §2 — gate flagged entities for non-owner.
    if (row.isFlaggedForReview && !isOwner) {
      return c.json({ error: 'under_review', message: 'Konten sedang ditinjau moderator.' }, 403);
    }
    // PLANIMPv7 §7 — soft-deleted invisible for non-owner.
    if (row.deletedAt && !isOwner) return c.json({ error: 'not_found' }, 404);
    // Apply secret prompt projection.
    const character = rowToCharacter(row);
    const detail = buildCharacterDetail(row, isOwner);
    return c.json({ character, detail, isOwner });
  }

  // Public access (no auth).
  const row = await db.query.characters.findFirst({
    where: and(eq(schema.characters.id, id), eq(schema.characters.isPublic, true)),
  });
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.isFlaggedForReview) {
    return c.json({ error: 'under_review', message: 'Konten sedang ditinjau moderator.' }, 403);
  }
  if (row.deletedAt) return c.json({ error: 'not_found' }, 404);
  return c.json({ character: rowToCharacter(row), detail: buildCharacterDetail(row, false), isOwner: false });
});

charactersRouter.delete('/:id', requireAuth, async (c) => {
  const { userId } = (c.get('user') as { userId: string });
  const id = c.req.param('id')!;
  const founder = await isFounderUser(userId);
  const now = new Date();
  const result = founder
    ? await db
        .update(schema.characters)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(schema.characters.id, id))
    : await db
        .update(schema.characters)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(schema.characters.id, id), eq(schema.characters.ownerId, userId)));
  return c.json({ ok: true, deleted: !!result });
});

// ─── PLANIMPv2 — Character detail page extensions ────────────────────────────

const zUpdateCharacterDetail = z.object({
  tagline: z.string().max(200).nullable().optional(),
  descriptionMd: z.string().max(32_000).nullable().optional(),
  exampleDialogMd: z.string().max(16_000).nullable().optional(),
  loreSectionsMd: z.array(z.object({
    title: z.string().max(120),
    bodyMd: z.string().max(8000),
    order: z.number().int().min(0).max(99),
  })).max(6).optional(),
  isSecretPromptHidden: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  slug: z.string().max(120).regex(/^[a-z0-9-]+$/).nullable().optional(),
  revisionSummary: z.string().max(200).nullable().optional(),
  // PLANIMPv2 — semantic persona override (optional).
  personaMd: z.object({
    physicalDescription: z.string().max(2000).nullable().optional(),
    coreIdentity: z.string().max(2000).nullable().optional(),
    mannerisms: z.string().max(2000).nullable().optional(),
    history: z.string().max(4000).nullable().optional(),
    role: z.string().max(120).nullable().optional(),
    classRole: z.string().max(120).nullable().optional(),
  }).nullable().optional(),
});

/** PATCH /api/characters/:id/detail — save rich detail fields with revision tracking. */
charactersRouter.patch('/:id/detail', requireAuth, zValidator('json', zUpdateCharacterDetail), async (c) => {
  const { userId } = (c.get('user') as { userId: string });
  const id = c.req.param('id')!;
  const input = c.req.valid('json');

  const existing = await db.query.characters.findFirst({
    where: and(eq(schema.characters.id, id), eq(schema.characters.ownerId, userId)),
  });
  if (!existing) return c.json({ error: 'not_found' }, 404);

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (input.tagline !== undefined) updates.tagline = input.tagline;
  if (input.isSecretPromptHidden !== undefined) updates.isSecretPromptHidden = input.isSecretPromptHidden;
  if (input.isPublic !== undefined) {
    if (input.isPublic === true && !existing.isPublic) {
      const blocked = await isPublishBlockedByPendingAvatar(id);
      if (blocked) {
        updates.queuedForPublish = true;
      } else {
        updates.isPublic = true;
        updates.queuedForPublish = false;
        if (!existing.publishedAt) updates.publishedAt = new Date();
        updates.updatedPublicAt = new Date();
      }
    } else {
      updates.isPublic = input.isPublic;
      if (input.isPublic === false) updates.queuedForPublish = false;
      if (input.isPublic && !existing.publishedAt) updates.publishedAt = new Date();
      if (input.isPublic) updates.updatedPublicAt = new Date();
    }
  }
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.loreSectionsMd !== undefined) {
    // Render each lore section's bodyMd → bodyHtml.
    const rendered = await Promise.all(
      input.loreSectionsMd.map(async (sec) => {
        const { html } = renderAndSanitize(sec.bodyMd);
        return { ...sec, bodyHtml: html };
      }),
    );
    updates.loreSectionsMd = rendered;
  }

  // Track revisions for text fields.
  if (input.descriptionMd !== undefined && input.descriptionMd !== null) {
    const { html } = renderAndSanitize(input.descriptionMd);
    updates.descriptionMd = input.descriptionMd;
    updates.descriptionHtml = html;
    await saveRevision({
      entityType: 'character',
      entityId: id,
      fieldKey: 'description',
      authorId: userId,
      contentMd: input.descriptionMd,
      summary: input.revisionSummary ?? null,
    });
  }
  if (input.exampleDialogMd !== undefined && input.exampleDialogMd !== null) {
    const { html } = renderAndSanitize(input.exampleDialogMd);
    updates.exampleDialogMd = input.exampleDialogMd;
    updates.exampleDialogHtml = html;
    await saveRevision({
      entityType: 'character',
      entityId: id,
      fieldKey: 'example_dialog',
      authorId: userId,
      contentMd: input.exampleDialogMd,
      summary: input.revisionSummary ?? null,
    });
  }

  // PLANIMPv2 — semantic persona override.
  if (input.personaMd !== undefined) {
    updates.personaMd = input.personaMd;
  }

  // PLANIMPv2 — recompute token cache whenever MD fields change.
  if (input.descriptionMd !== undefined || input.exampleDialogMd !== undefined) {
    const nextDesc = input.descriptionMd !== undefined ? (input.descriptionMd ?? '') : (existing.descriptionMd ?? '');
    const nextDialog = input.exampleDialogMd !== undefined ? (input.exampleDialogMd ?? '') : (existing.exampleDialogMd ?? '');
    updates.tokenCountCache = computeCharacterTokenCache({
      descriptionMd: nextDesc,
      exampleDialogMd: nextDialog,
      persona: existing.persona,
    });
  }

  await db.update(schema.characters).set(updates).where(eq(schema.characters.id, id));
  // PLANIMPv7 — invalidate translation cache when MD fields change.
  if (input.descriptionMd !== undefined || input.exampleDialogMd !== undefined) {
    await db.delete(schema.contentTranslations).where(
      and(
        eq(schema.contentTranslations.entityType, 'character'),
        eq(schema.contentTranslations.entityId, id),
      ),
    );
  }
  return c.json({ ok: true });
});

/** POST /api/characters/:id/publish — gate publish on approved primary avatar. */
charactersRouter.post('/:id/publish', requireAuth, async (c) => {
  const { userId } = (c.get('user') as { userId: string });
  const id = c.req.param('id')!;

  const existing = await db.query.characters.findFirst({
    where: and(eq(schema.characters.id, id), eq(schema.characters.ownerId, userId)),
  });
  if (!existing) return c.json({ error: 'not_found' }, 404);

  await db.update(schema.characters).set({
    isPublic: true,
    publishedAt: existing.publishedAt ?? new Date(),
    updatedPublicAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(schema.characters.id, id));

  return c.json({ ok: true, status: 'live' });
});

/** POST /api/characters/:id/unpublish — revert to private draft. */
charactersRouter.post('/:id/unpublish', requireAuth, async (c) => {
  const { userId } = (c.get('user') as { userId: string });
  const id = c.req.param('id')!;
  const existing = await db.query.characters.findFirst({
    where: and(eq(schema.characters.id, id), eq(schema.characters.ownerId, userId)),
  });
  if (!existing) return c.json({ error: 'not_found' }, 404);
  await db.update(schema.characters).set({
    isPublic: false,
    updatedAt: new Date(),
  }).where(eq(schema.characters.id, id));
  return c.json({ ok: true, status: 'draft' });
});

/** POST /api/characters/:id/clone — fork to private copy. */
charactersRouter.post('/:id/clone', requireAuth, async (c) => {
  const { userId } = (c.get('user') as { userId: string });
  const id = c.req.param('id')!;

  const source = await db.query.characters.findFirst({
    where: or(
      and(eq(schema.characters.id, id), eq(schema.characters.ownerId, userId)),
      and(eq(schema.characters.id, id), eq(schema.characters.isPublic, true)),
    ),
  });
  if (!source) return c.json({ error: 'not_found' }, 404);

  const newId = nanoid();
  await db.insert(schema.characters).values({
    id: newId,
    ownerId: userId,
    name: `${source.name} (kopi)`,
    avatarUrl: source.avatarUrl,
    persona: source.persona,
    tags: source.tags,
    tonePreset: source.tonePreset,
    isPublic: false,
    language: source.language,
    languagesSpoken: source.languagesSpoken,
    descriptionMd: source.descriptionMd,
    loreSectionsMd: source.loreSectionsMd,
    exampleDialogMd: source.exampleDialogMd,
    tagline: source.tagline,
  });

  return c.json({ id: newId }, 201);
});

/** GET /api/characters/:id/related





/** GET /api/characters/:id/related — related stories + characters by shared tags. */
charactersRouter.get('/:id/related', async (c) => {
  const id = c.req.param('id')!;
  const row = await db.query.characters.findFirst({
    where: eq(schema.characters.id, id),
    columns: { id: true, tags: true, ownerId: true },
  });
  if (!row) return c.json({ error: 'not_found' }, 404);

  const tags = (row.tags as string[]) ?? [];

  // Related stories: stories whose cast contains this character OR share tags.
  const storiesRows = await db.execute(sql`
    SELECT id, title, cover_image_url, total_plays, total_likes, avg_stars
    FROM stories
    WHERE status = 'published'
      AND id IN (
        SELECT DISTINCT s.id
        FROM stories s
        WHERE s.cast @> ${JSON.stringify([{ characterId: id }])}::jsonb
        UNION
        SELECT s2.id FROM stories s2
        WHERE ${tags.length > 0 ? sql`s2.tags && ARRAY[${sql.join(tags.slice(0, 5).map((t) => sql`${t}`), sql`, `)}]::text[]` : sql`false`}
      )
    ORDER BY total_plays DESC
    LIMIT 6
  `);

  // Related characters: same owner OR share tags.
  const charsRows = await db.execute(sql`
    SELECT id, name, avatar_url, total_likes, total_chats
    FROM characters
    WHERE is_public = true AND id != ${id}
      AND (
        owner_id = ${row.ownerId}
        ${tags.length > 0 ? sql`OR tags ?| ARRAY[${sql.join(tags.slice(0, 5).map((t) => sql`${t}`), sql`, `)}]::text[]` : sql``}
      )
    ORDER BY total_chats DESC
    LIMIT 6
  `);

  return c.json({
    relatedStories: (storiesRows as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [],
    relatedCharacters: (charsRows as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [],
  });
});

