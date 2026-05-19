import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, or } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import {
  CreateMcProfileSchema,
  createMcProfile,
  getUserMcProfiles,
  deleteMcProfile,
  setDefaultMcProfile,
} from '../services/mc-service.js';

export const mcProfilesRouter = new Hono<{ Variables: AuthVars }>();
mcProfilesRouter.use('*', requireAuth);

/** GET /api/mc-profiles — list all MC profiles for current user */
mcProfilesRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const profiles = await getUserMcProfiles(userId);
  return c.json({ profiles });
});

/** POST /api/mc-profiles — create a new MC profile */
mcProfilesRouter.post('/', zValidator('json', CreateMcProfileSchema), async (c) => {
  const { userId } = c.get('user');
  const data = c.req.valid('json');
  const profile = await createMcProfile(userId, data);
  return c.json(profile, 201);
});

/** DELETE /api/mc-profiles/:id — delete an MC profile */
mcProfilesRouter.delete('/:id', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const deleted = await deleteMcProfile(id, userId);
  if (!deleted) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

/** PUT /api/mc-profiles/set-default — set a profile as default */
mcProfilesRouter.put(
  '/set-default',
  zValidator('json', z.object({ profileId: z.string() })),
  async (c) => {
    const { userId } = c.get('user');
    const { profileId } = c.req.valid('json');
    const profile = await setDefaultMcProfile(profileId, userId);
    if (!profile) return c.json({ error: 'Not found' }, 404);
    return c.json({ profile });
  },
);

/** GET /api/mc-profiles/character-options — user's own characters usable as MC */
mcProfilesRouter.get('/character-options', async (c) => {
  const { userId } = c.get('user');
  const rows = await db
    .select({
      id: schema.characters.id,
      name: schema.characters.name,
      avatarUrl: schema.characters.avatarUrl,
      tagline: schema.characters.tagline,
      isBuiltIn: schema.characters.isBuiltIn,
      ownerId: schema.characters.ownerId,
      persona: schema.characters.persona,
    })
    .from(schema.characters)
    .where(
      and(
        or(
          eq(schema.characters.ownerId, userId),
          eq(schema.characters.isBuiltIn, true),
        ),
        eq(schema.characters.isRetired, false),
        eq(schema.characters.allowInStories, true),
      ),
    )
    .limit(50);

  const characters = rows.map((r) => ({
    id: r.id,
    name: r.name,
    avatarUrl: r.avatarUrl,
    tagline: r.tagline,
    isBuiltIn: r.isBuiltIn,
    ownerId: r.ownerId,
    // persona is already a JSONB object with all fields
    persona: (r.persona ?? {}) as Record<string, unknown>,
  }));

  return c.json({ characters });
});
