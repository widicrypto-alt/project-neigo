/**
 * Cron Jobs — background tasks for memory decay, session ticks, and more.
 *
 * Uses setInterval for simplicity (Bun doesn't have built-in cron).
 * All jobs are idempotent and safe to run concurrently.
 */
import { sql, lt, gt, and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { initVapid, sendScheduledPushNotifications, sendExpiryWarning } from '../services/push-notif.js';
import { rebuildStaleSnapshots } from '../services/session-snapshot.js';
import { sendDailyRecaps } from '../services/recap-push.js';
import { runLineageGc } from '../scripts/gc-lineage.js';
import { runContextMaintenancePass } from '../services/context-maintenance.js';
import { logger } from './logger.js';
// ── Memory importance decay ──────────────────────────────────────────
// Weekly: importance *= 0.9, floor 0.1.
// Runs every 6 hours (checks updated_at to only decay weekly).

async function decayMemoryImportance(): Promise<void> {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // Only decay memories that haven't been decayed in the last 7 days
    // and have importance > 0.1.
    await db.execute(
      sql`UPDATE memories
          SET importance = GREATEST(0.1, importance * 0.9),
              updated_at = NOW()
          WHERE importance > 0.1
            AND updated_at < ${oneWeekAgo}`,
    );
  } catch (err) {
    logger.warn({ err }, '[cron] memory-decay error');
  }
}

// ── Session tick ─────────────────────────────────────────────────────
// Detects sessions idle > 30 minutes and injects a time-skip marker
// into the session metadata. The orchestrator can use this to add
// "it's been a while" into the next prompt.

async function sessionTickCheck(): Promise<void> {
  try {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    // Find sessions that were active recently (last 2 days) but idle > 30 min.
    const idleSessions = await db
      .select({ id: schema.chatSessions.id, lastMessageAt: schema.chatSessions.lastMessageAt })
      .from(schema.chatSessions)
      .where(
        and(
          lt(schema.chatSessions.lastMessageAt, thirtyMinAgo),
          gt(schema.chatSessions.lastMessageAt, twoDaysAgo),
          gt(schema.chatSessions.turnCount, 0),
        ),
      )
      .limit(100);

    // Mark these sessions so the next turn gets a time-gap injection.
    // We use the metadata JSON column to store a `timeGapMinutes` field.
    for (const s of idleSessions) {
      const gapMs = Date.now() - new Date(s.lastMessageAt).getTime();
      const gapMinutes = Math.round(gapMs / 60_000);
      await db.execute(
        sql`UPDATE chat_sessions
            SET metadata = jsonb_set(
              COALESCE(metadata, '{}')::jsonb,
              '{timeGapMinutes}',
              ${gapMinutes}::text::jsonb
            )
            WHERE id = ${s.id}
              AND (metadata->>'timeGapMinutes' IS NULL
                   OR (metadata->>'timeGapMinutes')::int < ${gapMinutes})`,
      );
    }
  } catch (err) {
    logger.warn({ err }, '[cron] session-tick error');
  }
}

// ── Start cron jobs ──────────────────────────────────────────────────

// ── Warn users about sessions expiring in 2 days ─────────────────────
// Send push notification when session inactive for 5 days (2 days before auto-delete).

async function warnExpiringSessions(): Promise<void> {
  try {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

    // Find sessions idle 4–5 days that haven't been warned yet.
    const expiring = await db
      .select({
        id: schema.chatSessions.id,
        userId: schema.chatSessions.userId,
        characterId: schema.chatSessions.characterId,
        title: schema.chatSessions.title,
        metadata: schema.chatSessions.metadata,
      })
      .from(schema.chatSessions)
      .where(
        and(
          lt(schema.chatSessions.lastMessageAt, fourDaysAgo),
          gt(schema.chatSessions.lastMessageAt, fiveDaysAgo),
          gt(schema.chatSessions.turnCount, 0),
        ),
      )
      .limit(200);

    for (const session of expiring) {
      const meta = (session.metadata ?? {}) as Record<string, unknown>;
      if (meta.expiryWarned) continue; // Already warned

      // Send warning push notification
      await sendExpiryWarning(session.userId, session.id, session.title || 'Untitled session');

      // Mark session as warned so we don't repeat
      await db.execute(
        sql`UPDATE chat_sessions
            SET metadata = jsonb_set(COALESCE(metadata, '{}')::jsonb, '{expiryWarned}', 'true'::jsonb)
            WHERE id = ${session.id}`,
      );
    }
  } catch (err) {
    logger.warn({ err }, '[cron] warn-expiring error');
  }
}

