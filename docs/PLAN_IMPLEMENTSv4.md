> 🟡 **STATUS (apr 2026): DAY 13 FE BACKFILL SHIPPED.** 🔴 §12.1 tokenizer 4-family factory — obsolete; code chose cl100k universal proxy. ❌ §12.1 Prompt Info overlay → [BACKLOG.md](BACKLOG.md) B0.3. 🟡 §12.3 auto-continue helper shipped; orchestrator wiring → [BACKLOG.md](BACKLOG.md) B0.2. 🟡 §14.1 frontier state migration done; `context-maintenance.ts` BullMQ worker → [BACKLOG.md](BACKLOG.md) B1.5. ✅ §14 smart-trigger policy.

---

# PLAN_IMPLEMENTS v4 — Day 12-14 (Prompt Info overlay + FE backfill + smart-trigger)

> Lanjutan dari [PLAN_IMPLEMENTSv3.md](PLAN_IMPLEMENTSv3.md). Baca pre-flight §0 di [PLAN_IMPLEMENTSv1.md](PLAN_IMPLEMENTSv1.md).
>
> **Scope:** Day 12 X3.1 Prompt Info overlay + X3.2 auto-continue + X3.3 real tokenizer, Day 13 X8 FE backfill semua yang hutang PLANv2, Day 14 X4.3 frontier state + X4.6 smart-trigger policy.
>
> **Prereq:** Day 1 XML wrap (untuk F4 diff), Day 3 cache metrics (untuk overlay field), Day 11 marker preset (untuk per-section breakdown — tidak wajib, fallback global count).

---

## Day 12 — X3.1 Prompt Info overlay + X3.2 auto-continue + X3.3 real tokenizer

**Effort:** ~7 jam. **Risk:** rendah (overlay read-only), medium (tokenizer bundle size).

### 12.1 X3.3 Real tokenizer (ship pertama — X3.1 consumer-nya)

#### 12.1.1 Paket + lazy load strategy

Target: 4 tokenizer family selectable per model.

| Family | Package | Bundle cost |
|---|---|---|
| GPT (OAI + OpenRouter GPT) | `tiktoken` / `js-tiktoken` | ~120KB gzip |
| Claude (Anthropic) | `@anthropic-ai/tokenizer` | ~80KB gzip |
| Llama / Mistral / Gemma | `@xenova/transformers` (tokenizer-only) | ~180KB gzip (worst) |
| Fallback | Estimate `Math.ceil(chars/4)` | 0 |

**Strategy:** server-side semua di `@neigo/shared` tokenizer service (Node runtime cache); client-side **lazy-load per model family** via dynamic import di settings editor dan overlay.

#### 12.1.2 Service wrapper

**File baru:** `packages/shared/src/utils/tokenizer.ts`

```ts
type TokenizerFn = (text: string) => number;

const CACHE = new Map<string, TokenizerFn>();

export async function getTokenizer(modelSlug: string): Promise<TokenizerFn> {
  const family = familyFor(modelSlug);
  if (CACHE.has(family)) return CACHE.get(family)!;
  const fn = await loadFamily(family);
  CACHE.set(family, fn);
  return fn;
}

function familyFor(slug: string): 'gpt' | 'claude' | 'llama' | 'estimate' {
  if (slug.startsWith('openai/') || slug.startsWith('gpt-')) return 'gpt';
  if (slug.includes('claude') || slug.startsWith('anthropic/')) return 'claude';
  if (slug.includes('llama') || slug.includes('mistral') || slug.includes('gemma')) return 'llama';
  return 'estimate';
}

async function loadFamily(f: string): Promise<TokenizerFn> {
  if (f === 'gpt') {
    const { encoding_for_model } = await import('js-tiktoken');
    const enc = encoding_for_model('gpt-4o');
    return (t) => enc.encode(t).length;
  }
  if (f === 'claude') {
    const { countTokens } = await import('@anthropic-ai/tokenizer');
    return (t) => countTokens(t);
  }
  if (f === 'llama') {
    const { AutoTokenizer } = await import('@xenova/transformers');
    const tok = await AutoTokenizer.from_pretrained('Xenova/llama-tokenizer');
    return (t) => tok.encode(t).length;
  }
  return (t) => Math.ceil(t.length / 4);
}
```

