/**
 * BACKLOG B2.7 — Mass-publish helpers.
 *
 * Surfaces the private-content count and a one-shot bulk publish flip
 * so a creator can opt their entire personal library into discovery in
 * a single click. Dismissal is FE-state (localStorage) — no server
 * memory because the banner naturally hides when the count reaches
 * zero.
 */
import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';

export const meRouter = new Hono<{ Variables: AuthVars }>();

meRouter.use('*', requireAuth);

meRouter.post('/mass-publish', async (c) => {
  const { userId } = c.get('user');
  const body = await c.req.json().catch(() => null) as {
    includeCharacters?: boolean;
    includeStories?: boolean;
  } | null;
  const includeCharacters = body?.includeCharacters !== false;
  const includeStories = body?.includeStories !== false;

  const now = new Date();
  let charactersUpdated = 0;
  let storiesUpdated = 0;

  if (includeCharacters) {
    // Skip rows still pending avatar moderation — they get queued via the
    // B2.6 pre-flight rather than published outright.
    const pending = await db
      .select({ characterId: schema.characterImages.characterId })
      .from(schema.characterImages)
      .where(
        and(
          eq(schema.characterImages.isPrimary, true),
          sql`${schema.characterImages.moderationStatus} <> 'approved'`,
        ),
      );
    const skipIds = new Set(pending.map((p) => p.characterId));

    const candidates = await db
      .select({ id: schema.characters.id })
      .from(schema.characters)
      .where(
        and(
          eq(schema.characters.ownerId, userId),
          eq(schema.characters.isPublic, false),
          eq(schema.characters.isRetired, false),
        ),
      );

    const toFlip = candidates.filter((r) => !skipIds.has(r.id)).map((r) => r.id);
    const toQueue = candidates.filter((r) => skipIds.has(r.id)).map((r) => r.id);

    if (toFlip.length > 0) {
      await db
        .update(schema.characters)
        .set({
          isPublic: true,
          publishedAt: sql`coalesce(${schema.characters.publishedAt}, now())`,
          updatedPublicAt: now,
          updatedAt: now,
          queuedForPublish: false,
        })
        .where(
          and(
            eq(schema.characters.ownerId, userId),
            sql`${schema.characters.id} = ANY(${toFlip})`,
          ),
        );
      charactersUpdated = toFlip.length;
    }
    if (toQueue.length > 0) {
      await db
        .update(schema.characters)
        .set({ queuedForPublish: true, updatedAt: now })
        .where(
          and(
            eq(schema.characters.ownerId, userId),
            sql`${schema.characters.id} = ANY(${toQueue})`,
          ),
        );
    }
  }

  if (includeStories) {
    const result = await db
      .update(schema.stories)
      .set({
        status: 'published',
        publishedAt: sql`coalesce(${schema.stories.publishedAt}, now())`,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.stories.authorId, userId),
          eq(schema.stories.status, 'draft'),
        ),
      )
      .returning({ id: schema.stories.id });
    storiesUpdated = result.length;
  }

  return c.json({ charactersUpdated, storiesUpdated });
});
