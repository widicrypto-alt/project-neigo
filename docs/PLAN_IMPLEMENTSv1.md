> ✅ **STATUS (apr 2026): DAY 1–3 COMPLETE.** X2.1 XML wrap ✅ · X2.2 BYOK test-ping ✅ · X2.8 streaming isolation ✅. Migration-number registry in §0.3 is obsolete — actual numbering diverged (context-blobs=0036, lineage=0037, memory-graph=0038). See [INDEX.md](INDEX.md).

---

# PLAN_IMPLEMENTS v1 — Day 1-3 (Foundation + XS wins)

> **Doc series.** Implementasi detail PLANv3 §X2–§X10 dibagi per file supaya tidak time-out saat dibaca/di-edit. Agent cukup baca satu file per sesi eksekusi.
>
> - **v1 (file ini):** Pre-flight audit + Day 1 (XML wrap) + Day 2 (BYOK test-ping + H9 dup) + Day 3 (browser notif + prompt-cache visibility).
> - **v2:** Day 4-8 (CBS macros extend + `{{button}}` + lorebook decorators + regex scripts).
> - **v3:** Day 9-11 (Agent pipeline framework + marker-based preset).
> - **v4:** Day 12-14 (Prompt Info overlay + auto-continue + tokenizer + FE backfill + frontier state + smart-trigger).
> - **v5:** Post-batch (REDESIGNv2 D-items, LCM Phase 2-4 sisa, open questions + rollout).
>
> **Rujukan sumber:** [PLANv3.md](PLANv3.md) §X1–§X12, [PLANv2.md](PLANv2.md) §11, [MARINARA_AUDIT.md](MARINARA_AUDIT.md) §3/§6, [BRAINSTORM.md](BRAINSTORM.md) §11–14.
>
> **Prinsip agent saat eksekusi satu Day:**
> 1. **Baca file v<N> dulu.** Jangan lompat ke Day lain tanpa baca pre-flight di v1.
> 2. **Jalankan step by step.** Satu step = satu commit message minimum. JANGAN gabung 3 step dalam 1 commit.
> 3. **Setiap step beri acceptance test** (grep check / curl check / typecheck). Kalau fail, STOP dan fix sebelum lanjut.
> 4. **Tidak ada file baru tanpa migration/feature-flag/doc-update** yang corresponding. Three-file rule (schema, service, wire-point).
> 5. **Commit prefix:** `feat(Xn.m): <verb>` untuk feature, `chore(migrate): 00XX_<name>` untuk migrasi, `docs(planv3): ...` untuk update status PLANv3.md.

---

## 0. Pre-flight — reality check (WAJIB baca sebelum Day 1)

### 0.1 Verifikasi status shipped (anti-duplikasi)

Beberapa item di PLANv3 §X1 status map **sudah shipped sejak session lalu**. Sebelum klaim "start", konfirmasi dengan grep:

```bash
cd /root/project/project-neigo

# Memory stack T4.x — semua ✅
grep -l "hybridSearchRRF\|CONTEXT_DAG_CONDENSE\|SESSION_SNAPSHOT_ENABLED\|LCM_ESCALATION" packages/server/src

# Migrasi sudah di drizzle/
ls packages/server/drizzle/ | grep -E "0009_session_mistakes|0010_character_diary|0011_character_facts|0023_handoff|0024_character_language|0025_creator_profiles|0026_vn_tables|0027_letters"

# Services sudah eksis
ls packages/server/src/services/ | grep -E "mistakes-registry|character-diary|character-facts|session-snapshot|backstory-reveal|recap-push|schedule-planner|story-runner|letter-reply"

# FE settings pages yang sudah eksis
ls packages/web/src/app/settings/ packages/web/src/app/ | sort
```

**Hasil yang diharapkan:**
- Migrasi 0001–0027 lengkap (⚠️ `0024_character_language_retire.sql`, `0025_creator_profiles.sql`, `0026_vn_tables.sql`, `0027_letters.sql` **sudah ada**).
- Services memory/diary/facts/snapshot/backstory/recap/schedule/story/letter **sudah ada**.
- FE: `/settings/{presets,personas,folders,profile,notifications,appearance,privacy}` ada. `/settings/schedules` + `/handoff` + `/handoff/claim` **belum ada**.
- Macro resolver: `packages/shared/src/utils/macros.ts` **sudah ada** tapi **hanya 7 token** (`{{char}} {{user}} {{persona}} {{time}} {{date}} {{location}} {{weather}}`). Token `{{getvar}} {{setvar}} {{if}} {{calc}} {{button}} {{comment}} {{//}} {{br}}` **belum**.

