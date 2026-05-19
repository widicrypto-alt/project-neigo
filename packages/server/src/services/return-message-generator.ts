/**
 * Day-2 Return Message Generator
 *
 * When a user opens a session that has been idle for 24h+, this service
 * generates an AI-initiated continuation message. The character picks up
 * from the `unresolved_beat` — never a "welcome back!" greeting.
 *
 * Called by `POST /api/chat/:sessionId/return` or automatically by the
 * web client on session re-open.
 */
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import {
  AI_MODEL_CONFIG,
  DEFAULT_AI_MODEL,
} from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { AiProxy, type AiMessage } from './ai-proxy.js';

const IDLE_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours (generous for beta)

function modelSlug(_aiModel?: string | null): string {
  return AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug;
}

export interface ReturnResult {
  generated: boolean;
  messageId?: string;
  content?: string;
}

/**
 * Generate a return message if the session has been idle long enough.
 * Idempotent — returns `{ generated: false }` if already done or gap too short.
 */
export async function generateReturnMessage(opts: {
  sessionId: string;
  userId: string;
}): Promise<ReturnResult> {
  const { sessionId, userId } = opts;

  const session = await db.query.chatSessions.findFirst({
    where: eq(schema.chatSessions.id, sessionId),
  });
  if (!session || session.userId !== userId) {
    return { generated: false };
  }

  // Check idle gap.
  const lastMsg = session.lastMessageAt;
  const gap = Date.now() - new Date(lastMsg).getTime();
  if (gap < IDLE_THRESHOLD_MS) {
    return { generated: false };
  }

  // Don't generate if turnCount is 0 (never chatted) or very low (still in opening).
  if (session.turnCount < 3) {
    return { generated: false };
  }

  // Check if we already generated a return message for this gap
  // by looking for a recent NARRATOR message that is a return beat.
  const recentMessages = await db.query.chatMessages.findMany({
    where: eq(schema.chatMessages.sessionId, sessionId),
    orderBy: (m, { desc }) => [desc(m.createdAt)],
    limit: 2,
  });
  // If the last message is already from assistant and recent (< 1h), skip.
  const lastAssistant = recentMessages.find((m) => m.role === 'ASSISTANT');
  if (
    lastAssistant &&
    Date.now() - new Date(lastAssistant.createdAt).getTime() < 60 * 60 * 1000
  ) {
    return { generated: false };
  }

  // Load character.
  const charRow = await db.query.characters.findFirst({
    where: eq(schema.characters.id, session.characterId),
  });
  if (!charRow) return { generated: false };

  // Character persona fields are stored as JSONB.
  const persona = (charRow.persona ?? {}) as Record<string, unknown>;
  const charName = charRow.name;
  const personality = String(persona.personality ?? '');
  const speechStyle = String(persona.speechStyle ?? '');

  // Build prompt.
  const unresolvedBeat = session.unresolvedBeat;
  const latentQuestion = session.latentQuestion;
  const callbackCandidate = session.callbackCandidate;

  const gapHours = Math.round(gap / (60 * 60 * 1000));
  const gapLabel =
    gapHours >= 48
      ? `${Math.round(gapHours / 24)} days`
      : `${gapHours} hours`;

  const prompt: AiMessage[] = [
    {
      role: 'system',
      content: [
        `You are ${charName}. ${personality.slice(0, 400)}`,
        speechStyle ? `Speech style: ${speechStyle}` : '',
        '',
        `The user has been away for approximately ${gapLabel}.`,
        'Write a SINGLE message (1–3 sentences) as if picking up mid-thought.',
        '',
        'RULES:',
        '- Do NOT say "welcome back" or acknowledge the absence directly.',
        '- Do NOT greet. Do NOT use exclamation points.',
        '- Reference something unfinished from before, as if it\'s been on your mind.',
        '- Use your speech style. Hesitation is allowed.',
        '- The user should feel you continued existing while they were gone.',
        '',
        unresolvedBeat
          ? `Unfinished thread from last session: "${unresolvedBeat}"`
          : '',
        latentQuestion
          ? `Something you\'ve been wondering about them: "${latentQuestion}"`
          : '',
        callbackCandidate
          ? `Something they said that stuck with you: "${callbackCandidate}"`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  const slug = modelSlug(session.aiModel);
  const result = await AiProxy.complete({
    model: slug,
    messages: prompt,
    temperature: 0.75,
    maxTokens: 200,
  });

  const content = result.content.trim();
  if (!content) return { generated: false };

  // Persist as a CHARACTER message.
  const msgId = nanoid();
  await db.insert(schema.chatMessages).values({
    id: msgId,
    sessionId,
    turnIndex: session.turnCount * 2 + 1,
    role: 'ASSISTANT',
    speakerType: 'CHARACTER',
    speakerId: charRow.id,
    content,
    passType: 'CHARACTER_MAIN',
    turnId: nanoid(),
    tokenCount: result.totalTokens,
  });

  // Bump lastMessageAt (but not turnCount — this isn't a user-initiated turn).
  await db
    .update(schema.chatSessions)
    .set({ lastMessageAt: new Date() })
    .where(eq(schema.chatSessions.id, sessionId));

  return { generated: true, messageId: msgId, content };
}
