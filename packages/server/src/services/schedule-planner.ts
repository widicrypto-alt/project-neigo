/**
 * Wk14 PLANv2 H7 — Schedule planner.
 *
 * Thin service for user-configured scheduled autonomous messages. The
 * BullMQ worker calls `fireSchedule()` when a job resolves; the HTTP
 * route layer uses `enqueueSchedule()` whenever a row is created /
 * edited / re-enabled.
 *
 * Quiet-hours policy: if user.metadata.quietHoursStart / quietHoursEnd
 * are set (HH:MM strings in user's tz), we defer the fire until the
 * quiet window ends. This mirrors the nudge-generator etiquette.
 */
import { and, eq, lte } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import {
  getScheduleQueue,
  type SessionScheduleJobData,
} from '../lib/queue.js';
import { generateNudgeMessage } from './nudge-generator.js';

const DEDUP_KEY = (scheduleId: string) => `schedule-${scheduleId}`;

/** Pure helper: next fire time for a daily/weekly cadence, in UTC. */
export function nextOccurrence(opts: {
  cadence: 'once' | 'daily' | 'weekly';
  hour: number | null;
  minute: number | null;
  tz: string;
  from?: Date;
}): Date | null {
  if (opts.cadence === 'once') return null;
  const h = opts.hour ?? 9;
  const m = opts.minute ?? 0;
  const now = opts.from ?? new Date();
  // For simplicity we treat tz as an IANA name and compute the next
  // wall-clock HH:MM in that tz. If the tz is invalid we fall back to UTC
  // arithmetic so the job still fires (never worse than "wrong time zone").
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: opts.tz,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    // Walk forward hour-by-hour until we hit HH:MM in the user's tz. This
    // is O(24) in worst case but keeps the math tz-safe without pulling a
    // full tz library.
    const step = opts.cadence === 'weekly' ? 7 * 24 : 24;
    for (let i = 1; i <= step; i++) {
      const cand = new Date(now.getTime() + i * 60 * 60 * 1000);
      const parts = fmt.formatToParts(cand);
      const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? -1);
      const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? -1);
      if (hh === h && Math.abs(mm - m) < 60) {
        // align minutes exactly
        cand.setMinutes(cand.getMinutes() - (mm - m));
        cand.setSeconds(0, 0);
        return cand;
      }
    }
  } catch {
    // fallthrough
  }
  const fallback = new Date(now);
  fallback.setUTCHours(h, m, 0, 0);
  if (fallback <= now) fallback.setUTCDate(fallback.getUTCDate() + 1);
  return fallback;
}

interface QuietHours {
  startH: number;
  startM: number;
  endH: number;
  endM: number;
  tz: string;
}

function parseHM(s: unknown): [number, number] | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return [h, mm];
}

async function loadQuietHours(userId: string): Promise<QuietHours | null> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { metadata: true },
  });
  const meta = (user?.metadata ?? {}) as Record<string, unknown>;
  const start = parseHM(meta.quietHoursStart);
  const end = parseHM(meta.quietHoursEnd);
  if (!start || !end) return null;
  const tz = typeof meta.tz === 'string' ? meta.tz : 'UTC';
  return { startH: start[0], startM: start[1], endH: end[0], endM: end[1], tz };
}

/** Returns the adjusted UTC fireAt (deferred to end of quiet window if needed). */
export function deferPastQuietHours(fireAt: Date, qh: QuietHours): Date {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: qh.tz,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const parts = fmt.formatToParts(fireAt);
    const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? -1);
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? -1);
    const inMinutes = hh * 60 + mm;
    const startM = qh.startH * 60 + qh.startM;
    const endM = qh.endH * 60 + qh.endM;
    const inQuiet =
      startM <= endM
        ? inMinutes >= startM && inMinutes < endM
        : inMinutes >= startM || inMinutes < endM;
    if (!inQuiet) return fireAt;
    // Defer by the remaining quiet window in minutes.
    let deferBy = 0;
    if (startM <= endM) {
      deferBy = endM - inMinutes;
    } else {
      deferBy = inMinutes >= startM ? 24 * 60 - inMinutes + endM : endM - inMinutes;
    }
    return new Date(fireAt.getTime() + deferBy * 60 * 1000);
  } catch {
    return fireAt;
  }
}

