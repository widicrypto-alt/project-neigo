/**
 * Push Notification Service
 *
 * Sends Web Push notifications in character voice after 24h of session inactivity.
 * Uses Web Push (VAPID) via the `web-push` npm package.
 *
 * Design (per BETA_LAUNCH.md Part 7):
 *   - Triggered 24–48h after last session.
 *   - Character-voiced, NOT system copy.
 *   - Max 1 notification per user per day.
 *   - Opt-out is permanent (`users.push_opt_out = true`).
 */
import webpush from 'web-push';
import { and, eq, gt, lt, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  AI_MODEL_CONFIG,
  DEFAULT_AI_MODEL,
} from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { AiProxy, type AiMessage } from './ai-proxy.js';
import { env } from '../lib/env.js';

let vapidConfigured = false;

export function initVapid(): void {
  if (vapidConfigured) return;
  if (!env.ENABLE_PUSH_NOTIFICATIONS) {
    console.info('[push] disabled by ENABLE_PUSH_NOTIFICATIONS=false');
    return;
  }
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID keys not set — push notifications disabled');
    return;
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  vapidConfigured = true;
}

export function vapidPublicKey(): string | undefined {
  return env.VAPID_PUBLIC_KEY;
}

// ── Subscription management ───────────────────────────────────────────────────

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscription(
  userId: string,
  sub: PushSubscriptionPayload,
): Promise<void> {
  // Upsert: same endpoint = update user mapping (device transferred accounts).
  await db
    .insert(schema.pushSubscriptions)
    .values({
      id: nanoid(),
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
}

export async function removePushSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.userId, userId),
        eq(schema.pushSubscriptions.endpoint, endpoint),
      ),
    );
}

export async function setPushOptOut(userId: string): Promise<void> {
  // Permanent opt-out: remove all subscriptions and flag the user.
  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
  await db
    .update(schema.users)
    .set({ pushOptOut: true })
    .where(eq(schema.users.id, userId));
}

// ── Character-voiced copy generation ─────────────────────────────────────────

async function generatePushCopy(opts: {
  charName: string;
  personality: string;
  speechStyle: string;
  unresolvedBeat: string | null;
  gapHours: number;
}): Promise<string> {
  const { charName, personality, speechStyle, unresolvedBeat, gapHours } = opts;
  const gapLabel = gapHours >= 48 ? `${Math.round(gapHours / 24)} days` : `${gapHours} hours`;

  const messages: AiMessage[] = [
    {
      role: 'system',
      content: [
        `You are ${charName}. ${personality.slice(0, 300)}`,
        speechStyle ? `Speech style: ${speechStyle}` : '',
        '',
        `The user has been away for ${gapLabel}. Write a SINGLE short sentence (max 12 words)`,
        'as a push notification — something ${charName} might be thinking or feeling right now.',
        '',
        'RULES:',
        '- No greeting, no "welcome back", no exclamation points.',
        '- In character at all times. Sounds like a thought, not an alert.',
        '- If there is an unresolved thread, reference it obliquely.',
        '- Output only the sentence, nothing else.',
        '',
        unresolvedBeat ? `Unresolved thread: "${unresolvedBeat}"` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  try {
    const result = await AiProxy.complete({
      model: AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug,
      messages,
      temperature: 0.8,
      maxTokens: 60,
    });
    return result.content.trim().replace(/^["']|["']$/g, '');
  } catch {
    // Fallback copy if AI fails.
    return unresolvedBeat
      ? `${charName} is still thinking about what you left unsaid.`
      : `${charName} keeps checking the door.`;
  }
}

// ── Cron entry-point ─────────────────────────────────────────────────────────

const WINDOW_MIN_MS = 20 * 60 * 60 * 1000; // 20 hours (slightly less than 24h to handle drift)
const WINDOW_MAX_MS = 48 * 60 * 60 * 1000; // 48 hours max (after that, skip until next active)
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Send push notifications for users idle 20–48h.
 * Called from cron.ts every hour.
 */
export async function sendScheduledPushNotifications(): Promise<void> {
  if (!env.ENABLE_PUSH_NOTIFICATIONS) return;
  if (!vapidConfigured) return;

  const now = Date.now();
  const windowStart = new Date(now - WINDOW_MAX_MS);
  const windowEnd = new Date(now - WINDOW_MIN_MS);
  const oneDayAgo = new Date(now - ONE_DAY_MS);

  // Find users who:
  //   - haven't opted out
  //   - haven't been notified in the last 24h
  //   - had at least one session go idle in the 20–48h window
  const idleUsers = await db
    .selectDistinct({ userId: schema.chatSessions.userId })
    .from(schema.chatSessions)
    .where(
      and(
        gt(schema.chatSessions.lastMessageAt, windowStart),
        lt(schema.chatSessions.lastMessageAt, windowEnd),
        gt(schema.chatSessions.turnCount, sql`2`),
      ),
    );

  if (!idleUsers.length) return;

  const userIds = idleUsers.map((r) => r.userId);

  // Filter out opted-out users and recently notified users.
  const eligibleUsers = await db
    .select({
      id: schema.users.id,
      pushOptOut: schema.users.pushOptOut,
      lastPushSentAt: schema.users.lastPushSentAt,
    })
    .from(schema.users)
    .where(inArray(schema.users.id, userIds));

  const toNotify = eligibleUsers.filter((u) => {
    if (u.pushOptOut) return false;
    if (u.lastPushSentAt && now - new Date(u.lastPushSentAt).getTime() < ONE_DAY_MS) return false;
    return true;
  });

  for (const user of toNotify) {
    try {
      await notifyUser(user.id);
    } catch (err) {
      console.warn(`[push] failed for user ${user.id}:`, (err as Error).message);
    }
  }
}

async function notifyUser(userId: string): Promise<void> {
  // Get user's push subscriptions.
  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, userId));
  if (!subs.length) return;

  // Get most recent session + character.
  const session = await db.query.chatSessions.findFirst({
    where: eq(schema.chatSessions.userId, userId),
    orderBy: (s, { desc }) => [desc(s.lastMessageAt)],
  });
  if (!session) return;

  const character = await db.query.characters.findFirst({
    where: eq(schema.characters.id, session.characterId),
  });
  if (!character) return;

  const persona = (character.persona ?? {}) as Record<string, unknown>;
  const gapHours = Math.round(
    (Date.now() - new Date(session.lastMessageAt).getTime()) / (60 * 60 * 1000),
  );

  const body = await generatePushCopy({
    charName: character.name,
    personality: String(persona.personality ?? ''),
    speechStyle: String(persona.speechStyle ?? ''),
    unresolvedBeat: session.unresolvedBeat ?? null,
    gapHours,
  });
  const payload = JSON.stringify({
    title: character.name,
    body,
    icon: '/icon-192.svg',
    data: { sessionId: session.id },
  });

  // Send to all registered devices; remove stale subscriptions.
  const staleEndpoints: string[] = [];
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint);
        } else {
          throw err;
        }
      }
    }),
  );

  // Clean up stale subscriptions.
  for (const ep of staleEndpoints) {
    await db
      .delete(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, ep));
  }

  // Update lastPushSentAt.
  await db
    .update(schema.users)
    .set({ lastPushSentAt: new Date() })
    .where(eq(schema.users.id, userId));

  console.log(`[push] sent to user ${userId} (${subs.length - staleEndpoints.length} devices)`);
}

