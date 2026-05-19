> 🟡 **STATUS (apr 2026): DAY 11 SHIPPED.** X2.4 marker preset ✅. 🟡 Day 9–10 X2.7 agent pipeline is shadow-only; live wire + BUILTIN_AGENTS seed + shadow-compare → [BACKLOG.md](BACKLOG.md) B0.1.

---

# PLAN_IMPLEMENTS v3 — Day 9-11 (Agent pipeline + Marker preset)

> Lanjutan dari [PLAN_IMPLEMENTSv2.md](PLAN_IMPLEMENTSv2.md). Baca pre-flight §0 di [PLAN_IMPLEMENTSv1.md](PLAN_IMPLEMENTSv1.md).
>
> **Scope:** Day 9-10 X2.7 agent pipeline framework (refactor paling besar di batch 14-day ini), Day 11 X2.4 marker-based reorderable preset.
>
> **Prereq:** Day 1 XML wrap (X2.1) **wajib mendarat** karena agent output akan wrapped `<result agent="…">`. Day 4 macros (X2.3) bagus ada tapi tidak block. Day 7-8 regex TIDAK block.

---

## Day 9-10 — X2.7 Agent Pipeline Framework

**Effort:** ~14 jam total (2 hari). **Risk:** tinggi — refactor orchestrator core. Mitigasi: full backward-compat lewat adapter, flag OFF default.

### 9.1 Strategi migrasi bertahap (sesuai PLANv3 §X12 #1)

Default: **bertahap**, 2 validator per PR, shadow-mode 3 hari.

| Fase | Validator yang di-migrate | Hari | Flag shadow |
|---|---|---|---|
| Day 9 | Scaffolding + `continuity-guard` + `format-drift-detector` | 9 | `AGENT_PIPELINE_SHADOW=true` |
| Day 10 | `repetition-detector` + `tone-drift-detector` + `scene-state-parser` | 10 | idem |
| Post-batch | `harem-turn-selector`, `refusal` detect, custom `director`, `world-state`, `character-tracker` | minggu depan | rollout flag `AGENT_PIPELINE_ENABLED` |

**Shadow mode** = pipeline run paralel dengan legacy path, hasilnya dibandingkan di `agent_runs.result_data` tanpa mempengaruhi user-visible output. Kalau 3 hari konsisten match ≥ 95%, flip ke live.

### 9.2 Day 9 — Scaffolding + 2 validator pertama

#### 9.2.1 Migrasi 0028 (atau 0029 kalau regex sudah ambil 0028)

**File:** `packages/server/drizzle/0028_agent_configs.sql`

```sql
CREATE TYPE agent_phase AS ENUM ('pre_generation','parallel','post_processing');

CREATE TABLE agent_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,                         -- 'continuity' | 'format-guardian' | custom slug
  name text NOT NULL,
  phase agent_phase NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  connection_id uuid REFERENCES byok_connections(id) ON DELETE SET NULL,
  prompt_template text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { runInterval: 1, maxTokens: 256, ... }
  tools text[] NOT NULL DEFAULT '{}',
  is_builtin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_configs_user_phase ON agent_configs (user_id, phase, enabled);
CREATE UNIQUE INDEX idx_agent_configs_user_type ON agent_configs (user_id, type) WHERE is_builtin = true;

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_config_id uuid NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  turn_index integer NOT NULL,
  result_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  shadow boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_runs_session ON agent_runs (session_id, turn_index DESC);
CREATE INDEX idx_agent_runs_config_created ON agent_runs (agent_config_id, created_at DESC);

-- RLS
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_configs_owner ON agent_configs
  USING (user_id = current_setting('app.user_id', true)::uuid);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_runs_owner ON agent_runs
  USING (
    session_id IN (SELECT id FROM chat_sessions WHERE user_id = current_setting('app.user_id', true)::uuid)
  );
```

Extend `schema.ts` export `agentConfigs`, `agentRuns`, `agentPhase` enum.

