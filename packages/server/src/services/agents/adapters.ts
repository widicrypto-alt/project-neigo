/**
 * PLANv3 X2.7 — Built-in agent adapters.
 *
 * Thin wrappers translating existing validator services into the
 * `AgentResult` contract so the pipeline can route and persist them
 * uniformly. All logic is intentionally re-used from the existing
 * services — no behaviour change.
 */

import { detectContinuityRegression } from '../continuity-guard.js';
import { detectRepetition } from '../repetition-detector.js';
import { checkToneDrift } from '../tone-drift-detector.js';
import { detectFormatDrift } from '../format-drift-detector.js';
import { parseAndStripSceneState } from '../scene-state-parser.js';
import type {
  AgentConfigRow,
  AgentExecutionContext,
  AgentResult,
} from './agent-pipeline.js';

type Adapter = (config: AgentConfigRow, ctx: AgentExecutionContext) => Promise<AgentResult>;

export const BUILTIN_ADAPTERS: Record<string, Adapter> = {
  continuity: async (config, ctx) => {
    const started = Date.now();
    const result = detectContinuityRegression({
      newText: ctx.assistantDraft,
      recentAssistant: ctx.recentAssistant ?? [],
      recentUser: ctx.recentUser ?? [],
      userText: ctx.userMessage,
    });
    return {
      agentType: config.type,
      agentConfigId: config.id,
      outcome: result.shouldReject ? 'retry' : 'pass',
      feedback: result.reasons.join('; ') || undefined,
      data: { hasRegression: result.hasRegression, severity: result.severity, reasons: result.reasons },
      latencyMs: Date.now() - started,
    };
  },

  'format-guardian': async (config, ctx) => {
    const started = Date.now();
    const result = detectFormatDrift(ctx.assistantDraft);
    return {
      agentType: config.type,
      agentConfigId: config.id,
      outcome: result.shouldReject ? 'retry' : 'pass',
      feedback: result.violations.join('; ') || undefined,
      data: { violations: result.violations },
      latencyMs: Date.now() - started,
    };
  },

  repetition: async (config, ctx) => {
    const started = Date.now();
    const result = detectRepetition(ctx.assistantDraft, ctx.recentAssistant ?? []);
    return {
      agentType: config.type,
      agentConfigId: config.id,
      outcome: result.shouldReject ? 'retry' : 'pass',
      data: { severity: result.severity, repeatedPhrases: result.repeatedPhrases },
      latencyMs: Date.now() - started,
    };
  },

  'tone-guardian': async (config, ctx) => {
    const started = Date.now();
    const result = checkToneDrift(ctx.assistantDraft, ctx.character, ctx.trustScore ?? 0);
    return {
      agentType: config.type,
      agentConfigId: config.id,
      outcome: result.kind === 'drifting' ? 'retry' : 'pass',
      feedback: result.kind === 'drifting' ? result.correctionText : undefined,
      data: result.kind === 'drifting' ? { excerpt: result.excerpt } : {},
      latencyMs: Date.now() - started,
    };
  },

  'world-state': async (config, ctx) => {
    const started = Date.now();
    const parsed = parseAndStripSceneState(ctx.assistantDraft);
    return {
      agentType: config.type,
      agentConfigId: config.id,
      outcome: 'pass',
      data: { updates: parsed.stateUpdate ?? null },
      latencyMs: Date.now() - started,
    };
  },

  // director and chat-summary are stubs in Day 10 — requires external LLM
  // calls which we wire in post-batch track.
  director: async (config, _ctx) => ({
    agentType: config.type,
    agentConfigId: config.id,
    outcome: 'pass',
    latencyMs: 0,
  }),

  'chat-summary': async (config, _ctx) => ({
    agentType: config.type,
    agentConfigId: config.id,
    outcome: 'pass',
    latencyMs: 0,
  }),
};
