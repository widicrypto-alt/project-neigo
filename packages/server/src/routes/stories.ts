/**
 * REDESIGNv2 D4a — Visual Novel REST routes.
 *
 * storiesRouter → mounted at /api/stories
 *
 * Public routes (no auth): GET /api/stories, GET /api/stories/:id
 * Authenticated: everything else
 * Author-only: PATCH, publish, DELETE, cast management
 * PAID+: POST /api/stories (create draft)
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, inArray, or, sql, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import { optionalAuth, requireAuth, type AuthVars } from '../middleware/auth.js';

import { renderAndSanitize } from '../services/rich-content.js';
import { saveRevision } from '../services/content-revisions.js';
import { computeStoryTokenCache, computeVnReadiness } from '../services/detail-extensions.js';
import {
  listStories,
  listMyStories,
  getStory,
} from '../services/story-runner.js';
import {
  listScenarios,
  startStorySession,
} from '../services/story-session-seeder.js';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const zCreateStory = z
  .object({
    title: z.string().min(1).max(200),
    synopsis: z.string().max(2000).nullable().optional(),
    tagline: z.string().max(200).nullable().optional(),
    coverImageUrl: z.string().url().nullable().optional(),
    language: z.string().min(2).max(8).default('id'),
    requiredTier: z.enum(['FREE', 'PAID', 'FOUNDER']).default('FREE'),
    tags: z.array(z.string()).max(10).optional(),
    metadata: z.record(z.unknown()).optional(),
    // Rich content fields (wizard passes these; server renders to HTML)
    plotMd: z.string().max(32_000).nullable().optional(),
    openingQuote: z.string().max(500).nullable().optional(),
    openingQuoteBy: z.string().max(120).nullable().optional(),
    // Moderation flags
    isAdult18plus: z.boolean().optional(),
    containsMinors: z.boolean().optional(),
    // Status: default to draft — prevents accidental publish of empty stories
    status: z.enum(['draft', 'published']).default('draft'),
  })
  .refine((data) => !(data.containsMinors && data.isAdult18plus), {
    message: 'Cerita dengan karakter minor tidak boleh ditandai sebagai konten 18+.',
    path: ['isAdult18plus'],
  });

const zUpdateStory = z.object({
  title: z.string().min(1).max(200).optional(),
  synopsis: z.string().max(2000).nullable().optional(),
  tagline: z.string().max(200).nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  language: z.string().min(2).max(8).optional(),
  requiredTier: z.enum(['FREE', 'PAID', 'FOUNDER']).optional(),
  tags: z.array(z.string()).max(10).optional(),
  openingSceneId: z.string().length(21).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  cast: z.array(z.object({
    characterId: z.string().min(1).max(36),
    displayName: z.string().max(100).optional(),
    role: z.string().max(50).optional(),
  })).optional(),
});

const zAddCast = z.object({
  characterId: z.string().min(1).max(36),
  source: z.enum(['owned', 'public', 'builtin']),
  displayName: z.string().max(100).optional(),
  role: z.string().max(50).optional(),
});



// ─── helpers ─────────────────────────────────────────────────────────────────

/** Fetch a user's tier + foundingReader flag for gate checks. */
async function getUserTier(userId: string) {
  return db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { tier: true, isFoundingReader: true },
  });
}

function isPaidPlus(tier: string) {
  const t = tier.toUpperCase();
  return t === 'PAID' || t === 'FOUNDER' || t === 'ENTERPRISE';
}

async function resolveStoryId(idOrSlug: string): Promise<string | null> {
  const story = await db.query.stories.findFirst({
    where: or(eq(schema.stories.id, idOrSlug), eq(schema.stories.slug, idOrSlug)),
    columns: { id: true },
  });
  return story?.id ?? null;
}

// ─── storiesRouter ────────────────────────────────────────────────────────────

export const storiesRouter = new Hono<{ Variables: Partial<AuthVars> }>();

// Public reads still need optional auth so owner-only draft access and
// ?mine=1 work off the same cookie/bearer logic as charactersRouter.
storiesRouter.use('*', optionalAuth);

// GET /api/stories — public catalog, filter ?lang=id&tag=romance&sort=popular&limit=20&offset=0
// Special: ?mine=1 returns the authenticated author's own stories (all statuses, incl. draft)
storiesRouter.get('/', async (c) => {
  const { lang, tag, sort, limit, offset, mine } = c.req.query();

  if (mine === '1') {
    const userId = (c.get('user') as { userId?: string } | undefined)?.userId ?? null;
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const items = await listMyStories(userId);
    return c.json({ stories: items, count: items.length });
  }

  const sortKey = sort === 'popular' ? 'popular' : 'newest';
  const parsedLimit = Number.parseInt(limit ?? '', 10);
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 30;
  const parsedOffset = Number.parseInt(offset ?? '', 10);
  const safeOffset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const items = await listStories({
    language: lang || undefined,
    tag: tag || undefined,
    sort: sortKey,
    limit: safeLimit,
    offset: safeOffset,
  });
  return c.json({ stories: items, count: items.length });
});

