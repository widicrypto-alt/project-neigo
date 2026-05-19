/**
 * Tier enforcement middleware.
 * Fetches the user's current tier and attaches it, then exposes a `requireTier` gate
 * and quota helpers for fixed-window session and turn caps.
 */
import type { Context, Next } from 'hono';
import { eq, and, gte, sql } from 'drizzle-orm';
import type { Tier } from '@neigo/shared';
import { TIER_CONFIG } from '@neigo/shared';
import { db, schema } from '../db/client.js';
import type { AuthVars } from './auth.js';
import { resolveEffectiveTier } from '../lib/access-role.js';

export type TierVars = AuthVars & { tier: Tier };

export async function attachTier(c: Context<{ Variables: TierVars }>, next: Next) {
  const payload = c.get('user');
  if (!payload) {
    c.set('tier', 'FREE' as Tier);
    await next();
    return;
  }
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, payload.userId),
  });
  c.set('tier', resolveEffectiveTier({
    email: user?.email,
    storedTier: (user?.tier as Tier | undefined) ?? 'FREE',
  }));
  await next();
}

export function requireTier(...allowed: Tier[]) {
  return async (c: Context<{ Variables: TierVars }>, next: Next) => {
    const tier = c.get('tier') ?? 'FREE';
    if (!allowed.includes(tier)) {
      return c.json({ error: 'tier_required', allowed }, 403);
    }
    await next();
  };
}

export async function canCreateSession(
  userId: string,
  tier: Tier,
): Promise<{ allowed: boolean; reason?: string }> {
  const cfg = TIER_CONFIG[tier];
  if (cfg.maxSessionsPer5Hours === -1) return { allowed: true };
  const now = Date.now();
  const windowMs = 5 * 60 * 60 * 1000;
  const since = new Date(Math.floor(now / windowMs) * windowMs);
  const rows = await db
    .select()
    .from(schema.chatSessions)
    .where(
      and(eq(schema.chatSessions.userId, userId), gte(schema.chatSessions.createdAt, since)),
    );
  if (rows.length < cfg.maxSessionsPer5Hours) return { allowed: true };
  const resetAt = new Date(since.getTime() + windowMs).toISOString();
  return {
    allowed: false,
    reason: `5-hour session limit reached (${cfg.maxSessionsPer5Hours}) for tier ${tier}. Resets at ${resetAt}.`,
  };
}

export function canAddTurn(
  sessionTurnCount: number,
  tier: Tier,
): { allowed: boolean; reason?: string } {
  const cfg = TIER_CONFIG[tier];
  if (cfg.maxTurnsPerSession !== -1 && sessionTurnCount >= cfg.maxTurnsPerSession) {
    return {
      allowed: false,
      reason: `Turn cap reached (${cfg.maxTurnsPerSession}) for tier ${tier}.`,
    };
  }
  return { allowed: true };
}

/** Check global 5-hour + weekly turn budget across all sessions. */
export async function canAddTurnBudget(
  userId: string,
  tier: Tier,
): Promise<{ allowed: boolean; reason?: string }> {
  const cfg = TIER_CONFIG[tier];
  const now = Date.now();
  const fiveHourMs = 5 * 60 * 60 * 1000;
  const fiveHourStart = new Date(Math.floor(now / fiveHourMs) * fiveHourMs);
  const weekStart = new Date(now);
  const day = weekStart.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - diffToMonday);
  weekStart.setUTCHours(0, 0, 0, 0);

  if (cfg.maxTurnsPer5Hours !== -1) {
    const [fiveHourRow] = await db.execute(
      sql`SELECT COUNT(*)::int AS cnt
          FROM chat_messages cm
          JOIN chat_sessions cs ON cm.session_id = cs.id
          WHERE cs.user_id = ${userId}
            AND cm.speaker_type = 'USER'
            AND cm.created_at >= ${fiveHourStart.toISOString()}`,
    );
    const used5h = (fiveHourRow as { cnt: number })?.cnt ?? 0;
    if (used5h >= cfg.maxTurnsPer5Hours) {
      const resetAt = new Date(fiveHourStart.getTime() + fiveHourMs).toISOString();
      return {
        allowed: false,
        reason: `5-hour turn limit reached (${cfg.maxTurnsPer5Hours}) for tier ${tier}. Resets at ${resetAt}.`,
      };
    }
  }

  if (cfg.maxTurnsPerWeek !== -1) {
    const [weekRow] = await db.execute(
      sql`SELECT COUNT(*)::int AS cnt
          FROM chat_messages cm
          JOIN chat_sessions cs ON cm.session_id = cs.id
          WHERE cs.user_id = ${userId}
            AND cm.speaker_type = 'USER'
            AND cm.created_at >= ${weekStart.toISOString()}`,
    );
    const usedWeek = (weekRow as { cnt: number })?.cnt ?? 0;
    if (usedWeek >= cfg.maxTurnsPerWeek) {
      const resetAt = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      return {
        allowed: false,
        reason: `Weekly turn limit reached (${cfg.maxTurnsPerWeek}) for tier ${tier}. Resets at ${resetAt}.`,
      };
    }
  }

  return { allowed: true };
}

/** Check if tier allows export/share. */
export function canExport(tier: Tier): boolean {
  return TIER_CONFIG[tier].exportEnabled;
}

/** Check pinned memory limit. */
export async function canPinMemory(
  userId: string,
  characterId: string,
  tier: Tier,
): Promise<{ allowed: boolean; reason?: string }> {
  const cfg = TIER_CONFIG[tier];
  if (cfg.maxPinnedMemories === -1) return { allowed: true };
  const [row] = await db.execute(
    sql`SELECT COUNT(*)::int AS cnt
        FROM memories
        WHERE user_id = ${userId}
          AND character_id = ${characterId}
          AND is_pinned = true`,
  );
  const pinned = (row as { cnt: number })?.cnt ?? 0;
  if (pinned < cfg.maxPinnedMemories) return { allowed: true };
  return {
    allowed: false,
    reason: `Pinned memory limit reached (${cfg.maxPinnedMemories}) for tier ${tier}.`,
  };
}
