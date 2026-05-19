/**
 * Per-session character dynamic state (trust, mood, stagnation, drift).
 * Persisted in `character_dynamic_states` (PK: sessionId + characterId).
 */
import { eq, and, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import type { CharacterDynamicState } from '@neigo/shared';
import { determineStage } from './relationship-stage.js';
import { emitDashboardEvent } from '../lib/dashboard-events.js';

type Row = typeof schema.characterDynamicStates.$inferSelect;

function hydrate(r: Row): CharacterDynamicState {
  return {
    sessionId: r.sessionId,
    characterId: r.characterId,
    mood: r.mood,
    stagnation: r.stagnation,
    jealousy: r.jealousy,
    driftScore: r.driftScore,
    trustScore: r.trustScore,
    lastRelationshipStage: r.lastRelationshipStage,
    repetitionScore: r.repetitionScore,
    toneDrift: r.toneDrift,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export class DynamicStateManager {
  static async getOrCreate(
    sessionId: string,
    characterId: string,
  ): Promise<CharacterDynamicState> {
    const row = await db.query.characterDynamicStates.findFirst({
      where: and(
        eq(schema.characterDynamicStates.sessionId, sessionId),
        eq(schema.characterDynamicStates.characterId, characterId),
      ),
    });
    if (row) return hydrate(row);
    await db.insert(schema.characterDynamicStates).values({
      sessionId,
      characterId,
    }).onConflictDoNothing();
    const fresh = await db.query.characterDynamicStates.findFirst({
      where: and(
        eq(schema.characterDynamicStates.sessionId, sessionId),
        eq(schema.characterDynamicStates.characterId, characterId),
      ),
    });
    return hydrate(fresh!);
  }

  static async applyStatDelta(opts: {
    sessionId: string;
    characterId: string;
    trustDelta?: number;
    moodLabel?: string | null;
    repetitionScore?: number;
    toneDrift?: number;
    stagnationDelta?: number;
  }) {
    const trustDelta = opts.trustDelta ?? 0;
    const stagnationDelta = opts.stagnationDelta ?? 0;

    const setClause: Record<string, any> = {
      trustScore: sql`LEAST(100, GREATEST(0, COALESCE(${schema.characterDynamicStates.trustScore}, 0) + ${trustDelta}))`,
      stagnation: sql`LEAST(10, GREATEST(0, COALESCE(${schema.characterDynamicStates.stagnation}, 0) + ${stagnationDelta}))`,
      updatedAt: new Date(),
    };
    if (opts.moodLabel !== undefined) setClause.mood = opts.moodLabel;
    if (opts.repetitionScore !== undefined) setClause.repetitionScore = opts.repetitionScore;
    if (opts.toneDrift !== undefined) setClause.toneDrift = opts.toneDrift;

    const initialTrust = clamp(0 + trustDelta, 0, 100);
    const initialStage = determineStage(initialTrust);

    const [row] = await db.insert(schema.characterDynamicStates)
      .values({
        sessionId: opts.sessionId,
        characterId: opts.characterId,
        trustScore: initialTrust,
        lastRelationshipStage: initialStage,
        stagnation: clamp(0 + stagnationDelta, 0, 10),
        mood: opts.moodLabel ?? undefined,
        repetitionScore: opts.repetitionScore ?? 0,
        toneDrift: opts.toneDrift ?? 0,
      })
      .onConflictDoUpdate({
        target: [schema.characterDynamicStates.sessionId, schema.characterDynamicStates.characterId],
        set: setClause,
      })
      .returning();

    const newTrust = row!.trustScore ?? 0;
    const oldTrust = clamp(newTrust - trustDelta, 0, 100);
    const expectedStage = determineStage(newTrust);
    const oldStage = row!.lastRelationshipStage;

    // Optional patch if the stage computed from new trust differs from the db
    if (oldStage !== expectedStage) {
      await db.update(schema.characterDynamicStates)
        .set({ lastRelationshipStage: expectedStage })
        .where(
          and(
            eq(schema.characterDynamicStates.sessionId, opts.sessionId),
            eq(schema.characterDynamicStates.characterId, opts.characterId)
          )
        );
    }

    emitDashboardEvent({
      type: 'dynamic_state_updated',
      sessionId: opts.sessionId,
      payload: {
        characterId: opts.characterId,
        trustScore: newTrust,
        relationshipStage: expectedStage,
        mood: row!.mood,
        stagnation: row!.stagnation,
      },
    });

    return {
      oldTrust,
      newTrust,
      oldStage,
      newStage: expectedStage,
      stageChanged: oldStage !== expectedStage,
    };
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