// GET /api/stories/:id — public detail (id OR slug — BACKLOG B1.8)
storiesRouter.get('/:id', async (c) => {
  const idOrSlug = c.req.param('id')!;
  const requesterId = (c.get('user') as { userId?: string } | undefined)?.userId ?? null;
  const story = await getStory(idOrSlug, requesterId);
  if (!story) return c.json({ error: 'not_found' }, 404);
  // Downstream queries need the canonical UUID even if caller passed a slug.
  const storyId = story.id;

  // PLANIMPv7 §2/§7 — flagged + soft-delete gate for non-owner/non-founder.
  const modRow = await db.query.stories.findFirst({
    where: eq(schema.stories.id, storyId),
    columns: { isFlaggedForReview: true, deletedAt: true, authorId: true },
  });
  const isOwnerOrFounder = !!requesterId && modRow?.authorId === requesterId;
  if (modRow?.isFlaggedForReview && !isOwnerOrFounder) {
    return c.json({ error: 'under_review', message: 'Konten sedang ditinjau moderator.' }, 403);
  }
  if (modRow?.deletedAt && !isOwnerOrFounder) return c.json({ error: 'not_found' }, 404);

  // PLANBv2 — extend payload with scenarios + social aggregates so the
  // detail page renders in one round-trip (matches IsekaiZero detail UX).
  const [scenarios, storyRow] = await Promise.all([
    listScenarios(storyId),
    db.query.stories.findFirst({
      where: eq(schema.stories.id, storyId),
      columns: {
        tagline: true,
        tags: true,
        heroCarousel: true,
        totalPlays: true,
        totalChats: true,
        totalLikes: true,
        totalBookmarks: true,
        hiddenCount: true,
        // PLANIMPv3 new fields.
        slug: true,
        plotMd: true,
        plotHtml: true,
        aiPlotMd: true,
        aiPlotHtml: true,
        aiGuidelinesMd: true,
        aiReminderMd: true,
        outputReminderMd: true,
        isAdvancedMode: true,
        isSecretMode: true,
        isAdult18plus: true,
        containsMinors: true,
        playAsCharacterId: true,
        dungeonMindEnabled: true,
        openingQuote: true,
        openingQuoteBy: true,
        totalComments: true,
        totalRatings: true,
        avgStars: true,
        totalRoses: true,
        vnFgCount: true,
        vnBgCount: true,
        vnReadinessPct: true,
        updatedPublicAt: true,
        // PLANIMPv3 — cached token counts + denormalized cast for recompute.
        tokenCountCache: true,
        cast: true,
        // Discovery / Cast Mode fields
        discoveryMode: true,
        discoveryIntroMd: true,
        discoveryHintMd: true,
        showCastList: true,
        castPreviewCount: true,
        // Studio metadata (mcRole, worldLore, beats)
        metadata: true,
      },
    }),
  ]);

  // Reaction state for the requester (if logged in).
  let userReactions: string[] = [];
  let metCharacterIds: string[] = [];
  if (requesterId) {
    const reacts = await db
      .select({ kind: schema.reactions.kind })
      .from(schema.reactions)
      .where(
        and(
          eq(schema.reactions.entityType, 'story'),
          eq(schema.reactions.entityId, storyId),
          eq(schema.reactions.userId, requesterId),
        ),
      );
    userReactions = reacts.map((r) => r.kind);

    const progress = await db.query.storyCastProgress.findFirst({
      where: and(
        eq(schema.storyCastProgress.storyId, storyId),
        eq(schema.storyCastProgress.userId, requesterId)
      ),
      columns: { metCharacterIds: true }
    });
    if (progress?.metCharacterIds) {
      metCharacterIds = progress.metCharacterIds as string[];
    }
  }

  // Comment count
  const commentCountRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.entityType, 'story'),
        eq(schema.comments.entityId, storyId),
        sql`${schema.comments.deletedAt} IS NULL`,
      ),
    );

  // PLANIMPv3 — play-as character projection (soft FK).
  let playAsCharacter: { id: string; name: string; avatarUrl: string | null } | null = null;
  if (storyRow?.playAsCharacterId) {
    const paRow = await db.query.characters.findFirst({
      where: eq(schema.characters.id, storyRow.playAsCharacterId),
      columns: { id: true, name: true, avatarUrl: true, isPublic: true, ownerId: true, deletedAt: true },
    });
    if (paRow && !paRow.deletedAt && (paRow.isPublic || paRow.ownerId === requesterId)) {
      playAsCharacter = { id: paRow.id, name: paRow.name, avatarUrl: paRow.avatarUrl };
    }
  }

  // PLANIMPv3 — token info (cached or computed fallback).
  const cachedTokens = (storyRow?.tokenCountCache ?? {}) as { plot?: number; characters?: number; scenarios?: number; total?: number };
  const tokenInfo = (typeof cachedTokens.total === 'number' && cachedTokens.total > 0)
    ? { plot: cachedTokens.plot ?? 0, characters: cachedTokens.characters ?? 0, scenarios: cachedTokens.scenarios ?? 0, total: cachedTokens.total }
    : (() => {
        const c = computeStoryTokenCache(
          { plotMd: storyRow?.plotMd ?? null, cast: storyRow?.cast ?? [] },
          scenarios.map((s) => ({ id: s.id, tokenCount: s.tokenCount ?? 0, openingMd: s.openingMd ?? null })),
        );
        return { plot: c.plot, characters: c.characters, scenarios: c.scenarios, total: c.total };
      })();

  return c.json({
    story: {
      ...story,
      tagline: storyRow?.tagline ?? null,
      tags: storyRow?.tags ?? [],
      heroCarousel: storyRow?.heroCarousel ?? [],
      // PLANIMPv3 rich fields.
      slug: storyRow?.slug ?? null,
      plotMd: storyRow?.plotMd ?? null,
      plotHtml: storyRow?.plotHtml ?? null,
      openingQuote: storyRow?.openingQuote ?? null,
      openingQuoteBy: storyRow?.openingQuoteBy ?? null,
      isAdult18plus: storyRow?.isAdult18plus ?? false,
      containsMinors: storyRow?.containsMinors ?? false,
      dungeonMindEnabled: storyRow?.dungeonMindEnabled ?? false,
      vnReadinessPct: storyRow?.vnReadinessPct ?? 0,
      discoveryMode: storyRow?.discoveryMode ?? true,
      discoveryIntroMd: storyRow?.discoveryIntroMd ?? null,
      discoveryHintMd: storyRow?.discoveryHintMd ?? null,
      showCastList: storyRow?.showCastList ?? true,
      castPreviewCount: storyRow?.castPreviewCount ?? 3,
      // Studio fields stored in metadata JSONB
      mcRole: (() => { const m = (storyRow?.metadata ?? {}) as Record<string, unknown>; return typeof m.mcRole === 'string' ? m.mcRole : null; })(),
      worldLore: (() => { const m = (storyRow?.metadata ?? {}) as Record<string, unknown>; return Array.isArray(m.worldLore) ? m.worldLore : []; })(),
      beats: (() => { const m = (storyRow?.metadata ?? {}) as Record<string, unknown>; return Array.isArray(m.beats) ? m.beats : []; })(),
      metCharacterIds,
      // PLANIMPv3 — play-as character + cached token counts.
      playAsCharacter,
      tokenInfo,
      // Advanced / secret projection (only if requester is author or advanced mode on entity).
      ...(requesterId && requesterId === story.authorId
        ? {
            aiPlotMd: storyRow?.aiPlotMd ?? null,
            aiPlotHtml: storyRow?.aiPlotHtml ?? null,
            aiGuidelinesMd: storyRow?.aiGuidelinesMd ?? null,
            aiReminderMd: storyRow?.aiReminderMd ?? null,
            outputReminderMd: storyRow?.outputReminderMd ?? null,
            isAdvancedMode: storyRow?.isAdvancedMode ?? false,
            isSecretMode: storyRow?.isSecretMode ?? false,
          }
        : {
            aiPlotMd: null,
            aiPlotHtml: null,
            aiGuidelinesMd: null,
            aiReminderMd: null,
            outputReminderMd: null,
            isAdvancedMode: storyRow?.isAdvancedMode ?? false,
            isSecretMode: storyRow?.isSecretMode ?? false,
          }),
      social: {
        plays: storyRow?.totalPlays ?? 0,
        chats: storyRow?.totalChats ?? 0,
        likes: storyRow?.totalLikes ?? 0,
        bookmarks: storyRow?.totalBookmarks ?? 0,
        hidden: storyRow?.hiddenCount ?? 0,
        comments: commentCountRow[0]?.count ?? 0,
        ratings: storyRow?.totalRatings ?? 0,
        avgStars: storyRow?.avgStars ?? 0,
        roses: storyRow?.totalRoses ?? 0,
      },
      userReactions,
      scenarios: scenarios.map((s, i) => ({
        id: s.id,
        index: i + 1,
        title: s.title,
        subtitle: s.tileSubtitle,
        tileImageUrl: s.tileImageUrl,
        castSubset: s.castSubset,
        openingMd: s.openingMd ?? null,
        tokenCount: s.tokenCount ?? 0,
      })),
    },
  });
});

