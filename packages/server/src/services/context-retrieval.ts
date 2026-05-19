/**
 * PLANv3 X4.4 (post-batch Track B.3) — Context retrieval primitives.
 *
 * Three layered APIs on top of existing stores:
 *
 *   search(sessionId, query, k)  — hybrid recall over:
 *     (1) chat_messages full-text search (transcript-search.ts)
 *     (2) context_nodes FTS on summary column
 *   fused via Reciprocal Rank Fusion (same constant as memory-retriever
 *   T4.2). Intentionally omits vector search here — that lives in
 *   memory-retriever and is used for character memories, not session
 *   transcripts, to avoid embedding cost for raw messages.
 *
 *   describe(nodeId)  — returns a node with its direct child summaries
 *   and lineage (context_node_sources rows). Does NOT expand blobs.
 *
 *   expand(nodeId)    — returns full content of a node including blob
 *   payload when blob_ref is set.
 *
 *   expandQuery(sessionId, query, k) — runs search() then expand()s any
 *   node-kind hits. Used by the orchestrator's recall path when user
 *   message matches recall patterns ("ingat", "waktu kita", etc).
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { searchTranscript } from './transcript-search.js';
import { expandBlob } from './context-blobs.js';

export type RetrievedKind = 'message' | 'node';

export interface RetrievedItem {
  kind: RetrievedKind;
  id: string;
  sessionId: string;
  /** RRF fused score; higher = more relevant. */
  score: number;
  /** Short highlight / summary snippet for display. */
  snippet: string;
  /** Turn index (for messages) or turnStart (for nodes). */
  turnIndex: number;
}

export interface NodeDescription {
  id: string;
  sessionId: string;
  parentId: string | null;
  depth: number;
  turnStart: number;
  turnEnd: number;
  summary: string;
  salience: number;
  tokenCount: number;
  childSummaries: Array<{ id: string; summary: string; turnStart: number; turnEnd: number }>;
  sources: Array<{
    sourceType: 'message' | 'node' | 'blob';
    sourceId: string;
    rangeStart: number | null;
    rangeEnd: number | null;
  }>;
}

export interface NodeFull extends NodeDescription {
  /** Full content when backed by a blob; null otherwise. */
  blobContent: string | null;
}

const RRF_K = 60;

function clampK(k: number | undefined): number {
  const n = Math.floor(k ?? 5);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(50, n);
}

/**
 * Hybrid search across messages (FTS) and context_nodes (FTS on summary).
 * Results fused via Reciprocal Rank Fusion; k controls final count.
 */
export async function search(
  sessionId: string,
  userId: string,
  query: string,
  k = 5,
): Promise<RetrievedItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const limit = clampK(k);

  // (1) Messages FTS — reuse existing service scoped to session.
  const messageHits = await searchTranscript({
    userId,
    sessionId,
    query: trimmed,
    limit: limit * 4,
  });

  // (2) Node summaries FTS — lightweight inline query because
  // context_nodes has no dedicated search service yet.
  const nodeRows = (await db.execute(sql`
    SELECT
      n.id,
      n.session_id     AS "sessionId",
      n.depth          AS "depth",
      n.turn_start     AS "turnStart",
      n.summary        AS "summary",
      ts_rank(to_tsvector('simple', n.summary),
              plainto_tsquery('simple', ${trimmed})) AS rank
    FROM context_nodes n
    JOIN chat_sessions s ON s.id = n.session_id
    WHERE s.user_id = ${userId}
      AND n.session_id = ${sessionId}
      AND to_tsvector('simple', n.summary) @@ plainto_tsquery('simple', ${trimmed})
    ORDER BY rank DESC, n.depth DESC, n.turn_start DESC
    LIMIT ${limit * 4}
  `)) as unknown as Array<{
    id: string;
    sessionId: string;
    depth: number;
    turnStart: number;
    summary: string;
    rank: number;
  }>;

  // RRF fusion: each list contributes 1/(k + rank_i) per item.
  const scoreMap = new Map<string, RetrievedItem>();
  messageHits.forEach((hit, i) => {
    const rrf = 1 / (RRF_K + i + 1);
    const key = `m:${hit.id}`;
    const existing = scoreMap.get(key);
    if (existing) {
      existing.score += rrf;
    } else {
      scoreMap.set(key, {
        kind: 'message',
        id: hit.id,
        sessionId: hit.sessionId,
        score: rrf,
        snippet: hit.headline || hit.content.slice(0, 240),
        turnIndex: hit.turnIndex,
      });
    }
  });
  nodeRows.forEach((row, i) => {
    const rrf = 1 / (RRF_K + i + 1);
    const key = `n:${row.id}`;
    const existing = scoreMap.get(key);
    if (existing) {
      existing.score += rrf;
    } else {
      scoreMap.set(key, {
        kind: 'node',
        id: row.id,
        sessionId: row.sessionId,
        score: rrf,
        snippet: row.summary.slice(0, 240),
        turnIndex: row.turnStart,
      });
    }
  });

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Describe a node: summary + direct children + raw source lineage. */
export async function describe(nodeId: string): Promise<NodeDescription | null> {
  const node = await db.query.contextNodes.findFirst({
    where: eq(schema.contextNodes.id, nodeId),
  });
  if (!node) return null;

  const children = await db
    .select({
      id: schema.contextNodes.id,
      summary: schema.contextNodes.summary,
      turnStart: schema.contextNodes.turnStart,
      turnEnd: schema.contextNodes.turnEnd,
    })
    .from(schema.contextNodes)
    .where(eq(schema.contextNodes.parentId, nodeId));

  const sources = await db
    .select()
    .from(schema.contextNodeSources)
    .where(eq(schema.contextNodeSources.contextNodeId, nodeId));

  return {
    id: node.id,
    sessionId: node.sessionId,
    parentId: node.parentId,
    depth: node.depth,
    turnStart: node.turnStart,
    turnEnd: node.turnEnd,
    summary: node.summary,
    salience: node.salience,
    tokenCount: node.tokenCount,
    childSummaries: children,
    sources: sources.map((s) => ({
      sourceType: s.sourceType as 'message' | 'node' | 'blob',
      sourceId: s.sourceId,
      rangeStart: s.rangeStart,
      rangeEnd: s.rangeEnd,
    })),
  };
}

