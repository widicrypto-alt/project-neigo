/**
 * PLANBv4 X4.5 — Memory-graph writer.
 *
 * Thin wrapper around `memory-graph.ts` that converts orchestrator signals
 * (promises, unresolved beats, relationship snapshots) into node+edge
 * upserts. Every function is fire-and-forget safe:
 *   - Guarded by `env.MEMORY_GRAPH_WRITE_ENABLED`.
 *   - Swallows all errors.
 *   - Never blocks turn completion — call without `await`.
 *
 * Canonicalization (PLANBv4 §5.1):
 *   - People: name.trim().toLowerCase().normalize('NFKC').
 *   - Promises: `promise:<sha256(text).slice(0,16)>`.
 *   - Events:   `event:<sha256(summary).slice(0,16)>`.
 */
import { createHash } from 'node:crypto';
import { env } from '../lib/env.js';
import {
  upsertNode,
  addEdge,
  type MemoryNodeKind,
} from './memory-graph.js';

const writesEnabled = () => env.MEMORY_GRAPH_WRITE_ENABLED;

function shortHash(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

function normalize(name: string): string {
  return name.trim().toLowerCase().normalize('NFKC');
}

async function actorNode(userId: string, kind: MemoryNodeKind, name: string) {
  const n = await upsertNode({ userId, kind, canonicalName: normalize(name) });
  return n.id;
}

/**
 * Record promises a character just made. Each promise becomes a
 * `promise` node plus two edges from the speaker:
 *   character -[promised]-> promise
 *   character -[promised_to]-> user
 */
export async function recordPromises(opts: {
  userId: string;
  characterName: string;
  promises: string[];
  sessionId: string;
  sourceMessageId?: string | null;
}): Promise<void> {
  if (!writesEnabled() || !opts.promises.length) return;
  try {
    const charId = await actorNode(opts.userId, 'character', opts.characterName);
    const userId = await actorNode(opts.userId, 'user', `user:${opts.userId}`);
    for (const text of opts.promises) {
      const trimmed = text.trim();
      if (!trimmed) continue;
      const canonical = `promise:${shortHash(trimmed)}`;
      const promise = await upsertNode({
        userId: opts.userId,
        kind: 'promise',
        canonicalName: canonical,
        metadata: { text: trimmed.slice(0, 1000), sessionId: opts.sessionId },
      });
      await addEdge({
        fromNodeId: charId,
        toNodeId: promise.id,
        predicate: 'promised',
        sourceMessageId: opts.sourceMessageId ?? undefined,
        confidence: 0.9,
      });
      await addEdge({
        fromNodeId: charId,
        toNodeId: userId,
        predicate: 'promised_to',
        sourceMessageId: opts.sourceMessageId ?? undefined,
        confidence: 0.9,
      });
    }
  } catch {
    // never surface graph errors.
  }
}

/**
 * Record an unresolved scene beat as an `event` node witnessed by the
 * session user. Idempotent on (userId, summary-hash).
 */
export async function recordUnresolvedEvent(opts: {
  userId: string;
  summary: string;
  sessionId: string;
  sourceMessageId?: string | null;
}): Promise<void> {
  if (!writesEnabled() || !opts.summary.trim()) return;
  try {
    const canonical = `event:${shortHash(opts.summary.trim())}`;
    const ev = await upsertNode({
      userId: opts.userId,
      kind: 'event',
      canonicalName: canonical,
      metadata: {
        summary: opts.summary.trim().slice(0, 500),
        sessionId: opts.sessionId,
        unresolved: true,
      },
    });
    const userNode = await actorNode(opts.userId, 'user', `user:${opts.userId}`);
    await addEdge({
      fromNodeId: userNode,
      toNodeId: ev.id,
      predicate: 'witnessed',
      sourceMessageId: opts.sourceMessageId ?? undefined,
      confidence: 0.7,
    });
    await addEdge({
      fromNodeId: userNode,
      toNodeId: ev.id,
      predicate: 'unresolved',
      sourceMessageId: opts.sourceMessageId ?? undefined,
      confidence: 0.7,
    });
  } catch {
    // noop
  }
}

/**
 * Snapshot the current relationship stage as an edge whose predicate is
 * the stage slug (e.g. `close_friends`). Confidence = trust/100, clamped
 * to [0.3, 1]. Snapshots are additive — retrieval surfaces the newest.
 */
export async function recordRelationshipSnapshot(opts: {
  userId: string;
  characterName: string;
  stage: string;
  trustScore: number;
  sessionId: string;
  sourceMessageId?: string | null;
}): Promise<void> {
  if (!writesEnabled()) return;
  try {
    const charId = await actorNode(opts.userId, 'character', opts.characterName);
    const userNode = await actorNode(opts.userId, 'user', `user:${opts.userId}`);
    const predicate = opts.stage.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 64);
    const confidence = Math.min(1, Math.max(0.3, opts.trustScore / 100));
    await addEdge({
      fromNodeId: userNode,
      toNodeId: charId,
      predicate,
      confidence,
      validFrom: new Date(),
      sourceMessageId: opts.sourceMessageId ?? undefined,
    });
  } catch {
    // noop
  }
}
