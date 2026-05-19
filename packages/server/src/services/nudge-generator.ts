/**
 * Silent-user follow-up (the "20 second nudge").
 *
 * When a user opens a session via `/open` but stays silent, the character
 * should press the silence with a one-liner. Previously this was triggered
 * by a client-side 20 s `setTimeout`, which failed if the tab was closed.
 *
 * The logic lives here so both the legacy HTTP route `POST /chat/:id/nudge`
 * and the BullMQ worker `session-nudge` can share the same guards and
 * prompt — avoiding drift between the two entry points.
 */
import { nanoid } from 'nanoid';
import { and, asc, count, eq } from 'drizzle-orm';
import { AI_MODEL_CONFIG, DEFAULT_AI_MODEL } from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { AiProxy } from './ai-proxy.js';
import { logSessionEvent } from './session-event-log.js';

export interface NudgeResult {
  generated: boolean;
  messageId?: string;
  content?: string;
  characterId?: string;
}

/**
 * Run the guards + AI call needed to emit a nudge. Idempotent: re-running
 * on the same session returns `{ generated: false }` once any USER message
 * exists or once turnCount has moved past the "just-opened" state.
 */
export async function generateNudgeMessage(opts: {
  sessionId: string;
  userId: string;
  /** Where this nudge was invoked from — recorded in the session_events payload. */
  source: 'manual' | 'queue' | 'schedule';
  /** Optional authored hint from a user-configured schedule. */
  note?: string;
}): Promise<NudgeResult> {
  const { sessionId, userId, source } = opts;

  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return { generated: false };
  // Nudge only applies to the immediate post-/open state (narrator + character
  // beats emitted, user hasn't spoken). Anything else = session advanced or is
  // already stale. Scheduled messages bypass this gate because they are the
  // user's explicit intent to hear from the character at a later time.
  if (source !== 'schedule' && session.turnCount !== 2) return { generated: false };

  const userMsgs = await db
    .select({ cnt: count() })
    .from(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.sessionId, sessionId),
        eq(schema.chatMessages.speakerType, 'USER'),
      ),
    );
  // Scheduled messages are explicitly authored by the user to arrive later
  // in an ongoing chat — skip the "no user messages yet" gate.
  if (source !== 'schedule' && userMsgs[0] && userMsgs[0].cnt > 0)
    return { generated: false };

  const mainCharRow = await db.query.characters.findFirst({
    where: eq(schema.characters.id, session.characterId),
  });
  if (!mainCharRow) return { generated: false };
  const persona = (mainCharRow.persona ?? {}) as Record<string, string>;
  const characterName = mainCharRow.name;
  const personality = persona.personality ?? '';
  const speechStyle = persona.speechStyle ?? '';

  const existingMsgs = await db.query.chatMessages.findMany({
    where: eq(schema.chatMessages.sessionId, sessionId),
    orderBy: asc(schema.chatMessages.turnIndex),
  });
  const context = existingMsgs.map((m) => ({
    role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }));

  const nudgePrompt = [
    `You are ${characterName}. ${personality.slice(0, 300)}`,
    speechStyle ? `Speech style: ${speechStyle}` : '',
    '',
    source === 'schedule'
      ? 'You decided to reach out to the user right now, on your own, because time has passed since you last spoke.'
      : 'The user is silent. They haven\'t spoken yet. You initiated the scene.',
    source === 'schedule' && opts.note
      ? `Your reason for reaching out: ${opts.note.slice(0, 280)}`
      : '',
    'Write ONE short follow-up line (1 sentence max). Press the silence naturally.',
    'Examples: a sigh, a glance, an aside, tapping fingers, a half-question.',
    'Do NOT greet. Do NOT ask "are you okay?" Do NOT break the fourth wall.',
    'Use hesitation: "..." or em-dash or trailing off.',
  ]
    .filter(Boolean)
    .join('\n');

  const result = await AiProxy.complete({
    model: AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug,
    messages: [...context, { role: 'system', content: nudgePrompt }],
    temperature: 0.85,
    maxTokens: 80,
  });

  const content = result.content.trim();
  if (!content || content.length < 3) return { generated: false };

  const msgId = nanoid();
  await db.insert(schema.chatMessages).values({
    id: msgId,
    sessionId,
    turnIndex: existingMsgs.length,
    role: 'ASSISTANT',
    speakerType: 'CHARACTER',
    speakerId: mainCharRow.id,
    content,
    passType: 'CHARACTER_MAIN',
    turnId: nanoid(),
    tokenCount: 0,
  });

  logSessionEvent({
    sessionId,
    userId,
    characterId: mainCharRow.id,
    eventType: 'nudge_triggered',
    payload: { contentLen: content.length, source },
    turnIndex: existingMsgs.length,
  });

  return { generated: true, content, messageId: msgId, characterId: mainCharRow.id };
}
