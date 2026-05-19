/**
 * PLANv3 X2.7 — Agent pipeline (Day 9 scaffolding, SHADOW mode only).
 *
 * This is the skeleton for the agent pipeline refactor. In Day 9 we land
 * migration + schema + a non-blocking shadow runner that logs agent_runs
 * rows without affecting user output. Day 10 wires individual built-in
 * agents (continuity/format/repetition/tone/world-state/director/summary).
 *
 * Flag gates:
 *   - AGENT_PIPELINE_ENABLED: flip on to make pipeline authoritative.
 *   - AGENT_PIPELINE_SHADOW: run in shadow to compare outcomes.
 * When both off (default), runPipelinePhase() short-circuits to [].
 */

import { nanoid } from 'nanoid';
import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { env } from '../../lib/env.js';
import type { ChatSession, Character } from '@neigo/shared';

export type AgentPhase = 'pre_generation' | 'parallel' | 'post_processing';
export type AgentOutcome = 'pass' | 'retry' | 'block' | 'error';

export interface AgentExecutionContext {
  session: ChatSession;
  character: Character;
  userMessage: string;
  assistantDraft: string;
  turnIndex: number;
  scriptstate: Record<string, string>;
  /**
   * Recent assistant message contents (most-recent-first or chronological —
   * adapters treat as "nearby context"). Empty when unavailable.
   */
  recentAssistant?: string[];
  /** Recent user message contents (same ordering contract as recentAssistant). */
  recentUser?: string[];
  /**
   * Character trust score 0-100. Used by tone-guardian to allow warmth for
   * TSUNDERE archetypes once trust >= 70. Defaults to 0 when not provided.
   */
  trustScore?: number;
}

export interface AgentResult {
  agentType: string;
  agentConfigId: string;
  outcome: AgentOutcome;
  feedback?: string;
  data?: Record<string, unknown>;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
}

export interface AgentConfigRow {
  id: string;
  type: string;
  name: string;
  phase: AgentPhase;
  enabled: boolean;
  connectionId: string | null;
  promptTemplate: string;
  settings: Record<string, unknown>;
  tools: unknown[];
  isBuiltin: boolean;
}

async function loadEnabledAgents(
  userId: string,
  phase: AgentPhase,
): Promise<AgentConfigRow[]> {
  const rows = await db
    .select()
    .from(schema.agentConfigs)
    .where(
      and(
        eq(schema.agentConfigs.userId, userId),
        eq(schema.agentConfigs.phase, phase),
        eq(schema.agentConfigs.enabled, true),
      ),
    )
    .orderBy(asc(schema.agentConfigs.createdAt));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    phase: r.phase as AgentPhase,
    enabled: r.enabled,
    connectionId: r.connectionId,
    promptTemplate: r.promptTemplate,
    settings: (r.settings as Record<string, unknown>) ?? {},
    tools: Array.isArray(r.tools) ? (r.tools as unknown[]) : [],
    isBuiltin: r.isBuiltin,
  }));
}

function dueThisTurn(config: AgentConfigRow, turnIndex: number): boolean {
  const interval = Number(config.settings.runInterval ?? 1) || 1;
  return turnIndex % interval === 0;
}

/**
 * Day 10 executor — routes built-in `type` slugs to adapters wrapping the
 * existing validator services. Unknown types fall back to a 'pass' stub so
 * custom user-defined agents remain inert until the LLM-call executor ships
 * in the post-batch track.
 */
async function executeBuiltinAgent(
  config: AgentConfigRow,
  ctx: AgentExecutionContext,
): Promise<AgentResult> {
  const { BUILTIN_ADAPTERS } = await import('./adapters.js');
  const adapter = BUILTIN_ADAPTERS[config.type];
  if (adapter) return adapter(config, ctx);
  return {
    agentType: config.type,
    agentConfigId: config.id,
    outcome: 'pass',
    latencyMs: 0,
    data: { note: 'custom-agent-not-yet-implemented' },
  };
}

async function persistRun(
  ctx: AgentExecutionContext,
  r: AgentResult,
  shadow: boolean,
): Promise<void> {
  try {
    await db.insert(schema.agentRuns).values({
      id: nanoid(),
      agentConfigId: r.agentConfigId,
      sessionId: ctx.session.id,
      turnIndex: ctx.turnIndex,
      outcome: r.outcome,
      resultData: r.data ?? {},
      tokensIn: r.tokensIn ?? null,
      tokensOut: r.tokensOut ?? null,
      latencyMs: r.latencyMs ?? null,
      shadow,
      error: r.outcome === 'block' || r.outcome === 'error' ? r.feedback ?? null : null,
    }).onConflictDoNothing({
      target: [schema.agentRuns.sessionId, schema.agentRuns.turnIndex, schema.agentRuns.agentConfigId],
    });
  } catch (err) {
    // Shadow failures are never fatal — surface only at warn level.
    console.warn('[agent-pipeline] persistRun failed:', err);
  }
}

export async function runPipelinePhase(
  phase: AgentPhase,
  ctx: AgentExecutionContext,
  userId: string,
  opts: { shadow: boolean },
): Promise<AgentResult[]> {
  if (!env.AGENT_PIPELINE_ENABLED && !env.AGENT_PIPELINE_SHADOW) return [];
  // If shadow requested but shadow flag is off, bail.
  if (opts.shadow && !env.AGENT_PIPELINE_SHADOW) return [];
  try {
    // BACKLOG B0.1 — seed built-in configs for this user if missing.
    const { ensureBuiltinAgents } = await import('./seed.js');
    await ensureBuiltinAgents(userId);

    const configs = await loadEnabledAgents(userId, phase);
    const due = configs.filter((c) => dueThisTurn(c, ctx.turnIndex));
    if (due.length === 0) return [];

    const results: AgentResult[] = [];
    for (const cfg of due) {
      const started = Date.now();
      try {
        const r = await executeBuiltinAgent(cfg, ctx);
        r.latencyMs ??= Date.now() - started;
        results.push(r);
      } catch (err) {
        results.push({
          agentType: cfg.type,
          agentConfigId: cfg.id,
          outcome: 'error',
          feedback: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - started,
        });
      }
    }

    // Persist in parallel — failures are non-fatal.
    await Promise.all(results.map((r) => persistRun(ctx, r, opts.shadow)));
    return results;
  } catch (err) {
    console.warn('[agent-pipeline] runPipelinePhase failed:', err);
    return [];
  }
}

/**
 * Fire-and-forget shadow runner intended to be called from the orchestrator
 * post-draft. Swallows all errors and never affects the caller.
 */
export function runPipelineShadow(
  phase: AgentPhase,
  ctx: AgentExecutionContext,
  userId: string,
): void {
  if (!env.AGENT_PIPELINE_SHADOW) return;
  runPipelinePhase(phase, ctx, userId, { shadow: true }).catch((err) =>
    console.warn('[agent-pipeline] shadow failed:', err),
  );
}
