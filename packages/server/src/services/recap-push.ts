/**
 * PLANv2 post-wk14 — Nightly recap push.
 *
 * Once per day, for each user who (a) opted into push, (b) had chat
 * activity that day, and (c) has at least one push subscription, we
 * send a short "here's what happened" digest. Body text is generated
 * from the diary rollup if available, falling back to session titles.
 *
 * Throttled via `users.last_push_sent_at` (existing column) to the
 * standard "max 1 push per user per day" rule — shared with the
 * BETA_LAUNCH push rate limit.
 */
import webpush from 'web-push';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { env } from '../lib/env.js';

const DAILY_WINDOW_MS = 22 * 60 * 60 * 1000; // allow 1/day with slack

interface RecapCandidate {
  userId: string;
}

async function findCandidates(): Promise<RecapCandidate[]> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dailyCutoff = new Date(Date.now() - DAILY_WINDOW_MS);
  // Users with recent chat activity and no push in the last ~day.
  const rows = await db
    .selectDistinct({ userId: schema.chatSessions.userId })
    .from(schema.chatSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.chatSessions.userId))
    .where(
      and(
        gt(schema.chatSessions.lastMessageAt, twentyFourHoursAgo),
        eq(schema.users.pushOptOut, false),
        // last_push_sent_at older than daily cutoff OR null
        // drizzle's or() with isNull is a bit verbose; do two passes.
      ),
    )
    .limit(500);
  // Second filter: rate limit check (one query, batched).
  const eligible: RecapCandidate[] = [];
  for (const r of rows) {
    const u = await db.query.users.findFirst({
      where: eq(schema.users.id, r.userId),
      columns: { lastPushSentAt: true },
    });
    if (!u) continue;
    if (u.lastPushSentAt && u.lastPushSentAt > dailyCutoff) continue;
    eligible.push(r);
  }
  return eligible;
}

async function buildBody(userId: string): Promise<string> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const diary = await db
    .select({ entry: schema.characterDiary.entry, mood: schema.characterDiary.mood })
    .from(schema.characterDiary)
    .where(and(eq(schema.characterDiary.userId, userId), gt(schema.characterDiary.createdAt, since)))
    .orderBy(desc(schema.characterDiary.createdAt))
    .limit(1);
  if (diary[0]?.entry) {
    const snippet = diary[0].entry.replace(/\s+/g, ' ').slice(0, 140);
    return diary[0].mood ? `(${diary[0].mood}) ${snippet}` : snippet;
  }
  // Fallback: list up to 3 session titles.
  const sessions = await db
    .select({ title: schema.chatSessions.title })
    .from(schema.chatSessions)
    .where(and(eq(schema.chatSessions.userId, userId), gt(schema.chatSessions.lastMessageAt, since)))
    .orderBy(desc(schema.chatSessions.lastMessageAt))
    .limit(3);
  const titles = sessions
    .map((s) => s.title)
    .filter((t): t is string => !!t)
    .slice(0, 3)
    .join(' · ');
  return titles || 'Ada beberapa momen yang menunggu kamu baca lagi.';
}

export async function sendDailyRecaps(): Promise<{ candidates: number; sent: number }> {
  if (!env.ENABLE_PUSH_NOTIFICATIONS) return { candidates: 0, sent: 0 };
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { candidates: 0, sent: 0 };

  const candidates = await findCandidates();
  let sent = 0;
  for (const c of candidates) {
    const subs = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, c.userId));
    if (subs.length === 0) continue;
    const body = await buildBody(c.userId);
    const payload = JSON.stringify({
      title: 'Recap harian',
      body: body.slice(0, 220),
      icon: '/icon-192.svg',
      data: { type: 'daily_recap' },
    });
    const stale: string[] = [];
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) stale.push(sub.endpoint);
        }
      }),
    );
    for (const ep of stale) {
      await db
        .delete(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.endpoint, ep));
    }
    await db
      .update(schema.users)
      .set({ lastPushSentAt: new Date() })
      .where(eq(schema.users.id, c.userId));
    sent++;
  }
  return { candidates: candidates.length, sent };
}
