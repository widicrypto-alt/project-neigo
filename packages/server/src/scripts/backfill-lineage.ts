/**
 * PLANBv6 X4.2 — Backfill lineage for legacy context_nodes.
 *
 * Any D0 (leaf) context_node that was created BEFORE X4.2 lineage
 * wiring has no `context_node_sources` rows. This script reconstructs
 * the message-level lineage from the stored `turn_start`/`turn_end`
 * range by selecting all chat_messages in that session within the
 * range and inserting them as `source_type='message'` rows.
 *
 * Idempotent via ON CONFLICT DO NOTHING on the composite PK.
 * For D1/D2 parents we cannot perfectly reconstruct the child set
 * (order/chunking metadata wasn't preserved), but we can link every
 * child node whose turn range is covered by the parent's range —
 * good enough for ops tracing.
 *
 * Usage:
 *   pnpm --filter @neigo/server lineage:backfill
 *   pnpm --filter @neigo/server lineage:backfill -- --dry-run
 *   pnpm --filter @neigo/server lineage:backfill -- --batch=100
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

interface BackfillResult {
  leafNodesSeen: number;
  parentNodesSeen: number;
  messageRowsInserted: number;
  nodeRowsInserted: number;
}

function parseArg(flag: string, fallback: number): number {
  const match = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (!match) return fallback;
  const n = Number.parseInt(match.split('=')[1] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function runBackfillLineage(
  opts: { dryRun?: boolean; batchSize?: number } = {},
): Promise<BackfillResult> {
  const dryRun = !!opts.dryRun;
  const batchSize = opts.batchSize ?? 200;

  let leafNodesSeen = 0;
  let parentNodesSeen = 0;
  let messageRowsInserted = 0;
  let nodeRowsInserted = 0;

  // Pass 1: leaves (depth=0) — link to chat_messages by turn range.
  let cursor = '';
  for (;;) {
    const leaves = await db
      .select({
        id: schema.contextNodes.id,
        sessionId: schema.contextNodes.sessionId,
        turnStart: schema.contextNodes.turnStart,
        turnEnd: schema.contextNodes.turnEnd,
      })
      .from(schema.contextNodes)
      .where(
        and(
          eq(schema.contextNodes.depth, 0),
          sql`${schema.contextNodes.id} > ${cursor}`,
        ),
      )
      .orderBy(asc(schema.contextNodes.id))
      .limit(batchSize);

    if (!leaves.length) break;

    for (const leaf of leaves) {
      leafNodesSeen++;
      const messages = await db
        .select({ id: schema.chatMessages.id, turnIndex: schema.chatMessages.turnIndex })
        .from(schema.chatMessages)
        .where(
          and(
            eq(schema.chatMessages.sessionId, leaf.sessionId),
            sql`${schema.chatMessages.turnIndex} >= ${leaf.turnStart}`,
            sql`${schema.chatMessages.turnIndex} <= ${leaf.turnEnd}`,
          ),
        );
      if (!messages.length) continue;
      if (!dryRun) {
        await db
          .insert(schema.contextNodeSources)
          .values(
            messages.map((m) => ({
              contextNodeId: leaf.id,
              sourceType: 'message' as const,
              sourceId: m.id,
              rangeStart: m.turnIndex,
              rangeEnd: m.turnIndex,
            })),
          )
          .onConflictDoNothing();
      }
      messageRowsInserted += messages.length;
    }

    cursor = leaves[leaves.length - 1]!.id;
    if (leaves.length < batchSize) break;
  }

  // Pass 2: parents (depth>=1) — link to child context_nodes by
  // covered turn range AND (depth-1).
  cursor = '';
  for (;;) {
    const parents = await db
      .select({
        id: schema.contextNodes.id,
        sessionId: schema.contextNodes.sessionId,
        depth: schema.contextNodes.depth,
        turnStart: schema.contextNodes.turnStart,
        turnEnd: schema.contextNodes.turnEnd,
      })
      .from(schema.contextNodes)
      .where(
        and(
          sql`${schema.contextNodes.depth} >= 1`,
          sql`${schema.contextNodes.id} > ${cursor}`,
        ),
      )
      .orderBy(asc(schema.contextNodes.id))
      .limit(batchSize);

    if (!parents.length) break;

    for (const parent of parents) {
      parentNodesSeen++;
      const children = await db
        .select({
          id: schema.contextNodes.id,
          turnStart: schema.contextNodes.turnStart,
          turnEnd: schema.contextNodes.turnEnd,
        })
        .from(schema.contextNodes)
        .where(
          and(
            eq(schema.contextNodes.sessionId, parent.sessionId),
            eq(schema.contextNodes.depth, parent.depth - 1),
            sql`${schema.contextNodes.turnStart} >= ${parent.turnStart}`,
            sql`${schema.contextNodes.turnEnd} <= ${parent.turnEnd}`,
          ),
        );
      if (!children.length) continue;
      if (!dryRun) {
        await db
          .insert(schema.contextNodeSources)
          .values(
            children.map((c) => ({
              contextNodeId: parent.id,
              sourceType: 'node' as const,
              sourceId: c.id,
              rangeStart: c.turnStart,
              rangeEnd: c.turnEnd,
            })),
          )
          .onConflictDoNothing();
      }
      nodeRowsInserted += children.length;
    }

    cursor = parents[parents.length - 1]!.id;
    if (parents.length < batchSize) break;
  }

  return { leafNodesSeen, parentNodesSeen, messageRowsInserted, nodeRowsInserted };
}

function shouldRunAsScript(): boolean {
  const argv1 = process.argv[1] ?? '';
  return argv1.endsWith('backfill-lineage.ts') || argv1.endsWith('backfill-lineage.js');
}

if (shouldRunAsScript()) {
  const dryRun = process.argv.includes('--dry-run');
  const batchSize = parseArg('--batch', 200);
  runBackfillLineage({ dryRun, batchSize })
    .then((res) => {
      console.log(JSON.stringify({ ok: true, dryRun, batchSize, ...res }, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[backfill-lineage] failed:', err);
      process.exit(1);
    });
}
