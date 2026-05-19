/**
 * PLANBv6 X4.2 — Lineage GC.
 *
 * `context_node_sources.source_id` is a discriminated column with NO FK
 * constraint (the target table depends on `source_type`). If a raw
 * chat_message, child context_node, or context_blob is deleted, the
 * lineage row is left dangling.
 *
 * This script prunes those dangling rows. It's idempotent and cheap:
 * a single DELETE per source_type using NOT EXISTS against the
 * appropriate target table.
 *
 * Usage:
 *   pnpm --filter @neigo/server lineage:gc
 *   pnpm --filter @neigo/server lineage:gc -- --dry-run
 *
 * Registered as a daily cron (queue.ts) at a low-traffic hour.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

export interface LineageGcResult {
  messageDeleted: number;
  nodeDeleted: number;
  blobDeleted: number;
}

export async function runLineageGc(
  opts: { dryRun?: boolean } = {},
): Promise<LineageGcResult> {
  const dryRun = !!opts.dryRun;
  const countOr = (rowsOrCount: unknown): number => {
    // drizzle-orm execute returns a result object; best-effort parse.
    if (typeof rowsOrCount === 'number') return rowsOrCount;
    if (rowsOrCount && typeof rowsOrCount === 'object') {
      const r = rowsOrCount as { rowCount?: number; rows?: unknown[] };
      if (typeof r.rowCount === 'number') return r.rowCount;
      if (Array.isArray(r.rows)) return r.rows.length;
    }
    return 0;
  };

  let messageDeleted = 0;
  let nodeDeleted = 0;
  let blobDeleted = 0;

  if (dryRun) {
    const m = (await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM context_node_sources s
      WHERE s.source_type = 'message'
        AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.id = s.source_id)
    `)) as unknown as Array<{ c: number }>;
    messageDeleted = m[0]?.c ?? 0;
    const n = (await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM context_node_sources s
      WHERE s.source_type = 'node'
        AND NOT EXISTS (SELECT 1 FROM context_nodes n WHERE n.id = s.source_id)
    `)) as unknown as Array<{ c: number }>;
    nodeDeleted = n[0]?.c ?? 0;
    const b = (await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM context_node_sources s
      WHERE s.source_type = 'blob'
        AND NOT EXISTS (SELECT 1 FROM context_blobs b WHERE b.id = s.source_id)
    `)) as unknown as Array<{ c: number }>;
    blobDeleted = b[0]?.c ?? 0;
    return { messageDeleted, nodeDeleted, blobDeleted };
  }

  const r1 = await db.execute(sql`
    DELETE FROM context_node_sources s
    WHERE s.source_type = 'message'
      AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.id = s.source_id)
  `);
  messageDeleted = countOr(r1);

  const r2 = await db.execute(sql`
    DELETE FROM context_node_sources s
    WHERE s.source_type = 'node'
      AND NOT EXISTS (SELECT 1 FROM context_nodes n WHERE n.id = s.source_id)
  `);
  nodeDeleted = countOr(r2);

  const r3 = await db.execute(sql`
    DELETE FROM context_node_sources s
    WHERE s.source_type = 'blob'
      AND NOT EXISTS (SELECT 1 FROM context_blobs b WHERE b.id = s.source_id)
  `);
  blobDeleted = countOr(r3);

  return { messageDeleted, nodeDeleted, blobDeleted };
}

/** Observability — counters are updated in-process. */
export const lineageGcCounter = {
  deletedMessage: 0,
  deletedNode: 0,
  deletedBlob: 0,
};

function shouldRunAsScript(): boolean {
  const argv1 = process.argv[1] ?? '';
  return argv1.endsWith('gc-lineage.ts') || argv1.endsWith('gc-lineage.js');
}

if (shouldRunAsScript()) {
  const dryRun = process.argv.includes('--dry-run');
  runLineageGc({ dryRun })
    .then((res) => {
      console.log(
        JSON.stringify({ ok: true, dryRun, ...res }, null, 2),
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('[gc-lineage] failed:', err);
      process.exit(1);
    });
}