/**
 * Full node content — identical to describe() plus blob expansion when
 * context_nodes.blob_ref is set. Returns null when node is not found.
 */
export async function expand(nodeId: string): Promise<NodeFull | null> {
  const desc = await describe(nodeId);
  if (!desc) return null;

  const raw = await db.query.contextNodes.findFirst({
    where: eq(schema.contextNodes.id, nodeId),
    columns: { blobRef: true },
  });
  let blobContent: string | null = null;
  if (raw?.blobRef) {
    try {
      blobContent = await expandBlob(raw.blobRef);
    } catch {
      blobContent = null;
    }
  }
  return { ...desc, blobContent };
}

/**
 * search() + expand() for any node-kind hits. Messages are returned
 * as-is. Intended for the orchestrator's recall path.
 */
export async function expandQuery(
  sessionId: string,
  userId: string,
  query: string,
  k = 3,
): Promise<Array<RetrievedItem & { expanded: NodeFull | null }>> {
  const hits = await search(sessionId, userId, query, k);
  if (!hits.length) return [];

  const nodeIds = hits.filter((h) => h.kind === 'node').map((h) => h.id);
  const expanded = new Map<string, NodeFull>();
  if (nodeIds.length) {
    const descriptions = await Promise.all(nodeIds.map((id) => expand(id)));
    for (const d of descriptions) {
      if (d) expanded.set(d.id, d);
    }
  }

  return hits.map((h) => ({
    ...h,
    expanded: h.kind === 'node' ? expanded.get(h.id) ?? null : null,
  }));
}

/**
 * Heuristic: does the user message warrant engaging the recall path?
 * Used by the orchestrator to opt into expandQuery instead of the stock
 * RRF over character memories.
 */
const RECALL_PATTERN =
  /\b(ingat|inget|kemarin|dulu|waktu kita|waktu itu|tadi|pernah|remember|you said|what did|recall|last time|promised)\b/i;

export function isRecallQuery(userText: string): boolean {
  return RECALL_PATTERN.test(userText);
}

/** Internal helper exposed for tests. */
export const __internals = {
  RRF_K,
  RECALL_PATTERN,
  clampK,
  /** Used by a future batch-hydrate helper to fetch nodes by id. */
  async hydrateNodesByIds(ids: string[]): Promise<Array<typeof schema.contextNodes.$inferSelect>> {
    if (!ids.length) return [];
    return db
      .select()
      .from(schema.contextNodes)
      .where(and(inArray(schema.contextNodes.id, ids)));
  },
};

/**
 * X4.2 — walk the lineage graph from a context_node down to the raw
 * chat messages it was derived from. Uses a recursive CTE with a
 * depth cap (5) so a pathological chain cannot runaway. Returns the
 * distinct chat_messages rows ordered by turn_index.
 */
export async function traceToMessages(
  nodeId: string,
): Promise<Array<typeof schema.chatMessages.$inferSelect>> {
  const rows = (await db.execute(sql`
    WITH RECURSIVE lineage(context_node_id, source_type, source_id, depth) AS (
      SELECT context_node_id, source_type, source_id, 0
        FROM context_node_sources
        WHERE context_node_id = ${nodeId}
      UNION ALL
      SELECT s.context_node_id, s.source_type, s.source_id, l.depth + 1
        FROM context_node_sources s
        JOIN lineage l ON s.context_node_id = l.source_id
        WHERE l.source_type = 'node' AND l.depth < 5
    )
    SELECT DISTINCT source_id FROM lineage WHERE source_type = 'message'
  `)) as unknown as Array<{ source_id: string }>;
  const ids = rows.map((r) => r.source_id);
  if (!ids.length) return [];

  const messages = await db
    .select()
    .from(schema.chatMessages)
    .where(inArray(schema.chatMessages.id, ids))
    .orderBy(schema.chatMessages.turnIndex);
  return messages;
}
