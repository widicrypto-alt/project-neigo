/**
 * Character Facts Service — T4.9 Temporal Fact Graph
 *
 * Tracks versioned (subject, predicate, object) triples per session.
 * When a fact changes, the old version is closed (valid_to = now) and
 * a new version is created with version_of pointing to the predecessor.
 *
 * This enables arc tracking: "trust went 20→45→30→60 over 50 turns".
 */
import { and, eq, isNull, desc, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, schema } from '../db/client.js';
import { env } from '../lib/env.js';
import { emitDashboardEvent } from '../lib/dashboard-events.js';

export interface Fact {
  id: string;
  sessionId: string;
  characterId: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  validFrom: Date;
  validTo: Date | null;
  versionOf: string | null;
  sourceMessageId: string | null;
}

/**
 * Assert a fact. If the same (sessionId, subject, predicate) already exists
 * with a different object, close the old one and create a new version.
 * If the object is the same, skip (idempotent).
 */
export async function assertFact(opts: {
  sessionId: string;
  characterId: string;
  subject: string;
  predicate: string;
  object: string;
  confidence?: number;
  sourceMessageId?: string;
}): Promise<{ created: boolean; previousId?: string }> {
  if (!env.CHARACTER_FACTS_GRAPH_ENABLED) {
    return { created: false };
  }

  const { sessionId, characterId, subject, predicate, object } = opts;

  // Find current valid fact for this (session, subject, predicate)
  const existing = await db.query.characterFacts.findFirst({
    where: and(
      eq(schema.characterFacts.sessionId, sessionId),
      eq(schema.characterFacts.subject, subject),
      eq(schema.characterFacts.predicate, predicate),
      isNull(schema.characterFacts.validTo),
    ),
  });

  // Same value — no-op
  if (existing && existing.object === object) {
    return { created: false };
  }

  // Close previous version if exists
  if (existing) {
    await db
      .update(schema.characterFacts)
      .set({ validTo: new Date() })
      .where(eq(schema.characterFacts.id, existing.id));
  }

  // Insert new fact
  const newId = nanoid();
  await db.insert(schema.characterFacts).values({
    id: newId,
    sessionId,
    characterId,
    subject,
    predicate,
    object,
    confidence: opts.confidence ?? 1.0,
    versionOf: existing?.id ?? null,
    sourceMessageId: opts.sourceMessageId ?? null,
  });

  emitDashboardEvent({
    type: 'character_facts_updated',
    sessionId,
    payload: {
      fact: {
        id: newId,
        subject,
        predicate,
        object,
        confidence: opts.confidence ?? 1.0,
      },
    },
  });

  return { created: true, previousId: existing?.id };
}

/**
 * Get all currently-valid facts for a session.
 */
export async function currentFacts(sessionId: string): Promise<Fact[]> {
  if (!env.CHARACTER_FACTS_GRAPH_ENABLED) return [];

  const rows = await db.query.characterFacts.findMany({
    where: and(
      eq(schema.characterFacts.sessionId, sessionId),
      isNull(schema.characterFacts.validTo),
    ),
    orderBy: [desc(schema.characterFacts.createdAt)],
  });

  return rows as Fact[];
}

/**
 * Get the full timeline of a (subject, predicate) pair — all versions.
 */
export async function factTimeline(
  sessionId: string,
  subject: string,
  predicate: string,
): Promise<Fact[]> {
  if (!env.CHARACTER_FACTS_GRAPH_ENABLED) return [];

  const rows = await db.query.characterFacts.findMany({
    where: and(
      eq(schema.characterFacts.sessionId, sessionId),
      eq(schema.characterFacts.subject, subject),
      eq(schema.characterFacts.predicate, predicate),
    ),
    orderBy: [asc(schema.characterFacts.validFrom)],
  });

  return rows as Fact[];
}

/**
 * Build a prompt block summarizing current facts for context injection.
 */
export function buildFactsPromptBlock(facts: Fact[]): string {
  if (!facts.length) return '';
  const lines = facts.map(
    (f) => `• ${f.subject}.${f.predicate} = ${f.object}${f.confidence < 1 ? ` (conf ${f.confidence})` : ''}`,
  );
  return `[Current Facts]\n${lines.join('\n')}`;
}
