/**
 * BullMQ workers for session-scheduled background beats.
 *
 * Started once at server boot by `startSessionWorkers()`. Each worker owns
 * one queue; processors delegate to the same service functions the HTTP
 * routes use so the two entry points stay in lockstep.
 *
 * Guarded against missing Redis at boot: `createWorker` returns `null` and
 * this module silently degrades to a no-op (matches the queue module's
 * lazy-init pattern).
 */
import { generateNudgeMessage } from '../services/nudge-generator.js';
import { generateReturnMessage } from '../services/return-message-generator.js';
import { fireSchedule, rehydrateSchedules } from '../services/schedule-planner.js';
import { resyncCastDisplayName } from '../services/cast-denorm.js';
import { logger } from './logger.js';
import {
  createWorker,
  getNudgeQueue,
  getReturnQueue,
  type SessionNudgeJobData,
  type SessionReturnJobData,
  type SessionScheduleJobData,
  type CharacterRenameJobData,
} from '../lib/queue.js';

/**
 * Compose the deterministic jobId for a session. Both queues key jobs by
 * sessionId so a new heartbeat replaces the pending beat rather than
 * stacking duplicates.
 */
function jobIdFor(queue: 'nudge' | 'return', sessionId: string): string {
  return `session-${queue}-${sessionId}`;
}

const NUDGE_DELAY_MS = 20_000; // 20 seconds after first heartbeat
const RETURN_DELAY_MS = 12 * 60 * 60 * 1000; // 12 hours after last heartbeat

/**
 * Schedule (or re-schedule) the 20s nudge for a session. Safe to call
 * repeatedly — the deterministic jobId means a fresh call replaces any
 * pending one. No-op if Redis isn't available.
 */
export async function scheduleNudge(data: SessionNudgeJobData): Promise<void> {
  const q = getNudgeQueue();
  if (!q) return;
  const id = jobIdFor('nudge', data.sessionId);
  // Remove existing so the delay restarts from "now" even if the old job had
  // a shorter remaining delay.
  try {
    const existing = await q.getJob(id);
    if (existing) await existing.remove();
  } catch {
    // ignore — not fatal
  }
  await q.add('session-nudge', data, {
    jobId: id,
    delay: NUDGE_DELAY_MS,
    removeOnComplete: true,
    removeOnFail: { age: 3600, count: 100 },
  });
}

/**
 * Schedule (or re-schedule) the 12h return beat. Idempotent on sessionId.
 */
export async function scheduleReturn(data: SessionReturnJobData): Promise<void> {
  const q = getReturnQueue();
  if (!q) return;
  const id = jobIdFor('return', data.sessionId);
  try {
    const existing = await q.getJob(id);
    if (existing) await existing.remove();
  } catch {
    // ignore
  }
  await q.add('session-return', data, {
    jobId: id,
    delay: RETURN_DELAY_MS,
    removeOnComplete: true,
    removeOnFail: { age: 3600 * 24, count: 100 },
  });
}

/**
 * Cancel both pending jobs for a session (e.g. when the user finally
 * replies — no more nudge needed).
 */
export async function cancelSessionJobs(sessionId: string): Promise<void> {
  const nudge = getNudgeQueue();
  const ret = getReturnQueue();
  if (nudge) {
    try {
      const j = await nudge.getJob(jobIdFor('nudge', sessionId));
      if (j) await j.remove();
    } catch { /* ignore */ }
  }
  if (ret) {
    try {
      const j = await ret.getJob(jobIdFor('return', sessionId));
      if (j) await j.remove();
    } catch { /* ignore */ }
  }
}

let started = false;
/**
 * Start the BullMQ workers. Call exactly once at server boot. Second call
 * is a no-op. Returns `true` if workers were registered, `false` if Redis
 * was unreachable (degraded mode).
 */
export function startSessionWorkers(): boolean {
  if (started) return true;
  started = true;
  const nudgeWorker = createWorker<SessionNudgeJobData>('session-nudge', async (job) => {
    const { sessionId, userId } = job.data;
    // Processor returns the nudge result for observability; any throw is
    // retried per BullMQ defaults (we set no retries on add() so this is
    // effectively "try once, log failure").
    return generateNudgeMessage({ sessionId, userId, source: 'queue' });
  });
  const returnWorker = createWorker<SessionReturnJobData>('session-return', async (job) => {
    const { sessionId, userId } = job.data;
    return generateReturnMessage({ sessionId, userId });
  });
  const scheduleWorker = createWorker<SessionScheduleJobData>(
    'session-schedule',
    async (job) => fireSchedule(job.data),
  );
  // BACKLOG B2.5 — Character rename cast-denorm worker.
  const renameWorker = createWorker<CharacterRenameJobData>(
    'character-rename-denorm',
    async (job) => resyncCastDisplayName(job.data),
  );
  if (!nudgeWorker || !returnWorker || !scheduleWorker || !renameWorker) {
    logger.warn('[workers] Redis unavailable — session beats are disabled.');
    return false;
  }
  // Fire-and-forget catchup for schedules that should already have fired.
  rehydrateSchedules().catch((err) =>
    logger.warn({ err }, '[workers] schedule rehydrate failed'),
  );
  logger.info('[workers] session-nudge + session-return + session-schedule + character-rename-denorm started.');
  return true;
}