### 0.2 Update status-map di PLANv3 sebelum mulai

Karena migrasi 0024–0027 + services D1/D3/D4a/D5 sudah partial shipped, **update PLANv3.md §X5** agar tidak misleading di batch depan:

- D1 character purge — **SEBAGIAN ✅** (migrasi kolom `language`/`is_retired`/`allow_in_stories` ada di 0024; cek apakah seed-beta-3 + FE hide filter sudah dilakukan via `grep -r "is_retired" packages/server/src/routes/characters.ts packages/web/src/app/discover`).
- D3 creator profile — **SEBAGIAN ✅** (migrasi 0025 + `routes/creators.ts` eksis; cek `/creators/[handle]` page).
- D4a VN schema + engine — **✅** (migrasi 0026 + `routes/stories.ts` + `services/story-runner.ts`).
- D5 Letters — **✅** (migrasi 0027 + `routes/letters.ts` + `services/letter-reply.ts`).

Agent pipeline (X2.7) tidak lagi clash nomor migrasi dengan D3 karena 0025 sudah dipakai creator_profiles → X2.7 ambil **0028** (karena 0028_session_context_state_state yang dialokasikan X4.3 belum ada; tukar: X4.3 → 0029, X2.7 → 0028). Final allocation di bawah.

### 0.3 Migration number registry (diperbarui)

Nomor migrasi di bawah ini adalah **kontrak** — jangan bentrok:

| Nomor | File | Owner step | Status |
|---|---|---|---|
| 0001–0027 | (existing) | — | ✅ Shipped |
| **0028** | `0028_agent_configs.sql` | Day 9 X2.7 | Akan dibuat |
| **0029** | `0029_regex_scripts.sql` | Day 7 X2.5 | Akan dibuat (dipakai sebelum 0028 secara kronologis; pakai nomor 0029 supaya linear dengan commit order Day-9 selesai lebih dulu kalau paralel — tapi kalau Day 7 commit duluan, angkat ke 0028 dan agent_configs jadi 0029) |
| **0030** | `0030_context_blobs.sql` | Post-batch X4.1 | Akan dibuat |
| **0031** | `0031_context_node_sources.sql` | Post-batch X4.2 | Akan dibuat |
| **0032** | `0032_session_context_state.sql` | Day 14 X4.3 | Akan dibuat |
| **0033** | `0033_memory_graph.sql` | Post-batch X4.5 | Akan dibuat |

**Aturan kolision:** kalau dua Day dijalankan paralel oleh dua agent, agent yang commit duluan pakai nomor lebih kecil, agent kedua bump +1 dan **edit file migrasi miliknya sendiri sebelum `pnpm db:migrate`**. Verifikasi: `ls packages/server/drizzle/00{28..34}*.sql` sebelum commit.

### 0.4 Environment flags yang akan ditambah selama batch ini

Semua feature baru masuk lewat `packages/server/src/lib/env.ts` dengan default **off**. Rollout FOUNDER → PAID → FREE dilakukan via `user.tier` check di runtime, bukan via multiple env.

| Flag | Default | Owner |
|---|---|---|
| `PROMPT_XML_WRAP_ENABLED` | `false` | Day 1 X2.1 |
| `BYOK_TEST_PING_ENABLED` | `true` | Day 2 X2.2 (aman nyala, cuma 1 token) |
| `MACRO_ADVANCED_ENABLED` | `false` | Day 4 X2.3 (setvar/getvar/if/calc) |
| `LOREBOOK_DECORATORS_ENABLED` | `false` | Day 6 X2.6 |
| `LOREBOOK_RECURSIVE_SCAN_ENABLED` | `false` | Day 6 X2.6 |
| `REGEX_SCRIPTS_ENABLED` | `false` | Day 7 X2.5 |
| `AGENT_PIPELINE_ENABLED` | `false` | Day 9 X2.7 |
| `PROMPT_PRESET_MARKER_MODE` | `false` | Day 11 X2.4 |
| `AUTO_CONTINUE_ENABLED` | `true` (user toggle overrides) | Day 12 X3.2 |
| `SMART_RECALL_POLICY_ENABLED` | `false` | Day 14 X4.6 |

