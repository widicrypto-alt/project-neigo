/**
 * Transcript search — full-text search across chat messages for a session.
 *
 * Uses Postgres `to_tsvector` / `to_tsquery` with the 'simple' config
 * for language-agnostic tokenization (works for English + Indonesian).
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

export interface TranscriptSearchResult {
  id: string;
  sessionId: string;
  turnIndex: number;
  role: string;
  speakerType: string;
  speakerId: string | null;
  content: string;
  headline: string;
  rank: number;
  createdAt: string;
}

/**
 * Search chat messages within a session (or across all user sessions)
 * using Postgres full-text search.
 *
 * @param opts.userId      Required — ensures user can only search their own messages.
 * @param opts.sessionId   Optional — scope to a single session.
 * @param opts.query       The search query (plain language, auto-converted to tsquery).
 * @param opts.limit       Max results. Default 20.
 */
export async function searchTranscript(opts: {
  userId: string;
  sessionId?: string;
  query: string;
  limit?: number;
}): Promise<TranscriptSearchResult[]> {
  const { userId, sessionId, query, limit = 20 } = opts;
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Sanitize: convert user input to a safe tsquery using plainto_tsquery
  const sessionFilter = sessionId
    ? sql`AND m.session_id = ${sessionId}`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      m.id,
      m.session_id AS "sessionId",
      m.turn_index AS "turnIndex",
      m.role,
      m.speaker_type AS "speakerType",
      m.speaker_id AS "speakerId",
      m.content,
      ts_headline('simple', m.content, plainto_tsquery('simple', ${trimmed}),
        'StartSel=**,StopSel=**,MaxWords=40,MinWords=15') AS headline,
      ts_rank(to_tsvector('simple', m.content), plainto_tsquery('simple', ${trimmed})) AS rank,
      m.created_at AS "createdAt"
    FROM chat_messages m
    JOIN chat_sessions s ON s.id = m.session_id
    WHERE s.user_id = ${userId}
      ${sessionFilter}
      AND to_tsvector('simple', m.content) @@ plainto_tsquery('simple', ${trimmed})
    ORDER BY rank DESC, m.turn_index ASC
    LIMIT ${limit}
  `);

  return result as unknown as TranscriptSearchResult[];
}