#### 12.1.3 Wire di server

**File:** `packages/server/src/services/prompt-snapshot.ts`

Saat store snapshot, kalkulasi `tokens_total` dan per-section count pakai tokenizer real:

```ts
const tokenizer = await getTokenizer(modelSlug);
const perSection = sections.map(s => ({ identifier: s.identifier, tokens: tokenizer(s.content) }));
await db.insert(promptSnapshots).values({
  ...,
  metadata: { ...metadata, perSectionTokens: perSection, modelFamily: familyFor(modelSlug) },
});
```

#### 12.1.4 Wire di FE preset preview

Editor preset Day 11 sekarang pakai `Math.ceil(chars/4)` — ganti ke lazy-loaded tokenizer:

```tsx
const [tokenizer, setTokenizer] = useState<TokenizerFn | null>(null);
useEffect(() => { getTokenizer(currentModel).then(setTokenizer); }, [currentModel]);
const count = tokenizer ? tokenizer(section.content) : Math.ceil(section.content.length/4);
```

#### 12.1.5 Bundle size guardrail

Tambah di CI (atau manual check):

```bash
pnpm --filter @neigo/web build
# Check .next/static/chunks sizes; tokenizer chunks harus lazy (NOT in main bundle)
```

Kalau tiktoken masuk main bundle, review `next.config.ts` dynamic import handling.

#### 12.1.6 Commit

```
feat(X3.3 day12): real tokenizer per model family (lazy-loaded)

- shared/utils/tokenizer.ts factory with family detection + cache
- prompt-snapshot.ts records per-section token counts with real tokens
- preset editor preview uses real tokenizer (lazy fetch per model)
- bundle: tokenizer chunks lazy, main bundle unaffected

Per PLAN_IMPLEMENTSv4 §Day12.
```

### 12.2 X3.1 Prompt Info overlay

#### 12.2.1 Data source

Reuse `prompt_snapshots` (migrasi 0016 sudah ada). Endpoint baru readonly:

**File:** `packages/server/src/routes/sessions.ts` tambah:

```ts
sessionRouter.get('/:id/messages/:messageId/prompt-info', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const messageId = c.req.param('messageId');
  // verify ownership
  const session = await loadOwnedSession(sessionId, userId);
  if (!session) return c.json({ error: 'not_found' }, 404);

  const snap = await db.query.promptSnapshots.findFirst({
    where: eq(promptSnapshots.messageId, messageId),
  });
  if (!snap) return c.json({ error: 'no_snapshot' }, 404);

  return c.json({
    model: snap.modelSlug,
    presetName: snap.presetName,
    totalTokens: snap.totalTokens,
    perSection: snap.metadata?.perSectionTokens ?? [],
    cacheMetrics: snap.metadata?.cacheMetrics ?? null,
    validators: snap.metadata?.validators ?? [],       // from orchestrator
    retries: snap.metadata?.retries ?? 0,
    latencyMs: snap.metadata?.latencyMs,
    regexApplied: snap.metadata?.regexApplied ?? [],
    agentRuns: snap.metadata?.agentRunIds ?? [],       // kalau Day 9-10 shipped
  });
});
```

#### 12.2.2 FE component

**File baru:** `packages/web/src/components/chat/PromptInfoModal.tsx`

```tsx
export function PromptInfoModal({ messageId, sessionId, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['prompt-info', sessionId, messageId],
    queryFn: () => api.get(`/api/sessions/${sessionId}/messages/${messageId}/prompt-info`),
  });
  if (isLoading) return <Modal onClose={onClose}><Spinner/></Modal>;
  if (!data) return <Modal onClose={onClose}>No snapshot</Modal>;
  return (
    <Modal onClose={onClose}>
      <dl>
        <dt>Model</dt><dd>{data.model}</dd>
        <dt>Preset</dt><dd>{data.presetName}</dd>
        <dt>Total</dt><dd>{data.totalTokens} tokens · {data.latencyMs}ms</dd>
        <dt>Retries</dt><dd>{data.retries}</dd>
      </dl>

      <section>
        <h3>Section breakdown</h3>
        <ul>
          {data.perSection.map(s => <li key={s.identifier}>{s.identifier}: {s.tokens}t</li>)}
        </ul>
      </section>

      {data.cacheMetrics && (
        <section>
          <h3>Prompt cache</h3>
          <p>Read {data.cacheMetrics.cacheReadInputTokens ?? 0} · Write {data.cacheMetrics.cacheCreationInputTokens ?? 0}</p>
        </section>
      )}

      <section>
        <h3>Validators</h3>
        <ul>{data.validators.map(v => <li key={v.type}>{v.type}: {v.outcome}</li>)}</ul>
      </section>

      {data.regexApplied.length > 0 && (
        <section><h3>Regex applied</h3><ul>{data.regexApplied.map(id => <li key={id}>{id}</li>)}</ul></section>
      )}
    </Modal>
  );
}
```

