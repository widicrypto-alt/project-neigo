/**
 * PLANv2 post-wk14 — Cross-session character diary rollup.
 *
 * Every night the cron picks each (user, character) pair that saw chat
 * activity in the past 24 h and asks the light AI model to write a 1–2
 * paragraph first-person reflection from the character's point of view.
 * The entry is persisted in `character_diary` and later consulted by the
 * prompt builder so callbacks ("kemarin aku ..." ) stay grounded.
 *
 * Idempotency: we key on `character_diary` existence within the rollup
 * window — if a row already exists for (character, user) with
 * created_at >= windowStart we skip. That lets operators rerun the cron
 * without generating duplicates.
 */
import { nanoid } from 'nanoid';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { AiProxy } from './ai-proxy.js';
import { env } from '../lib/env.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGES_PER_PAIR = 60;
const MAX_PAIRS_PER_RUN = 200;

interface ActivePair {
  userId: string;
  characterId: string;
  sessionId: string;
  maxTurn: number;
  minTurn: number;
}

/** Find (user, character) pairs that had at least 4 user+char messages in the window. */
async function findActivePairs(since: Date): Promise<ActivePair[]> {
  // Pick the most-recent active session per (user, character) — keeps the
  // rollup grounded in one scene instead of trying to merge across parallel
  // sessions (which would risk contradictions).
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (s.user_id, s.character_id)
      s.user_id       AS "userId",
      s.character_id  AS "characterId",
      s.id            AS "sessionId",
      MAX(m.turn_index) AS "maxTurn",
      MIN(m.turn_index) AS "minTurn"
    FROM chat_sessions s
    JOIN chat_messages m ON m.session_id = s.id
    WHERE m.created_at >= ${since}
    GROUP BY s.user_id, s.character_id, s.id, s.last_message_at
    HAVING COUNT(*) >= 4
    ORDER BY s.user_id, s.character_id, s.last_message_at DESC
    LIMIT ${MAX_PAIRS_PER_RUN}
  `);
  // drizzle returns { rows: [...] } on pg client; be defensive.
  const list = (rows as unknown as { rows?: ActivePair[] }).rows ?? (rows as unknown as ActivePair[]);
  return Array.isArray(list) ? list : [];
}

async function alreadyRolledUp(
  characterId: string,
  userId: string,
  since: Date,
): Promise<boolean> {
  const existing = await db
    .select({ id: schema.characterDiary.id })
    .from(schema.characterDiary)
    .where(
      and(
        eq(schema.characterDiary.characterId, characterId),
        eq(schema.characterDiary.userId, userId),
        gt(schema.characterDiary.createdAt, since),
      ),
    )
    .limit(1);
  return existing.length > 0;
}

async function generateEntry(pair: ActivePair, since: Date): Promise<{
  entry: string;
  mood: string | null;
} | null> {
  const msgs = await db
    .select({
      role: schema.chatMessages.role,
      speakerType: schema.chatMessages.speakerType,
      content: schema.chatMessages.content,
    })
    .from(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.sessionId, pair.sessionId),
        gt(schema.chatMessages.createdAt, since),
      ),
    )
    .orderBy(asc(schema.chatMessages.turnIndex))
    .limit(MAX_MESSAGES_PER_PAIR);
  if (msgs.length < 4) return null;

  const char = await db.query.characters.findFirst({
    where: eq(schema.characters.id, pair.characterId),
    columns: { id: true, name: true, persona: true },
  });
  if (!char) return null;
  const persona = (char.persona ?? {}) as Record<string, string>;

  const transcript = msgs
    .map((m) => {
      const who =
        m.speakerType === 'USER' ? 'USER' : m.speakerType === 'NARRATOR' ? 'NARRATOR' : char.name;
      return `${who}: ${m.content.slice(0, 400)}`;
    })
    .join('\n');

  const systemPrompt = [
    `You are ${char.name}. ${String(persona.personality ?? '').slice(0, 400)}`,
    'Write a short, intimate diary entry (1–2 paragraphs, < 180 words) reflecting',
    'on the interactions below. First person. Not a summary — a feeling.',
    'Include ONE dominant mood label at the end on its own line as: MOOD: <one-word>.',
    'Match the conversation language (Indonesian / English / etc).',
  ].join('\n');

  const result = await AiProxy.complete({
    model: env.AI_LIGHT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: transcript },
    ],
    temperature: 0.7,
    maxTokens: 320,
  });
  const text = result.content.trim();
  if (!text) return null;
  const moodMatch = text.match(/MOOD:\s*([a-zA-Z\u00C0-\uFFFF\-]+)\s*$/i);
  const mood = moodMatch && moodMatch[1] ? moodMatch[1].toLowerCase() : null;
  const entry = moodMatch ? text.replace(moodMatch[0], '').trim() : text;
  return { entry, mood };
}

export async function runDiaryRollup(opts?: { now?: Date }): Promise<{
  candidates: number;
  written: number;
  skipped: number;
}> {
  const now = opts?.now ?? new Date();
  const since = new Date(now.getTime() - WINDOW_MS);
  const pairs = await findActivePairs(since);
  let written = 0;
  let skipped = 0;
  for (const p of pairs) {
    if (await alreadyRolledUp(p.characterId, p.userId, since)) {
      skipped++;
      continue;
    }
    try {
      const gen = await generateEntry(p, since);
      if (!gen) {
        skipped++;
        continue;
      }
      await db.insert(schema.characterDiary).values({
        id: nanoid(),
        sessionId: p.sessionId,
        characterId: p.characterId,
        userId: p.userId,
        turnRangeStart: p.minTurn,
        turnRangeEnd: p.maxTurn,
        entry: gen.entry,
        mood: gen.mood,
      });
      written++;
    } catch (err) {
      console.warn('[diary-rollup] pair failed', { pair: p, err: (err as Error).message });
      skipped++;
    }
  }
  return { candidates: pairs.length, written, skipped };
}

/** Fetch a character's recent diary entries for prompt injection. */
export async function recentDiaryEntries(
  userId: string,
  characterId: string,
  limit = 3,
): Promise<Array<{ entry: string; mood: string | null; createdAt: Date }>> {
  const rows = await db
    .select({
      entry: schema.characterDiary.entry,
      mood: schema.characterDiary.mood,
      createdAt: schema.characterDiary.createdAt,
    })
    .from(schema.characterDiary)
    .where(
      and(
        eq(schema.characterDiary.userId, userId),
        eq(schema.characterDiary.characterId, characterId),
      ),
    )
    .orderBy(desc(schema.characterDiary.createdAt))
    .limit(limit);
  return rows;
}
