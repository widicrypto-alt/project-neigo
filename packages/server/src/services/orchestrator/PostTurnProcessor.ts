import { sql, eq, and } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { env } from '../../lib/env.js';
import { BaseOrchestrator } from './BaseOrchestrator.js';
import type { OrchestratorContext, EmitSse } from '../orchestrator.js';
import {
  extractLatentQuestion,
  extractUnresolvedBeat,
  extractCallbackCandidate,
  scoreLatentQuestion,
  extractFactsFromTurn,
} from '../session-meta-extractor.js';
import { extractAndPinPromises, detectPromises } from '../promise-extractor.js';
import {
  recordPromises,
  recordUnresolvedEvent,
  recordRelationshipSnapshot,
} from '../graph-writer.js';
import { evaluateToolCalls } from '../tool-call-router.js';
import { generateCyoaChoices } from '../cyoa-generator.js';
import { compactSessionContext, condenseDepth } from '../context-compaction.js';
import { shouldWriteDiary, writeDiaryEntry } from '../character-diary.js';
import { buildSessionSnapshot } from '../session-snapshot.js';

export interface PostTurnProcessorArgs {
  ctx: OrchestratorContext;
  userText: string;
  messageIds: string[];
  emit: EmitSse;
}

export class PostTurnProcessor {
  static execute(args: PostTurnProcessorArgs) {
    const { ctx, userText, messageIds, emit } = args;
    const { session, character } = ctx;
    const mode = session.mode;

    const newTurnCount = session.turnCount + 1;

    // Turn 1: generate the character's private latent question.
    if (session.turnCount === 0) {
      extractLatentQuestion({
        sessionId: session.id,
        characterName: character.name,
        characterPersonality: character.personality,
        userMessage: userText,
      }).catch(() => {});

      // POV auto-detect: if user writes in first-person (aku/saya/I) for ROLEPLAY
      // and no explicit POV was set, persist first_person_character POV to session.
      if (mode === 'STORY' && !session.sceneCard.pov) {
        const firstPersonHits = (userText.match(/\\b(?:aku|saya|gue|gw|I|I'm|I've|my)\\b/gi) ?? []).length;
        const thirdPersonHits = (userText.match(/\\*[^*]+\\*/g) ?? []).length; // asterisk narration = 3rd person style
        if (firstPersonHits >= 2 && firstPersonHits > thirdPersonHits) {
          db.execute(
            sql`UPDATE chat_sessions
                SET scene_card = jsonb_set(COALESCE(scene_card, '{}'::jsonb), '{pov}', '"first_person_character"')
                WHERE id = ${session.id}`,
          ).catch(() => {});
        }
      }
    }

    // Turns 1–5: try to tag a callback candidate from user messages.
    if (newTurnCount <= 5) {
      extractCallbackCandidate({
        sessionId: session.id,
        userMessage: userText,
        currentCandidate: session.callbackCandidate ?? null,
      }).catch(() => {});
    }

    // Latent question scoring: if latent question exists, score every user message.
    if (session.latentQuestion && newTurnCount >= 2) {
      scoreLatentQuestion({
        sessionId: session.id,
        latentQuestion: session.latentQuestion,
        userMessage: userText,
      }).catch(() => {});
    }

    // Every 10 turns: extract an unresolved beat for Day-2 hook.
    if (newTurnCount % 10 === 0 || newTurnCount === 1) {
      // Grab last AI message content for beat extraction.
      const lastAiMsgId = messageIds[messageIds.length - 1];
      if (lastAiMsgId) {
        db.query.chatMessages.findFirst({
          where: eq(schema.chatMessages.id, lastAiMsgId),
        }).then(lastMsg => {
          if (lastMsg) {
            extractUnresolvedBeat({
              sessionId: session.id,
              characterName: character.name,
              lastAiResponse: lastMsg.content,
            })
              .then(async () => {
                // PLANBv4 §3.2 — mirror the just-extracted beat into the
                // memory graph as an `event` node witnessed by the user.
                const row = await db.query.chatSessions.findFirst({
                  where: eq(schema.chatSessions.id, session.id),
                  columns: { unresolvedBeat: true },
                });
                if (row?.unresolvedBeat) {
                  void recordUnresolvedEvent({
                    userId: ctx.userId,
                    summary: row.unresolvedBeat,
                    sessionId: session.id,
                    sourceMessageId: lastAiMsgId,
                  });
                }
              })
              .catch(() => {});
          }
        }).catch(() => {});
      }
    }

    // Promise extraction → auto-pinned memory (fire-and-forget) + graph.
    if (BaseOrchestrator.shouldRunToolCallEvaluation(newTurnCount, userText)) {
      const lastAiMsgId = messageIds[messageIds.length - 1];
      if (lastAiMsgId) {
        db.query.chatMessages.findFirst({
          where: eq(schema.chatMessages.id, lastAiMsgId),
        }).then(lastMsg => {
          if (lastMsg) {
            extractAndPinPromises({
              text: lastMsg.content,
              userId: ctx.userId,
              sessionId: session.id,
              characterId: character.id,
              characterName: character.name,
            }).catch(() => {});
            // PLANBv4 §3.2 — mirror detected promises into the graph.
            const promiseHits = detectPromises(lastMsg.content);
            if (promiseHits.length) {
              void recordPromises({
                userId: ctx.userId,
                characterName: character.name,
                promises: promiseHits,
                sessionId: session.id,
                sourceMessageId: lastAiMsgId,
              });
            }
          }
        }).catch(() => {});
      }
    }

    // PLANBv4 §3.3 — every 20 turns: snapshot the current relationship
    // stage as a timestamped edge (user -[stage_slug]-> character).
    if (newTurnCount > 0 && newTurnCount % 20 === 0) {
      const lastAiMsgId = messageIds[messageIds.length - 1] ?? null;
      void (async () => {
        try {
          const dyn = await db.query.characterDynamicStates.findFirst({
            where: and(
              eq(schema.characterDynamicStates.sessionId, session.id),
              eq(schema.characterDynamicStates.characterId, character.id),
            ),
            columns: { trustScore: true, lastRelationshipStage: true },
          });
          if (!dyn) return;
          const stage = (dyn.lastRelationshipStage ?? 'STRANGER').toString();
          await recordRelationshipSnapshot({
            userId: ctx.userId,
            characterName: character.name,
            stage,
            trustScore: dyn.trustScore ?? 0,
            sessionId: session.id,
            sourceMessageId: lastAiMsgId ?? undefined,
          });
        } catch {
          // noop
        }
      })();
    }

    // T4.9: Extract temporal facts from this turn (fire-and-forget).
    {
      const lastAiMsgId = messageIds[messageIds.length - 1];
      if (lastAiMsgId) {
        db.query.chatMessages.findFirst({
          where: eq(schema.chatMessages.id, lastAiMsgId),
        }).then(lastMsg => {
          if (lastMsg) {
            extractFactsFromTurn({
              sessionId: session.id,
              characterId: character.id,
              characterName: character.name,
              userMessage: userText,
              aiResponse: lastMsg.content,
              sourceMessageId: lastAiMsgId,
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    }

    // Tool-call evaluation — secondary AI call with function definitions.
    // If vulnerability is flagged, emit an SSE event for client-side upgrade CTA.
    {
      const lastAiMsgId = messageIds[messageIds.length - 1];
      if (lastAiMsgId) {
        db.query.chatMessages.findFirst({
          where: eq(schema.chatMessages.id, lastAiMsgId),
        }).then(lastMsg => {
          if (lastMsg) {
            evaluateToolCalls({
              ctx: {
                userId: ctx.userId,
                sessionId: session.id,
                characterId: character.id,
                characterName: character.name,
                model: BaseOrchestrator.modelSlugFor(session),
              },
              lastUserMessage: userText,
              lastAiResponse: lastMsg.content,
              recentHistory: ctx.history.slice(-6),
            })
              .then(async (results) => {
                const vuln = results.find(
                  (r) => r.tool === 'flag_vulnerability_moment' && r.ok,
                );
                if (vuln) {
                  await emit({
                    type: 'vulnerability_moment',
                    detail: vuln.detail ?? 'silence',
                    delayMs: 120_000, // client shows CTA after 2 minutes
                    message: 'Keep what you\'re building.',
                  });
                }
              })
              .catch(() => {});
          }
        }).catch(() => {});
      }
    }

    // MARINARA H10 — Discord webhook mirror (opt-in per session).
    // Fire-and-forget; a bad webhook must never block chat.
    {
      const sessionMeta = (session.metadata ?? {}) as Record<string, unknown>;
      const webhookUrl = sessionMeta.discordWebhook as string | undefined;
      if (webhookUrl) {
        const lastAiMsgId = messageIds[messageIds.length - 1];
        (async () => {
          const lastMsg = lastAiMsgId
            ? await db.query.chatMessages.findFirst({
                where: eq(schema.chatMessages.id, lastAiMsgId),
              })
            : null;
          if (!lastMsg) return;
          const { mirrorTurn } = await import('../discord-mirror.js');
          await mirrorTurn({
            webhookUrl,
            characterName: character.name,
            userText,
            assistantText: lastMsg.content,
            nsfw: Boolean(ctx.nsfwEnabled),
            allowNsfw: Boolean(sessionMeta.allowNsfwInDiscord),
          });
        })().catch(() => {});
      }
    }

    // Wk5 F3 — CYOA chip tail call. ROLEPLAY only, fire-and-forget so it
    // never blocks the stream close. Chips arrive on the SSE channel as a
    // separate `cyoa_choices` event after `done`.
    if (env.CYOA_CHOICES_ENABLED && mode === 'STORY') {
      const lastAiMsgId = messageIds[messageIds.length - 1];
      if (lastAiMsgId) {
        db.query.chatMessages
          .findFirst({ where: eq(schema.chatMessages.id, lastAiMsgId) })
          .then(async (lastMsg) => {
            if (!lastMsg?.content) return;
            const tonePreset = (session.sceneCard as { tone?: string } | null)?.tone ?? null;
            const dyn = await db.query.characterDynamicStates.findFirst({
              where: and(
                eq(schema.characterDynamicStates.sessionId, session.id),
                eq(schema.characterDynamicStates.characterId, character.id),
              ),
              columns: { trustScore: true },
            });
            const trustScore = dyn?.trustScore ?? 0;
            const choices = await generateCyoaChoices({
              characterName: character.name,
              userName: ctx.userName,
              lastCharacterText: lastMsg.content,
              recentHistory: ctx.history.slice(-6).map((m) => ({
                role: m.role === 'user' ? 'USER' : 'CHARACTER',
                text: m.content,
              })),
              tonePreset,
              trustScore,
              userId: ctx.userId,
            });
            if (choices.length >= 2) {
              await emit({
                type: 'cyoa_choices',
                turnIndex: session.turnCount + 1,
                choices,
              });
            }
          })
          .catch((err) => {
            console.warn('[cyoa] emit failed:', err instanceof Error ? err.message : err);
          });
      }
    }

    // Fire-and-forget: compact old transcript into context nodes when history is long enough.
    if (session.turnCount >= 20) {
      const windowStartTurn = Math.max(0, (session.turnCount - 30) * 2);
      compactSessionContext(session.id, windowStartTurn)
        .then(() => condenseDepth(session.id))
        .catch(() => {});
    }

    // T4.3: Character Diary — write entry every DIARY_INTERVAL turns (fire-and-forget)
    if (shouldWriteDiary(session.turnCount + 1)) {
      const diaryTurnEnd = session.turnCount;
      const diaryTurnStart = Math.max(0, diaryTurnEnd - 9); // last 10 turns
      writeDiaryEntry({
        sessionId: session.id,
        characterId: character.id,
        userId: ctx.userId,
        characterName: character.name,
        turnRangeStart: diaryTurnStart,
        turnRangeEnd: diaryTurnEnd,
      }).catch(() => {});
    }

    // T4.6: Rebuild session snapshot (fire-and-forget) every 5 turns
    if ((session.turnCount + 1) % 5 === 0) {
      buildSessionSnapshot(session.id).catch(() => {});
    }
  }
}