### 0.5 Commands yang akan sering dipakai

```bash
# Root-level typecheck
pnpm -r typecheck

# Server migrate (sudah benar load ../../.env)
pnpm --filter @neigo/server db:migrate

# Unit test server
pnpm --filter @neigo/server test

# Unit test shared (macros, regex-runner)
pnpm --filter @neigo/shared test

# Web typecheck + build
pnpm --filter @neigo/web typecheck && pnpm --filter @neigo/web build

# Full replay harness (validator regression)
pnpm --filter @neigo/server test:replay

# Memory benchmark regression gate
pnpm --filter @neigo/server bench:memory

# Deploy prod
bash ops/scripts/deploy-prod.sh
```

**Aturan deploy:** JANGAN deploy kecuali user explicit minta. Semua landing di branch `master` via normal commit. Deploy terpisah.

### 0.6 PR / commit hygiene

Setiap Day menghasilkan **minimal 1 commit, max 3 commit**. Format:

```
feat(X2.1 day1): XML-wrapped prompt sections behind flag

- builder.ts appendCharacterBrief -> <character>…</character>
- builder.ts appendScene -> <scenario>…</scenario>
- builder.ts appendLoreContext -> <lorebook>…</lorebook>
- env.ts add PROMPT_XML_WRAP_ENABLED=false
- builder.test.ts snapshot update guarded by flag

Per PLAN_IMPLEMENTSv1 §Day1. Flag off by default.
```

Tidak ada `git push --force`. Tidak ada commit yang mix feature + unrelated refactor. Tidak ada `--no-verify`.

---

## Day 1 — X2.1 XML-wrapped prompt sections + X2.8 streaming isolation (paired)

**Effort:** ~4 jam. **Risk:** rendah (flagged off).

### 1.1 Why paired

X2.1 edits server `builder.ts`; X2.8 edits web `chat/[sessionId]/page.tsx` + `lib/sse.ts`. Zero file overlap → aman paralel, cukup ship dalam 1 Day block.

### 1.2 Step 1 — Add flag + snapshot baseline

**File:** `packages/server/src/lib/env.ts`

Tambah line (alfabetis di block yang sesuai dengan pola eksisting):

```ts
PROMPT_XML_WRAP_ENABLED: z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true'),
```

**File:** `packages/server/src/prompts/builder.test.ts` (atau buat baru kalau belum ada)

Tambah snapshot test dengan flag OFF (baseline) + flag ON (wrapped). Gunakan `vitest` snapshot:

```ts
import { describe, it, expect } from 'vitest';
import { PromptBuilder } from './builder.js';
import { ChatMode } from '@neigo/shared';

describe('PromptBuilder XML wrap (X2.1)', () => {
  const baseArgs = { /* … fixture lengkap, character=Rei, session=minimal, mode=ROLEPLAY … */ };

  it('flag OFF: produces markdown headers', () => {
    const out = PromptBuilder.buildSystemPrompt(baseArgs);
    expect(out).toMatchSnapshot('builder-md-baseline');
    expect(out).not.toContain('<character>');
  });

  it('flag ON: wraps sections in XML tags', () => {
    process.env.PROMPT_XML_WRAP_ENABLED = 'true';
    const out = PromptBuilder.buildSystemPrompt(baseArgs);
    expect(out).toMatchSnapshot('builder-xml-wrapped');
    expect(out).toMatch(/<character>[\s\S]+?<\/character>/);
    expect(out).toMatch(/<scenario>[\s\S]+?<\/scenario>/);
  });
});
```

**Acceptance step 1:** `pnpm --filter @neigo/server test builder` lulus baseline snapshot (flag OFF). XML test di-`it.skip` dulu sampai step 2 selesai.

### 1.3 Step 2 — Refactor builder.ts pakai wrapping helper

**File:** `packages/server/src/prompts/builder.ts`

Tambah helper private:

