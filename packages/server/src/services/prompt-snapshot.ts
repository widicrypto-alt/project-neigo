/**
 * Prompt Snapshot Service (Wk2 PLANv2 F4).
 *
 * Captures the exact assembled prompt (messages + sampling params) about to
 * be sent to the model. Designed for FOUNDER / ops inspection — the
 * sensitive surface is the FULL system prompt, so access is always gated by
 * either an ops API key or the FOUNDER access role.
 *
 * Design rules:
 *   1. First-attempt capture only. Retries bump `retryCount` in place so
 *      the storage cost is O(turns), not O(turns × retries).
 *   2. Hard cap of 50 snapshots per session (oldest trimmed).
 *   3. Payload is raw JSON — we deliberately do NOT mask user text or
 *      system-prompt fragments here. Masking would defeat the debug
 *      purpose. Access control at the route layer is the only gate.
 *   4. Feature flag: `PROMPT_SNAPSHOTS_ENABLED` (defaults ON in dev,
 *      controllable per environment). Turning this off makes every
 *      capture a no-op — no DB writes, no failure.
 */
import { and, eq, lt, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, schema } from '../db/client.js';
import { env } from '../lib/env.js';

export interface CapturePromptSnapshotArgs {
  sessionId: string;
  userId: string;
  characterId?: string | null;
  turnId: string;
  turnIndex?: number | null;
  modelSlug: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  sampling?: Record<string, unknown>;
}

const MAX_SNAPSHOTS_PER_SESSION = 50;

function snapshotsEnabled(): boolean {
  // Default ON unless explicitly disabled. Matches the F4 "dev tool first"
  // posture — it is safe to have running in prod because access is gated.
  return env.PROMPT_SNAPSHOTS_ENABLED !== false;
}

/**
 * Capture a prompt snapshot for a first-attempt turn. If a snapshot for the
 * same (sessionId, turnId) pair already exists — indicating a retry — we
 * only bump `retryCount` instead of duplicating the payload.
 *
 * Best-effort: swallow errors so snapshot capture can never abort a turn.
 */
export async function capturePromptSnapshot(
  args: CapturePromptSnapshotArgs,
): Promise<void> {
  if (!snapshotsEnabled()) return;
  try {
    const existing = await db.query.promptSnapshots.findFirst({
      where: and(
        eq(schema.promptSnapshots.sessionId, args.sessionId),
        eq(schema.promptSnapshots.turnId, args.turnId),
      ),
      columns: { id: true, retryCount: true },
    });

    if (existing) {
      await db
        .update(schema.promptSnapshots)
        .set({ retryCount: existing.retryCount + 1 })
        .where(eq(schema.promptSnapshots.id, existing.id));
      return;
    }

    const validMessages = args.messages.filter(m => m && typeof m.content === 'string');
    const totalChars = validMessages.reduce((s, m) => s + m.content.length, 0);
    await db.insert(schema.promptSnapshots).values({
      id: nanoid(),
      sessionId: args.sessionId,
      userId: args.userId,
      characterId: args.characterId ?? null,
      turnId: args.turnId,
      turnIndex: args.turnIndex ?? null,
      modelSlug: args.modelSlug,
      messages: validMessages,
      sampling: args.sampling ?? {},
      totalChars,
      messageCount: validMessages.length,
      retryCount: 0,
    });

    // Best-effort GC — keep only the newest N per session. Any row created
    // before the Nth-newest `createdAt` is eligible for deletion.
    await trimOldSnapshots(args.sessionId);
  } catch (err) {
    // Snapshot failure must never break a live turn.
    console.error('[prompt-snapshot] capture failed', err);
  }
}

async function trimOldSnapshots(sessionId: string): Promise<void> {
  const cutoffRow = await db
    .select({ createdAt: schema.promptSnapshots.createdAt })
    .from(schema.promptSnapshots)
    .where(eq(schema.promptSnapshots.sessionId, sessionId))
    .orderBy(sql`${schema.promptSnapshots.createdAt} desc`)
    .offset(MAX_SNAPSHOTS_PER_SESSION - 1)
    .limit(1);

  const cutoff = cutoffRow[0]?.createdAt;
  if (!cutoff) return;
  await db
    .delete(schema.promptSnapshots)
    .where(
      and(
        eq(schema.promptSnapshots.sessionId, sessionId),
        lt(schema.promptSnapshots.createdAt, cutoff),
      ),
    );
}

/**
 * List the most recent snapshots for a session (headers only — no message
 * payload to keep the response small). Used by the ops UI list view.
 */
export async function listPromptSnapshots(sessionId: string, limit = 20) {
  return db
    .select({
      id: schema.promptSnapshots.id,
      turnId: schema.promptSnapshots.turnId,
      turnIndex: schema.promptSnapshots.turnIndex,
      modelSlug: schema.promptSnapshots.modelSlug,
      totalChars: schema.promptSnapshots.totalChars,
      messageCount: schema.promptSnapshots.messageCount,
      retryCount: schema.promptSnapshots.retryCount,
      createdAt: schema.promptSnapshots.createdAt,
    })
    .from(schema.promptSnapshots)
    .where(eq(schema.promptSnapshots.sessionId, sessionId))
    .orderBy(sql`${schema.promptSnapshots.createdAt} desc`)
    .limit(Math.min(100, Math.max(1, limit)));
}

/** Fetch a single snapshot (owner/ops already authorised). */
export async function getPromptSnapshot(snapshotId: string) {
  return db.query.promptSnapshots.findFirst({
    where: eq(schema.promptSnapshots.id, snapshotId),
  });
}