// ── Auto-clean inactive sessions ─────────────────────────────────────
// Delete sessions with no activity for 30+ days (not pinned).
// All child records (messages, memories, dynamic states, etc.) cascade.

async function cleanupInactiveSessions(): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await db
      .delete(schema.chatSessions)
      .where(
        and(
          lt(schema.chatSessions.lastMessageAt, thirtyDaysAgo),
          eq(schema.chatSessions.isPinned, false)
        )
      );
    const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
    if (count > 0) {
      logger.info(`[cron] cleanup: deleted ${count} sessions inactive 30+ days`);
    }
  } catch (err) {
    logger.warn({ err }, '[cron] cleanup-inactive error');
  }
}

// ── Context Nodes Garbage Collection ─────────────────────────────────
// Vacuums context_nodes from active sessions that are older than 30 days.
// Summarizes the leaf nodes into the 'memories' table to preserve long-term
// context before deleting them to keep the context_nodes table lean.

import { nanoid } from 'nanoid';

async function gcContextNodes(): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Find leaf context_nodes older than 30 days
    const oldNodes = await db
      .select({
        id: schema.contextNodes.id,
        sessionId: schema.contextNodes.sessionId,
        summary: schema.contextNodes.summary,
      })
      .from(schema.contextNodes)
      .where(
        and(
          lt(schema.contextNodes.createdAt, thirtyDaysAgo),
          eq(schema.contextNodes.depth, 0)
        )
      )
      .limit(500);

    if (oldNodes.length === 0) return;

    // Get the session owners
    const sessionIds = Array.from(new Set(oldNodes.map(n => n.sessionId)));
    const sessions = await db
      .select({
        id: schema.chatSessions.id,
        userId: schema.chatSessions.userId,
        characterId: schema.chatSessions.characterId,
      })
      .from(schema.chatSessions)
      .where(inArray(schema.chatSessions.id, sessionIds));
      
    const sessionMap = new Map(sessions.map(s => [s.id, s]));
    
    // Insert into memories
    const memoriesToInsert = oldNodes.map(node => {
      const session = sessionMap.get(node.sessionId);
      if (!session) return null;
      
      return {
        id: nanoid(),
        userId: session.userId,
        characterId: session.characterId,
        sessionId: session.id,
        type: 'EPISODIC',
        category: 'GENERAL',
        content: node.summary,
        importance: 0.5,
        chatMode: 'RP',
        createdAt: new Date(),
      };
    }).filter(Boolean) as typeof schema.memories.$inferInsert[];
    
    if (memoriesToInsert.length > 0) {
      await db.insert(schema.memories).values(memoriesToInsert);
    }
    
    // Delete the nodes
    await db
      .delete(schema.contextNodes)
      .where(inArray(schema.contextNodes.id, oldNodes.map(n => n.id)));
      
    logger.info(`[cron] context-gc: compacted ${oldNodes.length} old context nodes into memories.`);
  } catch (err) {
    logger.warn({ err }, '[cron] context-gc error');
  }
}


let started = false;

