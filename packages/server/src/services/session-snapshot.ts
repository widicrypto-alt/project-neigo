/**
 * Session Snapshot — T4.6
 *
 * Pre-computes wake-up context for sessions so the first turn after idle
 * doesn't need to run expensive retrieval from scratch.
 *
 * Snapshot stored in session.metadata.snapshot as JSON:
 * {
 *   builtAt: ISO string,
 *   turnCount: number,
 *   memoryIds: string[],      // top-20 memories by multi-factor score
 *   diaryIds: string[],       // top-5 diary entries
 *   compactedNodeIds: string[], // top D1+ nodes
 *   mistakeKinds: string[],   // distinct mistake kinds (last 3)
 * }
 *
 * The orchestrator can use a fresh snapshot (turnCount matches) to skip
 * full retrieval on the first turn, reducing cold-start latency.
 */
import { eq, desc, and, sql, gt } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { env } from '../lib/env.js';

export interface SessionSnapshot {
  builtAt: string;
  turnCount: number;
  memoryIds: string[];
  diaryIds: string[];
  compactedNodeIds: string[];
  mistakeKinds: string[];
}

/**
 * Build a snapshot for a single session.
 */
export async function buildSessionSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
  if (!env.SESSION_SNAPSHOT_ENABLED) return null;

  const session = await db.query.chatSessions.findFirst({
    where: eq(schema.chatSessions.id, sessionId),
  });
  if (!session) return null;

  // Top memories by importance (pre-sorted, no embedding needed)
  const memories = await db
    .select({ id: schema.memories.id })
    .from(schema.memories)
    .where(eq(schema.memories.sessionId, sessionId))
    .orderBy(desc(schema.memories.importance))
    .limit(20);

  // Top diary entries for (character, user) pair
  const diaries = await db
    .select({ id: schema.characterDiary.id })
    .from(schema.characterDiary)
    .where(
      and(
        eq(schema.characterDiary.characterId, session.characterId),
        eq(schema.characterDiary.userId, session.userId),
      ),
    )
    .orderBy(desc(schema.characterDiary.createdAt))
    .limit(5);

  // Top context nodes (prefer higher depth)
  const nodes = await db
    .select({ id: schema.contextNodes.id })
    .from(schema.contextNodes)
    .where(eq(schema.contextNodes.sessionId, sessionId))
    .orderBy(sql`depth DESC, salience DESC`)
    .limit(10);

  // Recent mistake kinds
  const mistakes = await db
    .select({ kind: schema.sessionMistakes.kind })
    .from(schema.sessionMistakes)
    .where(eq(schema.sessionMistakes.sessionId, sessionId))
    .orderBy(desc(schema.sessionMistakes.createdAt))
    .limit(3);

  const snapshot: SessionSnapshot = {
    builtAt: new Date().toISOString(),
    turnCount: session.turnCount,
    memoryIds: memories.map((m) => m.id),
    diaryIds: diaries.map((d) => d.id),
    compactedNodeIds: nodes.map((n) => n.id),
    mistakeKinds: [...new Set(mistakes.map((m) => m.kind))],
  };

  // Persist into session metadata
  await db.execute(
    sql`UPDATE chat_sessions
        SET metadata = jsonb_set(COALESCE(metadata, '{}')::jsonb, '{snapshot}', ${JSON.stringify(snapshot)}::jsonb)
        WHERE id = ${sessionId}`,
  );

  return snapshot;
}

/**
 * Get a fresh snapshot from session metadata (if turnCount matches current).
 */
export function getSnapshotIfFresh(
  metadata: Record<string, unknown> | null,
  currentTurnCount: number,
): SessionSnapshot | null {
  if (!env.SESSION_SNAPSHOT_ENABLED) return null;
  const snap = (metadata as Record<string, unknown> | null)?.snapshot as SessionSnapshot | undefined;
  if (!snap) return null;
  if (snap.turnCount !== currentTurnCount) return null;
  return snap;
}

/**
 * Cron job: rebuild stale snapshots for active sessions.
 * A snapshot is stale when session.turnCount > snapshot.turnCount.
 */
export async function rebuildStaleSnapshots(): Promise<number> {
  if (!env.SESSION_SNAPSHOT_ENABLED) return 0;

  try {
    // Find sessions active in last 3 days with stale or missing snapshots
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const sessions = await db
      .select({ id: schema.chatSessions.id, turnCount: schema.chatSessions.turnCount, metadata: schema.chatSessions.metadata })
      .from(schema.chatSessions)
      .where(
        and(
          gt(schema.chatSessions.lastMessageAt, threeDaysAgo),
          gt(schema.chatSessions.turnCount, 0),
        ),
      )
      .limit(50);

    let rebuilt = 0;
    for (const s of sessions) {
      const meta = (s.metadata ?? {}) as Record<string, unknown>;
      const snap = meta.snapshot as SessionSnapshot | undefined;
      if (snap && snap.turnCount === s.turnCount) continue; // still fresh
      await buildSessionSnapshot(s.id);
      rebuilt++;
    }
    if (rebuilt > 0) {
      console.log(`[cron] snapshot: rebuilt ${rebuilt} stale snapshots`);
    }
    return rebuilt;
  } catch (err) {
    console.warn('[cron] snapshot-rebuild error:', (err as Error).message);
    return 0;
  }
}