```ts
private static wrap(tag: string, content: string): string {
  if (!env.PROMPT_XML_WRAP_ENABLED) return content;
  return `<${tag}>\n${content.trim()}\n</${tag}>`;
}
```

Import `env` dari `../lib/env.js` (sudah pola biasa).

Lalu edit **satu-satu** method berikut (commit per method kalau ingin diff kecil, atau batch 1 commit besar kalau confidence):

| Method | Tag name |
|---|---|
| `appendCharacterBrief` / bagian yang output "## Character" | `character` |
| `appendPersona` | `persona` |
| `appendScenarioOrSceneCard` | `scenario` |
| `appendSceneState` | `scene_state` |
| `appendLoreContext` | `lorebook` |
| `appendMemory*` (pinned / emotional / episodic) | `memory` |
| `appendMistakes` (recent drift) | `recent_drift` |
| `appendDiaryReflection` (kalau eksis dari T4.3) | `diary_reflection` |
| `appendAuthorNote` | `author_note` |
| `appendOutputFormat` | `output_format` |

**JANGAN** wrap `<chat_history>` karena itu message array, bukan system string — model sudah parse dari role. Wrap hanya system-scoped sections.

**Acceptance step 2:**
1. Unskip XML snapshot test; `PROMPT_XML_WRAP_ENABLED=true pnpm --filter @neigo/server test builder` hijau.
2. Tidak ada duplikasi tag (`grep -c "<character>" snapshot` == `grep -c "</character>" snapshot`).
3. Tidak ada section hilang: diff markdown snapshot vs XML snapshot harus 1:1 line count untuk content.

### 1.4 Step 3 — Orchestrator replay harness regression

Pastikan flag OFF = behaviour lama persis.

```bash
PROMPT_XML_WRAP_ENABLED=false pnpm --filter @neigo/server test:replay
```

Harus lulus semua 9 skenario validator regression. Kalau gagal, ada side-effect di builder refactor (kemungkinan wrapping merubah whitespace yang di-parse oleh continuity-guard). Fix sebelum lanjut.

### 1.5 Step 4 — Commit + update PLANv3 status

```
feat(X2.1 day1): XML-wrapped prompt sections behind flag PROMPT_XML_WRAP_ENABLED

Per PLAN_IMPLEMENTSv1 §Day1. Flag off by default; rollout via F4 Prompt
Inspection A/B comparison.
```

Update PLANv3.md §X2.1 tambah baris status: `- ✅ shipped (flag off) 2026-04-22`.

### 1.6 X2.8 Streaming isolation (Day 1 track B)

**File target:** `packages/web/src/app/chat/[sessionId]/page.tsx`, `packages/web/src/lib/sse.ts`, bikin baru `packages/web/src/components/chat/StreamingBubble.tsx` + `packages/web/src/lib/streaming-buffer.ts`.

**Step 4.1** — Buat `streaming-buffer.ts` sebagai external store:

```ts
// packages/web/src/lib/streaming-buffer.ts
type Listener = () => void;

class StreamingBuffer {
  private buf = '';
  private listeners = new Set<Listener>();
  subscribe = (l: Listener) => { this.listeners.add(l); return () => this.listeners.delete(l); };
  getSnapshot = () => this.buf;
  append(chunk: string) { this.buf += chunk; this.listeners.forEach(l => l()); }
  reset() { this.buf = ''; this.listeners.forEach(l => l()); }
  finalize(): string { const final = this.buf; this.reset(); return final; }
}

export const chatStreamingBuffer = new StreamingBuffer();
```

**Step 4.2** — Buat `StreamingBubble.tsx`:

```tsx
// packages/web/src/components/chat/StreamingBubble.tsx
'use client';
import { memo, useSyncExternalStore } from 'react';
import { chatStreamingBuffer } from '@/lib/streaming-buffer';

function StreamingBubbleImpl({ characterName, avatarUrl }: { characterName: string; avatarUrl?: string }) {
  const text = useSyncExternalStore(chatStreamingBuffer.subscribe, chatStreamingBuffer.getSnapshot, () => '');
  if (!text) return null;
  return (
    <article className="…bubble-class…" data-role="assistant" data-streaming="true">
      {/* avatar + name + text with cursor */}
      <p>{text}<span className="animate-pulse">▋</span></p>
    </article>
  );
}

export const StreamingBubble = memo(StreamingBubbleImpl);
```