export function startCronJobs(): void {
  if (started) return;
  started = true;

  // Memory decay: every 6 hours.
  setInterval(() => void decayMemoryImportance(), 6 * 60 * 60 * 1000);

  // Session tick: every 5 minutes.
  setInterval(() => void sessionTickCheck(), 5 * 60 * 1000);

  // Run session tick once on startup (after a short delay).
  setTimeout(() => void sessionTickCheck(), 10_000);

  // Push notifications: hourly check for users idle 20–48h.
  initVapid();
  setInterval(() => void sendScheduledPushNotifications(), 60 * 60 * 1000);
  // Run once 2 minutes after startup (not immediate to let DB settle).
  setTimeout(() => void sendScheduledPushNotifications(), 2 * 60 * 1000);

  // Cleanup inactive sessions: every 6 hours.
  setInterval(() => void cleanupInactiveSessions(), 6 * 60 * 60 * 1000);
  // Run once 5 minutes after startup.
  setTimeout(() => void cleanupInactiveSessions(), 5 * 60 * 1000);

  // GC context nodes (move old nodes to memories): daily.
  setInterval(() => void gcContextNodes(), 24 * 60 * 60 * 1000);
  setTimeout(() => void gcContextNodes(), 10 * 60 * 1000); // 10 mins after startup

  // Warn expiring sessions: every 6 hours (before cleanup).
  setInterval(() => void warnExpiringSessions(), 6 * 60 * 60 * 1000);
  // Run once 4 minutes after startup (before cleanup at 5 min).
  setTimeout(() => void warnExpiringSessions(), 4 * 60 * 1000);

  // Session snapshot precompute (T4.6): every 15 minutes.
  setInterval(() => void rebuildStaleSnapshots(), 15 * 60 * 1000);
  // Run once 3 minutes after startup.
  setTimeout(() => void rebuildStaleSnapshots(), 3 * 60 * 1000);

  // Nightly recap push: 24h cadence. Fires 15 min after diary rollup so
  // diary entries from tonight feed into the push body.
  setInterval(() => {
    void sendDailyRecaps()
      .then((r) => logger.info(`[cron] recap-push: candidates=${r.candidates} sent=${r.sent}`))
      .catch((err) => logger.warn({ err }, '[cron] recap-push error', err));
  }, 24 * 60 * 60 * 1000);
  setTimeout(() => {
    void sendDailyRecaps().catch(() => {});
  }, 25 * 60 * 1000);

  // X4.2 lineage GC: prune dangling context_node_sources rows daily.
  // Runs once ~30 min after boot and then every 24h.
  setInterval(() => {
    void runLineageGc()
      .then((r) =>
        logger.info(
          `[cron] lineage-gc: message=${r.messageDeleted} node=${r.nodeDeleted} blob=${r.blobDeleted}`,
        ),
      )
      .catch((err) => logger.warn({ err }, '[cron] lineage-gc error'));
  }, 24 * 60 * 60 * 1000);
  setTimeout(() => {
    void runLineageGc().catch(() => {});
  }, 30 * 60 * 1000);

  // Refresh rating_aggregates materialized view every 5 min.
  setInterval(() => {
    void db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY rating_aggregates`)
      .then(() => logger.info('[cron] rating-aggregates refreshed'))
      .catch((err) => logger.warn({ err }, '[cron] rating-aggregates refresh error', err));
  }, 5 * 60 * 1000);
  // Run once 2 min after boot.
  setTimeout(() => {
    void db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY rating_aggregates`).catch(() => {});
  }, 2 * 60 * 1000);

  // Reconcile entity counters (totalLikes/Bookmarks) from reactions table every hour.
  setInterval(() => {
    void reconcileEntityCounters()
      .then((r) => logger.info(`[cron] counters reconciled: chars=${r.characters} stories=${r.stories}`))
      .catch((err) => logger.warn({ err }, '[cron] counter reconcile error', err));
  }, 60 * 60 * 1000);

  // Auto-flag entities with 3+ distinct-user reports in last 24h.
  setInterval(() => {
    void autoFlagReportedEntities()
      .then((n) => n > 0 && logger.info(`[cron] auto-flagged ${n} entities`))
      .catch((err) => logger.warn({ err }, '[cron] auto-flag error', err));
  }, 30 * 60 * 1000);

  // PLANIMPv7 — recompute discover trending scores every 15 min.
  setInterval(() => {
    void recomputeDiscoverScores()
      .then((n) => logger.info(`[cron] discover-scores upserted ${n}`))
      .catch((err) => logger.warn({ err }, '[cron] discover-scores error', err));
  }, 15 * 60 * 1000);
  setTimeout(() => { void recomputeDiscoverScores().catch(() => {}); }, 90 * 1000);

  // BACKLOG B1.6 — refresh related_entities MV every 15 min. Uses
  // CONCURRENTLY when possible so readers don't see an empty view.
  setInterval(() => {
    void refreshRelatedEntities()
      .then(() => logger.info('[cron] related_entities refreshed'))
      .catch((err) => logger.warn({ err }, '[cron] related_entities error'));
  }, 15 * 60 * 1000);
  setTimeout(() => { void refreshRelatedEntities().catch(() => {}); }, 120 * 1000);

  // BACKLOG B1.5 — context-maintenance: compact idle sessions every 15 min
  // and stash a wake_up_packet for fast cold-start on re-open.
  setInterval(() => {
    void runContextMaintenancePass()
      .then((n) => n > 0 && logger.info(`[cron] context-maintenance compacted ${n}`))
      .catch((err) => logger.warn({ err }, '[cron] context-maintenance error'));
  }, 15 * 60 * 1000);
  setTimeout(() => { void runContextMaintenancePass().catch(() => {}); }, 150 * 1000);

  // PLANIMPv7 — purge analytics_events older than 30 days (daily).
  setInterval(() => {
    void db.execute(sql`DELETE FROM analytics_events WHERE created_at < NOW() - INTERVAL '30 days'`)
      .then(() => logger.info('[cron] analytics purge done'))
      .catch((err) => logger.warn({ err }, '[cron] analytics purge error', err));
  }, 24 * 60 * 60 * 1000);

  // PLANIMPv7 §7 — permanently purge entities soft-deleted >14 days ago (daily).
  setInterval(() => {
    void purgeSoftDeleted()
      .then((r) => (r.c + r.s) > 0 && logger.info(`[cron] purged soft-deleted chars=${r.c} stories=${r.s}`))
      .catch((err) => logger.warn({ err }, '[cron] soft-delete purge error', err));
  }, 24 * 60 * 60 * 1000);

  logger.info('Cron jobs started (memory-decay: 6h, session-tick: 5m, push-notif: 1h, cleanup: 6h, expiry-warn: 6h, snapshot: 15m, diary-rollup: 24h, recap-push: 24h, lineage-gc: 24h, rating-aggregates: 5m, counters: 1h, auto-flag: 30m, discover: 15m, analytics-purge: 24h, soft-delete-purge: 24h)');
}