#### 12.2.3 Trigger button di bubble

**File:** `packages/web/src/app/chat/[sessionId]/page.tsx` (atau bubble component)

Di bubble assistant, footer action bar tambah button "🔍 Info" yang buka modal. Gate: `session.userId === user.id` (owner only).

#### 12.2.4 Commit

```
feat(X3.1 day12): Prompt Info overlay on assistant bubbles (owner-only)

- server/routes/sessions.ts GET /:id/messages/:mid/prompt-info
- web/components/chat/PromptInfoModal.tsx
- bubble action-bar adds 🔍 Info button
- surfaces: model, preset, per-section tokens, cache metrics, validators, retries, regex applied

Per PLAN_IMPLEMENTSv4 §Day12.
```

### 12.3 X3.2 Auto-continue on incomplete sentence

#### 12.3.1 Helper

**File baru:** `packages/shared/src/utils/completion-check.ts`

```ts
const PUNCT = /[.!?。…！？♡]["')\]]?\s*$/;

export function isCompleteSentence(text: string): boolean {
  return PUNCT.test(text.trimEnd());
}

export function trimUntilPunctuation(text: string): string {
  const m = text.match(/^([\s\S]*[.!?。…！？♡])[^.!?。…！？♡]*$/);
  return m ? m[1] : text;
}
```

Unit test: `"Hi there.", "Wait-"`, `"Oke nih…"`, emoji-final all covered.

#### 12.3.2 Wire di orchestrator

**File:** `packages/server/src/services/orchestrator.ts`

Setelah stream complete dan validator chain pass:

```ts
const autoContinueLimit = 1;
let autoContinued = 0;
const userPref = user.metadata?.autoContinueOnCut ?? true; // default ON per env.ts default
const hitMaxTokens = response.finishReason === 'length';

while (
  env.AUTO_CONTINUE_ENABLED &&
  userPref &&
  autoContinued < autoContinueLimit &&
  hitMaxTokens &&
  !isCompleteSentence(accumulated)
) {
  const continuation = await runSinglePass({
    ...args,
    continueFrom: accumulated,
    isContinuation: true,
  });
  accumulated += continuation;
  autoContinued++;
}
```

`runSinglePass` sudah terima `continueFrom` / `isContinuation` dari BRAINSTORM T3.12 (confirm via grep; kalau belum, tambah param yang forward `append: true` ke `chatMessages.content`).

#### 12.3.3 User toggle

Settings → `autoContinueOnCut: boolean`. Default `true`. Toggle di `/settings/notifications` (atau page appearance karena bukan notif per se — pilih page yang paling masuk; ikut pola `/settings/appearance`).

#### 12.3.4 Acceptance

- Cut response simulasi: kirim request dengan `maxTokens=20` ke prompt panjang. Response terpotong `"and then sh"`. Next turn auto-continue muncul melanjutkan.
- Guard: max 1x per turn (prevent infinite loop).
- User toggle OFF → no auto-continue walau cut.

#### 12.3.5 Commit

```
feat(X3.2 day12): auto-continue on incomplete sentence (max 1/turn)

- shared/utils/completion-check.ts (PUNCT regex, trimUntilPunctuation)
- orchestrator.ts re-fire continue when finishReason=length + !isComplete
- user.metadata.autoContinueOnCut toggle (default true)

Per PLAN_IMPLEMENTSv4 §Day12.
```

