/**
 * PLANv3 X4.5 (post-batch Track B.4) — Memory graph upsert helpers.
 *
 * Session-scoped first (per PLANv3 §X12 #2): callers tag new nodes with
 * the owning session via `metadata.sessionId`. Promotion to user-scope
 * happens via an explicit pin flow on top of these primitives.
 *
 * Extractor wiring (relationship-stage / character-facts / promise
 * detection) is a follow-up. This file ships the DB layer only so
 * extractors can depend on it without churn.
 */

import { nanoid } from 'nanoid';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

export type MemoryNodeKind =
  | 'user'
  | 'character'
  | 'location'
  | 'item'
  | 'event'
  | 'promise'
  | 'mistake';

export interface UpsertNodeInput {
  userId: string;
  kind: MemoryNodeKind;
  canonicalName: string;
  metadata?: Record<string, unknown>;
  /** PLANIMPv7 §1.3 — Optional ID to prevent name collisions for same-named characters. */
  characterId?: string | null;
}

export interface AddEdgeInput {
  fromNodeId: string;
  toNodeId: string;
  predicate: string;
  validFrom?: Date;
  validTo?: Date;
  confidence?: number;
  sourceMessageId?: string;
}

/**
 * Upsert a node by (user_id, kind, lower(canonical_name)). Returns the
 * existing row if present without overwriting metadata; callers that
 * want to merge metadata should read-modify-write explicitly.
 */
export async function upsertNode(input: UpsertNodeInput): Promise<{ id: string; created: boolean }> {
  const name = input.canonicalName.trim();
  const lowered = name.toLowerCase();
  if (!lowered) throw new Error('canonical_name_required');

  // PLANIMPv7 §1.3 — For characters, we use the characterId in the search to be unique.
  // We store the canonicalName as-is for display, but the look-up is scoped.
  const lookupName = (input.kind === 'character' && input.characterId)
    ? `char:${input.characterId}:${lowered}`
    : lowered;

  const existing = await db.query.memoryGraphNodes.findFirst({
    where: and(
      eq(schema.memoryGraphNodes.userId, input.userId),
      eq(schema.memoryGraphNodes.kind, input.kind),
      sql`lower(${schema.memoryGraphNodes.canonicalName}) = ${lookupName}`,
    ),
  });
  if (existing) return { id: existing.id, created: false };

  const id = nanoid();
  await db.insert(schema.memoryGraphNodes).values({
    id,
    userId: input.userId,
    kind: input.kind,
    canonicalName: (input.kind === 'character' && input.characterId)
      ? `char:${input.characterId}:${name}`
      : name,
    metadata: { ...input.metadata, originalName: name, characterId: input.characterId },
  });
  return { id, created: true };
}

/** Add a directed edge. Duplicates are allowed; dedupe is caller-side. */
export async function addEdge(input: AddEdgeInput): Promise<string> {
  const id = nanoid();
  await db.insert(schema.memoryGraphEdges).values({
    id,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    predicate: input.predicate,
    validFrom: input.validFrom ?? null,
    validTo: input.validTo ?? null,
    confidence: input.confidence ?? 1.0,
    sourceMessageId: input.sourceMessageId ?? null,
  });
  return id;
}

/** List outgoing edges for a node, optionally filtered by predicate. */
export async function edgesFrom(
  fromNodeId: string,
  predicate?: string,
): Promise<Array<typeof schema.memoryGraphEdges.$inferSelect>> {
  const conds = [eq(schema.memoryGraphEdges.fromNodeId, fromNodeId)];
  if (predicate) conds.push(eq(schema.memoryGraphEdges.predicate, predicate));
  return db
    .select()
    .from(schema.memoryGraphEdges)
    .where(and(...conds));
}

