/**
 * REDESIGNv2 D4a — Story Runner service.
 *
 * Handles reading progress for the Visual Novel engine.
 * All operations are scoped to the stories/story_scenes/story_runs domain;
 * chat_sessions are never touched here.
 *
 * Tier gate (per §4.3):
 *   FREE    — any authenticated user.
 *   PAID    — user.tier ∈ {PAID, FOUNDER/ENTERPRISE}.
 *   FOUNDER — user.isFoundingReader=true OR user.tier=FOUNDER/ENTERPRISE.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, schema } from '../db/client.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StoryListItem {
  id: string;
  title: string;
  tagline: string | null;
  synopsis: string | null;
  coverImageUrl: string | null;
  language: string;
  authorId: string;
  status: string;
  mode: string;
  requiredTier: string;
  cast: Array<{ characterId: string; displayName: string; role: string }>;
  tags: string[];
  metadata: { tags?: string[]; contentWarnings?: string[]; estimatedMinutes?: number };
  publishedAt: string | null;
  updatedAt: string;
  totalPlays: number;
  totalChats: number;
  totalLikes: number;
}

export interface StoryDetail extends StoryListItem {
  openingSceneId: string | null;
  characterRefs: Array<{ characterId: string; source: string }>;
}

export interface ScenePayload {
  id: string;
  storyId: string;
  orderIndex: number;
  title: string | null;
  backgroundImageUrl: string | null;
  bgmUrl: string | null;
  openingNarration: string | null;
  characterCues: Array<{ characterId: string; position: string; expression: string }>;
  dialogueLines: Array<{ speakerCharacterId: string | null; text: string }>;
  sceneType: string;
  nextSceneId: string | null;
  choices: Array<Record<string, unknown>>;
  endingSlug: string | null;
}

export interface RunState {
  id: string;
  userId: string;
  storyId: string;
  currentSceneId: string | null;
  startedAt: string;
  lastReadAt: string;
  completedAt: string | null;
  endingReached: string | null;
  readingSeconds: number;
}

// ─── Tier gate ───────────────────────────────────────────────────────────────

type TierKind = 'FREE' | 'PAID' | 'FOUNDER';

function checkTierAccess(
  requiredTier: string,
  user: { tier: string; isFoundingReader: boolean },
): boolean {
  const tier = requiredTier as TierKind;
  if (tier === 'FREE') return true;
  const effectiveTier = user.tier.toUpperCase();
  const isPaid = effectiveTier === 'PAID' || effectiveTier === 'FOUNDER' || effectiveTier === 'ENTERPRISE';
  if (tier === 'PAID') return isPaid;
  // FOUNDER tier: needs isFoundingReader flag OR FOUNDER/ENTERPRISE tier
  return user.isFoundingReader || effectiveTier === 'FOUNDER' || effectiveTier === 'ENTERPRISE';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapStory(s: typeof schema.stories.$inferSelect): StoryListItem {
  return {
    id: s.id,
    title: s.title,
    tagline: s.tagline ?? null,
    synopsis: s.synopsis ?? null,
    coverImageUrl: s.coverImageUrl ?? null,
    language: s.language,
    authorId: s.authorId,
    status: s.status,
    mode: s.mode,
    requiredTier: s.requiredTier,
    cast: (s.cast as Array<{ characterId: string; displayName: string; role: string }>) ?? [],
    tags: (s.tags as string[]) ?? [],
    metadata: (s.metadata as { tags?: string[]; contentWarnings?: string[]; estimatedMinutes?: number }) ?? {},
    publishedAt: s.publishedAt?.toISOString() ?? null,
    updatedAt: s.updatedAt.toISOString(),
    totalPlays: s.totalPlays ?? 0,
    totalChats: s.totalChats ?? 0,
    totalLikes: s.totalLikes ?? 0,
  };
}

function mapScene(sc: typeof schema.storyScenes.$inferSelect): ScenePayload {
  return {
    id: sc.id,
    storyId: sc.storyId,
    orderIndex: sc.orderIndex,
    title: sc.title ?? null,
    backgroundImageUrl: sc.backgroundImageUrl ?? null,
    bgmUrl: sc.bgmUrl ?? null,
    openingNarration: sc.openingNarration ?? null,
    characterCues: (sc.characterCues as Array<{ characterId: string; position: string; expression: string }>) ?? [],
    dialogueLines: (sc.dialogueLines as Array<{ speakerCharacterId: string | null; text: string }>) ?? [],
    sceneType: sc.sceneType,
    nextSceneId: sc.nextSceneId ?? null,
    choices: (sc.choices as Array<Record<string, unknown>>) ?? [],
    endingSlug: sc.endingSlug ?? null,
  };
}

function mapRun(r: typeof schema.storyRuns.$inferSelect): RunState {
  return {
    id: r.id,
    userId: r.userId,
    storyId: r.storyId,
    currentSceneId: r.currentSceneId ?? null,
    startedAt: r.startedAt.toISOString(),
    lastReadAt: r.lastReadAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    endingReached: r.endingReached ?? null,
    readingSeconds: r.readingSeconds,
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * List published stories (public catalog).
 * Filters: language, tag (inside metadata.tags).
 */