async function reconcileEntityCounters(): Promise<{ characters: number; stories: number }> {
  // Recalculate totalLikes and totalBookmarks for characters.
  await db.execute(sql`
    UPDATE characters AS c
    SET
      "total_likes"     = COALESCE((SELECT COUNT(*) FROM reactions WHERE entity_type = 'character' AND entity_id = c.id AND kind = 'like'), 0),
      "total_bookmarks" = COALESCE((SELECT COUNT(*) FROM reactions WHERE entity_type = 'character' AND entity_id = c.id AND kind = 'bookmark'), 0)
    WHERE EXISTS (SELECT 1 FROM reactions WHERE entity_type = 'character' AND entity_id = c.id)
  `);
  await db.execute(sql`
    UPDATE stories AS s
    SET
      "total_likes"     = COALESCE((SELECT COUNT(*) FROM reactions WHERE entity_type = 'story' AND entity_id = s.id AND kind = 'like'), 0),
      "total_bookmarks" = COALESCE((SELECT COUNT(*) FROM reactions WHERE entity_type = 'story' AND entity_id = s.id AND kind = 'bookmark'), 0)
    WHERE EXISTS (SELECT 1 FROM reactions WHERE entity_type = 'story' AND entity_id = s.id)
  `);
  return { characters: 1, stories: 1 };
}

