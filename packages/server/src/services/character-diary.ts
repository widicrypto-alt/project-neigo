/**
 * Character Diary — T4.3
 *
 * Generates 1st-person reflective diary entries from the character's
 * perspective every N turns. Cross-session retrieval lets characters
 * "remember how they felt" about past interactions.
 */
import { nanoid } from 'nanoid';
import { eq, and, desc, asc } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { AiProxy } from './ai-proxy.js';
import { env } from '../lib/env.js';
import { emitDashboardEvent } from '../lib/dashboard-events.js';

const DIARY_INTERVAL = 10; // Write diary every N turns
const DIARY_MAX_TOKENS = 250;
const DIARY_RETRIEVE_LIMIT = 2;

export interface DiaryEntry {
  id: string;
  entry: string;
  mood: string | null;
  turnRangeStart: number;
  turnRangeEnd: number;
  createdAt: string;
}

/**
 * Check if a diary write should trigger for the current turn.
 */
export function shouldWriteDiary(turnCount: number): boolean {
  return env.CHARACTER_DIARY_ENABLED && turnCount > 0 && turnCount % DIARY_INTERVAL === 0;
}

/**
 * Write a diary entry by summarizing recent turns from the character's perspective.
 * Fire-and-forget — call after emit({ type: 'done' }).
 */
export async function writeDiaryEntry(opts: {
  sessionId: string;
  characterId: string;
  userId: string;
  characterName: string;
  turnRangeStart: number;
  turnRangeEnd: number;
}): Promise<void> {
  if (!env.CHARACTER_DIARY_ENABLED) return;

  // Fetch messages in the turn range
  const messages = await db.query.chatMessages.findMany({
    where: and(
      eq(schema.chatMessages.sessionId, opts.sessionId),
    ),
    orderBy: asc(schema.chatMessages.turnIndex),
  });

  const rangeMessages = messages.filter(
    (m) => m.turnIndex >= opts.turnRangeStart * 2 && m.turnIndex <= opts.turnRangeEnd * 2 + 1,
  );

  if (rangeMessages.length < 4) return; // Not enough content for diary

  const transcript = rangeMessages
    .slice(-20) // Max 20 messages to keep prompt small
    .map((m) => `${m.role === 'USER' ? 'User' : opts.characterName}: ${m.content.slice(0, 300)}`)
    .join('\n');

  const systemPrompt = [
    `You are ${opts.characterName}. Write a brief 1st-person diary entry (1-2 paragraphs) reflecting on the interaction below.`,
    '',
    'Focus on:',
    '- How you FELT about what happened (emotions, not events)',
    '- Your impressions of the user (trust, curiosity, frustration, tenderness, etc)',
    '- Any unresolved feelings or things left unsaid',
    '',
    'Write naturally, as if confiding in a private journal. End with a single-word mood tag in brackets like [melancholic] or [warm].',
    '',
    '## Recent Interaction:',
    transcript,
  ].join('\n');

  try {
    const result = await AiProxy.complete({
      model: env.AI_MODEL,
      messages: [{ role: 'system', content: systemPrompt }],
      temperature: 0.7,
      maxTokens: DIARY_MAX_TOKENS,
    });

    const text = result.content.trim();
    if (!text || text.length < 30) return;

    // Extract mood from [bracket] at end
    const moodMatch = text.match(/\[(\w+)\]\s*$/);
    const mood = moodMatch ? moodMatch[1] : null;
    const entry = moodMatch ? text.replace(/\s*\[\w+\]\s*$/, '').trim() : text;

    await db.insert(schema.characterDiary).values({
      id: nanoid(),
      sessionId: opts.sessionId,
      characterId: opts.characterId,
      userId: opts.userId,
      turnRangeStart: opts.turnRangeStart,
      turnRangeEnd: opts.turnRangeEnd,
      entry,
      mood,
    });
  } catch (err) {
    console.warn('[character-diary] write failed:', (err as Error).message);
  }
}

/**
 * Retrieve the most recent diary entries for a (character, user) pair
 * across ALL sessions — enables cross-session emotional continuity.
 */
export async function retrieveDiaryEntries(opts: {
  characterId: string;
  userId: string;
  limit?: number;
}): Promise<DiaryEntry[]> {
  if (!env.CHARACTER_DIARY_ENABLED) return [];

  const rows = await db
    .select()
    .from(schema.characterDiary)
    .where(
      and(
        eq(schema.characterDiary.characterId, opts.characterId),
        eq(schema.characterDiary.userId, opts.userId),
      ),
    )
    .orderBy(desc(schema.characterDiary.createdAt))
    .limit(opts.limit ?? DIARY_RETRIEVE_LIMIT);

  return rows.map((r) => ({
    id: r.id,
    entry: r.entry,
    mood: r.mood,
    turnRangeStart: r.turnRangeStart,
    turnRangeEnd: r.turnRangeEnd,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Build prompt block from diary entries for system prompt injection.
 */
export function buildDiaryPromptBlock(
  entries: DiaryEntry[],
  characterName: string,
): string | null {
  if (entries.length === 0) return null;
  const lines = [
    `## ${characterName}'s Inner Reflections (private — do NOT quote these verbatim)`,
    `These are ${characterName}'s private diary entries about their relationship with the user.`,
    'Let these feelings inform your tone and emotional responses naturally:',
    '',
  ];
  for (const e of entries) {
    const moodTag = e.mood ? ` [${e.mood}]` : '';
    lines.push(`> ${e.entry}${moodTag}`);
    lines.push('');
  }
  return lines.join('\n');
}