// ── Expiry warning notification ──────────────────────────────────────────────

/**
 * Send a push notification warning that a session will be auto-deleted in ~2 days.
 */
export async function sendExpiryWarning(
  userId: string,
  sessionId: string,
  sessionTitle: string,
): Promise<void> {
  if (!env.ENABLE_PUSH_NOTIFICATIONS) return;
  if (!vapidConfigured) return;

  // Check opt-out
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { pushOptOut: true },
  });
  if (user?.pushOptOut) return;

  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, userId));
  if (!subs.length) return;

  const payload = JSON.stringify({
    title: '⚠️ Session akan dihapus',
    body: `"${sessionTitle.slice(0, 60)}" akan dihapus otomatis dalam 2 hari karena tidak ada aktivitas.`,
    icon: '/icon-192.svg',
    data: { sessionId, type: 'expiry_warning' },
  });

  const staleEndpoints: string[] = [];
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint);
        }
      }
    }),
  );

  for (const ep of staleEndpoints) {
    await db
      .delete(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, ep));
  }

  console.log(`[push] expiry warning sent for session ${sessionId}`);
}

/**
 * Send a raw push notification to all of a user's subscribed devices.
 * Used by the letter-reply worker when a character's reply is ready.
 * No-op if push is disabled, user opted out, or no subscriptions found.
 */
export async function sendPushToUser(opts: {
  userId: string;
  title: string;
  body: string;
  url?: string;
}): Promise<void> {
  if (!env.ENABLE_PUSH_NOTIFICATIONS) return;
  if (!vapidConfigured) return;

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, opts.userId),
    columns: { pushOptOut: true },
  });
  if (user?.pushOptOut) return;

  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, opts.userId));
  if (!subs.length) return;

  const payload = JSON.stringify({
    title: opts.title,
    body: opts.body,
    icon: '/icon-192.svg',
    data: { url: opts.url },
  });

  const staleEndpoints: string[] = [];
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) staleEndpoints.push(sub.endpoint);
      }
    }),
  );

  for (const ep of staleEndpoints) {
    await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, ep));
  }
}
