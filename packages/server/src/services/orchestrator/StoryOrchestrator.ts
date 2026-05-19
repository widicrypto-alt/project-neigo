import { nanoid } from 'nanoid';
import { sql, eq } from 'drizzle-orm';
import {
  PassType,
  BYOK_MODEL_CATALOG,
  AI_MODEL_CONFIG,
  DEFAULT_AI_MODEL,
  type ChatMode,
  type ChatSession,
  type Character,
  isCompleteSentence,
  runRegexScripts
} from '@neigo/shared';
import { db, schema } from '../../db/client.js';
import { AiProxy, AiUpstreamError, type AiMessage } from '../ai-proxy.js';
import { BasePassAgent, type EmitSse } from '../orchestrator-passes/BasePassAgent.js';
import { parseAndStripStats, parseAndStripEmotion, parseAndStripArcSave, type ParsedStats } from '../stats-parser.js';
import { detectRepetition } from '../repetition-detector.js';
import { detectContinuityRegression } from '../continuity-guard.js';
import { detectRefusal } from '../pass-output-sanitizer.js';
import { detectFormatDrift } from '../format-drift-detector.js';
import { detectPovDrift, type PovMode } from '../pov-drift-detector.js';
import { capturePromptSnapshot } from '../prompt-snapshot.js';
import { isSlowVsBaseline } from '../model-metrics.js';
import { parseAndStripSceneState, mergeSceneState, parseAndStripTrackers, mergeTrackers } from '../scene-state-parser.js';
import { shouldAutoTriggerArc } from '../arc-manager.js';
import { recordMistake } from '../mistakes-registry.js';
import { adaptiveTemperature } from '../hallucination-log.js';
import { env } from '../../lib/env.js';
import { loadRegexScripts } from '../regex-scripts-loader.js';
import { determineStage } from '../relationship-stage.js';

export class StoryOrchestrator extends BasePassAgent {
  public static pickFallbackSlug(userFallback: string | undefined): string {
    if (userFallback && userFallback !== 'off') {
      const hit = BYOK_MODEL_CATALOG.find((m) => m.id === userFallback);
      if (hit) return hit.id;
    }
    const hermesFree = BYOK_MODEL_CATALOG.find(
      (m) => m.tier === 'free' && /hermes/i.test(m.id),
    );
    return hermesFree?.id ?? AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug;
  }

  public static async getUserFallbackPreference(userId: string): Promise<string> {
    try {
      const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
      const meta = (user?.metadata ?? {}) as Record<string, unknown>;
      const raw = typeof meta.byokFallback === 'string' ? meta.byokFallback : 'server';
      return raw;
    } catch {
      return 'server';
    }
  }