export async function listStories(opts: {
  language?: string;
  tag?: string;
  limit?: number;
  offset?: number;
  sort?: 'newest' | 'popular';
}): Promise<StoryListItem[]> {
  const limit = Math.max(1, opts.limit ?? 30);
  const offset = Math.max(0, opts.offset ?? 0);

  const order =
    opts.sort === 'popular'
      ? sql`(${schema.stories.totalPlays} + ${schema.stories.totalChats} * 2) DESC`
      : desc(schema.stories.publishedAt);

  const rows = await db
    .select()
    .from(schema.stories)
    .where(
      and(
        eq(schema.stories.status, 'published'),
        opts.language ? eq(schema.stories.language, opts.language) : undefined,
        opts.tag
          ? sql`${schema.stories.metadata}->'tags' @> ${JSON.stringify([opts.tag.toLowerCase()])}::jsonb`
          : undefined,
      ),
    )
    .orderBy(order)
    .limit(limit)
    .offset(offset);

  const items = rows.map(mapStory);
  return items;
}

/**
 * List all stories owned by the authenticated user (all statuses, incl. drafts).
 * Used by the Studio stories list endpoint (?mine=1).
 */
export async function listMyStories(userId: string): Promise<StoryListItem[]> {
  const rows = await db
    .select()
    .from(schema.stories)
    .where(
      and(
        eq(schema.stories.authorId, userId),
        // exclude permanently soft-deleted
        sql`${schema.stories.deletedAt} IS NULL`,
      ),
    )
    .orderBy(desc(schema.stories.updatedAt))
    .limit(200);
  return rows.map(mapStory);
}

/**
 * Get story detail (metadata + cast refs).
 * Only returns non-draft stories unless the caller is the author.
 *
 * BACKLOG B1.8 — Accepts either UUID id or url-safe slug. Slug match is
 * case-sensitive to keep the canonical URL stable. Falls back to id on
 * no slug match so legacy UUID links keep working.
 */
export async function getStory(
  idOrSlug: string,
  requesterId: string | null,
): Promise<(StoryDetail & { forbidden?: boolean }) | null> {
  // Heuristic: 36-char hyphenated UUID or nanoid-style (>=20 chars all alnum).
  // If it looks like a UUID prefer id lookup first. Slug pattern is strict:
  // lowercase alnum + dashes and at least one dash OR shorter than 20 chars.
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(idOrSlug);
  const looksLikeSlug = /^[a-z0-9][a-z0-9-]*$/.test(idOrSlug);
  let story = await db.query.stories.findFirst({
    where: eq(schema.stories.id, idOrSlug),
  });
  if (!story && looksLikeSlug && !looksLikeUuid) {
    story = await db.query.stories.findFirst({
      where: eq(schema.stories.slug, idOrSlug),
    });
  }
  if (!story) return null;

  // Non-author can only see published/featured
  if (story.status === 'draft' && story.authorId !== requesterId) {
    return null;
  }

  const refs = await db
    .select({ characterId: schema.storyCharacterRefs.characterId, source: schema.storyCharacterRefs.source })
    .from(schema.storyCharacterRefs)
    .where(eq(schema.storyCharacterRefs.storyId, story.id));

  return { ...mapStory(story), openingSceneId: story.openingSceneId ?? null, characterRefs: refs };
}

/**
 * Get a single scene — validates it belongs to the story.
 */
export async function getScene(
  storyId: string,
  sceneId: string,
): Promise<ScenePayload | null> {
  const scene = await db.query.storyScenes.findFirst({
    where: and(eq(schema.storyScenes.id, sceneId), eq(schema.storyScenes.storyId, storyId)),
  });
  if (!scene) return null;
  return mapScene(scene);
}

/**
 * Start a new run for a user on a story.
 * If a run already exists (UNIQUE user+story), resume it instead.
 * Returns { run, scene }.
 */
export async function startRun(
  storyId: string,
  userId: string,
): Promise<{ run: RunState; scene: ScenePayload | null; alreadyStarted: boolean } | { error: string }> {
  const story = await db.query.stories.findFirst({
    where: and(eq(schema.stories.id, storyId)),
  });
  if (!story || (story.status !== 'published' && story.status !== 'featured')) {
    return { error: 'story_not_found' };
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { tier: true, isFoundingReader: true },
  });
  if (!user) return { error: 'user_not_found' };

  if (!checkTierAccess(story.requiredTier, user)) {
    return { error: 'tier_required' };
  }

  // Check existing run
  const existing = await db.query.storyRuns.findFirst({
    where: and(eq(schema.storyRuns.userId, userId), eq(schema.storyRuns.storyId, storyId)),
  });

  if (existing) {
    const scene = existing.currentSceneId
      ? await getScene(storyId, existing.currentSceneId)
      : story.openingSceneId
        ? await getScene(storyId, story.openingSceneId)
        : null;
    return { run: mapRun(existing), scene, alreadyStarted: true };
  }

  const runId = nanoid();
  const now = new Date();
  await db.insert(schema.storyRuns).values({
    id: runId,
    userId,
    storyId,
    currentSceneId: story.openingSceneId ?? null,
    startedAt: now,
    lastReadAt: now,
  });

  const run = await db.query.storyRuns.findFirst({ where: eq(schema.storyRuns.id, runId) });
  const scene = story.openingSceneId ? await getScene(storyId, story.openingSceneId) : null;

  return { run: mapRun(run!), scene, alreadyStarted: false };
}