// ───────────────────────────────────────────────────────────────────────────
// PLANBv4 — retrieval slice.
//
// `queryGraph` returns the most recent, highest-confidence edges a prompt
// builder can render for a given user+character context. It intentionally
// does not attempt community detection or vector ranking — recency and
// confidence are the only scorers. A future revision may swap the ordering
// for a proper relevance function once we have usage signal.
// ───────────────────────────────────────────────────────────────────────────

export interface GraphSliceEdge {
  id: string;
  predicate: string;
  confidence: number;
  createdAt: Date;
  fromNode: { id: string; kind: MemoryNodeKind; canonicalName: string; metadata: unknown };
  toNode: { id: string; kind: MemoryNodeKind; canonicalName: string; metadata: unknown };
}

export interface GraphSlice {
  edges: GraphSliceEdge[];
}

/**
 * Query the graph for edges anchored to a user and (optionally) a set of
 * character canonical names. Returns newest-first, filtered by a minimum
 * confidence (default 0.3 — matches the retrieval guardrail in §5.4).
 */
export async function queryGraph(opts: {
  userId: string;
  characterNames?: string[];
  predicates?: string[];
  minConfidence?: number;
  limit?: number;
}): Promise<GraphSlice> {
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 50);
  const minConfidence = opts.minConfidence ?? 0.3;

  // Collect candidate node ids for the user. Graph is user-scoped so we
  // bound the edge scan with these.
  const userNodes = await db
    .select({ id: schema.memoryGraphNodes.id })
    .from(schema.memoryGraphNodes)
    .where(eq(schema.memoryGraphNodes.userId, opts.userId));
  if (!userNodes.length) return { edges: [] };
  const userNodeIds = userNodes.map((n) => n.id);

  // Gather edges with confidence ≥ threshold, newest first, bounded by
  // `limit * 2` so we can do post-filter (character / predicate) cheaply.
  const rawEdges = await db
    .select()
    .from(schema.memoryGraphEdges)
    .where(
      and(
        inArray(schema.memoryGraphEdges.fromNodeId, userNodeIds),
        sql`${schema.memoryGraphEdges.confidence} >= ${minConfidence}`,
      ),
    )
    .orderBy(desc(schema.memoryGraphEdges.createdAt))
    .limit(limit * 4);
  if (!rawEdges.length) return { edges: [] };

  const nodeIdSet = new Set<string>();
  for (const e of rawEdges) {
    nodeIdSet.add(e.fromNodeId);
    nodeIdSet.add(e.toNodeId);
  }
  const nodeRows = await db
    .select()
    .from(schema.memoryGraphNodes)
    .where(inArray(schema.memoryGraphNodes.id, Array.from(nodeIdSet)));
  const byId = new Map(nodeRows.map((n) => [n.id, n]));

  const predicateFilter = opts.predicates && opts.predicates.length
    ? new Set(opts.predicates)
    : null;
  const nameFilter = opts.characterNames && opts.characterNames.length
    ? new Set(opts.characterNames.map((n) => n.trim().toLowerCase()))
    : null;

  const out: GraphSliceEdge[] = [];
  for (const e of rawEdges) {
    if (predicateFilter && !predicateFilter.has(e.predicate)) continue;
    const f = byId.get(e.fromNodeId);
    const t = byId.get(e.toNodeId);
    if (!f || !t) continue;
    if (nameFilter) {
      const matches =
        nameFilter.has(f.canonicalName.toLowerCase()) ||
        nameFilter.has(t.canonicalName.toLowerCase());
      if (!matches) continue;
    }
    out.push({
      id: e.id,
      predicate: e.predicate,
      confidence: e.confidence,
      createdAt: e.createdAt,
      fromNode: { id: f.id, kind: f.kind as MemoryNodeKind, canonicalName: f.canonicalName, metadata: f.metadata },
      toNode: { id: t.id, kind: t.kind as MemoryNodeKind, canonicalName: t.canonicalName, metadata: t.metadata },
    });
    if (out.length >= limit) break;
  }
  return { edges: out };
}