#### 9.2.2 Seed built-in agents

**File baru:** `packages/server/src/db/seed-builtin-agents.ts`

```ts
export const BUILTIN_AGENTS = [
  { type: 'continuity', phase: 'post_processing', prompt: CONTINUITY_PROMPT, settings: { runInterval: 1 }, isBuiltin: true },
  { type: 'format-guardian', phase: 'post_processing', prompt: FORMAT_PROMPT, settings: { runInterval: 1 }, isBuiltin: true },
  { type: 'repetition', phase: 'post_processing', prompt: '', settings: { runInterval: 1, algorithm: 'ngram' }, isBuiltin: true },
  { type: 'tone-guardian', phase: 'post_processing', prompt: TONE_PROMPT, settings: { runInterval: 1 }, isBuiltin: true },
  { type: 'world-state', phase: 'post_processing', prompt: SCENE_STATE_PROMPT, settings: { runInterval: 1 }, isBuiltin: true },
  { type: 'director', phase: 'parallel', prompt: DIRECTOR_PROMPT, settings: { runInterval: 5 }, isBuiltin: true },
  { type: 'chat-summary', phase: 'post_processing', prompt: SUMMARY_PROMPT, settings: { runInterval: 8 }, isBuiltin: true },
];

export async function seedBuiltinAgentsForUser(userId: string) {
  for (const a of BUILTIN_AGENTS) {
    await db.insert(schema.agentConfigs)
      .values({ userId, ...a, name: a.type, enabled: true })
      .onConflictDoNothing({ target: [schema.agentConfigs.userId, schema.agentConfigs.type] });
  }
}
```

Panggil dari user-register hook. Untuk user eksisting, backfill via script `pnpm --filter @neigo/server backfill:agents`.

#### 9.2.3 Service pipeline

**File baru:** `packages/server/src/services/agents/agent-executor.ts`

```ts
export interface AgentExecutionContext {
  session: Session;
  character: Character;
  userMessage: string;
  assistantDraft: string;    // for post_processing
  turnIndex: number;
  scriptstate: Record<string, string>;
}

export interface AgentResult {
  agentType: string;
  outcome: 'pass' | 'retry' | 'block';
  feedback?: string;         // correction prompt for retry
  data?: any;                // agent-specific payload (scene state, director notes)
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
}

export async function executeBuiltinAgent(
  config: AgentConfig,
  ctx: AgentExecutionContext
): Promise<AgentResult> {
  switch (config.type) {
    case 'continuity':       return adaptContinuity(config, ctx);
    case 'format-guardian':  return adaptFormatDrift(config, ctx);
    case 'repetition':       return adaptRepetition(config, ctx);
    case 'tone-guardian':    return adaptToneDrift(config, ctx);
    case 'world-state':      return adaptSceneState(config, ctx);
    case 'director':         return adaptDirector(config, ctx);
    case 'chat-summary':     return adaptSummary(config, ctx);
    default:                 return executeCustomAgent(config, ctx);
  }
}
```

Semua `adapt*` function **wrap existing service** (tidak rewrite logic):

```ts
async function adaptContinuity(config: AgentConfig, ctx: AgentExecutionContext): Promise<AgentResult> {
  const start = Date.now();
  const result = await runContinuityGuard(ctx.assistantDraft, ctx.session, ctx.character); // existing service
  return {
    agentType: 'continuity',
    outcome: result.ok ? 'pass' : 'retry',
    feedback: result.correctionPrompt,
    data: { violations: result.violations },
    latencyMs: Date.now() - start,
  };
}
```

#### 9.2.4 Pipeline orchestrator

**File baru:** `packages/server/src/services/agents/agent-pipeline.ts`