**Step 4.3** — Wire di `page.tsx`:
- Ganti `useState` untuk streaming text dengan call `chatStreamingBuffer.append(chunk)` di handler SSE `character`/`narrator`/`reactor`.
- Di event `done`, call `chatStreamingBuffer.finalize()` lalu append message final ke TanStack Query cache via `queryClient.setQueryData`.
- Render `<StreamingBubble />` di bawah daftar message committed, visible hanya saat `isStreaming===true`.
- Parent chat list HANYA re-render saat Query cache invalidated (post-done), bukan per-token.

**Step 4.4** — Double-rAF guard di `lib/sse.ts`:

Cari handler `done`. Bungkus commit state dengan:

```ts
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    // commit final message ke React Query cache
    queryClient.setQueryData(['messages', sessionId], (old) => [...old, finalMessage]);
    chatStreamingBuffer.finalize();
  });
});
```

Ini mencegah "vanishing message" race dengan React 18 concurrent commit per MARINARA changelog v1.4.8.

**Step 4.5 — Acceptance:**
1. `pnpm --filter @neigo/web typecheck` hijau.
2. Manual smoke: buka `/chat/[id]`, kirim message, buka React DevTools Profiler, record selama streaming. Hanya `StreamingBubble` di highlight re-render. Parent chat list 0 render selama stream.
3. Vanishing-message regression test: kirim 3 message cepat berturut-turut; semua muncul setelah stream done, tidak ada yang disappear.

**Step 4.6 — Commit:**

```
feat(X2.8 day1): isolate streaming bubble via useSyncExternalStore + double-rAF done

- new lib/streaming-buffer.ts external store
- new components/chat/StreamingBubble.tsx memo-wrapped
- chat/[sessionId]/page.tsx swaps useState -> external store
- lib/sse.ts done handler: requestAnimationFrame×2 commit guard

Per PLAN_IMPLEMENTSv1 §Day1.
```

### 1.7 Day 1 exit criteria

- [ ] 2 commit mendarat (X2.1 + X2.8).
- [ ] `pnpm -r typecheck` hijau.
- [ ] `pnpm --filter @neigo/server test:replay` hijau.
- [ ] React Profiler manual check: parent chat tidak re-render per-token.
- [ ] PLANv3.md updated dengan status ✅ per item.

---

## Day 2 — X2.2 BYOK test-ping + X6 H9 "Duplicate connection"

**Effort:** ~3 jam. **Risk:** rendah.

### 2.1 Step 1 — Tambah POST /test route

**File:** `packages/server/src/routes/byok.ts`

Di akhir `byokRouter` definitions (sebelum `export`), tambah:

```ts
const testLimiter = rateLimit({ name: 'byok:test', windowMs: 60_000, max: 10 });

byokRouter.post('/connections/:id/test', testLimiter, async (c) => {
  const userId = c.get('userId');
  const connId = c.req.param('id');

  // 1. Load connection (RLS: owner only)
  const conn = await db.query.byokConnections.findFirst({
    where: and(eq(schema.byokConnections.id, connId), eq(schema.byokConnections.userId, userId)),
  });
  if (!conn) return c.json({ error: 'not_found' }, 404);

  // 2. Cache check
  const cacheKey = `byok:test:${connId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return c.json(JSON.parse(cached));

  // 3. 1-token ping via AiProxy
  const key = decryptByokKey(conn.encryptedKey, conn.iv);
  const start = Date.now();
  try {
    const res = await AiProxy.complete({
      messages: [{ role: 'user', content: 'ping' }],
      model: conn.model,
      maxTokens: 1,
      temperature: 0,
      apiKey: key,
      baseUrl: BYOK_OPENROUTER_BASE_URL,
      timeoutMs: 10_000,
    });
    const latency = Date.now() - start;
    const payload = { ok: true, latencyMs: latency, model: conn.model, testedAt: new Date().toISOString() };
    await redis.set(cacheKey, JSON.stringify(payload), 'EX', 300);
    return c.json(payload);
  } catch (e: any) {
    const reason =
      e?.status === 401 ? 'invalid_key' :
      e?.status === 404 ? 'invalid_model' :
      e?.name === 'AbortError' ? 'timeout' : 'unknown';
    const payload = { ok: false, reason, message: e?.message ?? 'Unknown error' };
    await redis.set(cacheKey, JSON.stringify(payload), 'EX', 60); // cache failure lebih pendek
    return c.json(payload, 400);
  }
});
```

**Catatan:** `AiProxy.complete` harus accept `apiKey`/`baseUrl`/`timeoutMs` override. Kalau belum, bungkus minimal di helper baru `byok-probe.ts` yang langsung `fetch()` ke OpenRouter `/chat/completions` — jangan edit AiProxy utama demi scope kecil.

### 2.2 Step 2 — "Duplicate" endpoint (H9 bagian dua)

Tambah di file yang sama:

```ts
byokRouter.post('/connections/:id/duplicate', saveLimiter, async (c) => {
  const userId = c.get('userId');
  const connId = c.req.param('id');
  const src = await db.query.byokConnections.findFirst({
    where: and(eq(schema.byokConnections.id, connId), eq(schema.byokConnections.userId, userId)),
  });
  if (!src) return c.json({ error: 'not_found' }, 404);

  const [copy] = await db.insert(schema.byokConnections).values({
    userId,
    label: `${src.label} (copy)`,
    model: src.model,
    encryptedKey: src.encryptedKey,
    iv: src.iv,
    // copy all non-id fields
  }).returning();
  return c.json({ id: copy.id, label: copy.label });
});
```

### 2.3 Step 3 — FE Test button

**File:** `packages/web/src/app/settings/byok/page.tsx` (kalau belum ada path exact, find via `find packages/web -name "*.tsx" | xargs grep -l BYOK`).

Di card tiap connection, tambah:

```tsx
<button onClick={async () => {
  setTesting(conn.id);
  const res = await fetch(`/api/byok/connections/${conn.id}/test`, { method: 'POST' });
  const data = await res.json();
  setTestResult(conn.id, data);
  setTesting(null);
}}>
  {testing === conn.id ? <Spinner /> : 'Test'}
</button>
{testResult[conn.id]?.ok && <Badge color="green">{testResult[conn.id].latencyMs}ms</Badge>}
{testResult[conn.id]?.ok === false && <Badge color="red">{testResult[conn.id].reason}</Badge>}
```

Tambahkan juga tombol "Duplicate" yang hit `/duplicate` endpoint dan invalidate list query.

### 2.4 Step 4 — Acceptance

```bash
# Server route register smoke
curl -s -X POST -H "cookie: neigo_sess=..." https://roleplay-local:8787/api/byok/connections/INVALID/test
# expected: {"error":"not_found"} 404

# Valid key test
curl -s -X POST -H "cookie: neigo_sess=..." https://roleplay-local:8787/api/byok/connections/VALID/test
# expected: {"ok":true,"latencyMs":<int>,"model":"...","testedAt":"..."}
```

Typecheck + test lulus.

### 2.5 Step 5 — Commit

```
feat(X2.2+H9 day2): BYOK connection test-ping + duplicate

POST /api/byok/connections/:id/test — 1-token ping, Redis 5min cache
POST /api/byok/connections/:id/duplicate — clone with "(copy)" suffix
FE Settings/BYOK: Test + Duplicate buttons

Per PLAN_IMPLEMENTSv1 §Day2.
```

---

## Day 3 — X3.7 Browser notification + X7 Prompt-cache visibility parser

**Effort:** ~2 jam. **Risk:** sangat rendah (client-side + parser additive).

### 3.1 X3.7 Browser notification on done

**Step 1 — User toggle di settings schema:**

Ekstend `user.metadata.notifyOnReply: boolean` (default `false`). Kolom metadata jsonb sudah ada sejak 0013 — cukup baca/tulis lewat `/api/me/preferences`. Kalau endpoint ini belum eksis, tambahkan minimal PATCH.

**Step 2 — Settings UI:**

File: `packages/web/src/app/settings/notifications/page.tsx` (sudah eksis per list-dir). Tambah toggle:

```tsx
<Toggle
  label="Notif balasan saat tab tidak aktif"
  description="Browser notification muncul kalau karakter selesai balas sementara kamu di tab lain."
  checked={prefs.notifyOnReply}
  onChange={(v) => updatePrefs({ notifyOnReply: v })}
