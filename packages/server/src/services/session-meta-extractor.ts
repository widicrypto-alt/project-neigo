/**
 * Session Meta Extractor — lightweight post-turn service that fills in
 * retention-critical session columns:
 *
 * - `latentQuestion`  — character's private question for the session
 *                       (set on turn 0, never overwritten).
 * - `unresolvedBeat`  — Day-2 hook: incomplete beat left by character
 *                       (overwritten at end-of-session / high-drama turns).
 * - `callbackCandidate` — a user utterance tagged for Day 3 oblique reference
 *                         (set once from the first 5 user messages).
 *
 * Each extraction is a single short AI call. All three run fire-and-forget
 * so they never block the SSE stream.
 */
import { eq, sql as dsql } from 'drizzle-orm';
import { AI_MODEL_CONFIG, DEFAULT_AI_MODEL } from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { AiProxy, type AiMessage } from './ai-proxy.js';
import { assertFact } from './character-facts.js';
import { env } from '../lib/env.js';

function modelSlug(_aiModel?: string | null): string {
  return AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug;
}

/**
 * Generate the character's private latent question for this session.
 * Runs once on the first turn (turnCount === 0).
 */
export async function extractLatentQuestion(opts: {
  sessionId: string;
  characterName: string;
  characterPersonality: string;
  userMessage: string;
}): Promise<void> {
  try {
    const prompt: AiMessage[] = [
      {
        role: 'system',
        content: [
          `You are ${opts.characterName}. Personality: ${opts.characterPersonality.slice(0, 300)}`,
          '',
          `The user just said: "${opts.userMessage.slice(0, 500)}"`,
          '',
          'Based on this first interaction, what ONE private question does the character hold about this person?',
          'This question is never spoken aloud — it colors the character\'s behavior for the rest of the session.',
          'Respond with ONLY the question (one sentence, no quotes, no explanation).',
        ].join('\n'),
      },
    ];
    const res = await AiProxy.complete({
      model: modelSlug(),
      messages: prompt,
      temperature: 0.7,
      maxTokens: 80,
    });
    const question = res.content.trim().slice(0, 500);
    if (question.length > 5) {
      await db
        .update(schema.chatSessions)
        .set({ latentQuestion: question })
        .where(eq(schema.chatSessions.id, opts.sessionId));
    }
  } catch {
    // Non-critical — silently swallow.
  }
}

/**
 * Extract an unresolved beat from the last AI response. This becomes the
 * Day-2 hook ("There's something I— never mind. Tomorrow.").
 * Runs every 10 turns and at session end, overwriting the previous value.
 */
export async function extractUnresolvedBeat(opts: {
  sessionId: string;
  characterName: string;
  lastAiResponse: string;
}): Promise<void> {
  try {
    const prompt: AiMessage[] = [
      {
        role: 'system',
        content: [
          `Character: ${opts.characterName}`,
          `Last response: "${opts.lastAiResponse.slice(0, 800)}"`,
          '',
          'Extract ONE short unresolved emotional beat from this response — something the character started but didn\'t finish, hinted at but pulled back from, or implied without saying.',
          'If no natural beat exists, invent one that the character *would* leave unresolved.',
          'Write it as a brief narrative fragment (max 30 words). No quotes, no explanation.',
        ].join('\n'),
      },
    ];
    const res = await AiProxy.complete({
      model: modelSlug(),
      messages: prompt,
      temperature: 0.75,
      maxTokens: 60,
    });
    const beat = res.content.trim().slice(0, 300);
    if (beat.length > 5) {
      await db
        .update(schema.chatSessions)
        .set({ unresolvedBeat: beat })
        .where(eq(schema.chatSessions.id, opts.sessionId));
    }
  } catch {
    // Non-critical.
  }
}

/**
 * Tag one early user utterance as a callback candidate for Day 3 reference.
 * Only runs during turns 1–5 and only if no candidate is set yet.
 */
export async function extractCallbackCandidate(opts: {
  sessionId: string;
  userMessage: string;
  currentCandidate: string | null;
}): Promise<void> {
  // Only tag once.
  if (opts.currentCandidate) return;
  try {
    const prompt: AiMessage[] = [
      {
        role: 'system',
        content: [
          'You are a retention analyst. The user just said:',
          `"${opts.userMessage.slice(0, 500)}"`,
          '',
          'Does this message contain a specific personal detail, preference, memory, or opinion that a character could reference obliquely 2 days later to create a "they remembered" moment?',
          '',
          'If YES: respond with ONLY the key detail (short phrase, max 15 words).',
          'If NO: respond with exactly "SKIP".',
        ].join('\n'),
      },
    ];
    const res = await AiProxy.complete({
      model: modelSlug(),
      messages: prompt,
      temperature: 0.3,
      maxTokens: 40,
    });
    const candidate = res.content.trim();
    if (candidate.length > 3 && !candidate.toUpperCase().startsWith('SKIP')) {
      await db
        .update(schema.chatSessions)
        .set({ callbackCandidate: candidate.slice(0, 300) })
        .where(eq(schema.chatSessions.id, opts.sessionId));
    }
  } catch {
    // Non-critical.
  }
}