```ts
export async function runPipelinePhase(
  phase: AgentPhase,
  ctx: AgentExecutionContext,
  userId: string,
  opts: { shadow: boolean }
): Promise<AgentResult[]> {
  const configs = await loadEnabledAgents(userId, phase);
  const applicable = configs.filter(c => ctx.turnIndex % (c.settings.runInterval ?? 1) === 0);

  // Batch per (provider, model) — Marinara M1
  const groups = groupBy(applicable, c => `${c.connectionId ?? 'default'}:${c.settings.model ?? 'default'}`);
  const results: AgentResult[] = [];
  for (const group of Object.values(groups)) {
    if (group.length === 1) {
      results.push(await executeBuiltinAgent(group[0], ctx));
    } else {
      results.push(...await executeBatchedAgents(group, ctx));
    }
  }

  // Persist runs
  await Promise.all(results.map(r =>
    db.insert(schema.agentRuns).values({
      agentConfigId: findConfigId(configs, r.agentType),
      sessionId: ctx.session.id,
      turnIndex: ctx.turnIndex,
      resultData: r.data ?? {},
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      latencyMs: r.latencyMs,
      shadow: opts.shadow,
      error: r.outcome === 'block' ? r.feedback : null,
    })
  ));

  return results;
}
```

`executeBatchedAgents` — untuk Day 9 MVP, kirim `group.length === 1` cukup (tidak ada true batching dulu). Day 10 tambah batching real dengan `<agent_task>` format.

#### 9.2.5 Wire di orchestrator.ts dengan shadow guard

**File:** `packages/server/src/services/orchestrator.ts`

Di `runSinglePass`, setelah draft response generated, sebelum existing validator chain:

```ts
if (env.AGENT_PIPELINE_SHADOW) {
  // Run pipeline in SHADOW (no effect on user output)
  const ctx: AgentExecutionContext = { session, character, userMessage, assistantDraft: draftText, turnIndex, scriptstate };
  runPipelinePhase('post_processing', ctx, userId, { shadow: true }).catch(err => logger.error({ err }, 'agent-pipeline shadow failed'));
}

if (env.AGENT_PIPELINE_ENABLED) {
  // Live path — replace existing validator chain
  const results = await runPipelinePhase('post_processing', ctx, userId, { shadow: false });
  const blockers = results.filter(r => r.outcome === 'retry' || r.outcome === 'block');
  if (blockers.length > 0 && retries < 2) { retries++; continue; }
} else {
  // Legacy path (existing validator chain)
  // ... existing code
}
```

#### 9.2.6 Flag + commit Day 9

```ts
// env.ts
AGENT_PIPELINE_ENABLED: z.enum(['true','false']).default('false').transform(v => v==='true'),
AGENT_PIPELINE_SHADOW:  z.enum(['true','false']).default('false').transform(v => v==='true'),
```

Commit:

```
feat(X2.7 day9): agent pipeline scaffolding + continuity/format adapters

- drizzle/0028_agent_configs.sql (agent_configs + agent_runs, RLS, indexes)
- services/agents/{agent-executor,agent-pipeline,builtin-adapters}.ts
- db/seed-builtin-agents.ts + backfill script
- orchestrator.ts wires SHADOW path side-by-side with legacy
- env: AGENT_PIPELINE_ENABLED=false, AGENT_PIPELINE_SHADOW=false

Per PLAN_IMPLEMENTSv3 §Day9. Legacy path untouched; flag off.
```

### 9.3 Day 10 — Batching real + 3 validator sisa

#### 9.3.1 Real batching per (provider, model)

**File:** `packages/server/src/services/agents/agent-pipeline.ts`