/>
```

Saat pertama di-check, request permission:

```tsx
if (v && Notification.permission === 'default') {
  const result = await Notification.requestPermission();
  if (result !== 'granted') { toast.error('Permission ditolak'); return; }
}
```

**Step 3 — Wire di SSE done handler (`lib/sse.ts` atau chat page):**

```ts
// di dalam handler event 'done'
const prefs = queryClient.getQueryData(['me', 'preferences']) as UserPrefs | undefined;
if (
  prefs?.notifyOnReply &&
  document.hidden &&
  typeof Notification !== 'undefined' &&
  Notification.permission === 'granted'
) {
  const firstSentence = finalText.split(/(?<=[.?!])\s/)[0]?.slice(0, 140) ?? finalText.slice(0, 140);
  new Notification(characterName, {
    body: firstSentence,
    icon: avatarUrl ?? '/icon-192.png',
    tag: `neigo-reply-${sessionId}`, // coalesce
    silent: false,
  });
}
```

**Step 4 — Acceptance:**
1. Toggle ON → grant → minimize window → kirim message → notif muncul.
2. Toggle OFF → notif tidak muncul walau permission granted.
3. Tab aktif (not hidden) → tidak ada notif.

### 3.2 X7 Prompt-cache visibility parser

**Step 1 — Extend `model-metrics.ts`:**

File: `packages/server/src/services/model-metrics.ts`. Tambah parse untuk header/body:

```ts
export interface CacheMetrics {
  cacheCreationInputTokens?: number;   // Anthropic
  cacheReadInputTokens?: number;       // Anthropic
  promptTokensCached?: number;         // OpenRouter generic
}

export function parseCacheMetrics(raw: any): CacheMetrics {
  const usage = raw?.usage ?? {};
  return {
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? undefined,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? undefined,
    promptTokensCached: usage.prompt_tokens_cached ?? undefined,
  };
}
```

**Step 2 — Simpan di `prompt_snapshots`:**

Saat selesai stream, ekstend write ke `promptSnapshots.metadata jsonb` tambah:

```ts
{ cacheMetrics: parseCacheMetrics(lastApiResponse), …existing }
```

File: `packages/server/src/services/prompt-snapshot.ts`. Pass dari orchestrator `runSinglePass` hasil akhir upstream response object (kalau AiProxy sekarang discard body setelah stream, expose optional `finalUsage` via event bus).

**Step 3 — Surface di ops response (tidak ada FE di Day 3, cukup backend):**

File: `packages/server/src/routes/ops.ts`. Endpoint `GET /sessions/:id/context/overview` sudah ada; extend response include `cacheMetrics` dari latest snapshot.

FE rendering tunggu Day 12 Prompt Info overlay — Day 3 cukup data availability.

**Step 4 — Acceptance:**

```bash
# Pakai connection Claude / OpenRouter dengan Anthropic provider
curl -s ".../api/ops/sessions/ID/context/overview" | jq '.latestSnapshot.cacheMetrics'
# expected: { cacheCreationInputTokens: N, cacheReadInputTokens: M, ... }
```

### 3.3 Day 3 exit

- [ ] 1-2 commit mendarat (notif + cache metrics).
- [ ] typecheck hijau.
- [ ] manual notif smoke lulus.
- [ ] PLANv3 §X3.7 & §X7 update status.

---

## Day 1-3 summary + handoff ke v2

Setelah 3 hari ini, stack punya:
- XML wrap flag-ready untuk A/B
- BYOK UX lebih matang (test + duplicate)
- Streaming render profile sudah di-fix (zero parent re-render)
- Browser notif retention lever live
- Prompt cache metrics dikumpulkan (siap diexpose di Day 12)

**Next (baca `PLAN_IMPLEMENTSv2.md`):** Day 4-5 CBS macros extend (`setvar/getvar/if/calc`), Day 5 `{{button}}` renderer + trigger endpoint, Day 6 lorebook decorators + recursive scan, Day 7-8 regex scripts 4-mode dengan re2-wasm.

---

*File revision: PLAN_IMPLEMENTSv1 · 2026-04-22 · Day 1-3 + pre-flight. Series lanjut di v2…v5.*
