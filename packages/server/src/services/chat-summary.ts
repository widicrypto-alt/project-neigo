/**
 * Wk13 PLANv2 H12 — Chat summary popover.
 *
 * Cheap, on-demand 3-bullet gist of the last N turns. Not a replacement
 * for context-compaction — that one is O(turns) and structural; this is
 * O(1) and purely for the "what was this chat about?" hover UX.
 *
 * Results are cached inside chat_sessions.metadata.lastSummary keyed by
 * the most-recent message id so a re-open doesn't re-spend tokens.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { env } from '../lib/env.js';
import { AiProxy } from './ai-proxy.js';

export interface ChatSummary {
  bullets: string[];
  headline: string;
  /** lastMessageId at the time this summary was generated. */
  sourceMessageId: string;
  generatedAt: string;
}

const SYSTEM = `Summarise a roleplay chat. Output strict JSON:
{"headline":"<=10 words","bullets":["bullet 1","bullet 2","bullet 3"]}
Bullets must be concrete: named events, decisions, relationship shifts. \
No meta ("the user chatted..."). No repetition. Indonesian if chat is \
Indonesian, otherwise English.`;

function extractJson(raw: string): { headline?: string; bullets?: string[] } | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  try {
    return JSON.parse(body.slice(first, last + 1));
  } catch {
    return null;
  }
}

export async function summariseSession(
  sessionId: string,
  userId: string,
  opts: { turns?: number; force?: boolean } = {},
): Promise<ChatSummary | null> {
  const session = await db.query.chatSessions.findFirst({
    where: and(
      eq(schema.chatSessions.id, sessionId),
      eq(schema.chatSessions.userId, userId),
    ),
  });
  if (!session) return null;

  const lastMsg = await db.query.chatMessages.findFirst({
    where: eq(schema.chatMessages.sessionId, sessionId),
    orderBy: desc(schema.chatMessages.createdAt),
  });
  if (!lastMsg) return null;

  // Cache hit: metadata.lastSummary.sourceMessageId matches tail.
  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  const cached = meta.lastSummary as ChatSummary | undefined;
  if (!opts.force && cached && cached.sourceMessageId === lastMsg.id) {
    return cached;
  }

  const turnsToFetch = Math.max(4, Math.min(40, opts.turns ?? 20));
  const recent = await db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.sessionId, sessionId))
    .orderBy(desc(schema.chatMessages.turnIndex))
    .limit(turnsToFetch * 2);
  const ordered = [...recent].reverse();

  const transcript = ordered
    .map((m) => {
      const who =
        m.speakerType === 'USER'
          ? 'USER'
          : m.speakerType === 'NARRATOR'
            ? 'NARRATOR'
            : 'CHAR';
      return `[${who}] ${m.content.replace(/\s+/g, ' ').slice(0, 600)}`;
    })
    .join('\n');

  const prompt = `Chat transcript (most recent ${ordered.length} messages):\n${transcript}`;

  const res = await AiProxy.complete({
    model: env.AI_LIGHT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    maxTokens: 300,
    userId,
  });

  const parsed = extractJson(res.content ?? '');
  const headline =
    typeof parsed?.headline === 'string'
      ? parsed.headline.trim().slice(0, 120)
      : '';
  const bullets = Array.isArray(parsed?.bullets)
    ? parsed.bullets
        .map((b) => (typeof b === 'string' ? b.trim().slice(0, 200) : ''))
        .filter((b) => b.length > 0)
        .slice(0, 5)
    : [];

  if (!headline && bullets.length === 0) return null;

  const summary: ChatSummary = {
    headline: headline || 'Chat summary',
    bullets,
    sourceMessageId: lastMsg.id,
    generatedAt: new Date().toISOString(),
  };

  // Cache on session.metadata.lastSummary. Best-effort — never blocks.
  try {
    await db
      .update(schema.chatSessions)
      .set({
        metadata: { ...meta, lastSummary: summary },
      })
      .where(eq(schema.chatSessions.id, sessionId));
  } catch (err) {
    console.warn('[chat-summary] cache write failed', err);
  }

  return summary;
}

// Guard re-export for tests / future reuse.
export const _internal = { extractJson };
