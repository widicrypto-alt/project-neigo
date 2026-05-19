
import { eq, asc, sql, and } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { type ChatMode, type ChatSession, type Character } from '@neigo/shared';
import { type ParsedStats } from '../stats-parser.js';
import { type EmitSse, type OrchestratorContext } from '../orchestrator.js';
import { type AiMessage } from '../ai-proxy.js';
import { HaremStatsRepo } from '../cast-stats-repo.js';
import { planHaremTurn, type TurnPlan } from '../cast-turn-selector.js';
import { DirectorPassAgent } from '../orchestrator-passes/DirectorPassAgent.js';
import { NarratorPassAgent } from '../orchestrator-passes/NarratorPassAgent.js';
import { MainCharacterPassAgent } from '../orchestrator-passes/MainCharacterPassAgent.js';
import { ReactorPassAgent } from '../orchestrator-passes/ReactorPassAgent.js';
import { SilentPassAgent } from '../orchestrator-passes/SilentPassAgent.js';
import { WhisperPassAgent } from '../orchestrator-passes/WhisperPassAgent.js';
import { BaseOrchestrator } from './BaseOrchestrator.js';
import { shouldAutoTriggerArc } from '../arc-manager.js';
import { parseAndStripArcSave } from '../stats-parser.js';
import pLimit from 'p-limit';

export class CastOrchestrator {
  

  // ─── CAST FLOW ──────────────────────────────────────────────────────
  public static async execute(args: {
    ctx: OrchestratorContext;
    emit: EmitSse;
    history: AiMessage[];
    turnId: string;
    messageIds: string[];
    allStats: ParsedStats[];
  }) {
    const { ctx, emit, history, turnId, messageIds, allStats } = args;
    const { session } = ctx;
    const allChars = [ctx.character, ...ctx.castCharacters.filter((c) => c.id !== ctx.character.id)];
    await HaremStatsRepo.ensureRows(
      session.id,
      allChars.map((c) => c.id),
    );
    const statsMap = await HaremStatsRepo.map(session.id);
    const recent = await db.query.chatMessages.findMany({
      where: eq(schema.chatMessages.sessionId, session.id),
      orderBy: asc(schema.chatMessages.turnIndex),
    });
    const recentSpeakerIds = recent
      .filter((r) => r.speakerType === 'CHARACTER' && r.speakerId)
      .slice(-6)
      .reverse()
      .map((r) => r.speakerId as string);

    const plan: TurnPlan = planHaremTurn({
      cast: allChars,
      presentIds: allChars.map((c) => c.id),
      stats: statsMap,
      recentSpeakerIds,
      dramaIntensity: session.dramaIntensity,
    });

    await DirectorPassAgent.execute({ emit, history, session });
    await NarratorPassAgent.execute({ emit, history, session, turnId, messageIds });

    const mainChar = plan.assignments.find((a) => a.participation === 'MAIN_SPEAKER')?.character ?? ctx.character;
    await MainCharacterPassAgent.execute({
      emit, history, session, character: mainChar, turnId, messageIds, allStats,
    });

    // PLANCHATv3 §4.1 — Arc save detection for CAST mode.
    // After the main character pass, check the last emitted text for [ARC_SAVE].
    // This mirrors the STORY mode arc detection but for CAST's primary speaker.
    void (async () => {
      const lastMsgId = messageIds[messageIds.length - 1];
      if (!lastMsgId) return;
      const lastMsg = await db.query.chatMessages.findFirst({
        where: eq(schema.chatMessages.id, lastMsgId),
      });
      if (!lastMsg) return;
      const { arcSave } = parseAndStripArcSave(lastMsg.content);
      if (arcSave?.triggered) {
        try {
          const { saveModelTriggeredArc } = await import('../arc-manager.js');
          await saveModelTriggeredArc(session.id, session.turnCount, arcSave.title ?? undefined);
        } catch (err) {
          console.warn('[arc] CAST mode checkpoint save failed:', err);
        }
      }
    })();

    // PLANCHATv3 §4.1 — Auto-trigger arc save every 30 turns for CAST mode too
    if (shouldAutoTriggerArc(session.turnCount)) {
      void (async () => {
        try {
          const { triggerAutoArcSave } = await import('../arc-manager.js');
          const result = await triggerAutoArcSave(session.id, session.turnCount);
          if (result.checkpoint) {
            console.info(`[arc] CAST auto-checkpoint saved at turn ${session.turnCount}`);
          }
        } catch (err) {
          console.warn('[arc] CAST auto-checkpoint failed:', err);
        }
      })();
    }

    const limit = pLimit(3);
    const reactorPromises = plan.assignments
      .filter((x) => x.participation === 'REACTOR')
      .map((a) =>
        limit(() => ReactorPassAgent.execute({
          emit, history, session, character: a.character, turnId, messageIds, allStats,
        }))
      );

    const silentPromises = plan.assignments
      .filter((x) => x.participation === 'SILENT')
      .map((a) =>
        limit(() => SilentPassAgent.execute({
          emit, history, session, character: a.character, turnId, messageIds,
        }))
      );

    await Promise.allSettled([...reactorPromises, ...silentPromises]);
    if (plan.whisperPair) {
      const [a, b] = plan.whisperPair;
      await WhisperPassAgent.execute({
        emit, history, session, charA: a, charB: b, turnId, messageIds,
      });
    }

    // Cross-pass consistency check (fire-and-forget)
    BaseOrchestrator.checkCrossPassForTurn(session.id, messageIds, ctx.character.name).catch(() => {});
  }
}