/**
 * Score how much a user message obliquely addresses the session's latent question.
 * Returns a 0–1 score. If the score crosses a threshold, the character warms up;
 * otherwise, accumulated non-addressing leads to coldness in future sessions.
 *
 * Uses keyword overlap + AI scoring for borderline cases.
 * This is intentionally lightweight — runs on every turn if latentQuestion is set.
 */
export async function scoreLatentQuestion(opts: {
  sessionId: string;
  latentQuestion: string;
  userMessage: string;
}): Promise<{ addressed: boolean; score: number }> {
  // Quick heuristic: keyword overlap (skip AI call if obviously unrelated)
  const qWords = new Set(
    opts.latentQuestion.toLowerCase().replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter((w) => w.length > 3),
  );
  const msgWords = opts.userMessage.toLowerCase().replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter((w) => w.length > 3);
  const overlap = msgWords.filter((w) => qWords.has(w)).length;
  const quickScore = qWords.size > 0 ? overlap / qWords.size : 0;

  // If keyword overlap is very low and message is short, skip AI call.
  if (quickScore < 0.1 && msgWords.length < 8) {
    return { addressed: false, score: quickScore };
  }

  try {
    const prompt: AiMessage[] = [
      {
        role: 'system',
        content: [
          `A character secretly holds this private question about the user:`,
          `"${opts.latentQuestion}"`,
          '',
          `The user just said:`,
          `"${opts.userMessage.slice(0, 500)}"`,
          '',
          'Rate 0.0–1.0 how much the user message obliquely or directly touches on the question.',
          '0.0 = completely unrelated. 0.5 = tangential. 1.0 = directly answers it.',
          'Respond with ONLY the number (e.g. "0.3").',
        ].join('\n'),
      },
    ];
    const res = await AiProxy.complete({
      model: modelSlug(),
      messages: prompt,
      temperature: 0.2,
      maxTokens: 10,
    });
    const parsed = parseFloat(res.content.trim());
    const score = isNaN(parsed) ? quickScore : Math.max(0, Math.min(1, parsed));
    const addressed = score >= 0.4;

    // Persist the best score in metadata.
    if (addressed) {
      await db.execute(
        dsql`UPDATE chat_sessions
             SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ latentQuestionAddressed: true, latentQuestionScore: score })}::jsonb
             WHERE id = ${opts.sessionId}`,
      );
    }
    return { addressed, score };
  } catch {
    return { addressed: quickScore >= 0.4, score: quickScore };
  }
}

/**
 * T4.9: Extract state-change facts from the latest turn and assert them
 * into the temporal fact graph. Runs fire-and-forget after each turn.
 *
 * The AI identifies (subject, predicate, object) triples that changed
 * during this exchange. Only meaningful state transitions are recorded.
 */
export async function extractFactsFromTurn(opts: {
  sessionId: string;
  characterId: string;
  characterName: string;
  userMessage: string;
  aiResponse: string;
  sourceMessageId?: string;
}): Promise<void> {
  if (!env.CHARACTER_FACTS_GRAPH_ENABLED) return;

  try {
    const prompt: AiMessage[] = [
      {
        role: 'system',
        content: [
          'You are a state-change extractor for a roleplay session.',
          `Character: ${opts.characterName}`,
          '',
          'From the exchange below, extract any facts that CHANGED or were ESTABLISHED.',
          'Facts are (subject, predicate, object) triples.',
          '',
          'Examples:',
          '  Lysandra | trust_toward_user | 45',
          '  Lysandra | mood | melancholic',
          '  user | location | library',
          '  Lysandra | knows_user_secret | true',
          '',
          'Rules:',
          '- Only extract facts that clearly changed or were newly established.',
          '- Subject is a character name, "user", or an entity.',
          '- Predicate is a snake_case attribute.',
          '- Object is a short value (number, word, or brief phrase).',
          '- Max 5 facts per turn. If nothing changed, respond with "NONE".',
          '- Format: one fact per line as "subject | predicate | object".',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `User said: "${opts.userMessage.slice(0, 500)}"\n\nCharacter responded: "${opts.aiResponse.slice(0, 800)}"`,
      },
    ];

    const res = await AiProxy.complete({
      model: modelSlug(),
      messages: prompt,
      temperature: 0.3,
      maxTokens: 200,
    });

    const text = res.content.trim();
    if (!text || text.toUpperCase() === 'NONE') return;

    const lines = text.split('\n').filter((l) => l.includes('|'));
    for (const line of lines.slice(0, 5)) {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length < 3) continue;
      const [subject, predicate, object] = parts as [string, string, string];
      if (!subject || !predicate || !object) continue;
      if (subject.length > 100 || predicate.length > 100 || object.length > 200) continue;

      await assertFact({
        sessionId: opts.sessionId,
        characterId: opts.characterId,
        subject,
        predicate,
        object,
        sourceMessageId: opts.sourceMessageId,
      });
    }
  } catch {
    // Non-critical — silently swallow.
  }
}