```ts
async function executeBatchedAgents(group: AgentConfig[], ctx: AgentExecutionContext): Promise<AgentResult[]> {
  const systemPrompt = buildBatchedSystemPrompt(group, ctx);
  const userPrompt = buildBatchedUserPrompt(group, ctx);
  const start = Date.now();
  const response = await AiProxy.complete({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    model: group[0].settings.model ?? DEFAULT_VALIDATOR_MODEL,
    maxTokens: group.length * 256,
    temperature: 0.2,
    // connectionId from group[0] — all same provider
  });
  const latencyMs = Date.now() - start;

  const parsed = parseBatchedResponse(response.text, group);
  return group.map(cfg => ({
    agentType: cfg.type,
    outcome: parsed[cfg.type]?.outcome ?? 'pass',
    feedback: parsed[cfg.type]?.feedback,
    data: parsed[cfg.type]?.data,
    tokensIn: Math.round(response.usage.prompt_tokens / group.length),
    tokensOut: Math.round(response.usage.completion_tokens / group.length),
    latencyMs,
  }));
}

function buildBatchedSystemPrompt(group: AgentConfig[], ctx: AgentExecutionContext): string {
  const tasks = group.map(a => `<agent_task id="${a.type}" name="${a.name}">\n${a.promptTemplate}\n</agent_task>`).join('\n');
  return `You are a collection of ${group.length} specialized agents evaluating an assistant draft.

<context>
<character>${ctx.character.name}</character>
<user_message>${ctx.userMessage}</user_message>
<assistant_draft>${ctx.assistantDraft}</assistant_draft>
</context>

<agents>
${tasks}
</agents>

─── REQUIRED OUTPUT FORMAT ───
For each agent above, emit exactly one <result> element:
<result agent="continuity">{ "outcome": "pass|retry|block", "feedback": "...", "data": {...} }</result>
<result agent="format-guardian">{ ... }</result>
Emit ONLY these result tags. No prose outside.`;
}

function parseBatchedResponse(text: string, group: AgentConfig[]): Record<string, any> {
  const out: Record<string, any> = {};
  const re = /<result agent="([^"]+)">([\s\S]*?)<\/result>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try { out[m[1]] = JSON.parse(m[2].trim()); }
    catch { out[m[1]] = { outcome: 'pass', feedback: 'parse_error' }; }
  }
  return out;
}
```

#### 9.3.2 Tiga adapter lagi

Hari ini: `repetition` (algoritma lokal, no LLM call — tetap jalan as "local agent"), `tone-guardian`, `world-state`.

Untuk `repetition` yang ngga butuh LLM:

```ts
async function adaptRepetition(config: AgentConfig, ctx: AgentExecutionContext): Promise<AgentResult> {
  const start = Date.now();
  const res = detectRepetition(ctx.assistantDraft, ctx.session.id); // existing
  return {
    agentType: 'repetition',
    outcome: res.hasRepetition ? 'retry' : 'pass',
    feedback: res.correctionPrompt,
    data: { ngramMatches: res.matches },
    latencyMs: Date.now() - start,
    tokensIn: 0, tokensOut: 0,
  };
}
```

**`world-state` adapter** — wrap `scene-state-parser.parseAndStore()`. Hasilnya bukan retry/block — hanya update `session.metadata.sceneState`. Jadi `outcome: 'pass'` always; `data: { newSceneState }`.

#### 9.3.3 FE Settings page

**File:** `packages/web/src/app/settings/agents/page.tsx`

List semua agent user (pakai `GET /api/agents`):
- toggle enable/disable
- edit prompt template (untuk builtin dengan LLM call) 
- edit runInterval
- pilih connection (BYOK) — dropdown dari list connections
- tombol "Tambah custom agent" — form buat `agent_configs` baru dengan `type = 'custom-<slug>'`

Juga: `/settings/agents/:id/runs` — show last 50 `agent_runs` dengan tokens, latency, outcome. Debugging surface.

#### 9.3.4 Shadow-mode comparator

**File baru:** `packages/server/src/services/agents/shadow-compare.ts`

Cron / async worker: setiap turn dengan `shadow=true` result tersimpan, bandingkan dengan legacy decision yang disimpan sementara di `session.metadata.lastLegacyDecision`:

```ts
export async function compareShadow(sessionId: string, turnIndex: number) {
  const shadowResults = await db.query.agentRuns.findMany({
    where: and(eq(agentRuns.sessionId, sessionId), eq(agentRuns.turnIndex, turnIndex), eq(agentRuns.shadow, true)),
  });
  const legacy = /* load from session.metadata or prompt_snapshots */;
  const matches = shadowResults.filter(s => legacyOutcomeFor(s.agentType, legacy) === s.resultData.outcome);
  const rate = matches.length / shadowResults.length;
  await db.insert(agentShadowCompares).values({ sessionId, turnIndex, matchRate: rate });
}
```

Dashboard ops: `/ops/agents/shadow-rate` — chart match rate per agent type, 7 hari. Target ≥ 95% sebelum flip `AGENT_PIPELINE_ENABLED=true`.

#### 9.3.5 Commit Day 10

```
feat(X2.7 day10): agent pipeline batching + 3 adapters + shadow comparator

- agent-pipeline.ts real batching (<agent_task>/<result> format)
- adapters: repetition, tone-guardian, world-state
- FE /settings/agents list + toggle + runs debug view
- services/agents/shadow-compare.ts + ops dashboard
- all 5 post_processing validators now have agent-pipeline path (shadow mode)

Per PLAN_IMPLEMENTSv3 §Day10. Target 3-day shadow stability before enabling live.
```

### 9.4 Day 9-10 exit

- [ ] Migrasi 0028 applied di dev+staging.
- [ ] Backfill script run untuk user existing.
- [ ] Shadow-mode match rate captured untuk 5 validator.
- [ ] FE /settings/agents end-to-end (toggle + runs view).
- [ ] Legacy path UNCHANGED (diff snapshot orchestrator same).
- [ ] Batching test: 3 agent type dengan connection sama → 1 API call, parsed ke 3 result.

---

## Day 11 — X2.4 Marker-based reorderable prompt preset

**Effort:** ~6 jam. **Risk:** medium. Prereq Day 1 XML (flag bisa OFF saat marker emit markdown) + Day 4 macros.

### 11.1 Schema extend

**File:** `packages/server/drizzle/0028` atau `0029` (sudah dipakai) — **JANGAN bikin migrasi baru**. Tambah kolom via migrasi ALTER kecil:

**File:** `packages/server/drizzle/0030_prompt_presets_sections.sql`

```sql
ALTER TABLE prompt_presets
  ADD COLUMN IF NOT EXISTS sections_json jsonb NOT NULL DEFAULT '[]'::jsonb;
```

(Jika 0030 sudah dipakai untuk context_blobs, shift ke 0031/0032 — cek `ls packages/server/drizzle/` sebelum commit.)

### 11.2 Seed migrasi: snapshot current builder order

Karena builder sekarang hardcoded order, buat seed yang membaca builder dan dump order default:

**File:** `packages/server/src/db/seed-default-preset-sections.ts`

```ts
export const DEFAULT_SECTIONS: PresetSection[] = [
  { identifier: 'system_persona',   role: 'system', enabled: true,  isMarker: false, wrap: 'none',     content: 'You are …' },
  { identifier: 'character',        role: 'system', enabled: true,  isMarker: true,  wrap: 'xml',      markerConfig: { type: 'character' } },
  { identifier: 'persona',          role: 'system', enabled: true,  isMarker: true,  wrap: 'xml',      markerConfig: { type: 'persona' } },
  { identifier: 'scenario',         role: 'system', enabled: true,  isMarker: true,  wrap: 'xml',      markerConfig: { type: 'scenario' } },
  { identifier: 'scene_state',      role: 'system', enabled: true,  isMarker: true,  wrap: 'xml',      markerConfig: { type: 'scene_state' } },
  { identifier: 'lorebook_before',  role: 'system', enabled: true,  isMarker: true,  wrap: 'xml',      markerConfig: { type: 'lorebook', position: 'before_char' } },
  { identifier: 'memory',           role: 'system', enabled: true,  isMarker: true,  wrap: 'xml',      markerConfig: { type: 'memory' } },
  { identifier: 'mistakes',         role: 'system', enabled: true,  isMarker: true,  wrap: 'xml',      markerConfig: { type: 'recent_drift' } },
  { identifier: 'diary',            role: 'system', enabled: true,  isMarker: true,  wrap: 'xml',      markerConfig: { type: 'diary_reflection' } },
  { identifier: 'chat_history',     role: 'system', enabled: true,  isMarker: true,  wrap: 'none',     markerConfig: { type: 'chat_history', maxMessages: 40 } },
  { identifier: 'lorebook_after',   role: 'system', enabled: true,  isMarker: true,  wrap: 'xml',      markerConfig: { type: 'lorebook', position: 'after_char' } },
  { identifier: 'author_note',      role: 'system', enabled: true,  isMarker: true,  wrap: 'xml',      markerConfig: { type: 'author_note', depth: 4 } },
  { identifier: 'output_format',    role: 'system', enabled: true,  isMarker: false, wrap: 'xml',      content: DEFAULT_OUTPUT_FORMAT },
];
```

