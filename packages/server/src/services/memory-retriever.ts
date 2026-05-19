/**
 * Memory retrieval with pgvector cosine similarity (`<=>` operator).
 * Falls back to recency-ordered fetch if pgvector is not yet installed.
 *
 * T4.2: Hybrid RRF (Reciprocal Rank Fusion) combines FTS + pgvector results.
 */
import { sql as dsql, eq, and, desc } from 'drizzle-orm';
import { db, schema, sql as pg } from '../db/client.js';
import type { MemoryType } from '@neigo/shared';
import { Embeddings } from './embeddings.js';
import { nanoid } from 'nanoid';
import { env } from '../lib/env.js';

export interface MemoryHit {
  id: string;
  content: string;
  type: string;
  category: string;
  importance: number;
  emotionalTag: string | null;
  distance: number;
  createdAt: string;
}

export class MemoryRetriever {
  /** Insert a memory and compute its embedding. */
  static async insert(input: {
    userId: string;
    sessionId: string | null;
    characterId: string | null;
    type: MemoryType;
    category?: string;
    content: string;
    emotionalTag?: string | null;
    isMilestone?: boolean;
    isEpisodic?: boolean;
    importance?: number;
    chatMode?: string | null;
  }): Promise<string> {
    const id = nanoid();
    await db.insert(schema.memories).values({
      id,
      userId: input.userId,
      sessionId: input.sessionId,
      characterId: input.characterId,
      type: input.type,
      category: input.category ?? 'GENERAL',
      content: input.content,
      emotionalTag: input.emotionalTag ?? null,
      isMilestone: input.isMilestone ?? false,
      isEpisodic: input.isEpisodic ?? false,
      chatMode: input.chatMode ?? null,
      importance: input.importance ?? 0.5,
    });

    // Best-effort embedding update. Gracefully skip if pgvector column is missing.
    try {
      const vec = await Embeddings.embed(input.content);
      await pg.unsafe(
        `UPDATE memories SET embedding = $1::vector WHERE id = $2`,
        [Embeddings.toPgLiteral(vec), id] as never[],
      );
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[memory] embedding update skipped:', (err as Error).message);
      }
    }
    return id;
  }

  /** Retrieve top-K relevant memories for a query. */
  static async retrieve(opts: {
    userId: string;
    sessionId?: string | null;
    characterId?: string | null;
    query: string;
    limit?: number;
    /** Current session mood — boosts memories whose emotional tag matches. */
    currentMood?: string | null;
  }): Promise<MemoryHit[]> {
    const limit = opts.limit ?? 5;
    // Over-fetch so we can re-rank with composite score.
    const fetchLimit = Math.max(limit * 4, 20);

    try {
      const qVec = Embeddings.toPgLiteral(await Embeddings.embed(opts.query));
      const conditions: string[] = ['user_id = $1', 'embedding IS NOT NULL'];
      const params: unknown[] = [opts.userId];
      let p = 2;
      if (opts.sessionId) {
        conditions.push(`session_id = $${p++}`);
        params.push(opts.sessionId);
      }
      if (opts.characterId) {
        conditions.push(`(character_id = $${p++} OR character_id IS NULL)`);
        params.push(opts.characterId);
      }
      params.push(qVec);
      params.push(fetchLimit);
      const queryText = `
        SELECT id, content, type, category, importance, emotional_tag, created_at,
               access_count, last_accessed_at,
               (embedding <=> $${p++}::vector) AS distance
        FROM memories
        WHERE ${conditions.join(' AND ')}
        ORDER BY distance ASC
        LIMIT $${p}
      `;
      const rows = (await pg.unsafe(queryText, params as never[])) as Array<{
        id: string;
        content: string;
        type: string;
        category: string;
        importance: number;
        emotional_tag: string | null;
        distance: number;
        created_at: Date;
        access_count: number;
        last_accessed_at: Date | null;
      }>;

      // ── 5-factor importance scoring (T4.5) ──
      // Weights: recency 30%, frequency 25%, connectivity 20%, explicit 15%, type 10%
      const nowMs = Date.now();
      const mood = (opts.currentMood ?? '').toLowerCase();
      const scored = rows.map((r) => {
        let composite: number;

        if (env.MEMORY_MULTI_FACTOR_SCORE_ENABLED) {
          // Factor 1: Recency (30%) — exponential decay, half-life 7 days
          const lastAccess = r.last_accessed_at ? new Date(r.last_accessed_at).getTime() : new Date(r.created_at).getTime();
          const hoursSinceAccess = (nowMs - lastAccess) / (1000 * 60 * 60);
          const recency = Math.exp(-hoursSinceAccess / 168); // 168h = 7 days

          // Factor 2: Frequency (25%) — log scale, plateau at 20 accesses
          const frequency = Math.min(1, Math.log(1 + (r.access_count ?? 0)) / Math.log(20));

          // Factor 3: Connectivity (20%) — use semantic proximity as proxy
          // (true connectivity requires a citation graph; approximate with distance)
          const connectivity = Math.max(0, 1 - r.distance);

          // Factor 4: Explicit pin (15%) — importance > 0.8 or type PINNED
          const explicitPin = (r.importance >= 0.8 || r.type === 'PINNED') ? 1 : 0;

          // Factor 5: Type weight (10%)
          const typeWeights: Record<string, number> = {
            CORE: 1.0, PINNED: 1.0, LORE: 0.9, SUMMARY: 0.8,
            EVENT: 0.7, PREFERENCE: 0.6, GENERAL: 0.5, AMBIENT: 0.3,
          };
          const typeW = typeWeights[r.category] ?? typeWeights[r.type] ?? 0.5;

          composite = 0.30 * recency + 0.25 * frequency + 0.20 * connectivity + 0.15 * explicitPin + 0.10 * typeW;

          // Emotional mood bonus (additive, small)
          const tag = (r.emotional_tag ?? '').toLowerCase();
          if (mood && tag && this.moodTagMatches(mood, tag)) {
            composite += 0.08;
          }
        } else {
          // Legacy scoring (fallback)
          const semanticScore = Math.max(0, 1 - r.distance);
          const ageDays = (nowMs - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24);
          const recencyScore = Math.exp(-0.1 * ageDays);
          const importanceScore = r.importance;
          const tag = (r.emotional_tag ?? '').toLowerCase();
          const emotionalMatch = mood && tag && this.moodTagMatches(mood, tag) ? 0.2 : 0;
          composite = 0.45 * semanticScore + 0.20 * recencyScore + 0.20 * importanceScore + 0.15 * (emotionalMatch > 0 ? 1 : 0);
        }

        return { ...r, composite };
      });

      scored.sort((a, b) => b.composite - a.composite);
      return scored.slice(0, limit).map((r) => ({
        id: r.id,
        content: r.content,
        type: r.type,
        category: r.category,
        importance: r.importance,
        emotionalTag: r.emotional_tag,
        distance: r.distance,
        createdAt: r.created_at.toISOString(),
      }));
    } catch {
      // Fallback: recency-ordered, no vector.
      const whereClauses = [eq(schema.memories.userId, opts.userId)];
      if (opts.sessionId) whereClauses.push(eq(schema.memories.sessionId, opts.sessionId));
      const rows = await db
        .select()
        .from(schema.memories)
        .where(and(...whereClauses))
        .orderBy(desc(schema.memories.createdAt))
        .limit(limit);
      return rows.map((r) => ({
        id: r.id,
        content: r.content,
        type: r.type,
        category: r.category,
        importance: r.importance,
        emotionalTag: r.emotionalTag,
        distance: 0,
        createdAt: r.createdAt.toISOString(),
      }));
    }
  }

  /** Simple mood→tag affinity check. */
  private static moodTagMatches(mood: string, tag: string): boolean {
    const AFFINITIES: Record<string, string[]> = {
      happy:      ['joy', 'happy', 'warm', 'playful', 'love'],
      sad:        ['sad', 'melancholic', 'lonely', 'grief', 'hurt'],
      angry:      ['angry', 'frustrated', 'bitter', 'resentful'],
      vulnerable: ['vulnerable', 'tender', 'fragile', 'sad', 'hurt', 'lonely'],
      cold:       ['cold', 'distant', 'guarded', 'bitter'],
      tender:     ['tender', 'vulnerable', 'warm', 'love', 'joy'],
      guarded:    ['guarded', 'cold', 'distant', 'bitter'],
    };
    const tags = AFFINITIES[mood] ?? [];
    return tags.some((t) => tag.includes(t));
  }

  /** Get all pinned memories for a character (non-vector). */
  static async listPinned(userId: string, characterId: string): Promise<string[]> {
    const rows = await db
      .select()
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.userId, userId),
          eq(schema.memories.characterId, characterId),
          eq(schema.memories.type, 'PINNED'),
        ),
      )
      .orderBy(desc(schema.memories.importance))
      .limit(10);
    return rows.map((r) => r.content);
  }

  /**
   * T4.2 — Hybrid RRF: combines FTS (full-text search) + pgvector cosine
   * results using Reciprocal Rank Fusion scoring.
   *
   * RRF score = Σ 1 / (k + rank_i) where k=60 (constant dampening factor)
   *
   * Falls back to standard `retrieve()` if FTS is unavailable.
   */
  static async hybridSearchRRF(opts: {
    userId: string;
    sessionId?: string | null;
    characterId?: string | null;
    query: string;
    limit?: number;
    currentMood?: string | null;
  }): Promise<MemoryHit[]> {
    if (!env.MEMORY_HYBRID_RRF_ENABLED) {
      return this.retrieve(opts);
    }

    const limit = opts.limit ?? 5;
    const RRF_K = 60;

    try {
      // ── 1. Vector search (top 20) ──
      const qVec = Embeddings.toPgLiteral(await Embeddings.embed(opts.query));
      const vecConditions: string[] = ['user_id = $1', 'embedding IS NOT NULL'];
      const vecParams: unknown[] = [opts.userId];
      let p = 2;
      if (opts.sessionId) {
        vecConditions.push(`session_id = $${p++}`);
        vecParams.push(opts.sessionId);
      }
      if (opts.characterId) {
        vecConditions.push(`(character_id = $${p++} OR character_id IS NULL)`);
        vecParams.push(opts.characterId);
      }
      vecParams.push(qVec);
      const vecQuery = `
        SELECT id, content, type, category, importance, emotional_tag, created_at,
               (embedding <=> $${p++}::vector) AS distance
        FROM memories
        WHERE ${vecConditions.join(' AND ')}
        ORDER BY distance ASC
        LIMIT 20
      `;
      const vecRows = (await pg.unsafe(vecQuery, vecParams as never[])) as Array<{
        id: string;
        content: string;
        type: string;
        category: string;
        importance: number;
        emotional_tag: string | null;
        distance: number;
        created_at: Date;
      }>;

      // ── 2. FTS search (top 20) ──
      const ftsConditions: string[] = ['user_id = $1'];
      const ftsParams: unknown[] = [opts.userId];
      let fp = 2;
      if (opts.sessionId) {
        ftsConditions.push(`session_id = $${fp++}`);
        ftsParams.push(opts.sessionId);
      }
      if (opts.characterId) {
        ftsConditions.push(`(character_id = $${fp++} OR character_id IS NULL)`);
        ftsParams.push(opts.characterId);
      }
      // Sanitize query for ts_query: remove special chars, split into terms
      const terms = opts.query
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6);
      
      if (terms.length === 0) return this.retrieve(opts); // empty query fallback
      
      // Try AND logic first for precision, fallback to OR if no hits (handled by RRF combining)
      const tsQuery = terms.join(' & ');
      ftsParams.push(tsQuery);
      const ftsQuery = `
        SELECT id, content, type, category, importance, emotional_tag, created_at,
               ts_rank(to_tsvector('simple', content), to_tsquery('simple', $${fp++})) AS rank
        FROM memories
        WHERE ${ftsConditions.join(' AND ')}
          AND to_tsvector('simple', content) @@ to_tsquery('simple', $${fp - 1})
        ORDER BY rank DESC
        LIMIT 20
      `;
      let ftsRows = (await pg.unsafe(ftsQuery, ftsParams as never[])) as Array<{
        id: string;
        content: string;
        type: string;
        category: string;
        importance: number;
        emotional_tag: string | null;
        created_at: Date;
        rank: number;
      }>;

      // Fallback to OR if AND returned nothing
      if (ftsRows.length === 0 && terms.length > 1) {
        ftsParams[ftsParams.length - 1] = terms.join(' | ');
        ftsRows = (await pg.unsafe(ftsQuery, ftsParams as never[])) as any;
      }

      // ── 3. Reciprocal Rank Fusion ──
      const scoreMap = new Map<string, { score: number; row: (typeof vecRows)[0] }>();

      for (let i = 0; i < vecRows.length; i++) {
        const row = vecRows[i]!;
        const rrf = 1 / (RRF_K + i + 1);
        const existing = scoreMap.get(row.id);
        if (existing) {
          existing.score += rrf;
        } else {
          scoreMap.set(row.id, { score: rrf, row });
        }
      }

      for (let i = 0; i < ftsRows.length; i++) {
        const fRow = ftsRows[i]!;
        const rrf = 1 / (RRF_K + i + 1);
        const existing = scoreMap.get(fRow.id);
        if (existing) {
          existing.score += rrf;
        } else {
          scoreMap.set(fRow.id, {
            score: rrf,
            row: { ...fRow, distance: 1 }, // no distance from FTS-only
          });
        }
      }

      // Sort by RRF score descending
      const fused = [...scoreMap.values()].sort((a, b) => b.score - a.score).slice(0, limit);

      // ── 4. Bump access_count for returned memories ──
      const returnedIds = fused.map((f) => f.row.id);
      if (returnedIds.length > 0) {
        pg.unsafe(
          `UPDATE memories SET access_count = access_count + 1, last_accessed_at = now() WHERE id = ANY($1)`,
          [returnedIds] as never[],
        ).catch(() => {});
      }

      return fused.map((f) => ({
        id: f.row.id,
        content: f.row.content,
        type: f.row.type,
        category: f.row.category,
        importance: f.row.importance,
        emotionalTag: f.row.emotional_tag,
        distance: f.row.distance,
        createdAt: f.row.created_at.toISOString(),
      }));
    } catch {
      // Fallback to standard retrieval if FTS or vector unavailable
      return this.retrieve(opts);
    }
  }

  // silence unused-import warning for dsql in some builds
  static _dsqlRef = dsql;
}
