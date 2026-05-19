/**
 * BACKLOG B0.1 — BUILTIN_AGENTS seed.
 *
 * Ensures every user who participates in a shadow/live pipeline run has
 * their set of built-in agent_configs inserted. Called lazily by
 * `runPipelineShadow` / `runPipelinePhase` so dormant users never pay the
 * cost and the operation is idempotent: we insert-if-missing by user+type.
 */
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, schema } from '../../db/client.js';

export interface BuiltinAgentDef {
  type: string;
  name: string;
  phase: 'pre_generation' | 'parallel' | 'post_processing';
  enabled: boolean;
  promptTemplate: string;
  settings: Record<string, unknown>;
}

/**
 * Canonical set of built-in agents mirroring the adapters registered in
 * `./adapters.ts`. Order matches the intended evaluation order when the
 * live path is activated (director → chat-summary disabled until LLM exec
 * is wired in post-batch).
 */
export const BUILTIN_AGENTS: BuiltinAgentDef[] = [
  {
    type: 'continuity',
    name: 'Continuity Guardian',
    phase: 'post_processing',
    enabled: true,
    promptTemplate: '',
    settings: { runInterval: 1 },
  },
  {
    type: 'format-guardian',
    name: 'Format Guardian',
    phase: 'post_processing',
    enabled: true,
    promptTemplate: '',
    settings: { runInterval: 1 },
  },
  {
    type: 'repetition',
    name: 'Repetition Detector',
    phase: 'post_processing',
    enabled: true,
    promptTemplate: '',
    settings: { runInterval: 1 },
  },
  {
    type: 'tone-guardian',
    name: 'Tone Guardian',
    phase: 'post_processing',
    enabled: true,
    promptTemplate: '',
    settings: { runInterval: 1 },
  },
  {
    type: 'world-state',
    name: 'World-State Parser',
    phase: 'post_processing',
    enabled: true,
    promptTemplate: '',
    settings: { runInterval: 1 },
  },
  {
    type: 'director',
    name: 'Director (LLM, disabled)',
    phase: 'pre_generation',
    enabled: false,
    promptTemplate: 'Summarize the current scene into 2 bullet points for the character.',
    settings: { runInterval: 3 },
  },
  {
    type: 'chat-summary',
    name: 'Chat Summary (LLM, disabled)',
    phase: 'post_processing',
    enabled: false,
    promptTemplate: 'Produce a 1-sentence recap of the latest turn for future retrieval.',
    settings: { runInterval: 5 },
  },
];

// Module-level dedup so we don't re-query per turn.
const seededUsers = new Set<string>();

/**
 * Ensures the given user has a row in agent_configs for every entry in
 * {@link BUILTIN_AGENTS}. Idempotent and safe to call in a hot path.
 */
export async function ensureBuiltinAgents(userId: string): Promise<void> {
  if (seededUsers.has(userId)) return;

  const existing = await db
    .select({ type: schema.agentConfigs.type })
    .from(schema.agentConfigs)
    .where(and(
      eq(schema.agentConfigs.userId, userId),
      eq(schema.agentConfigs.isBuiltin, true),
    ));
  const have = new Set(existing.map((r) => r.type));

  const toInsert = BUILTIN_AGENTS
    .filter((a) => !have.has(a.type))
    .map((a) => ({
      id: nanoid(),
      userId,
      type: a.type,
      name: a.name,
      phase: a.phase,
      enabled: a.enabled,
      connectionId: null,
      promptTemplate: a.promptTemplate,
      settings: a.settings,
      tools: [] as unknown[],
      isBuiltin: true,
    }));

  if (toInsert.length > 0) {
    try {
      await db.insert(schema.agentConfigs).values(toInsert);
    } catch (err) {
      // Another concurrent caller may have won the race — tolerate unique
      // conflicts without crashing the shadow hook.
      console.warn('[agents:seed] insert failed:', (err as Error).message);
    }
  }

  seededUsers.add(userId);
}