Backfill: untuk semua preset di DB dengan `sections_json = '[]'`, set ke DEFAULT_SECTIONS.

### 11.3 Builder refactor

**File:** `packages/server/src/prompts/builder.ts`

Tambah public entrypoint baru:

```ts
export async function buildSystemPromptFromSections(args: BuildArgs): Promise<string> {
  if (!env.PROMPT_PRESET_MARKER_MODE) {
    return buildSystemPromptLegacy(args); // existing hardcoded-order path
  }

  const preset = await loadPreset(args.presetId);
  const sections = preset.sectionsJson ?? DEFAULT_SECTIONS;
  const out: string[] = [];

  for (const s of sections) {
    if (!s.enabled) continue;
    const content = s.isMarker
      ? await expandMarker(s.markerConfig!, args)
      : resolveMacros(s.content ?? '', args.macroCtx, 'resolve').text;
    if (!content.trim()) continue;
    out.push(wrap(s.wrap, s.identifier, content));
  }

  return out.join('\n\n');
}

function wrap(wrap: 'xml'|'markdown'|'none', identifier: string, content: string): string {
  if (wrap === 'xml') return `<${identifier}>\n${content.trim()}\n</${identifier}>`;
  if (wrap === 'markdown') return `## ${identifier}\n${content.trim()}`;
  return content.trim();
}
```

`expandMarker` switch per `markerConfig.type` memanggil existing helper:

```ts
async function expandMarker(cfg: MarkerConfig, args: BuildArgs): Promise<string> {
  switch (cfg.type) {
    case 'character':         return formatCharacterBrief(args.character);
    case 'persona':           return formatPersona(args.persona);
    case 'scenario':          return formatScenario(args);
    case 'scene_state':       return formatSceneState(args.session.metadata?.sceneState);
    case 'lorebook':          return formatLorebook(args, cfg.position);
    case 'memory':            return formatMemory(args.memoryResults);
    case 'recent_drift':      return formatDrift(args.mistakes);
    case 'diary_reflection':  return formatDiary(args.diary);
    case 'chat_history':      return ''; // chat_history is role-based, handled in message array
    case 'author_note':       return formatAuthorNote(args.character, cfg.depth);
    case 'agent_data':        return formatAgentData(args, cfg.agentType!);
    default: return '';
  }
}
```

**Penting:** `chat_history` marker di section list tidak emit system string — tapi signal builder untuk **inject messages array** di posisi tertentu. Return empty + set flag `positionOfHistory = index` untuk caller:

```ts
// caller gets positionOfHistory, splits out + messagesArray for final LLM call
const { systemBefore, systemAfter, positionOfHistory } = await buildSystemPromptFromSections(args);
// compose messages: [{ role: 'system', content: systemBefore }, ...history, { role: 'system', content: systemAfter }]
```

### 11.4 FE editor — drag-drop dnd-kit

**File:** `packages/web/src/app/settings/presets/[id]/page.tsx` (atau modal di list page)

Pakai `@dnd-kit/sortable`:

```tsx
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