/**
 * Resume an existing run (by runId).
 */
export async function getRun(
  runId: string,
  userId: string,
): Promise<{ run: RunState; scene: ScenePayload | null } | null> {
  const run = await db.query.storyRuns.findFirst({
    where: and(eq(schema.storyRuns.id, runId), eq(schema.storyRuns.userId, userId)),
  });
  if (!run) return null;

  const scene = run.currentSceneId
    ? await getScene(run.storyId, run.currentSceneId)
    : null;

  return { run: mapRun(run), scene };
}

/**
 * Advance run to the next scene (kinetic only).
 * fromSceneId must match currentSceneId (optimistic lock).
 * Returns the next scene, or marks the run completed on ending scenes.
 */
export async function advanceRun(
  runId: string,
  userId: string,
  fromSceneId: string,
  elapsedSeconds = 0,
): Promise<
  | { run: RunState; nextScene: ScenePayload | null; completed: boolean }
  | { error: string }
> {
  const run = await db.query.storyRuns.findFirst({
    where: and(eq(schema.storyRuns.id, runId), eq(schema.storyRuns.userId, userId)),
  });
  if (!run) return { error: 'run_not_found' };
  if (run.completedAt) return { error: 'run_already_completed' };
  if (run.currentSceneId !== fromSceneId) return { error: 'scene_mismatch' };

  const currentScene = await db.query.storyScenes.findFirst({
    where: and(
      eq(schema.storyScenes.id, fromSceneId),
      eq(schema.storyScenes.storyId, run.storyId),
    ),
  });
  if (!currentScene) return { error: 'scene_not_found' };

  const now = new Date();
  const isEnding = currentScene.sceneType === 'ending' || !currentScene.nextSceneId;
  const nextSceneId = isEnding ? null : currentScene.nextSceneId;

  await db
    .update(schema.storyRuns)
    .set({
      currentSceneId: nextSceneId ?? run.currentSceneId,
      lastReadAt: now,
      readingSeconds: (run.readingSeconds ?? 0) + Math.max(0, Math.round(elapsedSeconds)),
      ...(isEnding
        ? {
            completedAt: now,
            endingReached: currentScene.endingSlug ?? 'default',
          }
        : {}),
    })
    .where(eq(schema.storyRuns.id, runId));

  const updated = await db.query.storyRuns.findFirst({ where: eq(schema.storyRuns.id, runId) });
  const nextScene = nextSceneId ? await getScene(run.storyId, nextSceneId) : null;

  // PLANVNv2 BV5 — re-seed the linked chat session so the FE sees the new
  // scene on query invalidation, without requiring a separate endpoint.
  if (run.seededSessionId) {
    const sessionId = run.seededSessionId;
    const newSceneCard = {
      sceneId: nextScene?.id ?? null,
      background: nextScene?.backgroundImageUrl ?? null,
      location: null,
      weather: null,
      nextSceneId: nextScene?.nextSceneId ?? null,
      castSubset: nextScene?.characterCues?.map((c) => c.characterId) ?? [],
    };

    // Update the live chat session's scene state.
    await db
      .update(schema.chatSessions)
      .set({ sceneCard: newSceneCard })
      .where(eq(schema.chatSessions.id, sessionId));

    // Insert a synthetic NARRATOR message that marks the scene boundary.
    // Tagged with metadata.kind='scene_change' so the FE bubble mapper skips it.
    const lastTurn = await db.query.chatMessages.findFirst({
      where: eq(schema.chatMessages.sessionId, sessionId),
      orderBy: (m, { desc: d }) => [d(m.turnIndex)],
      columns: { turnIndex: true },
    });
    const nextTurnIndex = (lastTurn?.turnIndex ?? -1) + 1;
    const sceneLabel = nextScene?.title
      ? `[Scene: ${nextScene.title}]`
      : '[Scene change]';
    const sceneContent = nextScene?.openingNarration
      ? `${sceneLabel} ${nextScene.openingNarration}`
      : sceneLabel;

    await db.insert(schema.chatMessages).values({
      id: nanoid(),
      sessionId,
      turnIndex: nextTurnIndex,
      role: 'assistant',
      speakerType: 'NARRATOR',
      content: sceneContent,
      metadata: { kind: 'scene_change', sceneId: nextScene?.id ?? null },
      createdAt: now,
    });

    // Write a session_events row for analytics and timeline.
    await db.insert(schema.sessionEvents).values({
      id: nanoid(),
      sessionId,
      userId: run.userId,
      eventType: 'scene_advance',
      payload: { fromSceneId, toSceneId: nextScene?.id ?? null },
    }).catch(() => {/* best-effort — sessionEvents may not exist in tests */});
  }

  return { run: mapRun(updated!), nextScene, completed: isEnding };
}
