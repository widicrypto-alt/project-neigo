/**
 * BACKLOG B1.5 — Context maintenance worker.
 *
 * For each idle session (no message in the last hour) we precompute a
 * "wake up packet" so reopening the session can skip the expensive
 * first-turn RRF retrieval. The packet is stored in
 * `session_context_state.wake_up_packet` and refreshed whenever a newer
 * message exists than the last compaction.
 *
 * Shape of wakeUpPacket:
 *   {
 *     summary: string;       // 2-4 sentence recap of last ~10 turns
 *     lastSpeakerRole: 'user' | 'assistant';
 *     mood?: string;          // last known mood if tracked
 *     turnsCompacted: number;
 *     lastTurnIndex: number;
 *     generatedAt: string;    // ISO
 *   }
 *
 * Runs via cron (see lib/cron.ts). Safe to run concurrently — the upsert
 * semantics + idempotent compaction keep duplicates harmless.
 */

import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

export interface WakeUpPacket {
  summary: string;
  lastSpeakerRole: 'user' | 'assistant';
  mood?: string | null;
  turnsCompacted: number;
  lastTurnIndex: number;
  generatedAt: string;
}

const MAX_TURNS_TO_COMPACT = 10;
const IDLE_THRESHOLD_MS = 60 * 60 * 1000;  // 1 hour
const BATCH_LIMIT = 20;

/**
 * Build a compact summary string from the last N messages. We deliberately
 * avoid calling the LLM here — the payoff of pre-warming is latency, so we
 * use a cheap deterministic summariser (speaker tags + truncation). The
 * model can elaborate on first turn if needed.
 */
function buildSummary(messages: Array<{ role: string; content: string }>): string {
  if (messages.length === 0) return '';
  const lines: string[] = [];
  for (const m of messages.slice(-MAX_TURNS_TO_COMPACT)) {
    const speaker = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Character' : m.role;
    const body = m.content.replace(/\s+/g, ' ').trim();
    if (!body) continue;
    lines.push(`${speaker}: ${body.length > 240 ? body.slice(0, 240) + '…' : body}`);
  }
  return lines.join('\n');
}

/**
 * Run one pass of the maintenance worker. Returns the number of sessions
 * updated. Intended to be called from cron every 10-15 min.
 */
export async function runContextMaintenancePass(): Promise<number> {
  const idleCutoff = new Date(Date.now() - IDLE_THRESHOLD_MS);

  // Find candidate sessions: idle (lastMessageAt < cutoff), have turns, and
  // either no context_state row yet, or the stored packet is stale (fresh
  // mark older than lastMessageAt).
  const candidates = await db
    .select({
      id: schema.chatSessions.id,
      lastMessageAt: schema.chatSessions.lastMessageAt,
      turnCount: schema.chatSessions.turnCount,
      metadata: schema.chatSessions.metadata,
      snapshotFreshAt: schema.sessionContextState.snapshotFreshAt,
    })
    .from(schema.chatSessions)
    .leftJoin(
      schema.sessionContextState,
      eq(schema.sessionContextState.sessionId, schema.chatSessions.id),
    )
    .where(
      and(
        gt(schema.chatSessions.turnCount, 2),
        lt(schema.chatSessions.lastMessageAt, idleCutoff),
        or(
          isNull(schema.sessionContextState.snapshotFreshAt),
          lt(schema.sessionContextState.snapshotFreshAt, schema.chatSessions.lastMessageAt),
        ),
      ),
    )
    .orderBy(desc(schema.chatSessions.lastMessageAt))
    .limit(BATCH_LIMIT);

  let updated = 0;
  for (const s of candidates) {
    try {
      const msgs = await db
        .select({ role: schema.chatMessages.role, content: schema.chatMessages.content, turnIndex: schema.chatMessages.turnIndex })
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.sessionId, s.id))
        .orderBy(desc(schema.chatMessages.createdAt))
        .limit(MAX_TURNS_TO_COMPACT);
      if (msgs.length === 0) continue;
      // Restore chronological order.
      msgs.reverse();
      const summary = buildSummary(msgs);
      const last = msgs[msgs.length - 1]!;
      const meta = (s.metadata ?? {}) as { sceneState?: Record<string, string> };
      const mood = meta.sceneState?.mood ?? null;
      const packet: WakeUpPacket = {
        summary,
        lastSpeakerRole: last.role === 'user' ? 'user' : 'assistant',
        mood,
        turnsCompacted: msgs.length,
        lastTurnIndex: last.turnIndex ?? 0,
        generatedAt: new Date().toISOString(),
      };

      await db
        .insert(schema.sessionContextState)
        .values({
          sessionId: s.id,
          lastCompactedTurn: packet.lastTurnIndex,
          snapshotFreshAt: new Date(),
          wakeUpPacket: packet as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.sessionContextState.sessionId,
          set: {
            lastCompactedTurn: packet.lastTurnIndex,
            snapshotFreshAt: new Date(),
            wakeUpPacket: packet as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          },
        });
      updated++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[context-maintenance] ${s.id} failed:`, (err as Error).message);
    }
  }
  return updated;
}

/**
 * Read a wake-up packet for a session. Returns null if never computed or
 * stale vs. the latest message.
 */
export async function readFreshWakeUpPacket(sessionId: string): Promise<WakeUpPacket | null> {
  const row = await db.query.sessionContextState.findFirst({
    where: eq(schema.sessionContextState.sessionId, sessionId),
    columns: { wakeUpPacket: true, snapshotFreshAt: true },
  });
  if (!row?.wakeUpPacket || !row.snapshotFreshAt) return null;

  // Compare against lastMessageAt — if a newer message exists, packet is stale.
  const session = await db.query.chatSessions.findFirst({
    where: eq(schema.chatSessions.id, sessionId),
    columns: { lastMessageAt: true },
  });
  if (session?.lastMessageAt && session.lastMessageAt > row.snapshotFreshAt) return null;
  return row.wakeUpPacket as unknown as WakeUpPacket;
}

// Unused but kept to document the shape for future callers.
export const _markContextDebt = (sessionId: string) =>
  db.execute(sql`
    INSERT INTO session_context_state (session_id, maintenance_debt, updated_at)
    VALUES (${sessionId}, 1, NOW())
    ON CONFLICT (session_id) DO UPDATE
      SET maintenance_debt = session_context_state.maintenance_debt + 1,
          updated_at = NOW()
  `);