async function autoFlagReportedEntities(): Promise<number> {
  const threshold = 3;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db.execute(sql`
    SELECT entity_type, entity_id, COUNT(DISTINCT reporter_id) AS report_count
    FROM content_reports
    WHERE created_at >= ${since.toISOString()}
    GROUP BY entity_type, entity_id
    HAVING COUNT(DISTINCT reporter_id) >= ${threshold}
  `);
  let flagged = 0;
  for (const row of ((rows as unknown as { rows: Array<{ entity_type: string; entity_id: string; report_count: string }> }).rows ?? [])) {
    if (row.entity_type === 'character') {
      await db.execute(sql`UPDATE characters SET is_flagged_for_review = true WHERE id = ${row.entity_id} AND is_flagged_for_review = false`);
      flagged++;
    } else if (row.entity_type === 'story') {
      await db.execute(sql`UPDATE stories SET is_flagged_for_review = true WHERE id = ${row.entity_id} AND is_flagged_for_review = false`);
      flagged++;
    }
  }
  return flagged;
}

async function recomputeDiscoverScores(): Promise<number> {
  // Score = avgStars + log10(views+10)*2 + log10(chats+10)*3 + log10(likes+10)*1.5 - daysSincePublish*0.1
  const result = await db.execute(sql`
    WITH combined AS (
      SELECT 'character' AS entity_type, id AS entity_id,
             COALESCE(avg_stars, 0) AS avg_stars,
             COALESCE(total_views, 0) AS views,
             COALESCE(total_chats, 0) AS chats,
             COALESCE(total_likes, 0) AS likes,
             COALESCE(published_at, created_at) AS published_at
      FROM characters
      WHERE is_public = true AND COALESCE(deleted_at, NULL) IS NULL AND is_flagged_for_review = false
      UNION ALL
      SELECT 'story' AS entity_type, id AS entity_id,
             COALESCE(avg_stars, 0) AS avg_stars,
             COALESCE(total_views, 0) AS views,
             COALESCE(total_chats, 0) AS chats,
             COALESCE(total_likes, 0) AS likes,
             COALESCE(published_at, created_at) AS published_at
      FROM stories
      WHERE status IN ('published','featured') AND COALESCE(deleted_at, NULL) IS NULL AND is_flagged_for_review = false
    )
    INSERT INTO discover_scores (entity_type, entity_id, score, computed_at)
    SELECT
      entity_type, entity_id,
      (avg_stars
        + LOG(10, views + 10) * 2.0
        + LOG(10, chats + 10) * 3.0
        + LOG(10, likes + 10) * 1.5
        - GREATEST(EXTRACT(EPOCH FROM (NOW() - published_at)) / 86400.0, 0) * 0.1
      )::real,
      NOW()
    FROM combined
    ON CONFLICT (entity_type, entity_id)
    DO UPDATE SET score = EXCLUDED.score, computed_at = NOW()
  `);
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

async function purgeSoftDeleted(): Promise<{ c: number; s: number }> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const c = await db.execute(sql`DELETE FROM characters WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff.toISOString()}`);
  const s = await db.execute(sql`DELETE FROM stories WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff.toISOString()}`);
  return {
    c: (c as unknown as { rowCount?: number }).rowCount ?? 0,
    s: (s as unknown as { rowCount?: number }).rowCount ?? 0,
  };
}

/**
 * BACKLOG B1.6 — refresh related_entities MV.
 * CONCURRENTLY requires a unique index (migration 0053 creates one) and
 * that the view is populated. Fall back to plain REFRESH on first run.
 */
async function refreshRelatedEntities(): Promise<void> {
  try {
    await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY related_entities`);
  } catch (err) {
    // 0A000: CONCURRENTLY requires a pre-populated view. Retry non-concurrent.
    const msg = (err as Error).message || '';
    if (msg.includes('CONCURRENTLY') || msg.includes('0A000')) {
      await db.execute(sql`REFRESH MATERIALIZED VIEW related_entities`);
      return;
    }
    throw err;
  }
}