function SectionRow({ section }: { section: PresetSection }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section.identifier });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button {...attributes} {...listeners} aria-label="Drag">⋮⋮</button>
      <span>{section.identifier}</span>
      <Toggle checked={section.enabled} onChange={(v) => updateSection(section.identifier, { enabled: v })} />
      <select value={section.wrap} onChange={(e) => updateSection(section.identifier, { wrap: e.target.value as any })}>
        <option value="xml">XML</option>
        <option value="markdown">Markdown</option>
        <option value="none">None</option>
      </select>
      {section.isMarker && <MarkerConfigEditor cfg={section.markerConfig} onChange={...} />}
    </div>
  );
}
```

Preview panel: klik "Preview" → POST `/api/presets/:id/preview` dengan sample session context → return rendered prompt + token estimate per section. Pakai real tokenizer dari Day 12 (kalau Day 12 belum ship, pakai estimate `Math.ceil(chars/4)` sebagai fallback dengan badge "estimate").

### 11.5 Test

```ts
it('reordering lorebook before vs after history reflects in snapshot', async () => {
  const presetA = await createPreset(user, { sections: SECTIONS_LOREBOOK_BEFORE });
  const presetB = await createPreset(user, { sections: SECTIONS_LOREBOOK_AFTER });
  const promptA = await buildSystemPromptFromSections({ presetId: presetA.id, ...fixture });
  const promptB = await buildSystemPromptFromSections({ presetId: presetB.id, ...fixture });
  expect(promptA.indexOf('<lorebook>')).toBeLessThan(promptA.indexOf('chat_history'));
  expect(promptB.indexOf('<lorebook>')).toBeGreaterThan(promptB.indexOf('chat_history'));
});

it('disabling section omits it entirely', async () => {
  const sections = DEFAULT_SECTIONS.map(s => s.identifier === 'mistakes' ? { ...s, enabled: false } : s);
  const prompt = await buildSystemPromptFromSections({ sections, ...fixture });
  expect(prompt).not.toMatch(/<mistakes>/);
});
```

### 11.6 Commit

```
feat(X2.4 day11): marker-based reorderable preset sections

- drizzle/0030_prompt_presets_sections.sql (ALTER sections_json jsonb)
- db/seed-default-preset-sections.ts + backfill for existing presets
- prompts/builder.ts buildSystemPromptFromSections() + expandMarker()
- env.ts PROMPT_PRESET_MARKER_MODE=false (rollout via flag)
- web/app/settings/presets/[id] dnd-kit editor + live preview

Per PLAN_IMPLEMENTSv3 §Day11. Legacy path preserved; activated by flag.
```

### 11.7 Day 11 exit

- [ ] Kolom `sections_json` ada di semua preset (backfilled).
- [ ] Legacy builder path tidak tersentuh (flag off → identical output).
- [ ] Drag-drop editor jalan; reorder → save → next chat prompt snapshot reflect urutan baru.
- [ ] Disable section → section hilang dari prompt.
- [ ] Preview endpoint return token count per section.

---

## Handoff ke v4

Setelah Day 11: agent pipeline live di shadow, marker preset editor live behind flag. Stack punya arsitektur modular yang unblock X6 H2 World Info Inspector, X7 prompt-cache visibility per section, custom agent authoring.

**Next (baca `PLAN_IMPLEMENTSv4.md`):** Day 12 Prompt Info overlay + auto-continue + tokenizer bundle, Day 13 FE backfill (schedules/handoff/backstory/quiet-hours/diary BullMQ), Day 14 frontier state (X4.3) + smart-trigger policy (X4.6). Closing 14-day batch.

---

*File revision: PLAN_IMPLEMENTSv3 · 2026-04-22 · Day 9-11.*