// GET /api/stories/:id/advanced — lazy-loaded advanced bundle for detail page.
storiesRouter.get('/:id/advanced', async (c) => {
  const idOrSlug = c.req.param('id')!;
  const requesterId = (c.get('user') as { userId?: string } | undefined)?.userId ?? null;
  const story = await getStory(idOrSlug, requesterId);
  if (!story) return c.json({ error: 'not_found' }, 404);

  const storyRow = await db.query.stories.findFirst({
    where: eq(schema.stories.id, story.id),
    columns: {
      aiPlotHtml: true,
      aiGuidelinesMd: true,
      aiReminderMd: true,
      outputReminderMd: true,
      isAdvancedMode: true,
      isSecretMode: true,
    },
  });
  if (!storyRow) return c.json({ error: 'not_found' }, 404);

  const isOwner = requesterId === story.authorId;
  const canView = isOwner || (storyRow.isAdvancedMode && !storyRow.isSecretMode);
  if (!canView) return c.json({ error: 'not_found' }, 404);

  return c.json({
    aiPlotHtml: storyRow.aiPlotHtml ?? null,
    aiGuidelinesMd: storyRow.aiGuidelinesMd ?? null,
    aiReminderMd: storyRow.aiReminderMd ?? null,
    outputReminderMd: storyRow.outputReminderMd ?? null,
  });
});