### 12.4 Day 12 exit

- [ ] Tokenizer bundle lazy-loaded; main Next bundle tidak membengkak >80KB.
- [ ] Prompt Info modal render semua section breakdown + cache metrics.
- [ ] Cut-sentence test lulus: max 1 auto-continue, guard OFF toggle bekerja.

---

## Day 13 — X8 FE backfill (schedules + handoff + backstory + quiet-hours + diary BullMQ)

**Effort:** ~8 jam. **Risk:** rendah per item (banyak item kecil). Total besar karena 5 page baru.

### 13.1 /settings/schedules

**File baru:** `packages/web/src/app/settings/schedules/page.tsx`

Backend `routes/schedules.ts` sudah ada (session_schedules migrasi 0022). FE perlu:

- List upcoming scheduled messages: `GET /api/schedules?sessionId=?`
- Form tambah: `sessionId` (dropdown user sessions aktif) + `cadence` (`daily`/`weekly`/`custom cron`) + `time` (picker user-tz) + `enabled` toggle.
- Cancel per entry: `DELETE /api/schedules/:id`.

Consistent dengan UI style existing settings page lain (lihat `/settings/notifications/page.tsx` untuk layout reference).

### 13.2 /handoff (desktop) + /handoff/claim (mobile)

**File baru:** `packages/web/src/app/handoff/page.tsx`

Desktop flow:
1. Button "Generate QR" → `POST /api/handoff/token` (backend sudah ada) → dapat JWT + URL `/handoff/claim?token=...`.
2. Render QR via `qrcode` lib (`pnpm add qrcode react-qr-code -F @neigo/web`).
3. Polling `GET /api/handoff/status/:tokenId` setiap 2 detik untuk detect claimed; setelah claimed → toast "Device lain sudah masuk".
4. Token TTL 3 menit; expired → regenerate.

**File baru:** `packages/web/src/app/handoff/claim/page.tsx`

Mobile flow:
1. Read `?token=` dari URL.
2. `POST /api/handoff/claim` dengan token → set session cookie.
3. Redirect ke `/`.
4. Kalau token invalid/expired → error UI.

### 13.3 Backstory tier editor di /characters/[id]/edit

**File:** `packages/web/src/app/characters/[id]/edit/page.tsx` — tambah tab "Backstory Tiers":

```tsx
<BackstoryEditor
  tiers={character.metadata?.backstoryTiers ?? []}
  onChange={(tiers) => patchCharacter({ metadata: { ...character.metadata, backstoryTiers: tiers }})}
/>
```

Component:

```tsx
function BackstoryEditor({ tiers, onChange }) {
  return (
    <div>
      {tiers.map((t, i) => (
        <div key={i}>
          <label>Trust ≥</label>
          <input type="number" value={t.trustThreshold} onChange={e => update(i, { trustThreshold: +e.target.value })} />
          <textarea value={t.text} onChange={e => update(i, { text: e.target.value })} />
          <button onClick={() => remove(i)}>Hapus</button>
        </div>
      ))}
      <button onClick={() => onChange([...tiers, { trustThreshold: 0, text: '' }])}>Tambah tier</button>
    </div>
  );
}
```

Sort by `trustThreshold` asc before submit. Backend `backstory-reveal.ts` baca field ini.

### 13.4 Quiet hours UI di /settings

**File:** `packages/web/src/app/settings/page.tsx` (root atau notif page)

```tsx
<Section title="Quiet hours">
  <TimePicker label="Mulai" value={prefs.quietHoursStart ?? '22:00'} onChange={v => update({ quietHoursStart: v })} />
  <TimePicker label="Selesai" value={prefs.quietHoursEnd ?? '08:00'} onChange={v => update({ quietHoursEnd: v })} />
  <p className="text-sm text-gray-400">Schedule Planner + Recap Push + Letters respect jam ini.</p>
</Section>
```

Backend sudah baca field — cukup patch `PATCH /api/me/preferences` accept fields.

### 13.5 Diary rollup → BullMQ repeatable

**File:** `packages/server/src/services/character-diary-rollup.ts`

Ganti `setInterval(rollup, 24*60*60*1000)` dengan BullMQ:

