/**
 * PLANIMPv1 §4.2 — Polymorphic threaded comments.
 * Mounted at /api/characters/:id/comments and /api/stories/:id/comments
 * via commentsRouter factory.
 *
 * p95 budget: < 80 ms (warm). Paginated via cursor.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import { requireAuth, optionalAuth, type AuthVars } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { renderAndSanitize } from '../services/rich-content.js';

const zCreateComment = z.object({
  bodyMd: z.string().min(1).max(4096),
  parentId: z.string().max(36).nullable().optional(),
});

const zVote = z.object({
  dir: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});

function makeRouter(entityType: 'character' | 'story') {
  const router = new Hono<{ Variables: Partial<AuthVars> }>();
  router.use('*', optionalAuth);

  // GET /:entityId/comments?sort=top|new&limit=20&cursor=<iso>
  router.get('/', async (c) => {
    const entityId = c.req.param('id')! ?? c.req.param('storyId')! ?? c.req.param('characterId')!;
    const sort = c.req.query('sort') ?? 'new';
    const limitRaw = Math.max(1, Math.min(50, Number(c.req.query('limit') ?? '20')));
    const cursor = c.req.query('cursor');

    const conds = [
      eq(schema.comments.entityType, entityType),
      eq(schema.comments.entityId, entityId!),
      sql`${schema.comments.deletedAt} IS NULL`,
      sql`${schema.comments.parentId} IS NULL`,
    ];

    if (cursor) conds.push(sql`${schema.comments.createdAt} < ${cursor}::timestamptz`);

    const order = sort === 'top'
      ? desc(sql`${schema.comments.upvotes} - ${schema.comments.downvotes}`)
      : desc(schema.comments.createdAt);

    const rows = await db
      .select({
        id: schema.comments.id,
        authorId: schema.comments.authorId,
        bodyMd: schema.comments.bodyMd,
        bodyHtml: schema.comments.bodyHtml,
        upvotes: schema.comments.upvotes,
        downvotes: schema.comments.downvotes,
        pinnedByOwner: schema.comments.pinnedByOwner,
        editedAt: schema.comments.editedAt,
        createdAt: schema.comments.createdAt,
        authorName: schema.users.displayName,
        authorHandle: schema.users.handle,
        authorAvatar: schema.users.avatarUrl,
      })
      .from(schema.comments)
      .leftJoin(schema.users, eq(schema.comments.authorId, schema.users.id))
      .where(and(...conds))
      .orderBy(order)
      .limit(limitRaw + 1);

    const hasMore = rows.length > limitRaw;
    return c.json({ comments: rows.slice(0, limitRaw), hasMore });
  });

  // POST /:entityId/comments
  router.post('/', requireAuth, rateLimit({ max: 5, windowMs: 60 * 1000 }), zValidator('json', zCreateComment), async (c) => {
    const entityId = c.req.param('id')! ?? c.req.param('storyId')! ?? c.req.param('characterId')!;
    const { userId } = (c.get('user') as { userId: string });
    const { bodyMd, parentId } = c.req.valid('json');

    const { html } = renderAndSanitize(bodyMd, 'comment');

    const id = nanoid();
    await db.insert(schema.comments).values({
      id,
      entityType,
      entityId: entityId!,
      parentId: parentId ?? null,
      authorId: userId,
      bodyMd,
      bodyHtml: html,
    });

    // Increment entity comment counter.
    if (entityType === 'story') {
      await db
        .update(schema.stories)
        .set({ totalComments: sql`${schema.stories.totalComments} + 1` })
        .where(eq(schema.stories.id, entityId!));
    } else {
      await db
        .update(schema.characters)
        .set({ totalComments: sql`${schema.characters.totalComments} + 1` })
        .where(eq(schema.characters.id, entityId!));
    }

    return c.json({ id }, 201);
  });

  // DELETE /comments/:commentId (soft)
  router.delete('/:commentId', requireAuth, async (c) => {
    const { userId } = (c.get('user') as { userId: string });
    const commentId = c.req.param('commentId')!;

    const comment = await db.query.comments.findFirst({
      where: and(eq(schema.comments.id, commentId), eq(schema.comments.authorId, userId)),
    });
    if (!comment) return c.json({ error: 'not_found' }, 404);

    await db
      .update(schema.comments)
      .set({ deletedAt: new Date(), bodyMd: '[deleted]', bodyHtml: '<p>[deleted]</p>' })
      .where(eq(schema.comments.id, commentId));

    return c.json({ ok: true });
  });

  // POST /comments/:commentId/vote
  router.post('/:commentId/vote', requireAuth, zValidator('json', zVote), async (c) => {
    const { userId } = (c.get('user') as { userId: string });
    const commentId = c.req.param('commentId')!;
    const { dir } = c.req.valid('json');

    if (dir === 0) {
      await db
        .delete(schema.commentVotes)
        .where(and(eq(schema.commentVotes.commentId, commentId), eq(schema.commentVotes.userId, userId)));
    } else {
      await db
        .insert(schema.commentVotes)
        .values({ commentId, userId, vote: dir })
        .onConflictDoUpdate({ target: [schema.commentVotes.commentId, schema.commentVotes.userId], set: { vote: dir } });
    }

    // Recompute upvotes/downvotes.
    const votes = await db
      .select({ vote: schema.commentVotes.vote })
      .from(schema.commentVotes)
      .where(eq(schema.commentVotes.commentId, commentId));

    const upvotes = votes.filter((v) => v.vote === 1).length;
    const downvotes = votes.filter((v) => v.vote === -1).length;

    await db
      .update(schema.comments)
      .set({ upvotes, downvotes })
      .where(eq(schema.comments.id, commentId));

    return c.json({ upvotes, downvotes });
  });

  // POST /comments/:commentId/pin — entity owner only (PLANIMPv1 §4.2).
  router.post('/:commentId/pin', requireAuth, async (c) => {
    const { userId } = (c.get('user') as { userId: string });
    const commentId = c.req.param('commentId')!;
    const body = await c.req.json().catch(() => ({}));
    const pin = body?.pin !== false;
    const comment = await db.query.comments.findFirst({
      where: eq(schema.comments.id, commentId),
      columns: { id: true, entityType: true, entityId: true },
    });
    if (!comment) return c.json({ error: 'not_found' }, 404);
    // Verify caller owns parent entity.
    let isOwner = false;
    if (comment.entityType === 'character') {
      const ch = await db.query.characters.findFirst({
        where: eq(schema.characters.id, comment.entityId),
        columns: { ownerId: true },
      });
      isOwner = ch?.ownerId === userId;
    } else if (comment.entityType === 'story') {
      const st = await db.query.stories.findFirst({
        where: eq(schema.stories.id, comment.entityId),
        columns: { authorId: true },
      });
      isOwner = st?.authorId === userId;
    }
    if (!isOwner) return c.json({ error: 'forbidden' }, 403);
    await db.update(schema.comments).set({ pinnedByOwner: pin }).where(eq(schema.comments.id, commentId));
    return c.json({ ok: true, pinned: pin });
  });

  return router;
}

export const characterCommentsRouter = makeRouter('character');
export const storyCommentsRouter = makeRouter('story');
