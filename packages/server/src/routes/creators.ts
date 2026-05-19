/**
 * REDESIGNv2 D3 — Public creator profile routes.
 *
 *   GET  /api/creators/:handle   — public profile (handle, displayName, bio,
 *                                  public characters)
 *
 * The authenticated caller manages their own handle/bio/visibility via
 * PATCH /api/me/profile (see me.ts).
 */
import { Hono } from 'hono';
import { and, eq, desc, sql, inArray } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { requireAuth, optionalAuth, type AuthVars } from '../middleware/auth.js';

export const creatorsRouter = new Hono<{ Variables: Partial<AuthVars> }>();
creatorsRouter.use('*', optionalAuth);

creatorsRouter.get('/:handle', async (c) => {
  const handle = (c.req.param('handle') ?? '').toLowerCase().replace(/^@/, '');
  if (!handle) return c.json({ error: 'invalid_handle' }, 400);

  const user = await db.query.users.findFirst({
    where: eq(schema.users.handle, handle),
  });
  if (!user || !user.profileIsPublic) {
    return c.json({ error: 'not_found' }, 404);
  }

  const authUser = c.get('user') as { userId: string } | undefined;
  let isFollowing = false;
  if (authUser?.userId && authUser.userId !== user.id) {
    const follow = await db.query.followers.findFirst({
      where: and(
        eq(schema.followers.followerUserId, authUser.userId),
        eq(schema.followers.followedUserId, user.id),
      ),
    });
    isFollowing = !!follow;
  }

  const characters = await db
    .select({
      id: schema.characters.id,
      name: schema.characters.name,
      avatarUrl: schema.characters.avatarUrl,
      tonePreset: schema.characters.tonePreset,
      tags: schema.characters.tags,
      language: schema.characters.language,
      languagesSpoken: schema.characters.languagesSpoken,
      updatedAt: schema.characters.updatedAt,
    })
    .from(schema.characters)
    .where(
      and(
        eq(schema.characters.ownerId, user.id),
        eq(schema.characters.isPublic, true),
        eq(schema.characters.isRetired, false),
        sql`${schema.characters.deletedAt} IS NULL`,
      ),
    )
    .limit(60);

  return c.json({
    creator: {
      handle: user.handle,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.profileBio ?? null,
      isFoundingReader: user.isFoundingReader,
      followerCount: user.followerCount ?? 0,
      followingCount: user.followingCount ?? 0,
      isFollowing,
      joinedAt: user.createdAt.toISOString(),
    },
    characters: characters.map((ch) => ({
      ...ch,
      updatedAt: ch.updatedAt.toISOString(),
    })),
  });
});

// POST /api/creators/:handle/follow — follow a creator (PLANIMPv7 §4).
creatorsRouter.post('/:handle/follow', requireAuth, async (c) => {
  const handle = (c.req.param('handle') ?? '').toLowerCase().replace(/^@/, '');
  const { userId } = c.get('user') as { userId: string };
  const target = await db.query.users.findFirst({
    where: eq(schema.users.handle, handle),
    columns: { id: true, profileIsPublic: true },
  });
  if (!target || !target.profileIsPublic) return c.json({ error: 'not_found' }, 404);
  if (target.id === userId) return c.json({ error: 'cannot_follow_self' }, 400);
  const existing = await db.query.followers.findFirst({
    where: and(
      eq(schema.followers.followerUserId, userId),
      eq(schema.followers.followedUserId, target.id),
    ),
  });
  if (!existing) {
    await db.insert(schema.followers).values({
      followerUserId: userId,
      followedUserId: target.id,
    });
    await db.update(schema.users)
      .set({ followerCount: sql`${schema.users.followerCount} + 1` })
      .where(eq(schema.users.id, target.id));
    await db.update(schema.users)
      .set({ followingCount: sql`${schema.users.followingCount} + 1` })
      .where(eq(schema.users.id, userId));
  }
  return c.json({ ok: true, following: true });
});

// POST /api/creators/:handle/unfollow.
creatorsRouter.post('/:handle/unfollow', requireAuth, async (c) => {
  const handle = (c.req.param('handle') ?? '').toLowerCase().replace(/^@/, '');
  const { userId } = c.get('user') as { userId: string };
  const target = await db.query.users.findFirst({
    where: eq(schema.users.handle, handle),
    columns: { id: true },
  });
  if (!target) return c.json({ error: 'not_found' }, 404);
  const existing = await db.query.followers.findFirst({
    where: and(
      eq(schema.followers.followerUserId, userId),
      eq(schema.followers.followedUserId, target.id),
    ),
  });
  if (existing) {
    await db.delete(schema.followers).where(
      and(
        eq(schema.followers.followerUserId, userId),
        eq(schema.followers.followedUserId, target.id),
      ),
    );
    await db.update(schema.users)
      .set({ followerCount: sql`GREATEST(${schema.users.followerCount} - 1, 0)` })
      .where(eq(schema.users.id, target.id));
    await db.update(schema.users)
      .set({ followingCount: sql`GREATEST(${schema.users.followingCount} - 1, 0)` })
      .where(eq(schema.users.id, userId));
  }
  return c.json({ ok: true, following: false });
});

// GET /api/creators/feed — latest characters+stories from followed creators.
creatorsRouter.get('/me/feed', requireAuth, async (c) => {
  const { userId } = c.get('user') as { userId: string };
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? '20')));
  const followed = await db
    .select({ id: schema.followers.followedUserId })
    .from(schema.followers)
    .where(eq(schema.followers.followerUserId, userId));
  const ids = followed.map((f) => f.id);
  if (ids.length === 0) return c.json({ characters: [], stories: [] });

  const [chars, stories] = await Promise.all([
    db.query.characters.findMany({
      where: and(
        inArray(schema.characters.ownerId, ids),
        eq(schema.characters.isPublic, true),
        sql`${schema.characters.deletedAt} IS NULL`,
      ),
      columns: { id: true, name: true, avatarUrl: true, tagline: true, ownerId: true, updatedAt: true, slug: true },
      orderBy: [desc(schema.characters.updatedAt)],
      limit,
    }),
    db.query.stories.findMany({
      where: and(
        inArray(schema.stories.authorId, ids),
        sql`${schema.stories.status} IN ('published','featured')`,
      ),
      columns: { id: true, title: true, tagline: true, coverImageUrl: true, authorId: true, updatedAt: true, slug: true },
      orderBy: [desc(schema.stories.updatedAt)],
      limit,
    }),
  ]);
  return c.json({ characters: chars, stories });
});