// POST /api/stories — create draft (PAID+)
storiesRouter.post('/', requireAuth, zValidator('json', zCreateStory), async (c) => {
  const { userId } = c.get('user');
  const user = await getUserTier(userId);
  if (!user || !isPaidPlus(user.tier)) {
    return c.json({ error: 'paid_required' }, 403);
  }
  const body = c.req.valid('json');
  const id = nanoid();
  const now = new Date();

  // Render plot markdown to HTML if provided
  let plotHtml: string | null = null;
  if (body.plotMd) {
    const rendered = renderAndSanitize(body.plotMd);
    plotHtml = rendered.html;
  }

  await db.insert(schema.stories).values({
    id,
    title: body.title,
    synopsis: body.synopsis ?? null,
    tagline: body.tagline ?? null,
    coverImageUrl: body.coverImageUrl ?? null,
    language: body.language,
    authorId: userId,
    // Default to draft — prevents auto-publishing empty stories
    status: body.status === 'published' ? 'published' : 'draft',
    mode: 'kinetic',
    requiredTier: body.requiredTier,
    cast: [],
    metadata: body.metadata ?? {},
    tags: body.tags ?? [],
    isAdult18plus: body.isAdult18plus ?? false,
    containsMinors: body.containsMinors ?? false,
    plotMd: body.plotMd ?? null,
    plotHtml: plotHtml,
    openingQuote: body.openingQuote ?? null,
    openingQuoteBy: body.openingQuoteBy ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const story = await getStory(id, userId);
  return c.json({ story }, 201);
});

// PATCH /api/stories/:id — update (author only)
storiesRouter.patch('/:id', requireAuth, zValidator('json', zUpdateStory), async (c) => {
  const { userId } = c.get('user');
  const storyId = c.req.param('id')!;
  const row = await db.query.stories.findFirst({ where: eq(schema.stories.id, storyId) });
  if (!row || row.authorId !== userId) return c.json({ error: 'not_found' }, 404);
  if (row.status === 'archived') return c.json({ error: 'story_archived' }, 409);

  const body = c.req.valid('json');
  const patch: Partial<typeof schema.stories.$inferInsert> = { updatedAt: new Date() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.synopsis !== undefined) patch.synopsis = body.synopsis ?? null;
  if (body.tagline !== undefined) patch.tagline = body.tagline ?? null;
  if (body.coverImageUrl !== undefined) patch.coverImageUrl = body.coverImageUrl ?? null;
  if (body.language !== undefined) patch.language = body.language;
  if (body.requiredTier !== undefined) patch.requiredTier = body.requiredTier;
  if (body.tags !== undefined) patch.tags = body.tags;
  if (body.openingSceneId !== undefined) patch.openingSceneId = body.openingSceneId ?? null;
  if (body.metadata !== undefined) {
    const existing = (row.metadata as Record<string, unknown>) ?? {};
    patch.metadata = { ...existing, ...body.metadata } as never;
  }
  if (body.cast !== undefined) patch.cast = body.cast as never;

  await db.update(schema.stories).set(patch).where(eq(schema.stories.id, storyId));
  const story = await getStory(storyId, userId);
  return c.json({ story });
});

// POST /api/stories/:id/publish — publish (author only)
storiesRouter.post('/:id/publish', requireAuth, async (c) => {
  const { userId } = c.get('user');
  const storyId = c.req.param('id')!;
  const row = await db.query.stories.findFirst({ where: eq(schema.stories.id, storyId) });
  if (!row || row.authorId !== userId) return c.json({ error: 'not_found' }, 404);
  if (!row.openingSceneId) return c.json({ error: 'no_opening_scene' }, 422);

  const now = new Date();
  await db
    .update(schema.stories)
    .set({ status: 'published', publishedAt: now, updatedPublicAt: now, updatedAt: now })
    .where(eq(schema.stories.id, storyId));

  const story = await getStory(storyId, userId);
  return c.json({ story });
});

// BACKLOG B1.3 — VN readiness compute + persist.
// POST /api/stories/:id/vn-readiness/recompute
// Computes the breakdown, writes `stories.vnReadinessPct`, returns both.
// Author-only; rate-limit is implicit via PATCH-style cost + router middleware.
storiesRouter.post('/:id/vn-readiness/recompute', requireAuth, async (c) => {
  const { userId } = c.get('user');
  const storyId = c.req.param('id')!;
  const row = await db.query.stories.findFirst({
    where: eq(schema.stories.id, storyId),
    columns: {
      id: true,
      authorId: true,
      plotMd: true,
      cast: true,
      openingQuote: true,
      playAsCharacterId: true,
    },
  });
  if (!row || row.authorId !== userId) return c.json({ error: 'not_found' }, 404);

  const scenes = await db
    .select({
      openingMd: schema.storyScenes.openingMd,
      nextSceneId: schema.storyScenes.nextSceneId,
      sceneType: schema.storyScenes.sceneType,
      backgroundImageUrl: schema.storyScenes.backgroundImageUrl,
    })
    .from(schema.storyScenes)
    .where(eq(schema.storyScenes.storyId, storyId));

  const breakdown = computeVnReadiness({
    plotMd: row.plotMd ?? null,
    cast: Array.isArray(row.cast) ? (row.cast as unknown[]) : null,
    openingQuote: row.openingQuote ?? null,
    playAsCharacterId: row.playAsCharacterId ?? null,
    scenarios: scenes.map((s) => ({
      openingMd: s.openingMd ?? null,
      nextSceneId: s.nextSceneId ?? null,
      sceneType: s.sceneType ?? null,
      backgroundImageUrl: s.backgroundImageUrl ?? null,
    })),
  });

  await db
    .update(schema.stories)
    .set({ vnReadinessPct: breakdown.pct, updatedAt: new Date() })
    .where(eq(schema.stories.id, storyId));

  return c.json({ storyId, vnReadinessPct: breakdown.pct, ...breakdown });
});

// DELETE /api/stories/:id — soft-archive (author only)
storiesRouter.delete('/:id', requireAuth, async (c) => {  const { userId } = c.get('user');
  const storyId = c.req.param('id')!;
  const row = await db.query.stories.findFirst({ where: eq(schema.stories.id, storyId) });
  if (!row || row.authorId !== userId) return c.json({ error: 'not_found' }, 404);

  await db
    .update(schema.stories)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(schema.stories.id, storyId));

  return c.json({ ok: true });
});



// GET /api/stories/:id/cast/candidates — cast picker
storiesRouter.get('/:id/cast/candidates', requireAuth, async (c) => {
  const { userId } = c.get('user');
  const storyId = c.req.param('id')!;

  const story = await db.query.stories.findFirst({ where: eq(schema.stories.id, storyId) });
  if (!story || story.authorId !== userId) return c.json({ error: 'not_found' }, 404);

  const charCols = {
    id: schema.characters.id,
    name: schema.characters.name,
    avatarUrl: schema.characters.avatarUrl,
    tagline: schema.characters.tagline,
    language: schema.characters.language,
    tonePreset: schema.characters.tonePreset,
    isBuiltIn: schema.characters.isBuiltIn,
    allowInStories: schema.characters.allowInStories,
  } as const;

  const [ownChars, publicChars, builtins] = await Promise.all([
    // Owned characters (not retired)
    db
      .select(charCols)
      .from(schema.characters)
      .where(
        and(
          eq(schema.characters.ownerId, userId),
          eq(schema.characters.isRetired, false),
        ),
      )
      .limit(100),
    // Public characters from others (allow_in_stories=true, not retired, not owned by requester)
    db
      .select(charCols)
      .from(schema.characters)
      .where(
        and(
          eq(schema.characters.isPublic, true),
          eq(schema.characters.allowInStories, true),
          eq(schema.characters.isRetired, false),
          eq(schema.characters.isBuiltIn, false),
          sql`${schema.characters.ownerId} != ${userId}`,
        ),
      )
      .limit(100),
    // Built-in beta chars (Rei/Lysandra/Kaia)
    db
      .select(charCols)
      .from(schema.characters)
      .where(
        and(
          eq(schema.characters.isBuiltIn, true),
          eq(schema.characters.isRetired, false),
          eq(schema.characters.allowInStories, true),
        ),
      ),
  ]);

  return c.json({
    candidates: {
      owned: ownChars.map((ch) => ({ ...ch, source: 'owned' as const })),
      public: publicChars.map((ch) => ({ ...ch, source: 'public' as const })),
      builtin: builtins.map((ch) => ({ ...ch, source: 'builtin' as const })),
    },
  });
});

// POST /api/stories/:id/cast — add a character ref
storiesRouter.post('/:id/cast', requireAuth, zValidator('json', zAddCast), async (c) => {
  const { userId } = c.get('user');
  const storyId = c.req.param('id')!;
  const body = c.req.valid('json');

  const story = await db.query.stories.findFirst({ where: eq(schema.stories.id, storyId) });
  if (!story || story.authorId !== userId) return c.json({ error: 'not_found' }, 404);
  if (story.status === 'archived') return c.json({ error: 'story_archived' }, 409);

  const character = await db.query.characters.findFirst({
    where: eq(schema.characters.id, body.characterId),
    columns: { id: true, name: true, isRetired: true, allowInStories: true, ownerId: true, isBuiltIn: true },
  });
  if (!character || character.isRetired) return c.json({ error: 'character_not_found' }, 404);
  if (!character.allowInStories) return c.json({ error: 'character_opt_out' }, 422);

  // Insert or ignore duplicate
  await db
    .insert(schema.storyCharacterRefs)
    .values({ storyId, characterId: body.characterId, source: body.source })
    .onConflictDoNothing();

  // Update denormalized cast jsonb
  const displayName = body.displayName ?? character.name ?? '';
  const role = body.role ?? 'main';
  const currentCast = (story.cast as Array<{ characterId: string; displayName: string; role: string }>) ?? [];
  const alreadyInCast = currentCast.some((e) => e.characterId === body.characterId);
  if (!alreadyInCast) {
    await db
      .update(schema.stories)
      .set({
        cast: [...currentCast, { characterId: body.characterId, displayName, role }],
        updatedAt: new Date(),
      })
      .where(eq(schema.stories.id, storyId));
  }

  return c.json({ ok: true }, 201);
});

// DELETE /api/stories/:id/cast/:characterId — remove a character ref
storiesRouter.delete('/:id/cast/:characterId', requireAuth, async (c) => {
  const { userId } = c.get('user');
  const storyId = c.req.param('id')!;
  const characterId = c.req.param('characterId')!;

  const story = await db.query.stories.findFirst({ where: eq(schema.stories.id, storyId) });
  if (!story || story.authorId !== userId) return c.json({ error: 'not_found' }, 404);

  await db
    .delete(schema.storyCharacterRefs)
    .where(
      and(
        eq(schema.storyCharacterRefs.storyId, storyId),
        eq(schema.storyCharacterRefs.characterId, characterId),
      ),
    );

  // Update cast jsonb
  const currentCast = (story.cast as Array<{ characterId: string; displayName: string; role: string }>) ?? [];
  await db
    .update(schema.stories)
    .set({
      cast: currentCast.filter((e) => e.characterId !== characterId) as never,
      updatedAt: new Date(),
    })
    .where(eq(schema.stories.id, storyId));

  return c.json({ ok: true });
});

// ─── PLANBv2: Scenario CRUD + start + home rails ────────────────────────────

const zCreateScenario = z.object({
  title: z.string().min(1).max(200),
  tileSubtitle: z.string().max(200).nullable().optional(),
  tileImageUrl: z.string().url().max(500).nullable().optional(),
  tileOrder: z.number().int().min(0).max(999).optional(),
  personaPrompt: z.string().max(4000).nullable().optional(),
  openingNarration: z.string().max(8000).nullable().optional(),
  openingInputHint: z.string().max(240).nullable().optional(),
  castSubset: z.array(z.string().max(36)).max(20).optional(),
  backgroundImageUrl: z.string().url().max(500).nullable().optional(),
  bgmUrl: z.string().url().max(500).nullable().optional(),
  // PLANVNv2 BV7 — VN scene-chain fields.
  nextSceneId: z.string().max(36).nullable().optional(),
  sceneType: z.enum(['narration', 'dialogue', 'ending']).optional(),
  endingSlug: z.string().max(40).nullable().optional(),
});

const zUpdateScenario = zCreateScenario.partial();

const zReorderScenarios = z.object({
  order: z.array(z.string().min(1).max(36)).max(40),
});

const zStartStory = z.object({
  scenarioId: z.string().min(1).max(36),
  mode: z.enum(['play', 'author_test']).default('play'),
});



// GET /api/stories/:id/scenarios — author or public-published
storiesRouter.get('/:id/scenarios', async (c) => {
  const storyId = c.req.param('id')!;
  const story = await db.query.stories.findFirst({
    where: eq(schema.stories.id, storyId),
    columns: { id: true, status: true, authorId: true },
  });
  if (!story) return c.json({ error: 'not_found' }, 404);

  if (story.status === 'draft') {
    let userId: string | null = null;
    try {
      userId = c.get('user')?.userId ?? null;
    } catch {
      // anon
    }
    if (story.authorId !== userId) return c.json({ error: 'not_found' }, 404);
  }

  const scenarios = await listScenarios(storyId);
  return c.json({ scenarios });
});

// POST /api/stories/:id/scenarios — author only
storiesRouter.post('/:id/scenarios', requireAuth, zValidator('json', zCreateScenario), async (c) => {
  const { userId } = c.get('user');
  const storyId = c.req.param('id')!;
  const story = await db.query.stories.findFirst({ where: eq(schema.stories.id, storyId) });
  if (!story || story.authorId !== userId) return c.json({ error: 'not_found' }, 404);
  if (story.status === 'archived') return c.json({ error: 'story_archived' }, 409);

  const body = c.req.valid('json');
  const id = nanoid();
  const now = new Date();

  // Default tile_order = max + 10
  const last = await db
    .select({ max: sql<number>`coalesce(max(tile_order), 0)::int` })
    .from(schema.storyScenes)
    .where(eq(schema.storyScenes.storyId, storyId));
  const nextOrder = body.tileOrder ?? (last[0]?.max ?? 0) + 10;

  await db.insert(schema.storyScenes).values({
    id,
    storyId,
    orderIndex: nextOrder,
    tileOrder: nextOrder,
    title: body.title,
    tileSubtitle: body.tileSubtitle ?? null,
    tileImageUrl: body.tileImageUrl ?? null,
    personaPrompt: body.personaPrompt ?? null,
    openingNarration: body.openingNarration ?? null,
    openingInputHint: body.openingInputHint ?? null,
    castSubset: body.castSubset ?? [],
    backgroundImageUrl: body.backgroundImageUrl ?? null,
    bgmUrl: body.bgmUrl ?? null,
    sceneType: 'narration',
    createdAt: now,
    updatedAt: now,
  });

  // First scenario becomes the opening_scene_id automatically.
  if (!story.openingSceneId) {
    await db
      .update(schema.stories)
      .set({ openingSceneId: id, updatedAt: now })
      .where(eq(schema.stories.id, storyId));
  }

  const scenarios = await listScenarios(storyId);
  return c.json({ scenarios }, 201);
});

// PATCH /api/stories/:id/scenarios/:scenarioId — author only
storiesRouter.patch(
  '/:id/scenarios/:scenarioId',
  requireAuth,
  zValidator('json', zUpdateScenario),
  async (c) => {
    const { userId } = c.get('user');
    const storyId = c.req.param('id')!;
    const scenarioId = c.req.param('scenarioId')!;
    const story = await db.query.stories.findFirst({ where: eq(schema.stories.id, storyId) });
    if (!story || story.authorId !== userId) return c.json({ error: 'not_found' }, 404);

    const body = c.req.valid('json');
    const patch: Partial<typeof schema.storyScenes.$inferInsert> = { updatedAt: new Date() };
    if (body.title !== undefined) patch.title = body.title;
    if (body.tileSubtitle !== undefined) patch.tileSubtitle = body.tileSubtitle ?? null;
    if (body.tileImageUrl !== undefined) patch.tileImageUrl = body.tileImageUrl ?? null;
    if (body.tileOrder !== undefined) patch.tileOrder = body.tileOrder;
    if (body.personaPrompt !== undefined) patch.personaPrompt = body.personaPrompt ?? null;
    if (body.openingNarration !== undefined) patch.openingNarration = body.openingNarration ?? null;
    if (body.openingInputHint !== undefined) patch.openingInputHint = body.openingInputHint ?? null;
    if (body.castSubset !== undefined) patch.castSubset = body.castSubset;
    if (body.backgroundImageUrl !== undefined) patch.backgroundImageUrl = body.backgroundImageUrl ?? null;
    if (body.bgmUrl !== undefined) patch.bgmUrl = body.bgmUrl ?? null;
    // PLANVNv2 BV7 — VN scene-chain fields.
    if (body.sceneType !== undefined) patch.sceneType = body.sceneType;
    if (body.endingSlug !== undefined) patch.endingSlug = body.endingSlug ?? null;
    if (body.nextSceneId !== undefined) {
      const nextId = body.nextSceneId ?? null;
      if (nextId !== null) {
        // Validate: (1) belongs to same story, (2) not self.
        if (nextId === scenarioId) {
          return c.json({ error: 'invalid_next_scene', reason: 'self_reference' }, 422);
        }
        const target = await db.query.storyScenes.findFirst({
          where: and(eq(schema.storyScenes.id, nextId), eq(schema.storyScenes.storyId, storyId)),
          columns: { id: true },
        });
        if (!target) {
          return c.json({ error: 'invalid_next_scene', reason: 'not_found' }, 422);
        }
        // (3) DFS cycle check (≤ 64 hops).
        const allScenes = await db
          .select({ id: schema.storyScenes.id, nextSceneId: schema.storyScenes.nextSceneId })
          .from(schema.storyScenes)
          .where(eq(schema.storyScenes.storyId, storyId));
        const nextMap = new Map(allScenes.map((s) => [s.id, s.nextSceneId]));
        // Temporarily apply the proposed change for cycle detection.
        nextMap.set(scenarioId, nextId);
        let cursor: string | null | undefined = nextId;
        let hops = 0;
        while (cursor && hops < 64) {
          if (cursor === scenarioId) {
            return c.json({ error: 'cycle_detected' }, 422);
          }
          cursor = nextMap.get(cursor);
          hops++;
        }
      }
      patch.nextSceneId = nextId;
    }

    await db
      .update(schema.storyScenes)
      .set(patch)
      .where(and(eq(schema.storyScenes.id, scenarioId), eq(schema.storyScenes.storyId, storyId)));

    const scenarios = await listScenarios(storyId);
    return c.json({ scenarios });
  },
);

// DELETE /api/stories/:id/scenarios/:scenarioId — author only
storiesRouter.delete('/:id/scenarios/:scenarioId', requireAuth, async (c) => {
  const { userId } = c.get('user');
  const storyId = c.req.param('id')!;
  const scenarioId = c.req.param('scenarioId')!;
  const story = await db.query.stories.findFirst({ where: eq(schema.stories.id, storyId) });
  if (!story || story.authorId !== userId) return c.json({ error: 'not_found' }, 404);

  await db
    .delete(schema.storyScenes)
    .where(and(eq(schema.storyScenes.id, scenarioId), eq(schema.storyScenes.storyId, storyId)));

  // If we deleted the opening scene, fall back to next available scenario.
  if (story.openingSceneId === scenarioId) {
    const remaining = await db
      .select({ id: schema.storyScenes.id })
      .from(schema.storyScenes)
      .where(eq(schema.storyScenes.storyId, storyId))
      .orderBy(asc(schema.storyScenes.tileOrder))
      .limit(1);
    await db
      .update(schema.stories)
      .set({ openingSceneId: remaining[0]?.id ?? null, updatedAt: new Date() })
      .where(eq(schema.stories.id, storyId));
  }

  return c.json({ ok: true });
});

// POST /api/stories/:id/scenarios/reorder — bulk tile_order update
storiesRouter.post(
  '/:id/scenarios/reorder',
  requireAuth,
  zValidator('json', zReorderScenarios),
  async (c) => {
    const { userId } = c.get('user');
    const storyId = c.req.param('id')!;
    const story = await db.query.stories.findFirst({ where: eq(schema.stories.id, storyId) });
    if (!story || story.authorId !== userId) return c.json({ error: 'not_found' }, 404);

    const { order } = c.req.valid('json');
    for (let i = 0; i < order.length; i++) {
      const id = order[i]!;
      await db
        .update(schema.storyScenes)
        .set({ tileOrder: (i + 1) * 10, updatedAt: new Date() })
        .where(and(eq(schema.storyScenes.id, id), eq(schema.storyScenes.storyId, storyId)));
    }
    const scenarios = await listScenarios(storyId);
    return c.json({ scenarios });
  },
);

// POST /api/stories/:id/start — seed a chat session for the chosen scenario
storiesRouter.post('/:id/start', requireAuth, zValidator('json', zStartStory), async (c) => {
  const { userId } = c.get('user');
  const storyId = await resolveStoryId(c.req.param('id')!);
  const { scenarioId, mode } = c.req.valid('json');
  if (!storyId) return c.json({ error: 'not_found' }, 404);
  const result = await startStorySession({
    storyId,
    userId,
    scenarioId,
    authorTest: mode === 'author_test',
  });
  if ('error' in result) {
    const status =
      result.error === 'forbidden' ? 403 :
      result.error === 'story_not_published' ? 403 : 404;
    return c.json({ error: result.error }, status);
  }
  // PLANIMPv7 — emit story.started timeline event (fire-and-forget).
  try {
    const sid = (result as { sessionId?: string }).sessionId;
    if (sid) {
      await db.insert(schema.sessionEvents).values({
        id: nanoid(),
        sessionId: sid,
        userId,
        eventType: 'story.started',
        payload: { storyId, scenarioId, mode },
      });
    }
  } catch (e) {
    console.error('sessionEvents insert failed:', e);
    // non-fatal
  }
  return c.json(result, result.alreadyStarted ? 200 : 201);
});

// GET /api/stories/home/rails — featured / winners / trending
storiesRouter.get('/home/rails', async (c) => {
  const { lang } = c.req.query();
  const baseWhere = lang
    ? and(
        sql`${schema.stories.status} IN ('published','featured')`,
        eq(schema.stories.language, lang),
      )
    : sql`${schema.stories.status} IN ('published','featured')`;

  const [featured, winners, trending] = await Promise.all([
    db
      .select()
      .from(schema.stories)
      .where(and(baseWhere, sql`${schema.stories.featuredAt} IS NOT NULL`))
      .orderBy(desc(schema.stories.featuredAt))
      .limit(12),
    db
      .select()
      .from(schema.stories)
      .where(and(baseWhere, sql`'winner' = ANY(${schema.stories.tags})`))
      .orderBy(desc(schema.stories.publishedAt))
      .limit(12),
    db
      .select()
      .from(schema.stories)
      .where(baseWhere)
      .orderBy(sql`(${schema.stories.totalPlays} + ${schema.stories.totalChats} * 2) DESC`)
      .limit(12),
  ]);

  const mapCard = (s: typeof schema.stories.$inferSelect) => ({
    id: s.id,
    title: s.title,
    synopsis: s.synopsis,
    tagline: s.tagline,
    coverImageUrl: s.coverImageUrl,
    language: s.language,
    requiredTier: s.requiredTier,
    authorId: s.authorId,
    tags: s.tags ?? [],
    metadata: { tags: s.tags ?? [], genre: s.tags?.[0] },
    totalPlays: s.totalPlays,
    totalChats: s.totalChats,
    totalLikes: s.totalLikes,
  });

  return c.json({
    rails: {
      featured: featured.map(mapCard),
      winners: winners.map(mapCard),
      trending: trending.map(mapCard),
    },
  });
});



// ─── PLANIMPv3 — Story Studio rich-detail endpoints ──────────────────────────

const zUpdateStoryDetail = z
  .object({
    slug: z.string().max(120).regex(/^[a-z0-9-]+$/).nullable().optional(),
    plotMd: z.string().max(32_000).nullable().optional(),
    aiPlotMd: z.string().max(32_000).nullable().optional(),
    aiGuidelinesMd: z.string().max(16_000).nullable().optional(),
    aiReminderMd: z.string().max(8000).nullable().optional(),
    outputReminderMd: z.string().max(8000).nullable().optional(),
    isAdvancedMode: z.boolean().optional(),
    isSecretMode: z.boolean().optional(),
    isAdult18plus: z.boolean().optional(),
    containsMinors: z.boolean().optional(),
    playAsCharacterId: z.string().nullable().optional(),
    dungeonMindEnabled: z.boolean().optional(),
    openingQuote: z.string().max(500).nullable().optional(),
    openingQuoteBy: z.string().max(120).nullable().optional(),
    revisionSummary: z.string().max(200).nullable().optional(),
  })
  .refine((data) => !(data.containsMinors && data.isAdult18plus), {
    message: 'Cerita dengan karakter minor tidak boleh ditandai sebagai konten 18+.',
    path: ['isAdult18plus'],
  });

/** PATCH /api/stories/:id/detail — save rich studio fields with revision tracking. */
storiesRouter.patch('/:id/detail', requireAuth, zValidator('json', zUpdateStoryDetail), async (c) => {
  const { userId } = c.get('user');
  const storyId = c.req.param('id')!;
  const input = c.req.valid('json');

  const existing = await db.query.stories.findFirst({
    where: and(eq(schema.stories.id, storyId), eq(schema.stories.authorId, userId)),
    columns: { id: true, authorId: true },
  });
  if (!existing) return c.json({ error: 'not_found' }, 404);

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.isAdvancedMode !== undefined) updates.isAdvancedMode = input.isAdvancedMode;
  if (input.isSecretMode !== undefined) updates.isSecretMode = input.isSecretMode;
  if (input.isAdult18plus !== undefined) updates.isAdult18plus = input.isAdult18plus;
  if (input.containsMinors !== undefined) updates.containsMinors = input.containsMinors;
  if (input.playAsCharacterId !== undefined) updates.playAsCharacterId = input.playAsCharacterId;
  if (input.dungeonMindEnabled !== undefined) updates.dungeonMindEnabled = input.dungeonMindEnabled;
  if (input.openingQuote !== undefined) updates.openingQuote = input.openingQuote;
  if (input.openingQuoteBy !== undefined) updates.openingQuoteBy = input.openingQuoteBy;
  if (input.aiReminderMd !== undefined) updates.aiReminderMd = input.aiReminderMd;
  if (input.outputReminderMd !== undefined) updates.outputReminderMd = input.outputReminderMd;

  // Rich text with render + revision tracking.
  if (input.plotMd !== undefined && input.plotMd !== null) {
    const { html } = renderAndSanitize(input.plotMd);
    updates.plotMd = input.plotMd;
    updates.plotHtml = html;
    await saveRevision({
      entityType: 'story',
      entityId: storyId,
      fieldKey: 'plot',
      authorId: userId,
      contentMd: input.plotMd,
      summary: input.revisionSummary ?? null,
    });
  }
  if (input.aiPlotMd !== undefined && input.aiPlotMd !== null) {
    const { html } = renderAndSanitize(input.aiPlotMd);
    updates.aiPlotMd = input.aiPlotMd;
    updates.aiPlotHtml = html;
    await saveRevision({
      entityType: 'story',
      entityId: storyId,
      fieldKey: 'ai_plot',
      authorId: userId,
      contentMd: input.aiPlotMd,
      summary: input.revisionSummary ?? null,
    });
  }
  if (input.aiGuidelinesMd !== undefined && input.aiGuidelinesMd !== null) {
    // No separate HTML column for guidelines — just store the markdown.
    updates.aiGuidelinesMd = input.aiGuidelinesMd;
  }

  await db.update(schema.stories).set(updates).where(eq(schema.stories.id, storyId));
  // PLANIMPv7 — invalidate translation cache when plot/synopsis MD changes.
  if (input.plotMd !== undefined) {
    await db.delete(schema.contentTranslations).where(
      and(
        eq(schema.contentTranslations.entityType, 'story'),
        eq(schema.contentTranslations.entityId, storyId),
      ),
    );
    // PLANIMPv3 — recompute token cache async.
    void (async () => {
      const full = await db.query.stories.findFirst({
        where: eq(schema.stories.id, storyId),
        columns: { plotMd: true, cast: true },
      });
      const scenes = await db.query.storyScenes.findMany({
        where: eq(schema.storyScenes.storyId, storyId),
        columns: { id: true, tokenCount: true, openingMd: true },
      });
      if (full) {
        const cache = computeStoryTokenCache(full, scenes);
        await db.update(schema.stories).set({ tokenCountCache: cache }).where(eq(schema.stories.id, storyId));
      }
    })().catch(() => {});
  }
  return c.json({ ok: true });
});