```ts
// on app init
if (!env.DISABLE_DIARY_ROLLUP_QUEUE) {
  await queue.add('diary-rollup', {}, {
    repeat: { pattern: '0 3 * * *' }, // 03:00 daily
    jobId: 'diary-rollup-daily',      // idempotent — only 1 repeat job
  });
}

// worker
worker.process('diary-rollup', async () => {
  for (const userId of await listActiveUsers()) {
    await rollupUser(userId);
  }
});
```

**Migration guard:** remove setInterval call; deploy akan bisa horizontal scale tanpa double-emit.

### 13.6 Commit (bisa pecah 3-5 commit)

```
feat(X8 day13a): /settings/schedules page
feat(X8 day13b): /handoff + /handoff/claim QR pairing UI
feat(X8 day13c): backstory tier editor tab in /characters/[id]/edit
feat(X8 day13d): quiet hours time picker in /settings
chore(X8 day13e): migrate diary rollup setInterval -> BullMQ repeatable
```

### 13.7 Day 13 exit

- [ ] 4 page FE baru mendarat (schedules, handoff desktop, handoff claim, backstory tab).
- [ ] QR pairing end-to-end: desktop → scan → mobile masuk session.
- [ ] Diary rollup tidak lagi tergantung process uptime; horizontal scale safe.
- [ ] Quiet hours toggle written ke `user.metadata.quietHoursStart/End`.

---

## Day 14 — X4.3 Frontier state + X4.6 Smart-trigger recall/save policy

**Effort:** ~6 jam. **Risk:** medium (policy mempengaruhi cost — test dulu dengan small sample).

### 14.1 X4.3 `session_context_state` frontier

#### 14.1.1 Migrasi

**File:** `packages/server/drizzle/0032_session_context_state.sql` (nomor final cek `ls drizzle/` saat eksekusi)

```sql
CREATE TABLE session_context_state (
  session_id uuid PRIMARY KEY REFERENCES chat_sessions(id) ON DELETE CASCADE,
  last_compacted_turn integer NOT NULL DEFAULT 0,
  maintenance_debt integer NOT NULL DEFAULT 0,      -- how many uncompacted turns
  snapshot_fresh_at timestamptz,                     -- last wake-up packet generation
  wake_up_packet jsonb,                              -- precomputed context for fast cold-start
  frontier_depth integer NOT NULL DEFAULT 0,         -- current DAG depth
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE session_context_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY scs_owner ON session_context_state
  USING (
    session_id IN (SELECT id FROM chat_sessions WHERE user_id = current_setting('app.user_id', true)::uuid)
  );
```

#### 14.1.2 Wire di context-compaction

**File:** `packages/server/src/services/context-compaction.ts`

Setiap run compact, upsert state:

```ts
await db.insert(sessionContextState).values({
  sessionId,
  lastCompactedTurn: latestTurnIdx,
  maintenanceDebt: 0,
  frontierDepth: currentDepth,
  updatedAt: new Date(),
}).onConflictDoUpdate({
  target: sessionContextState.sessionId,
  set: { lastCompactedTurn: latestTurnIdx, maintenanceDebt: 0, frontierDepth: currentDepth, updatedAt: new Date() },
});
```

Maintenance debt increment saat turn selesai tapi belum compact:

```ts
await db.update(sessionContextState)
  .set({ maintenanceDebt: sql`${sessionContextState.maintenanceDebt} + 1` })
  .where(eq(sessionContextState.sessionId, sessionId));
```

#### 14.1.3 Background cron `context-maintenance.ts`

**File baru:** `packages/server/src/services/context-maintenance.ts`

```ts
export async function maintenanceTick() {
  const candidates = await db.select()
    .from(sessionContextState)
    .where(gt(sessionContextState.maintenanceDebt, 10))
    .orderBy(desc(sessionContextState.maintenanceDebt))
    .limit(20);

  for (const s of candidates) {
    try { await compactSession(s.sessionId); }
    catch (e) { logger.error({ e, sessionId: s.sessionId }, 'maintenance compact failed'); }
  }
}
```

Register BullMQ repeatable: setiap 5 menit.

#### 14.1.4 Wake-up packet

Saat session idle ≥ 1 jam (cek `updatedAt`), worker precompute `wake_up_packet`:

