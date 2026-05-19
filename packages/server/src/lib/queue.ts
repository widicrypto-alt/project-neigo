/**
 * BullMQ queue glue for session-scheduled background work.
 *
 * We use a single shared Redis connection (ioredis) and two queues:
 *   - `session-nudge`  — fires once, 20s after a heartbeat, if the scene
 *                       is still in first-open state (no USER message yet).
 *   - `session-return` — fires once, 12h after the last heartbeat, to
 *                       nudge the user back with a return beat.
 *
 * Jobs are upserted with a deterministic key (the sessionId) so heartbeats
 * don't stack copies — each heartbeat replaces the pending job.
 *
 * Failure mode: if REDIS_URL is not set or Redis is unreachable at boot
 * the module exports `null` for the queues and callers short-circuit to a
 * no-op. This lets dev/test runs without Redis keep working (same pattern
 * we use for BYOK encryption).
 */
import { Queue, Worker, type Processor, type ConnectionOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

export type SessionJobName = 'session-nudge' | 'session-return' | 'session-schedule' | 'character-rename-denorm';

export interface SessionNudgeJobData {
  sessionId: string;
  userId: string;
}
export interface SessionReturnJobData {
  sessionId: string;
  userId: string;
}

/**
 * BACKLOG B2.5 — Character rename cast-denorm. Re-syncs
 * `stories.cast[].displayName` across every story that references the
 * renamed character.
 */
export interface CharacterRenameJobData {
  characterId: string;
  newName: string;
}

/** Wk14 H7 — user-configured one-shot scheduled autonomous message. */
export interface SessionScheduleJobData {
  sessionId: string;
  userId: string;
  /** Stable id for the scheduled row so dedup keys survive DB churn. */
  scheduleId: string;
  /** Optional authored prompt the planner should honour. */
  note?: string;
}

let connection: Redis | null = null;
let nudgeQueue: Queue<SessionNudgeJobData> | null = null;
let returnQueue: Queue<SessionReturnJobData> | null = null;
let scheduleQueue: Queue<SessionScheduleJobData> | null = null;
let renameQueue: Queue<CharacterRenameJobData> | null = null;
let initialized = false;

/**
 * Lazily open a single Redis connection shared by every queue/worker. Uses
 * `maxRetriesPerRequest: null` because BullMQ requires blocking commands.
 */
export function getQueueConnection(): Redis | null {
  if (connection) return connection;
  if (!env.REDIS_URL) return null;
  connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  connection.on('error', (err) => {
    // Log once, then let ioredis keep reconnecting. Never crash the server.
    logger.warn({ err }, '[queue] redis error');
  });
  return connection;
}

export function getNudgeQueue(): Queue<SessionNudgeJobData> | null {
  if (!initialized) initQueues();
  return nudgeQueue;
}

export function getReturnQueue(): Queue<SessionReturnJobData> | null {
  if (!initialized) initQueues();
  return returnQueue;
}

export function getScheduleQueue(): Queue<SessionScheduleJobData> | null {
  if (!initialized) initQueues();
  return scheduleQueue;
}

function initQueues(): void {
  initialized = true;
  const conn = getQueueConnection();
  if (!conn) return;
  nudgeQueue = new Queue<SessionNudgeJobData>('session-nudge', { connection: conn });
  returnQueue = new Queue<SessionReturnJobData>('session-return', { connection: conn });
  scheduleQueue = new Queue<SessionScheduleJobData>('session-schedule', { connection: conn });
  renameQueue = new Queue<CharacterRenameJobData>('character-rename-denorm', { connection: conn });
}

export function getCharacterRenameQueue(): Queue<CharacterRenameJobData> | null {
  if (!initialized) initQueues();
  return renameQueue;
}

/**
 * Register a worker on one of the session queues. Returns `null` if Redis
 * isn't configured (worker is skipped). Workers are created once at boot by
 * {@link startSessionWorkers}.
 */
export function createWorker<T>(
  name: SessionJobName,
  processor: Processor<T>,
): Worker<T> | null {
  const conn = getQueueConnection();
  if (!conn) return null;
  const w = new Worker<T>(name, processor, {
    connection: conn as unknown as ConnectionOptions,
    // Session jobs are cheap (1 DB read + 1 AI call); keep concurrency low.
    concurrency: 4,
  });
  w.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.warn(`[worker:${name}] job ${job?.id} failed:`, err.message);
  });
  return w;
}