// Duplicate POST /:id/publish removed — guarded version (with openingSceneId check) is the canonical handler above.

/** POST /api/stories/:id/unpublish — set back to draft. */
storiesRouter.post('/:id/unpublish', requireAuth, async (c) => {
  const { userId } = c.get('user');
  const storyId = c.req.param('id')!;
  const existing = await db.query.stories.findFirst({
    where: and(eq(schema.stories.id, storyId), eq(schema.stories.authorId, userId)),
    columns: { id: true },
  });
  if (!existing) return c.json({ error: 'not_found' }, 404);
  await db.update(schema.stories).set({ status: 'draft', updatedAt: new Date() })
    .where(eq(schema.stories.id, storyId));
  return c.json({ ok: true, status: 'draft' });
});

/** POST /api/stories/:id/clone — fork to private copy. */
storiesRouter.post('/:id/clone', requireAuth, async (c) => {
  const { userId } = c.get('user');
  const storyId = c.req.param('id')!;
  const source = await db.query.stories.findFirst({
    where: or(
      and(eq(schema.stories.id, storyId), eq(schema.stories.authorId, userId)),
      and(eq(schema.stories.id, storyId), eq(schema.stories.status, 'published')),
    ),
  });
  if (!source) return c.json({ error: 'not_found' }, 404);
  const newId = nanoid();
  const now = new Date();
  await db.insert(schema.stories).values({
    id: newId,
    title: `${source.title} (kopi)`,
    synopsis: source.synopsis,
    coverImageUrl: source.coverImageUrl,
    language: source.language,
    authorId: userId,
    status: 'draft',
    mode: source.mode,
    requiredTier: source.requiredTier,
    cast: source.cast ?? [],
    metadata: source.metadata ?? {},
    tags: source.tags ?? [],
    plotMd: source.plotMd,
    plotHtml: source.plotHtml,
    aiPlotMd: source.aiPlotMd,
    aiGuidelinesMd: source.aiGuidelinesMd,
    aiReminderMd: source.aiReminderMd,
    outputReminderMd: source.outputReminderMd,
    isAdvancedMode: source.isAdvancedMode,
    openingQuote: source.openingQuote,
    openingQuoteBy: source.openingQuoteBy,
    createdAt: now,
    updatedAt: now,
  });
  // Clone scenarios.
  const srcScenarios = await listScenarios(storyId);
  for (const sc of srcScenarios) {
    await db.insert(schema.storyScenes).values({
      id: nanoid(),
      storyId: newId,
      title: sc.title,
      tileSubtitle: sc.tileSubtitle,
      tileImageUrl: sc.tileImageUrl,
      castSubset: sc.castSubset,
      openingMd: sc.openingMd,
      tokenCount: sc.tokenCount ?? 0,
      tileOrder: sc.tileOrder ?? 0,
      sceneType: 'intro',
    });
  }
  return c.json({ id: newId }, 201);
});