```ts
{
  pinnedMemories: [...top 5],
  currentMood: {...},
  currentSceneState: {...},
  recentMistakes: [...top 3],
  diarySnippet: '...last 3-day rollup',
}
```

Disimpan ke `wake_up_packet jsonb`. Saat user reopen session, endpoint `GET /api/sessions/:id` include `wakeUpPacket` → FE render greeting atau inject ke system prompt pertama (skip expensive RRF first turn).

#### 14.1.5 Commit

```
feat(X4.3 day14): session_context_state frontier + maintenance cron + wake-up packet

- drizzle/0032_session_context_state.sql + RLS
- context-compaction.ts upserts state per run
- new context-maintenance.ts background worker (BullMQ every 5m)
- wake-up packet precompute for idle sessions (≥1h)
- GET /api/sessions/:id returns wakeUpPacket for cold-start

Per PLAN_IMPLEMENTSv4 §Day14.
```

### 14.2 X4.6 Smart-trigger recall/save policy

#### 14.2.1 Heuristic policy service

**File baru:** `packages/server/src/services/memory-policy.ts`

```ts
export function shouldRecall(userMsg: string, session: Session): { recall: boolean; reason: string } {
  const trimmed = userMsg.trim();
  if (trimmed.length < 20) return { recall: false, reason: 'too_short' };
  if (isGreetingOnly(trimmed)) return { recall: false, reason: 'greeting_only' };
  if (session.turnCount < 3) return { recall: true, reason: 'early_turn' }; // always recall early
  return { recall: true, reason: 'default' };
}

const GREETING_RE = /^(hai|halo|hi|hey|pagi|siang|sore|malam|konbanwa|ohayou|otsu)[\s\W]*$/i;
function isGreetingOnly(t: string): boolean { return GREETING_RE.test(t); }

export function shouldSave(response: string, priorMood: number, newMood: number, hadPromise: boolean): { save: boolean; reason: string } {
  if (hadPromise) return { save: true, reason: 'promise_detected' };
  if (Math.abs(newMood - priorMood) > 0.4) return { save: true, reason: 'mood_spike' };
  if (response.length < 50) return { save: false, reason: 'too_short' };
  if (isSmalltalkPattern(response)) return { save: false, reason: 'smalltalk' };
  return { save: true, reason: 'default' };
}
```

#### 14.2.2 Wire di orchestrator

**File:** `packages/server/src/services/orchestrator.ts` `runSinglePass`

Sebelum call `hybridSearchRRF`:

```ts
const policy = shouldRecall(userMsg, session);
let memoryResults: MemoryHit[] = [];
if (env.SMART_RECALL_POLICY_ENABLED && policy.recall) {
  memoryResults = await hybridSearchRRF(...);
} else if (!env.SMART_RECALL_POLICY_ENABLED) {
  memoryResults = await hybridSearchRRF(...);
}
```

Sebelum fire `scheduleSummary` / `extractPromises` / `diaryRollup`:

```ts
const saveDecision = shouldSave(finalResponse, priorMood, newMood, promiseDetected);
if (env.SMART_RECALL_POLICY_ENABLED && !saveDecision.save) {
  // skip save cascade
  logger.debug({ reason: saveDecision.reason }, 'smart-policy skip save');
} else {
  await scheduleSummary(...);
  await extractPromises(...);
  // etc
}
```

#### 14.2.3 Observability

Tambah kolom `metadata.recallSkipped` dan `metadata.saveSkipped` counter di `prompt_snapshots` / `session_events`. Ops dashboard: compare aggregate recall/save rates sebelum vs sesudah flag ON.

Target: 40-60% cost reduction di tail turns mundane (per PLANv3 §X4.6).

#### 14.2.4 Unit test

```ts
it('short message skips recall', () => {
  expect(shouldRecall('oke', mockSession).recall).toBe(false);
});
it('greeting only skips', () => {
  expect(shouldRecall('halo', mockSession).recall).toBe(false);
});
it('mood spike triggers save', () => {
  expect(shouldSave('long response', 0.2, 0.7, false).save).toBe(true);
});
it('promise triggers save regardless of length', () => {
  expect(shouldSave('ok', 0.5, 0.5, true).save).toBe(true);
});
```

