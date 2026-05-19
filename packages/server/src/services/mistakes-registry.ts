/**
 * Mistakes Registry — T4.1
 *
 * Records validator drift patterns per session so the system prompt can
 * proactively warn the model about repeated failures.
 */
import { nanoid } from 'nanoid';
import { eq, desc } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { env } from '../lib/env.js';

export type MistakeKind =
  | 'tone_drift'
  | 'pov_drift'
  | 'format_drift'
  | 'repetition'
  | 'refusal'
  | 'continuity';

export interface MistakeRecord {
  id: string;
  sessionId: string;
  turnIndex: number;
  kind: MistakeKind;
  excerpt: string;
  correction: string;
}

/**
 * Record a drift pattern that was detected and corrected by a retry.
 */
export async function recordMistake(input: {
  sessionId: string;
  turnIndex: number;
  kind: MistakeKind;
  excerpt: string;
  correction: string;
}): Promise<void> {
  if (!env.MISTAKES_REGISTRY_ENABLED) return;
  await db.insert(schema.sessionMistakes).values({
    id: nanoid(),
    sessionId: input.sessionId,
    turnIndex: input.turnIndex,
    kind: input.kind,
    excerpt: input.excerpt.slice(0, 240),
    correction: input.correction.slice(0, 500),
    resolvedInTurn: input.turnIndex, // recorded only on successful retry
  });
}

/**
 * Retrieve the N most recent mistakes for a session, used for prompt injection.
 */
export async function recentMistakes(
  sessionId: string,
  limit = 3,
): Promise<MistakeRecord[]> {
  if (!env.MISTAKES_REGISTRY_ENABLED) return [];
  const rows = await db
    .select()
    .from(schema.sessionMistakes)
    .where(eq(schema.sessionMistakes.sessionId, sessionId))
    .orderBy(desc(schema.sessionMistakes.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    turnIndex: r.turnIndex,
    kind: r.kind as MistakeKind,
    excerpt: r.excerpt,
    correction: r.correction,
  }));
}

/**
 * Build a prompt block from recent mistakes for system injection.
 */
export function buildMistakesPromptBlock(mistakes: MistakeRecord[]): string | null {
  if (mistakes.length === 0) return null;
  const lines = [
    '## Recent Drift Patterns (DO NOT REPEAT)',
    'The following mistakes were detected in previous turns of this session.',
    'Actively avoid repeating them:',
    '',
  ];
  for (const m of mistakes) {
    lines.push(`- [${m.kind}] turn ${m.turnIndex}: "${m.excerpt}" → Fix: ${m.correction}`);
  }
  return lines.join('\n');
}