// GET /api/stories/:id/related — related stories (shared tags) + cast characters.
storiesRouter.get('/:id/related', async (c) => {
  const id = await resolveStoryId(c.req.param('id')!);
  if (!id) return c.json({ error: 'not_found' }, 404);
  const story = await db.query.stories.findFirst({
    where: eq(schema.stories.id, id),
    columns: { id: true, tags: true, cast: true, authorId: true },
  });
  if (!story) return c.json({ error: 'not_found' }, 404);
  const tags = (story.tags ?? []) as string[];
  const relatedStories = tags.length
    ? await db.query.stories.findMany({
        where: and(
          sql`${schema.stories.id} <> ${id}`,
          eq(schema.stories.status, 'published'),
          sql`${schema.stories.tags} && ARRAY[${sql.join(tags.map((t) => sql`${t}`), sql`, `)}]::text[]`,
        ),
        columns: { id: true, title: true, synopsis: true, coverImageUrl: true, tagline: true, tags: true, slug: true },
        limit: 6,
      })
    : [];
  const castIds: string[] = Array.isArray(story.cast)
    ? (story.cast as { characterId: string }[]).map((c) => c.characterId).filter(Boolean)
    : [];
  const relatedCharacters = castIds.length
    ? await db.query.characters.findMany({
        where: and(
          inArray(schema.characters.id, castIds),
          eq(schema.characters.isPublic, true),
        ),
        columns: { id: true, name: true, avatarUrl: true, chapter: true, tagline: true },
        limit: 6,
      })
    : [];
  return c.json({ stories: relatedStories, characters: relatedCharacters });
});
