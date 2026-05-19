import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { setCookie, deleteCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { zLogin, zRegister } from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { SESSION_COOKIE, signJwt } from '../lib/jwt.js';
import { env } from '../lib/env.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { resolveAccessRole, resolveEffectiveTier } from '../lib/access-role.js';

export const authRouter = new Hono<{ Variables: AuthVars }>();

// Abuse protection: cap register/login per IP. Register is harsher because it
// creates rows; login is looser to accommodate password typos.
const registerLimiter = rateLimit({ name: 'auth:register', windowMs: 60 * 60_000, max: 10 });
const loginLimiter = rateLimit({ name: 'auth:login', windowMs: 60_000, max: 15 });

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'Lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

authRouter.post('/register', registerLimiter, zValidator('json', zRegister), async (c) => {
  const { email, password, displayName } = c.req.valid('json');
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) return c.json({ error: 'email_taken' }, 409);
  const hash = await bcrypt.hash(password, 10);
  const id = nanoid();
  await db.insert(schema.users).values({
    id,
    email,
    passwordHash: hash,
    displayName,
    tier: 'FREE',
  });
  // PLANv3 X2.7 — seed built-in agent configs (removed)
  const token = signJwt({ userId: id, email });
  setCookie(c, SESSION_COOKIE, token, cookieOptions);
  const effectiveTier = resolveEffectiveTier({ email, storedTier: 'FREE' });
  const role = resolveAccessRole({ email, isFoundingReader: true });
  return c.json({ user: { id, email, displayName, tier: effectiveTier, role, isFoundingReader: true, metadata: {} } });
});

authRouter.post('/login', loginLimiter, zValidator('json', zLogin), async (c) => {
  const { email, password } = c.req.valid('json');
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!user) return c.json({ error: 'invalid_credentials' }, 401);
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return c.json({ error: 'invalid_credentials' }, 401);
  const token = signJwt({ userId: user.id, email: user.email });
  setCookie(c, SESSION_COOKIE, token, cookieOptions);
  const effectiveTier = resolveEffectiveTier({
    email: user.email,
    storedTier: user.tier as 'FREE' | 'PREMIUM' | 'PREMIUM_PLUS' | 'ENTERPRISE',
  });
  const role = resolveAccessRole({ email: user.email, isFoundingReader: user.isFoundingReader });
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      tier: effectiveTier,
      role,
      isFoundingReader: user.isFoundingReader,
      metadata: user.metadata ?? {},
    },
  });
});

authRouter.get('/me', requireAuth, async (c) => {
  const payload = c.get('user');
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, payload.userId) });
  if (!user) return c.json({ error: 'not_found' }, 404);
  const effectiveTier = resolveEffectiveTier({
    email: user.email,
    storedTier: user.tier as 'FREE' | 'PREMIUM' | 'PREMIUM_PLUS' | 'ENTERPRISE',
  });
  const role = resolveAccessRole({ email: user.email, isFoundingReader: user.isFoundingReader });
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      profileAge: user.profileAge,
      profileGender: user.profileGender,
      profilePronouns: user.profilePronouns,
      profileBio: user.profileBio,
      handle: user.handle,
      profileIsPublic: user.profileIsPublic,
      tier: effectiveTier,
      role,
      isFoundingReader: user.isFoundingReader,
      metadata: user.metadata ?? {},
    },
  });
});

const zProfileUpdate = z.object({
  displayName: z.string().min(1).max(100),
  profileAge: z.number().int().min(13).max(120).nullable().optional(),
  profileGender: z.string().max(30).nullable().optional(),
  profilePronouns: z.string().max(40).nullable().optional(),
  profileBio: z.string().max(500).nullable().optional(),
  handle: z
    .string()
    .regex(/^[a-z0-9_]{3,40}$/, 'handle must be 3-40 chars of a-z, 0-9, _')
    .nullable()
    .optional(),
  profileIsPublic: z.boolean().optional(),
});

// Reserved handles that cannot be claimed by users — must not collide with
// top-level routes or platform identifiers.
const RESERVED_HANDLES = new Set([
  'admin', 'api', 'auth', 'chat', 'creators', 'debug', 'discover', 'health',
  'help', 'neigo', 'neigo', 'legal', 'login', 'logout', 'mod', 'moderator',
  'official', 'ops', 'profile', 'public', 'register', 'root', 'settings',
  'signin', 'signout', 'signup', 'staff', 'stories', 'studio', 'support',
  'system', 'user', 'users',
]);

