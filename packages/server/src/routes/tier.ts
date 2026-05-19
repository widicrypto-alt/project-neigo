import { Hono } from 'hono';
import { and, eq, gte, sql } from 'drizzle-orm';
import { TIER_CONFIG } from '@neigo/shared';
import type { Tier } from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { resolveAccessRole, resolveEffectiveTier } from '../lib/access-role.js';

export const tierRouter = new Hono<{ Variables: AuthVars }>();
tierRouter.use('*', requireAuth);

tierRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  const tier = resolveEffectiveTier({
    email: user?.email,
    storedTier: (user?.tier as Tier | undefined) ?? 'FREE',
  });
  const role = resolveAccessRole({
    email: user?.email,
    isFoundingReader: user?.isFoundingReader,
  });
  const now = Date.now();
  const fiveHourMs = 5 * 60 * 60 * 1000;
  const fiveHourStart = new Date(Math.floor(now / fiveHourMs) * fiveHourMs);

  const weekStart = new Date(now);
  const day = weekStart.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - diffToMonday);
  weekStart.setUTCHours(0, 0, 0, 0);

  const sessions5h = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.userId, userId),
        gte(schema.chatSessions.createdAt, fiveHourStart),
      ),
    );

  const turns5h = await db.execute(
    sql`SELECT COUNT(*)::int AS cnt
        FROM chat_messages cm
        JOIN chat_sessions cs ON cm.session_id = cs.id
        WHERE cs.user_id = ${userId}
          AND cm.speaker_type = 'USER'
          AND cm.created_at >= ${fiveHourStart.toISOString()}`,
  );

  const turnsWeek = await db.execute(
    sql`SELECT COUNT(*)::int AS cnt
        FROM chat_messages cm
        JOIN chat_sessions cs ON cm.session_id = cs.id
        WHERE cs.user_id = ${userId}
          AND cm.speaker_type = 'USER'
          AND cm.created_at >= ${weekStart.toISOString()}`,
  );

  const usedSessions5h = sessions5h[0]?.value ?? 0;
  const usedTurns5h = ((turns5h[0] as { cnt?: number } | undefined)?.cnt ?? 0);
  const usedTurnsWeek = ((turnsWeek[0] as { cnt?: number } | undefined)?.cnt ?? 0);

  return c.json({
    tier,
    role,
    expiresAt: user?.tierExpiresAt?.toISOString() ?? null,
    config: TIER_CONFIG[tier],
    all: TIER_CONFIG,
    usage: {
      sessions5h: usedSessions5h,
      turns5h: usedTurns5h,
      turnsWeek: usedTurnsWeek,
      resetAt5h: new Date(fiveHourStart.getTime() + fiveHourMs).toISOString(),
      resetAtWeek: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    featureFlags: {
      pushNotifications: env.ENABLE_PUSH_NOTIFICATIONS,
    },
  });
});