#### 14.2.5 Commit

```
feat(X4.6 day14): smart-trigger memory recall/save heuristic policy

- services/memory-policy.ts (shouldRecall + shouldSave)
- orchestrator.ts wires policy gates around RRF + save cascade
- env SMART_RECALL_POLICY_ENABLED=false
- metrics: recallSkipped/saveSkipped counters in prompt_snapshots

Per PLAN_IMPLEMENTSv4 §Day14. Heuristic first; upgrade to classifier LLM if false-negative >20%.
```

### 14.3 Day 14 exit

- [ ] Migrasi 0032 applied.
- [ ] Maintenance cron register di BullMQ; test manual trigger reduces debt.
- [ ] Wake-up packet populated untuk session idle ≥ 1h.
- [ ] Policy unit tests hijau.
- [ ] Ops dashboard shows new metrics (recallSkipped%, saveSkipped%).

---

## Day 12-14 summary — closing 14-day batch

Selesai Day 14 berarti PLANv3 §X10 14-day advanced batch complete:

| Day | Ship |
|---|---|
| 1 | X2.1 XML + X2.8 streaming |
| 2 | X2.2 BYOK test + H9 dup |
| 3 | X3.7 notif + cache metrics |
| 4 | X2.3 CBS macros |
| 5 | X3.6 {{button}} |
| 6 | X2.6 lorebook decorators + recursive |
| 7-8 | X2.5 regex 4-mode |
| 9-10 | X2.7 agent pipeline (shadow) |
| 11 | X2.4 marker preset |
| 12 | X3.1 overlay + X3.2 auto-cont + X3.3 tokenizer |
| 13 | X8 FE backfill |
| 14 | X4.3 frontier + X4.6 policy |

**Post-batch roadmap:** baca [PLAN_IMPLEMENTSv5.md](PLAN_IMPLEMENTSv5.md) untuk REDESIGNv2 D1-D6 verification, LCM Phase 2-4 sisa (X4.1/4.2/4.4/4.5), MARINARA Phase H sisa (H2/H3/H4/H6/H8/H10/H11), dan stretch/§4 originals.

### Flag rollout schedule post-batch

| Flag | Wk 1 | Wk 2 | Wk 3 |
|---|---|---|---|
| `PROMPT_XML_WRAP_ENABLED` | FOUNDER | PAID | ALL |
| `MACRO_ADVANCED_ENABLED` | FOUNDER | PAID | ALL |
| `LOREBOOK_DECORATORS_ENABLED` | FOUNDER | PAID | ALL |
| `LOREBOOK_RECURSIVE_SCAN_ENABLED` | FOUNDER | PAID | ALL |
| `REGEX_SCRIPTS_ENABLED` | FOUNDER | PAID | ALL |
| `AGENT_PIPELINE_SHADOW` | ALL | ALL | — |
| `AGENT_PIPELINE_ENABLED` | — | FOUNDER (if shadow ≥95%) | PAID |
| `PROMPT_PRESET_MARKER_MODE` | FOUNDER | PAID | ALL |
| `AUTO_CONTINUE_ENABLED` | ALL | ALL | ALL |
| `SMART_RECALL_POLICY_ENABLED` | FOUNDER | PAID (monitor cost) | ALL |

### Regression gates per flag flip

Sebelum flip flag ke tier berikutnya:
1. `pnpm -r typecheck` hijau.
2. `pnpm --filter @neigo/server test:replay` 9/9 skenario hijau.
3. `pnpm --filter @neigo/server bench:memory` tidak lebih rendah dari `baseline.json` >5%.
4. Cost dashboard: cost per turn tidak naik >20% (kalau naik tanpa output quality improvement → investigate).
5. Error rate 24h post-flip <0.5%.

---

## Handoff ke v5

Batch 14-day selesai. Berikutnya masuk track paralel (REDESIGNv2 FE + LCM Phase 2-4 backend + MARINARA Phase H sisa).

**Baca `PLAN_IMPLEMENTSv5.md`** — post-batch execution.

---

*File revision: PLAN_IMPLEMENTSv4 · 2026-04-22 · Day 12-14 + flag rollout + closing summary.*