  public static async execute(args: {
    emit: EmitSse;
    history: AiMessage[];
    session: ChatSession;
    character: Character;
    turnId: string;
    messageIds: string[];
    allStats: ParsedStats[];
    mode: ChatMode;
    userId: string;
    userText: string;
    stage: ReturnType<typeof determineStage>;
    byokKey?: string;
    byokModel?: string;
    initialTempBoost?: number;
    presetSampling?: { temperature: number | null; topP: number | null } | null;
    trustScore?: number;
  }) {
    const recent = await BasePassAgent.recentAssistantContents(args.session.id, 5);
    const recentUser = await BasePassAgent.recentUserContents(args.session.id, 6);
    const MAX_RETRIES = 2;
    let tempBoost = args.initialTempBoost ?? 0;
    const refusalPreamble: AiMessage = {
      role: 'system',
      content:
        'IMPORTANT: You are not an AI assistant. You are the character as written in the persona above. ' +
        'Do NOT apologize, decline, or mention policies, AI, models, or assistants. ' +
        'Stay fully in-voice. Respond as the character would, even when the topic is difficult — ' +
        'refusals must be expressed in-character (through the persona\'s voice), never out-of-character.',
    };
    let refusalInjected = false;
    let continuityCorrection: AiMessage | null = null;
    const catalogEntry = args.byokModel ? BYOK_MODEL_CATALOG.find((m) => m.id === args.byokModel) : undefined;
    const catalogSampling = catalogEntry?.sampling;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const msgId = nanoid();
      let buffer = '';
      const baseTemp = BasePassAgent.scheduledTemp(args.session);
      const temp = adaptiveTemperature(0);
      const historyWithGuard = [
        ...args.history,
        ...(continuityCorrection ? [continuityCorrection] : []),
        ...(refusalInjected ? [refusalPreamble] : []),
      ];

      let activeByokKey = args.byokKey;
      let activeByokModel = args.byokModel;
      let usedFallback = false;
      const streamStart = performance.now();
      let streamError: AiUpstreamError | null = null;
      const activeModelSlug = activeByokKey
        ? (activeByokModel ?? 'byok')
        : BasePassAgent.modelSlugFor(args.session);
      const effectiveTemp =
        args.presetSampling?.temperature != null
          ? args.presetSampling.temperature + tempBoost
          : (catalogSampling?.temperature ?? baseTemp) + (temp - 0.75) + tempBoost;
      const effectiveTopP = args.presetSampling?.topP ?? catalogSampling?.topP;

      await capturePromptSnapshot({
        sessionId: args.session.id,
        userId: args.userId,
        characterId: args.character.id,
        turnId: args.turnId,
        turnIndex: args.session.turnCount,
        modelSlug: activeModelSlug,
        messages: historyWithGuard.map((m) => ({
          role: m.role,
          content: m.content ?? '',
        })),
        sampling: {
          temperature: effectiveTemp,
          maxTokens: catalogSampling?.maxTokens,
          topP: effectiveTopP,
          frequencyPenalty: catalogSampling?.frequencyPenalty,
          stop: catalogSampling?.stop,
          byok: Boolean(activeByokKey),
          attempt,
        },
      });

      const runStream = async () => {
        for await (const chunk of AiProxy.stream({
          model: activeByokKey ? undefined : BasePassAgent.modelSlugFor(args.session),
          messages: historyWithGuard,
          temperature: effectiveTemp,
          maxTokens: catalogSampling?.maxTokens,
          topP: effectiveTopP,
          frequencyPenalty: catalogSampling?.frequencyPenalty,
          stop: catalogSampling?.stop,
          userId: activeByokKey ? undefined : args.userId,
          byokKey: activeByokKey,
          byokModel: activeByokModel,
        })) {
          buffer += chunk;
          if (attempt === 0) {
            if (buffer.length >= 320) {
              if (buffer.length - chunk.length < 320) {
                await args.emit({
                  type: 'character',
                  characterId: args.character.id,
                  chunk: buffer,
                  passType: PassType.CHARACTER_MAIN,
                  messageId: msgId,
                });
              } else {
                await args.emit({
                  type: 'character',
                  characterId: args.character.id,
                  chunk,
                  passType: PassType.CHARACTER_MAIN,
                  messageId: msgId,
                });
              }
            }
          }
        }
      };

      try {
        await runStream();
      } catch (err) {
        if (err instanceof AiUpstreamError && err.isByok && buffer.length === 0) {
          const userFallback = await StoryOrchestrator.getUserFallbackPreference(args.userId);
          if (userFallback !== 'off') {
            const fallbackSlug = StoryOrchestrator.pickFallbackSlug(userFallback);
            activeByokKey = undefined;
            activeByokModel = undefined;
            usedFallback = true;
            await args.emit({
              type: 'system_hint',
              tone: 'fallback',
              message: `Fallback ke ${fallbackSlug.split('/').pop() ?? 'Hermes'} — your model was unavailable.`,
              details: { reason: err.status, originalModel: err.model, fallbackModel: fallbackSlug },
            });
            buffer = '';
            await runStream();
          } else {
            streamError = err;
          }
        } else if (err instanceof AiUpstreamError) {
          streamError = err;
        } else {
          throw err;
        }
      }
      if (streamError) {
        throw streamError;
      }

      const streamMs = performance.now() - streamStart;
      const probedSlug = activeByokModel ?? BasePassAgent.modelSlugFor(args.session);
      const slow = isSlowVsBaseline(probedSlug, streamMs);
      if (slow.slow && attempt === 0 && !usedFallback) {
        await args.emit({
          type: 'system_hint',
          tone: 'slow',
          message: `This model is ~${slow.ratio.toFixed(1)}x slower than usual.`,
          details: { model: probedSlug, currentMs: Math.round(streamMs), avgMs: slow.avgMs },
        });
      }

      if (attempt === 0 && buffer.length > 0 && buffer.length < 320) {
        await args.emit({
          type: 'character',
          characterId: args.character.id,
          chunk: buffer,
          passType: PassType.CHARACTER_MAIN,
          messageId: msgId,
        });
      }

      const { clean, updates } = parseAndStripStats(buffer);
      args.allStats.push(...updates);

      const { clean: emotionClean, emotion: detectedEmotion } = parseAndStripEmotion(clean);
      let finalText = emotionClean;
      if (detectedEmotion) {
        await args.emit({ type: 'emotion', emotion: detectedEmotion, characterId: args.character.id });
      }

      if (args.mode === 'STORY') {
        const { clean: stateClean, stateUpdate } = parseAndStripSceneState(finalText);
        finalText = stateClean;
        if (stateUpdate) {
          const existingMeta = (args.session.metadata ?? {}) as Record<string, unknown>;
          const existingSceneState = (existingMeta.sceneState ?? {}) as Record<string, string>;
          const merged = mergeSceneState(existingSceneState, stateUpdate.entries);
          db.execute(
            sql`UPDATE chat_sessions
                SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ sceneState: merged })}::jsonb
                WHERE id = ${args.session.id}`,
          ).catch(() => {});

          if (
            merged.scenario_complete === 'true' &&
            typeof existingMeta.storyRunId === 'string'
          ) {
            void (async () => {
              try {
                const { advanceScenarioFromSession } = await import(
                  '../story-session-seeder.js'
                );
                await advanceScenarioFromSession(args.session.id);
              } catch (err) {
                console.warn('[orchestrator] scenario auto-advance failed', err);
              }
            })();
          }
        }

        const { clean: trackerClean, trackerUpdate } = parseAndStripTrackers(finalText);
        finalText = trackerClean;
        if (trackerUpdate) {
          const existingMeta = (args.session.metadata ?? {}) as Record<string, unknown>;
          const existingTrackers = (existingMeta.trackers ?? {}) as Record<string, string>;
          const mergedTrackers = mergeTrackers(existingTrackers, trackerUpdate.entries);
          db.execute(
            sql`UPDATE chat_sessions
                SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ trackers: mergedTrackers })}::jsonb
                WHERE id = ${args.session.id}`,
          ).catch(() => {});
        }

        const { clean: arcClean, arcSave } = parseAndStripArcSave(finalText);
        finalText = arcClean;
        if (arcSave?.triggered) {
          void (async () => {
            try {
              const { saveModelTriggeredArc } = await import('../arc-manager.js');
              await saveModelTriggeredArc(args.session.id, args.session.turnCount, arcSave.title ?? undefined);
            } catch (err) {
              console.warn('[arc] model-triggered checkpoint save failed:', err);
            }
          })();
        }

        if (shouldAutoTriggerArc(args.session.turnCount)) {
          void (async () => {
            try {
              const { triggerAutoArcSave } = await import('../arc-manager.js');
              const result = await triggerAutoArcSave(args.session.id, args.session.turnCount);
              if (result.checkpoint) {
                console.info(`[arc] auto-checkpoint saved at turn ${args.session.turnCount}`);
              }
            } catch (err) {
              console.warn('[arc] auto-checkpoint failed:', err);
            }
          })();
        }
      }

      const hygieneResult = BasePassAgent.applyHygiene(finalText, {
        passType: PassType.CHARACTER_MAIN,
        character: args.character,
        knownNouns: [args.character.name],
        trustScore: args.stage === 'INTIMATE' ? 80 : args.stage === 'CLOSE_FRIEND' ? 60 : 0,
      });
      finalText = hygieneResult.text;

      const outputScripts = await loadRegexScripts({
        userId: args.userId,
        placement: 'edit_output',
        characterId: args.character.id,
      });
      if (outputScripts.length) {
        finalText = runRegexScripts(finalText, outputScripts, {
          turnIndex: args.session.turnCount,
        }).text;
      }

      try {
        const { runPipelineShadow, runPipelinePhase } = await import('../agents/agent-pipeline.js');
        const pipelineCtx = {
          session: args.session,
          character: args.character,
          userMessage: args.userText,
          assistantDraft: finalText,
          turnIndex: args.session.turnCount,
          scriptstate:
            ((args.session.metadata as { scriptstate?: Record<string, string> } | null | undefined)
              ?.scriptstate ?? {}) as Record<string, string>,
          recentAssistant: recent,
          recentUser,
          trustScore: args.trustScore ?? 0,
        };
        runPipelineShadow('post_processing', pipelineCtx, args.userId);
        if (env.AGENT_PIPELINE_ENABLED) {
          void runPipelinePhase('post_processing', pipelineCtx, args.userId, { shadow: false })
            .catch(() => { /* non-fatal */ });
        }
      } catch {
        /* shadow hook swallows all errors */
      }

      const rep = detectRepetition(finalText, recent);
      const continuity = detectContinuityRegression({
        newText: finalText,
        recentAssistant: recent,
        recentUser,
        userText: args.userText,
        stage: args.stage,
      });
      const refusal = detectRefusal(finalText);
      const formatDrift = args.mode === 'STORY' ? detectFormatDrift(finalText) : { shouldReject: false, violations: [] as string[] };
      const effectivePov = (args.session.sceneCard.pov || 'third_person_limited') as PovMode;
      const povDrift = args.mode === 'STORY'
        ? detectPovDrift(finalText, effectivePov)
        : { shouldReject: false, detectedPov: null as PovMode | null, correctionText: '' };

      const refusalRetry = refusal.refused && !refusalInjected && attempt < MAX_RETRIES;
      const continuityRetry = continuity.shouldReject && attempt < MAX_RETRIES;
      const toneDriftRetry = hygieneResult.toneDrifted && attempt < MAX_RETRIES;
      const formatDriftRetry = formatDrift.shouldReject && attempt < MAX_RETRIES;
      const povDriftRetry = povDrift.shouldReject && attempt < MAX_RETRIES;

      if ((!rep.shouldReject && !refusalRetry && !continuityRetry && !toneDriftRetry && !formatDriftRetry && !povDriftRetry) || attempt === MAX_RETRIES) {
        if (attempt > 0) {
          await args.emit({
            type: 'character',
            characterId: args.character.id,
            chunk: finalText,
            passType: PassType.CHARACTER_MAIN,
            messageId: msgId,
          });
        }
        
        if (
          env.AUTO_CONTINUE_ENABLED &&
          args.mode === 'STORY' &&
          attempt === 0 &&
          finalText.length >= 80 &&
          !isCompleteSentence(finalText)
        ) {
          try {
            const continuationHistory: AiMessage[] = [
              ...args.history,
              { role: 'assistant', content: finalText },
              {
                role: 'user',
                content:
                  '[CONTINUE] Lanjutkan respons sebelumnya tanpa mengulang teks yang sudah ada. ' +
                  'Selesaikan kalimat terakhir dan tutup pemikiran secara natural dalam maksimal 2 kalimat. ' +
                  'Jangan menambahkan sapaan baru, jangan mengulang paragraf sebelumnya.',
              },
            ];
            let extra = '';
            for await (const chunk of AiProxy.stream({
              model: activeByokKey ? undefined : BasePassAgent.modelSlugFor(args.session),
              messages: continuationHistory,
              temperature: effectiveTemp,
              maxTokens: Math.min(catalogSampling?.maxTokens ?? 512, 512),
              topP: effectiveTopP,
              frequencyPenalty: catalogSampling?.frequencyPenalty,
              stop: catalogSampling?.stop,
              userId: activeByokKey ? undefined : args.userId,
              byokKey: activeByokKey,
              byokModel: activeByokModel,
            })) {
              extra += chunk;
              await args.emit({
                type: 'character',
                characterId: args.character.id,
                chunk,
                passType: PassType.CHARACTER_MAIN,
                messageId: msgId,
              });
            }
            if (extra.trim().length > 0) {
              const stripped = parseAndStripStats(extra).clean;
              const hyg = BasePassAgent.applyHygiene(stripped, {
                passType: PassType.CHARACTER_MAIN,
                character: args.character,
                knownNouns: [args.character.name],
                trustScore: args.stage === 'INTIMATE' ? 80 : args.stage === 'CLOSE_FRIEND' ? 60 : 0,
              });
              let extraText = hyg.text;
              if (outputScripts.length) {
                extraText = runRegexScripts(extraText, outputScripts, {
                  turnIndex: args.session.turnCount,
                }).text;
              }
              if (extraText.trim().length > 0 && !finalText.includes(extraText.trim())) {
                finalText = `${finalText}${finalText.endsWith(' ') ? '' : ' '}${extraText.trim()}`;
              }
            }
          } catch (err) {
            console.warn('[auto-continue] continuation failed; keeping original draft', err);
          }
        }
        
        await db.insert(schema.chatMessages).values({
          id: msgId,
          sessionId: args.session.id,
          turnIndex: args.session.turnCount * 2 + 1,
          role: 'ASSISTANT',
          speakerType: 'CHARACTER',
          speakerId: args.character.id,
          content: finalText,
          passType: PassType.CHARACTER_MAIN,
          turnId: args.turnId,
          tokenCount: 0,
          metadata: args.byokModel ? { modelKey: args.byokModel } : {},
        });
        args.messageIds.push(msgId);
        break;
      }

      if (refusalRetry) {
        refusalInjected = true;
        tempBoost = Math.max(tempBoost - 0.1, -0.15);
        recordMistake({
          sessionId: args.session.id,
          turnIndex: args.session.turnCount,
          kind: 'refusal',
          excerpt: finalText.slice(0, 240),
          correction: 'Stay fully in-character; never break to apologize or refuse out-of-character.',
        }).catch(() => {});
        console.warn(
          `[refusal-guard] session=${args.session.id} attempt=${attempt} reason=${refusal.reason}`,
        );
      } else if (continuityRetry) {
        continuityCorrection = {
          role: 'system',
          content: [
            'CONTINUITY CORRECTION: Your previous draft regressed the established relationship/scene state.',
            `Problems: ${continuity.reasons.join('; ')}.`,
            'Rewrite so the current response continues naturally from the latest softened/established state.',
            'Do NOT replay an already-resolved beat. Preserve consequences from the previous scene.',
          ].join('\\n'),
        };
        tempBoost = Math.max(tempBoost + 0.05, 0.05);
        recordMistake({
          sessionId: args.session.id,
          turnIndex: args.session.turnCount,
          kind: 'continuity',
          excerpt: finalText.slice(0, 240),
          correction: continuity.reasons.join('; '),
        }).catch(() => {});
      } else if (toneDriftRetry) {
        continuityCorrection = {
          role: 'system',
          content: `TONE DRIFT CORRECTION: ${hygieneResult.toneDriftCorrection ?? 'Your tone drifted from the character preset. Rewrite in-voice.'}`,
        };
        tempBoost = Math.max(tempBoost - 0.05, -0.1);
        recordMistake({
          sessionId: args.session.id,
          turnIndex: args.session.turnCount,
          kind: 'tone_drift',
          excerpt: finalText.slice(0, 240),
          correction: hygieneResult.toneDriftCorrection ?? 'Rewrite in-voice per tone preset.',
        }).catch(() => {});
        console.warn(
          `[tone-drift] session=${args.session.id} attempt=${attempt} correction=${hygieneResult.toneDriftCorrection}`,
        );
      } else if (formatDriftRetry) {
        continuityCorrection = {
          role: 'system',
          content:
            'FORMAT CORRECTION: Your previous draft put dialogue inside *italics*. ' +
            'Rewrite following the Format Contract strictly: *italics* for narration ONLY, "quotes" for dialogue ONLY. ' +
            'Always close * before opening ". Never nest "..." inside *...*.',
        };
        recordMistake({
          sessionId: args.session.id,
          turnIndex: args.session.turnCount,
          kind: 'format_drift',
          excerpt: finalText.slice(0, 240),
          correction: '*italics* for narration ONLY, "quotes" for dialogue ONLY.',
        }).catch(() => {});
        console.warn(
          `[format-drift] session=${args.session.id} attempt=${attempt} violations=${formatDrift.violations.length}`,
        );
      } else if (povDriftRetry) {
        continuityCorrection = {
          role: 'system',
          content: `POV CORRECTION: ${povDrift.correctionText}`,
        };
        recordMistake({
          sessionId: args.session.id,
          turnIndex: args.session.turnCount,
          kind: 'pov_drift',
          excerpt: finalText.slice(0, 240),
          correction: povDrift.correctionText,
        }).catch(() => {});
        console.warn(
          `[pov-drift] session=${args.session.id} attempt=${attempt} expected=${effectivePov} detected=${povDrift.detectedPov}`,
        );
      } else {
        tempBoost += 0.15;
        recordMistake({
          sessionId: args.session.id,
          turnIndex: args.session.turnCount,
          kind: 'repetition',
          excerpt: finalText.slice(0, 240),
          correction: 'Avoid repeating phrases from recent messages.',
        }).catch(() => {});
      }
    }
  }
}
