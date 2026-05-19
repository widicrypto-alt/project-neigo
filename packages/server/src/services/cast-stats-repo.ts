/**
 * Harem stats repository: ensure-rows + stat deltas + snapshot fetch.
 */
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import type { HaremStats } from '@neigo/shared';

type Row = typeof schema.haremStats.$inferSelect;
function hydrate(r: Row): HaremStats {
  return {
    sessionId: r.sessionId,
    characterId: r.characterId,
    affection: r.affection,
    loyalty: r.loyalty,
    jealousy: r.jealousy,
    voiceScore: r.voiceScore,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export class HaremStatsRepo {
  static async ensureRows(sessionId: string, characterIds: string[]) {
    if (characterIds.length === 0) return;
    const existing = await db
      .select()
      .from(schema.haremStats)
      .where(
        and(
          eq(schema.haremStats.sessionId, sessionId),
          inArray(schema.haremStats.characterId, characterIds),
        ),
      );
    const have = new Set(existing.map((r) => r.characterId));
    const missing = characterIds.filter((id) => !have.has(id));
    if (missing.length === 0) return;
    await db
      .insert(schema.haremStats)
      .values(missing.map((id) => ({ sessionId, characterId: id })))
      .onConflictDoNothing(); // Safety: don't error if it concurrently inserted
  }

  static async list(sessionId: string): Promise<HaremStats[]> {
    const rows = await db
      .select()
      .from(schema.haremStats)
      .where(eq(schema.haremStats.sessionId, sessionId));
    return rows.map(hydrate);
  }

  static async map(sessionId: string): Promise<Map<string, HaremStats>> {
    const list = await this.list(sessionId);
    return new Map(list.map((s) => [s.characterId, s]));
  }

  static async applyDelta(opts: {
    sessionId: string;
    characterId: string;
    affection?: number;
    loyalty?: number;
    jealousy?: number;
    voice?: number;
  }): Promise<{ old: HaremStats; updated: HaremStats }> {
    const defaultStats = {
      affection: 500,
      loyalty: 500,
      jealousy: 0,
      voiceScore: 0.5,
    };

    const deltaAffection = opts.affection ?? 0;
    const deltaLoyalty = opts.loyalty ?? 0;
    const deltaJealousy = opts.jealousy ?? 0;
    const deltaVoice = (opts.voice ?? 0) / 100;

    const [row] = await db.insert(schema.haremStats)
      .values({
        sessionId: opts.sessionId,
        characterId: opts.characterId,
        affection: clamp(defaultStats.affection + deltaAffection, 0, 1000),
        loyalty: clamp(defaultStats.loyalty + deltaLoyalty, 0, 1000),
        jealousy: clamp(defaultStats.jealousy + deltaJealousy, 0, 5),
        voiceScore: clamp(defaultStats.voiceScore + deltaVoice, 0, 1),
      })
      .onConflictDoUpdate({
        target: [schema.haremStats.sessionId, schema.haremStats.characterId],
        set: {
          affection: sql`LEAST(1000, GREATEST(0, ${schema.haremStats.affection} + ${deltaAffection}))`,
          loyalty: sql`LEAST(1000, GREATEST(0, ${schema.haremStats.loyalty} + ${deltaLoyalty}))`,
          jealousy: sql`LEAST(5, GREATEST(0, ${schema.haremStats.jealousy} + ${deltaJealousy}))`,
          voiceScore: sql`LEAST(1, GREATEST(0, ${schema.haremStats.voiceScore} + ${deltaVoice}))`,
          updatedAt: new Date(),
        }
      })
      .returning();

    const updated = hydrate(row!);

    // Derive approximate 'old' state to avoid a read-before-write query
    const old: HaremStats = {
      ...updated,
      affection: clamp(updated.affection - deltaAffection, 0, 1000),
      loyalty: clamp(updated.loyalty - deltaLoyalty, 0, 1000),
      jealousy: clamp(updated.jealousy - deltaJealousy, 0, 5),
      voiceScore: clamp(updated.voiceScore - deltaVoice, 0, 1),
    };

    return { old, updated };
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