/**
 * Re-register (or remove) the BullMQ job backing a schedule row. Idempotent.
 */
export async function enqueueSchedule(scheduleId: string): Promise<void> {
  const q = getScheduleQueue();
  if (!q) return;
  const row = await db.query.sessionSchedules.findFirst({
    where: eq(schema.sessionSchedules.id, scheduleId),
  });
  if (!row) return;
  const jobId = DEDUP_KEY(scheduleId);
  try {
    const existing = await q.getJob(jobId);
    if (existing) await existing.remove();
  } catch {
    // ignore
  }
  if (!row.enabled) return;
  const qh = await loadQuietHours(row.userId);
  const fireAt = qh ? deferPastQuietHours(row.fireAt, qh) : row.fireAt;
  const delay = Math.max(0, fireAt.getTime() - Date.now());
  const data: SessionScheduleJobData = {
    sessionId: row.sessionId,
    userId: row.userId,
    scheduleId,
    note: row.note,
  };
  await q.add('session-schedule', data, {
    jobId,
    delay,
    removeOnComplete: true,
    removeOnFail: { age: 24 * 3600, count: 100 },
  });
}

/**
 * Worker entry point. Invoked by `session-workers.ts`.
 * Reads the row, fires a nudge-style autonomous message, then re-queues
 * the next occurrence (if recurring). Returns a small result payload.
 */
export async function fireSchedule(data: SessionScheduleJobData): Promise<{
  ok: boolean;
  recurring: boolean;
  nextFireAt?: string;
}> {
  const row = await db.query.sessionSchedules.findFirst({
    where: eq(schema.sessionSchedules.id, data.scheduleId),
  });
  if (!row || !row.enabled) return { ok: false, recurring: false };

  // Delegate the in-character message composition to the nudge generator.
  // The `source='schedule'` tag lets the generator skip certain guards.
  await generateNudgeMessage({
    sessionId: data.sessionId,
    userId: data.userId,
    source: 'schedule',
    note: data.note,
  }).catch((err) => {
    console.warn('[schedule] nudge emit failed', err);
  });

  await db
    .update(schema.sessionSchedules)
    .set({ lastFiredAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.sessionSchedules.id, data.scheduleId));

  if (row.cadence === 'once') {
    await db
      .update(schema.sessionSchedules)
      .set({ enabled: false })
      .where(eq(schema.sessionSchedules.id, data.scheduleId));
    return { ok: true, recurring: false };
  }

  const next = nextOccurrence({
    cadence: row.cadence as 'daily' | 'weekly',
    hour: row.hour,
    minute: row.minute,
    tz: row.tz,
  });
  if (!next) return { ok: true, recurring: false };
  await db
    .update(schema.sessionSchedules)
    .set({ fireAt: next, updatedAt: new Date() })
    .where(eq(schema.sessionSchedules.id, data.scheduleId));
  await enqueueSchedule(data.scheduleId);
  return { ok: true, recurring: true, nextFireAt: next.toISOString() };
}

/**
 * Boot-time catchup: re-enqueue schedules that were enabled but didn't
 * fire (e.g. server was down). Anything whose fireAt is in the past is
 * enqueued with delay=0 so the worker picks it up immediately.
 */
export async function rehydrateSchedules(): Promise<number> {
  const q = getScheduleQueue();
  if (!q) return 0;
  const now = new Date();
  const rows = await db
    .select({ id: schema.sessionSchedules.id })
    .from(schema.sessionSchedules)
    .where(
      and(
        eq(schema.sessionSchedules.enabled, true),
        lte(schema.sessionSchedules.fireAt, new Date(now.getTime() + 7 * 24 * 3600 * 1000)),
      ),
    );
  for (const r of rows) {
    await enqueueSchedule(r.id);
  }
  return rows.length;
}