authRouter.patch('/profile', requireAuth, zValidator('json', zProfileUpdate), async (c) => {
  const payload = c.get('user');
  const input = c.req.valid('json');

  // Handle change — enforce reserved list + uniqueness.
  if (input.handle !== undefined && input.handle !== null) {
    const nextHandle = input.handle.toLowerCase();
    if (RESERVED_HANDLES.has(nextHandle)) {
      return c.json({ error: 'handle_reserved', message: 'This handle is reserved.' }, 400);
    }
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.handle, nextHandle),
    });
    if (existing && existing.id !== payload.userId) {
      return c.json({ error: 'handle_taken', message: 'Handle already taken.' }, 409);
    }
  }

  const updates: Record<string, unknown> = {
    displayName: input.displayName,
    profileAge: input.profileAge ?? null,
    profileGender: input.profileGender?.trim() || null,
    profilePronouns: input.profilePronouns?.trim() || null,
    profileBio: input.profileBio?.trim() || null,
    updatedAt: new Date(),
  };
  if (input.handle !== undefined) {
    updates.handle = input.handle ? input.handle.toLowerCase() : null;
  }
  if (input.profileIsPublic !== undefined) {
    updates.profileIsPublic = input.profileIsPublic;
  }

  await db.update(schema.users).set(updates).where(eq(schema.users.id, payload.userId));

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, payload.userId) });
  if (!user) return c.json({ error: 'not_found' }, 404);
  const effectiveTier = resolveEffectiveTier({
    email: user.email,
    storedTier: user.tier as 'FREE' | 'PREMIUM' | 'PREMIUM_PLUS' | 'ENTERPRISE',
  });
  const role = resolveAccessRole({ email: user.email, isFoundingReader: user.isFoundingReader });

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      profileAge: user.profileAge,
      profileGender: user.profileGender,
      profilePronouns: user.profilePronouns,
      profileBio: user.profileBio,
      handle: user.handle,
      profileIsPublic: user.profileIsPublic,
      tier: effectiveTier,
      role,
      isFoundingReader: user.isFoundingReader,
      metadata: user.metadata ?? {},
    },
  });
});

// Partial metadata merge — used for onboarding flags, UI hints, preferences.
// Values are merged shallowly into the existing jsonb blob.
const zMetadataUpdate = z.record(z.string(), z.unknown());

authRouter.patch('/metadata', requireAuth, zValidator('json', zMetadataUpdate), async (c) => {
  const payload = c.get('user');
  const patch = c.req.valid('json');
  // Drizzle jsonb merge via SQL to avoid race conditions.
  await db.execute(
    sql`UPDATE users
        SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb,
            updated_at = NOW()
        WHERE id = ${payload.userId}`,
  );
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, payload.userId) });
  return c.json({ metadata: user?.metadata ?? {} });
});

// PLANIMPv7 §7 — GDPR export: full JSON dump of user's own data.
authRouter.get('/export', requireAuth, async (c) => {
  const { userId } = c.get('user');
  const [user, myCharacters, myStories, myComments, myRatings, myReactions, myRevisions, myFollows] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, userId) }),
    db.query.characters.findMany({ where: eq(schema.characters.ownerId, userId) }),
    db.query.stories.findMany({ where: eq(schema.stories.authorId, userId) }),
    db.query.comments.findMany({ where: eq(schema.comments.authorId, userId) }),
    db.query.ratings.findMany({ where: eq(schema.ratings.userId, userId) }),
    db.query.reactions.findMany({ where: eq(schema.reactions.userId, userId) }),
    db.query.contentRevisions.findMany({ where: eq(schema.contentRevisions.authorId, userId) }),
    db.query.followers.findMany({ where: eq(schema.followers.followerUserId, userId) }),
  ]);
  if (!user) return c.json({ error: 'not_found' }, 404);
  // Strip password hash.
  const { passwordHash: _ph, byokOrKeyEnc: _b, ...userSafe } = user as Record<string, unknown>;
  const payload = {
    exportedAt: new Date().toISOString(),
    user: userSafe,
    characters: myCharacters,
    stories: myStories,
    comments: myComments,
    ratings: myRatings,
    reactions: myReactions,
    revisions: myRevisions,
    follows: myFollows,
  };
  c.header('Content-Disposition', `attachment; filename="neigo-export-${userId}.json"`);
  return c.json(payload);
});

// PLANIMPv7 §7 — GDPR account deletion: soft-delete the user and their content (14-day purge).
authRouter.post('/delete-account', requireAuth, async (c) => {
  const { userId } = c.get('user');
  const now = new Date();
  // Soft-delete all owned characters and stories.
  await db.update(schema.characters).set({ deletedAt: now, isPublic: false }).where(eq(schema.characters.ownerId, userId));
  await db.update(schema.stories).set({ deletedAt: now }).where(eq(schema.stories.authorId, userId));
  // Mark user metadata pending deletion. Hard-delete after 14 days via cron or manually.
  const userRow = await db.query.users.findFirst({ where: eq(schema.users.id, userId), columns: { metadata: true } });
  const meta = (userRow?.metadata ?? {}) as Record<string, unknown>;
  await db.update(schema.users).set({
    metadata: { ...meta, pendingDeletionAt: now.toISOString() },
    profileIsPublic: false,
  }).where(eq(schema.users.id, userId));
  deleteCookie(c, SESSION_COOKIE);
  return c.json({ ok: true, willBePurgedAt: new Date(now.getTime() + 14 * 86400_000).toISOString() });
});
