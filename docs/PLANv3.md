> 🟡 **STATUS (apr 2026): X1 FULLY SHIPPED.** Tier-1 #3 CBS · #4 marker preset · #5 regex scripts · #7 agent pipeline (framework) ✅. 🟡 Tier-1 #1 XML wrap · #2 BYOK ping · #6 lorebook decorators · #8 streaming isolation. 🟡 Tier-2 #9 CYOA · #10 director · #11 HypaV3 memory ✅; #12 Prompt Info · #14 real tokenizer partial. ❌ #15 Tavern import · #16 auto-continue wire · parts of #17. Remaining → [BACKLOG.md](BACKLOG.md).

---

# Risu → Project Neigo: Deep Improvement Brainstorm

Note: The URL `beranalpa/ideas_risuai` returns 404 — used the upstream **[kwaroran/Risuai](https://github.com/kwaroran/Risuai)** (1.4k ⭐, SvelteKit/Tauri, GPL-3.0) as reference.

---

## 1. High-Value Pickups (priority HIGH)

### A. Reorderable Prompt Template (drag-drop blocks)
Risu lets users reorder every prompt block: `main`, `jailbreak`, `chats`, `lorebook`, `globalNote`, `authorNote`, `lastChat`, `description`, `personaPrompt`, `plain`, `memory`, `postEverything` — with per-block `innerFormat` wrappers using `{{slot}}`.

**Source:** `src/ts/process/index.svelte.ts` `sendChat()` loop over `template[]`, `src/lib/Setting/Pages/PromptSettings.svelte` drag UI.

**Action for us:** Currently `packages/server/src/prompts/builder.ts` is hardcoded. Add a `promptTemplate: PromptBlock[]` on `promptPresets` (we already have `0020_prompt_presets.sql`). Each block = `{ type, innerFormat, role, defaultText }`. Builder walks the array instead of hardcoded order.

### B. Lorebook Decorators (`@@` directives)
Risu's lorebook keys use inline decorators that replace UI toggles — much more expressive than boolean flags.

```
@@activate_only_after 5         # activate only after N turns
@@activate_only_every 3         # activate every Nth turn
@@keep_activate_after_match     # stays on once triggered
@@dont_activate_after_match     # deactivates after first trigger
@@depth 0                       # injection depth from end
@@role system|user|assistant    # role of inserted message
@@scan_depth 4                  # messages to scan
@@probability 50                # % chance
@@additional_keys foo,bar       # require secondary keys
@@exclude_keys foo              # NEGATIVE keys (block activation)
@@match_full_word               # word-boundary match
@@position after_char|before_char|personality|scenario
```

**Source:** `src/ts/process/lorebook.svelte.ts:286-345`, `src/ts/gui/highlight.ts:169-192` (decorator list).

**Action for us:** Our `0017_lorebooks.sql` already exists. Add a decorator parser to the lorebook activation path. Zero DB change — directives live inside `content`.

### C. Recursive Lorebook Scanning
Risu's `loadLoreBookV3Prompt()` rescans activated entries' content as new search text. Entry A mentions "dragon" → activates B; B mentions "castle" → activates C.

**Source:** `lorebook.svelte.ts:574-607` (`recursivePrompt` accumulator).

**Action:** Worth adding if we want deeper worldbuilding. Gate with `recursiveScanning: boolean` flag on lorebook.

### D. Regex Scripts (4 modes)
User-defined regex pipelines run at:
- `editinput` — before storing user message
- `editoutput` — after model response
- `editprocess` — on chat data just before HTTP request
- `editdisplay` — only affects rendering, not persisted

Supports `$1..$n`, `$&`, `$<name>` named groups, plus Risu-specific actions (`@@emo <name>`, cbs interpolation).

**Source:** `src/ts/process/scripts.ts`.

**Action for us:** Huge win for user customization. Add `regexScripts` column on `characters` and/or `promptPresets`. Apply in orchestrator hooks. We already process output through validators — add a regex pass in `editdisplay` between server response and frontend render.

### E. CBS Macros (`{{var}}`, `{{setvar}}`, `{{calc}}`, `{{if}}`, `{{each}}`)
Risu has a full templating DSL embedded in every prompt string, character field, and message. Key primitives:

| Macro | Purpose |
|---|---|
| `{{char}}` / `{{user}}` / `{{persona}}` | identity |
| `{{getvar::key}}` / `{{setvar::key::val}}` | persistent chat vars |
| `{{getglobalvar::key}}` | cross-chat vars |
| `{{tempvar}}` / `{{settempvar}}` | scoped vars |
| `{{calc::expr}}` / `{{? $a+1}}` | math |
| `{{#if cond}}...{{/if}}` | conditionals |
| `{{#each arr as x}}...{{/each}}` | loops |
| `{{equal::a::b}}` | comparisons |
| `{{button::Label::trigger}}` | **inline clickable buttons rendered in chat** (huge UX win) |
| `{{tex::E=mc^2}}` | KaTeX |
| `{{comment}}` / `{{//}}` | display / silent comments |
| `{{br}}` / `{{bo}}` / `{{bc}}` | escapes |
| `{{erase}}` | trims last sentence from current output |
| `{{call::func::args}}` | user-defined functions |

**Source:** `src/ts/cbs.ts`, `src/ts/parser/parser.svelte.ts` `risuChatParser()` — a recursive stack-based parser with call-stack limit of 20.

**Action for us:** Adopt a subset. Start with `{{char}}`/`{{user}}`/`{{persona}}`/`{{getvar}}`/`{{setvar}}`/`{{if}}`/`{{calc}}`. Store `scriptstate` JSONB on session. Would replace most special-case code in our prompt builder.

### F. Long-Term Memory: SupaMemory + HypaV2/V3
Three layered strategies, all in `src/ts/process/memory/`:

- **SupaMemory** — rolling summarization. When context overflows, summarize oldest block via a separate LLM call; summaries cascade into a meta-summary when 4+ chunks accumulate.
- **HypaV2** — vector-embed each chunk, retrieve top-k by cosine similarity to last 3 user messages.
- **HypaV3** — hybrid: recent-window + similar-retrieval + random-seed with explicit token ratios (`recentMemoryRatio`, `similarMemoryRatio`, `randomMemoryRatio`, `extraSummarizationRatio`). Supports concurrency/rate limiters.

**Source:** `supaMemory.ts`, `hypav2.ts`, `hypav3.ts`.

**Action for us:** We already have `pgvector` (0001), `contextNodes` (0008), and `characterDynamicStates`. We could layer a HypaV3-style budget allocator on top. Cache embedding results keyed by `hash(content + ctx_group)`.

---

## 2. Medium-Value Pickups

### G. Prompt Diff Modal
Side-by-side diff of two prompt presets with card-level + line-level + word-level diff (`src/lib/Others/PromptDiffModal.svelte`). Show when switching presets so users see exactly what changes.

### H. Playground
Dedicated "dev drawer" for: tokenizer tester, embedding similarity tester, Jinja template preview, prompt syntax highlighter, translation tester, image-gen tester (`src/lib/Playground/`). Great for debugging char cards. Slot into `/studio`.

### I. Triggers V2 (visual scripting)
Event-driven actions: `start`, `manual`, `output`, `input`, `display`, `request`. Conditions match vars/chat-index/regex. Effects: `setvar`, `cutchat`, `modifychat`, `systemprompt`, `impersonate`, `command`, `checkSimilarity`, `runAxLLM`, `calculate`, array/dict ops. Implemented as a no-code block builder (`src/lib/SideBars/Scripts/TriggerV2List.svelte`).

### J. Character Card v3 Export/Import (PNG embed)
Full spec-compliant tavern card in/out with asset embedding in PNG chunks (`characterCards.ts`, `PngChunk`). Compat with SillyTavern ecosystem. Low cost, big import-value.

### K. Depth Prompts (character's `depth_prompt`)
Inject extra prompts at a specific distance from the end of the conversation. Implemented as CharacterCardV3 `data.extensions.depth_prompt`.

### L. Cache Point (Anthropic prompt caching)
Template block `type: 'cache'` with `depth` + `role` — flags messages for Anthropic cache points to cut cost. Applicable for Claude BYOK.

### M. Author's Note / Memory Note / Jailbreak Toggle
Clear separation between main prompt / jailbreak / global note / author's note per-character and per-chat. UI has a `{{jbtoggled}}` token so users can condition on whether JB is enabled.

### N. Emotion Image System
Character has `emotionImages: [name, assetId][]`. The model can emit `@@emo happy` via regex scripts and the UI swaps the displayed sprite — with **embedding fallback**: if the model uses an unregistered emotion name, find nearest by embedding similarity. Logit-bias boosts emotion keywords in recent turns (`index.svelte.ts:1869-1885`).

### O. Additional Assets (`{{audio::name}}`, `{{bg::name}}`, `{{image::name}}`)
Character cards carry embedded image/audio/video. Macros interpolate asset references into the background HTML. Dynamic asset matching via embeddings when exact name not found.

### P. Chat Variables Dashboard
Every chat has a `scriptstate: {[key]: string}` dict, editable in UI. We could surface this as a "character memory facts" panel — we already have `characterDynamicStates` table; same concept.

---

## 3. UX / Frontend Pickups

### Q. Inline Action Buttons in Messages
`{{button::Label::trigger_cmd}}` renders a real `<button>` inline that fires a trigger. Used for choose-your-own-adventure menus. Pairs with Studio "story" mode.

### R. Anti-Incomplete Auto-Continue
Detect last char isn't punctuation → re-request with `continue: true` automatically, appending to the last message (`util.ts#isLastCharPunctuation`, `trimUntilPunctuation`). User sets target token count. Reduces "… and then sh" mid-sentence cut-offs.

### S. Token Budget UI Everywhere
Every prompt field, lorebook entry, character field has a live token counter. `tokens.desc`, `tokens.firstMsg`, `tokens.localNote` (`CharConfig.svelte:39-72`). Reactive `$effect` recomputes on change.

### T. Reactive Tokenizer Pool
Supports tiktoken (GPT), Claude, Llama, Mistral, Llama3, Gemma, Cohere, DeepSeek, Gemini, Google Cloud — selected per model (`tokenizer.ts:182-356`). Cached. We currently estimate — real tokenization would make budget-UI honest.

### U. Prompt Info Inside Chat
Optional debug overlay: below each assistant message, show which preset/toggles/prompt cards were used to generate it (`promptInfo`, `generationInfo` with model/tokens/ids). Users love this for RP debugging.

### V. Notification on Response Done
When tab is unfocused and a streamed reply finishes, raise a browser `Notification('Risuai', { body: result })`. Tiny code, big retention win.

### W. Dynamic Assets Preview (right rail)
When editing a character, live preview of which asset files resolve per scene tag.

### X. Multiuser Room Join (peerSync)
Risu has `peerSync()` across local peers and `joinMultiuserRoom` — could inform a future shared-story feature.

### Y. Preset Chains
`presetChain` in DB lets a single send trigger multiple preset passes (e.g. `analyze → roleplay → judge`). Similar to our multi-pass prompt file.

---

## 4. Specific Patterns Worth Copying Directly

### The CBS parser architecture
A **stack-based recursive parser** (`parser.svelte.ts:1537+`) with:
- `nested: string[]` — output accumulation stack
- `stackType: Uint8Array(512)` — tracks block type at each depth
- `callStack` counter with 20-deep limit to prevent runaway recursion
- `rmVar`, `runVar`, `tokenizeAccurate`, `displaying` modes so the same template expands differently for tokenization vs. display vs. actual send.

Much cleaner than regex-based macro expansion.

### Lorebook budget trimming
```ts
activesSorted.sort((a,b) => b.priority - a.priority)
let usedTokens = 0
const activesFiltered = activesSorted.filter(act => {
  if (usedTokens + act.tokens <= loreToken) { usedTokens += act.tokens; return true }
  return false
})
// then re-sort by `order` for injection
```
Priority-based drop, insertion-order output.

### Emotion logit bias decay
```ts
const modifier = 20 - ((tempEmotion.length - (i + 1)) * (20/4))
for(const token of tokens){ emobias[token] -= modifier }
```
Prevents model repeating recent emotion names via logit bias on the tokenizer tokens of recent emotion words.

### Stream cancel pattern
```ts
abortSignal.addEventListener('abort', abortReader, { once: true })
try { while(!streamAborted){ readed = await reader.read(); ... } }
```
Clean unified abort across all providers.

---

## 5. Prioritized Pickup List for Our Stack

**Tier 1 — do next (biggest product impact, low integration cost):**
1. **Reorderable prompt template** — rewire `builder.ts` to iterate a `PromptBlock[]` from `promptPresets`.
2. **CBS macros (subset)** — `{{char}} {{user}} {{persona}} {{getvar}} {{setvar}} {{if}} {{calc}} {{button}} {{comment}}`. Port `risuChatParser` concept (simplified) into `packages/shared`.
3. **Regex scripts** — 4-mode pipeline (`editinput/output/process/display`). Character-level + preset-level.
4. **Lorebook decorators + recursive scan** — extend our existing lorebook.

**Tier 2 — high value, medium work:**
5. **HypaV3-style memory** on top of existing pgvector + contextNodes with explicit ratio budgets.
6. **Prompt Info overlay** under assistant messages (we have `prompt_snapshots` already — just render it).
7. **Real tokenizer** per model (tiktoken lite bundle) for accurate budget UI.
8. **Tavern Card v2/v3 import/export** with PNG embed — instant community compat.
9. **Inline `{{button::}}` triggers** — branch/choose UX in stories & chat.
10. **Auto-continue on incomplete sentence**.

**Tier 3 — later / polish:**
11. Playground (tokenizer, embedding, parser debug in one drawer).
12. Triggers V2 visual scripting.
13. Prompt Diff Modal when switching presets.
14. Emotion system + embedding fallback.
15. Background music / `{{audio::}}` macro.
16. Jailbreak toggle token (`{{jbtoggled}}`).

---

## 6. Things We Already Do Better Than Risu

- Postgres + RLS + FTS (Risu stores everything in IndexedDB/LocalForage)
- Server-side orchestrator with validation chain (tone drift, continuity, format drift)
- Scene state `[STATE:]` tags (Risu has `chatVariables` but no model-emitted scene grounding)
- Session events / timeline / branching as first-class DB concepts
- Multi-tenant + founding-reader tiers
- Letters / async non-chat interaction surfaces
- Stories / Studio VN mode

Risu is single-user desktop-first; we're a web platform. Import the authoring DSL, keep the infra.

---

---

# Marinara → Project Neigo: Architecture-Level Pickups

> **Source:** `beranalpa/ideas_marinara` (fork of `Pasta-Devs/Marinara-Engine` v1.5.3, AGPL-3.0).
> **License posture:** Ideas only — no code/schema/prompt copied. All re-specified for our stack.
> **Full feature-level audit:** see [MARINARA_AUDIT.md](MARINARA_AUDIT.md) (§1–§8, Phase F–H roadmap, conflict matrix, integration graph, 12-week execution plan). This section adds **architecture/implementation-pattern pickups** not covered there.

---

## M1. Agent Pipeline Framework (paling strategis)

Marinara punya 3-fase pipeline: `pre_generation → parallel → post_processing`. Yang membedakan dari orchestrator kita yang monolitik:

### Batching per provider+model
Agent dengan provider+model sama digabung jadi **satu** LLM call. Format batched system prompt:
```
<role>You are a collection of N specialized agents...</role>
<lore>lorebook entries, characters, persona</lore>
<agents>
  <agent_task id="continuity" name="...">…prompt…</agent_task>
  <agent_task id="world-state" name="...">…prompt…</agent_task>
</agents>
─── REQUIRED OUTPUT FORMAT ───
<result agent="continuity">{ … json … }</result>
<result agent="world-state">{ … json … }</result>
```
Parser split per `<result>` tag. **N agent = 1 API call** → biaya token jauh lebih efisien.

### Config-driven via DB
```ts
agent_configs { id, type, name, phase, enabled, connectionId?,
                promptTemplate, settings jsonb, tools[] }
agent_runs    { agentConfigId, chatId, messageId, resultData jsonb }
```
User bisa bikin **custom agent** di UI tanpa deploy kode baru — isi prompt + pilih phase. `agent_runs` simpan tiap eksekusi untuk replay/debug.

### Tool-call loop (max 5 round)
Agent bisa punya tools (`roll_dice`, `update_game_state`, `search_lorebook`, `set_expression`, `trigger_event`). Loop: `LLM → toolCalls? → execute → feed back → LLM → …`

### Mapping ke orchestrator kita saat ini
| Project Neigo (hardcoded `runSinglePass`) | Jadi agent type |
|---|---|
| `repetition-detector` | `prose-guardian` (post_processing) |
| `continuity-guard` | `continuity` (post_processing) |
| `tone-drift-detector` | `tone-guardian` (post_processing) |
| `format-drift-detector` | `format-guardian` (post_processing) |
| `scene-state-parser` | `world-state` (post_processing) |
| `harem-turn-selector` | `response-orchestrator` (pre_generation) |
| `relationship-stage` + `character-facts` + `character-diary` | `character-tracker` (parallel) |

**Keuntungan migrasi:**
- User bisa toggle off validator yang mengganggu per-chat
- Beda model per-agent (validator murah → model cheap; director → flagship)
- Tambah validator baru via UI tanpa re-deploy
- Token cost transparan per agent → billing lebih jujur

**Migration path:** bikin `agent_configs` + `agent-pipeline.ts` baru, wrap existing validator di `executeBuiltInAgent(type, ctx)`. Backward-compat. Source: `packages/server/src/services/agents/agent-executor.ts`, `agent-pipeline.ts`.

---

## M2. Marker-Based Prompt Assembler

Marinara punya `prompt_sections` dengan konsep **marker** yang lebih kuat dari plain block list:

```ts
prompt_sections { id, presetId, identifier, name, content, role,
                  enabled, isMarker, groupId, markerConfig jsonb }

// MarkerConfig examples:
{ type: 'chat_history', chatHistoryOptions: { maxMessages: 20 } }
{ type: 'lorebook', lorebookFormat: 'full' }
{ type: 'agent_data', agentType: 'world-state' }  // ambil hasil agent run terakhir
```

**Marker types:** `character`, `lorebook`, `persona`, `chat_history`, `chat_summary`, `world_info_before`, `world_info_after`, `dialogue_examples`, `agent_data`.

**Injection position:** `ordered` (urutan normal) vs `depth` (N messages dari akhir — depth prompt pattern).

**Wrap format per section:** `xml` | `markdown` | `none` — otomatis bungkus content dengan tag semantik.

**Action:** kalau adopt reorderable preset (Risu §A / PLANv3 Tier 1 #1), ikuti pola marker-based ini. Identifier-based lebih survivable terhadap schema evolution dari plain `type` enum. Source: `packages/server/src/db/schema/prompts.ts`, `packages/server/src/services/prompt/marker-expander.ts`.

---

## M3. XML-Wrapped Prompt Sections (1-day win)

Marinara wrap tiap section dengan XML tag semantik eksplisit:
```
<character_name>Lysandra</character_name>
<character_description>…</character_description>
<scenario>…</scenario>
<chat_history>…</chat_history>
<lorebook>…</lorebook>
```

Kita pakai plain markdown (`## Header\n…`). XML tag boost citation accuracy 5–15% di long-context (Claude/Anthropic benchmarks) karena model belajar XML token sebagai delimiter hard. Near-zero integration cost — edit `builder.ts` saja.

**Action:** audit `packages/server/src/prompts/builder.ts`, ganti markdown header ke `<section_name>…</section_name>`. Bump ke **Tier 1** dari P2 di MARINARA_AUDIT.md karena effort XS.

---

## M4. Regex Script Schema (lebih lengkap dari Risu)

Marinara punya field tambahan yang Risu tidak punya:

```ts
regex_scripts {
  findRegex, replaceString,
  trimStrings,       // array strings yang auto-strip setelah match (anti-slop blacklist)
  placement,         // 'user_input' | 'ai_output' | 'both'
  flags,
  promptOnly,        // "true" = modify prompt sebelum kirim, tidak simpan ke DB
  order,
  minDepth,          // hanya aktif dari turn N...
  maxDepth           // ...sampai turn M
}
```

`minDepth/maxDepth` solve masalah nyata: rule yang cuma relevan di awal chat (intro rules) vs late-game rules. `promptOnly` bikin filter yang model lihat beda dari yang user simpan di history. Adopt schema ini kalau implement Risu §D regex scripts.

---

## M5. Streaming Re-Render Isolation

Dari Marinara changelog: tiap SSE token trigger re-render seluruh chat tree → fix dengan:
- Streaming bubble component di-isolate dari parent
- `memo` wrapper di streaming message
- State streaming dipegang via `ref` / local state, bukan React Query cache
- Double-rAF commit setelah stream done (prevent "vanishing message" bug)

**Action konkret untuk kita:** profile `packages/web/src/app/chat/[sessionId]/page.tsx` dengan React Profiler. Kalau tiap token trigger re-render daftar message → split `StreamingBubble` jadi component sendiri yang subscribe ke stream state via `useSyncExternalStore`. Parent pakai `useDeferredValue` untuk snapshot final. (Cross-ref MARINARA_AUDIT.md §2.7.)

---

## M6. BYOK Connection Test-Ping (UX quick win)

Marinara punya endpoint `/connections/:id/test` — kirim 1-token prompt untuk validate credentials, URL, dan model slug. Plus tombol "Duplicate" yang clone config dengan suffix "(copy)".

**Action:** tambah `POST /api/byok/connections/:id/test` (1-token ping, cache hasil 5 menit). UX win besar untuk first-time BYOK — user tau langsung key valid sebelum coba chat. Effort XS.

---

## M7. Per-Agent Run Interval

Marinara punya `BUILT_IN_AGENT_RUN_INTERVAL_DEFAULTS`:
```ts
{ director: 5, 'lorebook-keeper': 8, 'chat-summary': 5 }
```
Agent mahal tidak run tiap turn — hanya tiap N turn. Override via `settings.runInterval` per agent config.

**Action:** kalau adopt agent pipeline (M1), defaultkan validator mahal ke `runInterval: 5-8`. `context-compaction.ts` kita juga harusnya begitu — sekarang tiap turn.

---

## M8. Autonomous Messenger + Schedule Planner (retention lever)

Dua agent yang jalan bersama:
- **Schedule Planner** (pre_generation, weekly cron) — generate jadwal realistis per karakter dari personality description. Simpan sebagai jsonb.
- **Autonomous Messenger** (cron) — cek user idle > threshold, baca current schedule karakter, kirim DM tanpa prompt kalau sesuai timing + `talkativeness` setting.

Kita punya semua infra: BullMQ, Web Push, `session_schedules` table (migration 0022). Tinggal rakit. Conversion lever kuat untuk D+1/D+7 retention.

---

## M9. Unified Priority Table (Risu + Marinara, no overlap)

Gabungan semua pickup dari kedua sumber, diurutkan ROI:

| # | Pickup | Sumber | Effort | Priority |
|---|---|---|---|---|
| 1 | **XML-wrapped prompt sections** | Marinara M3 | XS | ⭐ Tier 1 |
| 2 | **BYOK test-ping** | Marinara M6 | XS | ⭐ Tier 1 |
| 3 | **CBS macros subset** (`{{char}}` `{{user}}` `{{getvar}}` `{{setvar}}` `{{if}}` `{{calc}}` `{{button}}`) | Risu §E | M | ⭐ Tier 1 |
| 4 | **Reorderable prompt template** → adopt marker-based (M2) | Risu §A + Marinara M2 | M | ⭐ Tier 1 |
| 5 | **Regex scripts** dengan minDepth/maxDepth/promptOnly (M4 schema) | Risu §D + Marinara M4 | M | ⭐ Tier 1 |
| 6 | **Lorebook decorators + recursive scan** | Risu §B+C | M | ⭐ Tier 1 |
| 7 | **Agent pipeline framework** (refactor orchestrator) | Marinara M1 | L | ⭐ Tier 1 (foundational) |
| 8 | **Streaming re-render isolation audit + fix** | Marinara M5 | S | ⭐ Tier 1 |
| 9 | **CYOA Choices** (per MARINARA_AUDIT §3 F3) | Marinara | M | Tier 2 |
| 10 | **Narrative Director** (per MARINARA_AUDIT §3 F2) | Marinara | M | Tier 2 |
| 11 | **HypaV3-style memory** hybrid retrieval | Risu §F | M | Tier 2 |
| 12 | **Prompt Info overlay** (render `prompt_snapshots`) | Risu §U + Marinara | S | Tier 2 |
| 13 | **Per-agent run interval** | Marinara M7 | XS | Tier 2 |
| 14 | **Real tokenizer** per model (tiktoken bundle) | Risu §T | M | Tier 2 |
| 15 | **Tavern Card v2/v3 PNG import/export** | Risu §J | M | Tier 2 |
| 16 | **Auto-continue on incomplete sentence** | Risu §R | S | Tier 2 |
| 17 | **Autonomous Messenger + Schedule Planner** | Marinara M8 | M | Tier 2 |
| 18 | **Playground debug drawer** | Risu §H | L | Tier 3 |
| 19 | **Triggers V2 visual scripting** | Risu §I | L | Tier 3 |
| 20 | **Emotion sprite + logit-bias decay** | Risu §N | M | Tier 3 |
| 21 | **Background + weather overlays** | Marinara | M | Tier 3 |
| 22 | **Prompt Diff Modal** | Risu §G | S | Tier 3 |
| 23 | **Background music** `{{audio::}}` | Risu §O | M | Tier 3 |

**Start point yang direkomendasikan:** #1 (XML wrap, 1 hari) → #2 (test-ping, setengah hari) → #8 (streaming profiling, 1 hari) → lalu masuk #7 (agent pipeline) sebagai foundational yang unlock #9, #10, dan seluruh Phase F dari MARINARA_AUDIT.md.

---

---

# Advanced Unimplemented Backlog — Consolidated (MARINARA_AUDIT + BRAINSTORM + REDESIGNv2 + PLANv2 sisa)

> **Tujuan.** Gabungan semua brainstorm yang tersimpan tapi belum diimplementasikan, dikonsolidasi di satu tempat agar next-batch work bisa di-pilih tanpa bolak-balik 5 dokumen. Hanya item yang **belum shipped** yang masuk. Semua item yang sudah ✅ di PLANv2 §11 living log atau di migrasi 0001–0022 DIEXCLUDE dari list ini — hanya direferensikan di §X1 status map.
>
> **Pemeriksaan bukti-shipped (grep cepat):** `env.ts` sudah expose `MEMORY_HYBRID_RRF_ENABLED`, `CONTEXT_DAG_CONDENSE_ENABLED`, `LCM_ESCALATION_ENABLED`, `MEMORY_MULTI_FACTOR_SCORE_ENABLED`, `SESSION_SNAPSHOT_ENABLED`; `session-snapshot.ts`, `context-compaction.ts` (L1→L2→L3 + D1), `memory-retriever.ts::hybridSearchRRF`, `benchmarks/longmemeval.ts` eksis; `ops.ts` sudah expose `/sessions/:id/context/{overview,grep,node/:nodeId}`. Migrasi `0009_session_mistakes`, `0010_character_diary`, `0011_character_facts`, `0015_ai_model_slug`, `0016_prompt_snapshots`, `0017_lorebooks`, `0018_personas`, `0019_message_swipes`, `0020_prompt_presets`, `0021_chat_folders`, `0022_session_schedules` sudah ada. **Artinya:** T4.1–T4.10 dari BRAINSTORM §14 dan MARINARA §3 wk 1–14 **SUDAH ✅** — tidak diulang di bawah.

## X1. Status map — apa yang sudah shipped (jangan re-plan)

| Sumber | Item | Bukti |
|---|---|---|
| MARINARA_AUDIT §3 F1–F4, G1–G6, H1, H7, H12 | Wk 1–14 stack | PLANv2 §11 table (semua ✅) |
| MARINARA_AUDIT §4 #5 QR handoff | `routes/handoff.ts` | `0023_handoff_tokens.sql` |
| MARINARA_AUDIT §4 #6 Nightly recap push | `services/recap-push.ts` | cron registered |
| MARINARA_AUDIT §4 #1 Diary rollup | `services/character-diary-rollup.ts` | post-wk14 batch |
| MARINARA_AUDIT §4 #2 Trust-gated backstory | `services/backstory-reveal.ts` | post-wk14 batch |
| MARINARA_AUDIT §6 cache-bust checklist | `public/sw.js` NetworkOnly + `lib/sse.ts` no-store | PLANv2 §6 retrofit |
| BRAINSTORM §14 T4.1 Mistakes Registry | `services/mistakes-registry.ts` | `0009_session_mistakes.sql` |
| BRAINSTORM §14 T4.2 Hybrid RRF | `memory-retriever.ts::hybridSearchRRF` | flag `MEMORY_HYBRID_RRF_ENABLED` |
| BRAINSTORM §14 T4.3 Character Diary | `services/character-diary.ts` | `0010_character_diary.sql` |
| BRAINSTORM §14 T4.4 DAG D1 condense | `context-compaction.ts::condenseDepth` | flag `CONTEXT_DAG_CONDENSE_ENABLED` |
| BRAINSTORM §14 T4.5 Multi-factor scoring | `memory-retriever.ts` scoring block | flag `MEMORY_MULTI_FACTOR_SCORE_ENABLED` |
| BRAINSTORM §14 T4.6 Session snapshot | `services/session-snapshot.ts` | flag `SESSION_SNAPSHOT_ENABLED` |
| BRAINSTORM §14 T4.7 L1→L2→L3 escalation | `context-compaction.ts` L1/L2/L3 gates | flag `LCM_ESCALATION_ENABLED` |
| BRAINSTORM §14 T4.8 Drill-down ops routes | `routes/ops.ts` context/{overview,grep,node} | admin-gated |
| BRAINSTORM §14 T4.9 Fact graph | `services/character-facts.ts` | `0011_character_facts.sql` |
| BRAINSTORM §14 T4.10 Memory benchmark | `benchmarks/longmemeval.ts` + `baseline.json` | CLI runnable |

**Implikasi:** tidak ada repeat dari daftar di atas di backlog berikut.

---

## X2. Tier-1 Unimplemented (foundational, ship dulu)

Ini perluasan dari §M9 table (item #1–#8) dengan detail implementasi supaya bisa langsung dieksekusi.

### X2.1 · XML-wrapped prompt sections (item #1, effort XS)
- **File target:** `packages/server/src/prompts/builder.ts`
- **Diff:** tiap `append*` method ganti `## Header\n...` → `<section_name>\n...\n</section_name>`. Sections: `<character>`, `<persona>`, `<scenario>`, `<scene_state>`, `<lorebook>`, `<memory>`, `<recent_drift>`, `<diary_reflection>`, `<chat_history>`, `<author_note>`.
- **Gate:** feature flag `PROMPT_XML_WRAP_ENABLED` — rollout FOUNDER → PAID → FREE supaya bisa A/B di F4 Prompt Inspection snapshot comparison.
- **Acceptance:** snapshot diff di `/ops/sessions/:id/context` menunjukkan XML envelope; tidak ada section yang lost/duplicate.

### X2.2 · BYOK test-ping endpoint (item #2, effort XS)
- **File baru:** `packages/server/src/routes/byok.ts` → `POST /connections/:id/test`
- **Logic:** panggil `AiProxy.complete` dengan `maxTokens: 1`, prompt `"ping"`, timeout 10s. Cache hasil di Redis `byok:test:${connId}` 5min.
- **FE:** tombol "Test" di `/settings/connections` — spinner → ✅ green atau ❌ error detail (`401`, `invalid_model`, `timeout`).
- **Acceptance:** key invalid ditolak dengan pesan actionable sebelum user chat pertama.

### X2.3 · CBS macros subset di shared package (item #3, effort M)
- **File baru:** `packages/shared/src/utils/macros.ts` (port konsep `risuChatParser` — stack-based, max 20-deep, mode `resolve` vs `tokenize` vs `display`).
- **Macros supported v1:** `{{char}}` `{{user}}` `{{persona}}` `{{time}}` `{{date}}` `{{location}}` `{{weather}}` `{{getvar::k}}` `{{setvar::k::v}}` `{{if cond}}...{{/if}}` `{{calc::expr}}` `{{comment}}` `{{//}}` `{{br}}`.
- **Scriptstate storage:** extend `chat_sessions.metadata.scriptstate jsonb` — `{setvar}` write, `{getvar}` read di resolver.
- **Wire:** `builder.ts` run resolver pada setiap string content sebelum kirim ke LLM; `chat/page.tsx` run resolver mode `display` untuk render bubble.
- **Guardrail:** `{{setvar}}` hanya dari character card / preset / trigger — JANGAN dari user-input (prompt injection).
- **Acceptance:** character card dengan `{{setvar::mood::happy}}{{getvar::mood}}` render "happy"; recursion limit catch.

### X2.4 · Reorderable marker-based prompt template (item #4, effort M)
- **Schema:** extend `0020_prompt_presets.sql` — tambah kolom `sections_json jsonb` yang berisi array `{identifier, role, enabled, isMarker, markerConfig?, wrap: 'xml'|'markdown'|'none'}`.
- **Seed default preset:** one-time snapshot dari current `builder.ts` order (X2.1 post-migration).
- **Builder refactor:** iterate `preset.sections_json` bukan hardcoded method order. Marker types: `character`, `persona`, `scenario`, `lorebook`, `scene_state`, `chat_history`, `chat_summary`, `agent_data(agentType)`, `depth(n)`.
- **FE editor:** `/settings/presets/[id]` drag-drop dnd-kit; toggle per section; preview token count pakai X3.3 tokenizer.
- **Acceptance:** user reorder lorebook-before-history vs after-history → prompt snapshot (F4) reflect perubahan persis.

### X2.5 · Regex scripts 4-mode + Marinara schema field (item #5, effort M)
- **Migrasi baru** `0024_regex_scripts.sql`:
  ```
  regex_scripts(id, scope enum('character','preset','user'), scope_id uuid,
                find_regex text, replace_string text, trim_strings text[],
                placement enum('edit_input','edit_output','edit_process','edit_display'),
                flags text, prompt_only bool, order_index int,
                min_depth int, max_depth int, enabled bool)
  ```
- **Runner:** `packages/shared/src/utils/regex-runner.ts` — sandbox **re2-wasm** (JANGAN native `RegExp` pada user input), 10ms per-turn timebox, fallback pass-through.
- **Wire points di orchestrator:**
  - `edit_input` — sebelum store ke `chat_messages`
  - `edit_process` — setelah build prompt, sebelum `AiProxy.complete`
  - `edit_output` — setelah response complete sebelum validator chain
  - `edit_display` — **client-side only** (via `@neigo/shared`) — tidak modify persist data
- **Acceptance:** rule `"/\\bnya\\b/g → ''"` dengan `minDepth=0, maxDepth=5` cleanly strip "nya" dari awal conversation saja.

### X2.6 · Lorebook decorators + recursive scan (item #6, effort M)
- **File baru:** `packages/server/src/services/lorebook/decorator-parser.ts`
- **Decorators v1:** `@@activate_only_after <n>`, `@@activate_only_every <n>`, `@@depth <n>`, `@@role <system|user|assistant>`, `@@probability <n>`, `@@additional_keys k1,k2`, `@@exclude_keys k1,k2`, `@@match_full_word`, `@@position after_char|before_char|personality|scenario`.
- **Storage:** decorator disimpan **inline dalam `content`** (zero DB change) — parser strip ke `parsed` + `directives` object saat activation.
- **Recursive scan:** extend `services/lorebook/keyword-scan.ts` — tambah `recursive: bool` per-lorebook; bila true, entries yang baru activated jadi extra scan text untuk round berikutnya (max 3 rounds to prevent explosion, dedupe by entry id).
- **Acceptance:** entry "Dragon" mentions "castle" → entry "Castle" ikut aktif; loop detection bekerja pada mutual reference A↔B.

### X2.7 · Agent pipeline framework (item #7, effort L — foundational)
- **Migrasi baru** `0025_agent_configs.sql`:
  ```
  agent_configs(id, user_id, type, name, phase enum('pre_generation','parallel','post_processing'),
                enabled, connection_id uuid?, prompt_template text, settings jsonb,
                tools text[], run_interval int default 1, is_builtin bool)
  agent_runs(id, agent_config_id, session_id, turn_index, result_data jsonb,
             tokens_in int, tokens_out int, latency_ms int, created_at)
  ```
- **Services baru:**
  - `packages/server/src/services/agents/agent-executor.ts` — single-agent execution + optional tool-call loop (max 5 rounds)
  - `packages/server/src/services/agents/agent-pipeline.ts` — phase runner + **batching per (provider, model)** dengan `<agent_task id>…</agent_task>` + `<result agent>…</result>` format
  - `packages/server/src/services/agents/builtin-adapters.ts` — wrap existing `repetition-detector`, `continuity-guard`, `tone-drift-detector`, `format-drift-detector`, `scene-state-parser`, `harem-turn-selector` sebagai built-in agent types (backward compat).
- **Per-agent run interval** (item #13, Marinara M7): `runInterval=5` default untuk `director`, `lorebook-keeper`, `chat-summary`; `runInterval=1` untuk validator.
- **Migration path:** orchestrator `runSinglePass` deprecate bertahap — flag `AGENT_PIPELINE_ENABLED`. Built-in validator tetap jalan lewat adapter; user bisa tambah custom agent via UI.
- **FE:** `/settings/agents` — list enable/disable toggle, custom agent editor.
- **Acceptance:** 6 validator dijalankan sebagai 1–2 batched LLM call (bukan 6 separate), cost tracking per-agent di `agent_runs`.

### X2.8 · Streaming re-render isolation (item #8, effort S)
- **Profile dulu:** buka `packages/web/src/app/chat/[sessionId]/page.tsx` di React Profiler; confirm tiap SSE token trigger re-render seluruh chat tree.
- **Fix:**
  - Split `StreamingBubble` jadi component sendiri, `memo`-wrap.
  - State streaming via `useSyncExternalStore` subscribe ke store `streaming-buffer.ts`, bukan `useState` di parent.
  - Parent pakai `useDeferredValue` untuk snapshot final.
  - Double-rAF commit guard di `packages/web/src/lib/sse.ts` event `done` — pastikan tidak ada "vanishing message" race dengan React 18 concurrent commit.
- **Acceptance:** React Profiler selama streaming menunjukkan hanya `StreamingBubble` yang re-render per token; parent ChatWindow 0 render.

---

## X3. Tier-2 Unimplemented (product surfaces)

### X3.1 · Prompt Info overlay (item #12, effort S)
- Reuse `prompt_snapshots` (migrasi 0016) yang sudah ada.
- FE: di bubble assistant, button "🔍 Debug" → modal show preset name, section list + token count per section, model, total tokens, latency, retry count, validator score.
- Gate: owner-only (same auth check as F4).
- Value: RP debugging — user lihat kenapa reply drift.

### X3.2 · Auto-continue on incomplete sentence (item #16, effort S)
- **Helper baru** `packages/shared/src/utils/completion-check.ts::isLastCharPunctuation(text)`.
- Orchestrator POST-stream hook: bila response length ≥ `maxTokens * 0.95` AND `!isLastCharPunctuation` → auto-fire `/continue` endpoint (which already exists per BRAINSTORM §13 T3.12).
- Guardrail: max 1 auto-continue per turn; user-toggle di settings `autoContinueOnCut`.

### X3.3 · Real tokenizer per model (item #14, effort M)
- Bundle `tiktoken` (GPT) + `@anthropic-ai/tokenizer` (Claude) + `@xenova/transformers` (Llama/Gemma/Mistral) lazy-loaded di shared package.
- Per-model selector di `ai-proxy.ts::AI_MODEL_CONFIG[model].tokenizer`.
- Wire ke token-count UI: preset editor section weight, lorebook entry `tokenEstimate`, context budget.
- Cache tokenizer instance; cache hash(content) → tokenCount per session.

### X3.4 · Tavern Card v2/v3 PNG import/export (item #15, effort M)
- `packages/server/src/services/character-card/png-chunks.ts` — read/write `tEXt`/`chara` chunks per spec.
- `POST /api/characters/import` accepts PNG multipart → parse chunks → validate zod schema → seed character + lorebook + avatar.
- `GET /api/characters/:id/export.png` → embed full character+lorebook+regex scripts+depth prompt in PNG chunks.
- Import UX di `/characters/new` — drag-drop PNG card.

### X3.5 · HypaV3-style memory budgeter (item #11, effort M)
- **Already have** hybrid RRF (T4.2) + multi-factor scoring (T4.5). Missing: **explicit budget ratio allocator**.
- New config `USER_SETTINGS.memoryRatios = { recentMemoryRatio: 0.4, similarMemoryRatio: 0.4, randomMemoryRatio: 0.1, extraSummarizationRatio: 0.1 }`.
- `memory-retriever.ts` allocate token budget per bucket sebelum RRF fusion.
- "Random" bucket = nostalgic-surprise factor; pilih 1–2 memory random dari pool salience≥0.7 untuk variasi.

### X3.6 · Inline `{{button::Label::trigger}}` macro (item #9 bagian Risu §Q)
- Butuh X2.3 CBS macro selesai dulu.
- Renderer di `packages/web/src/components/chat/bubble-format.tsx` — button render sebagai `<button>` real; klik POST `/api/chat/:sessionId/trigger` dengan `{trigger: cmd}`.
- Server-side: trigger cmd di-whitelist per character — bukan arbitrary eval.
- Pairing natural dengan CYOA shipped + stories mode.

### X3.7 · Browser notification on response done (Risu §V, effort XS)
- Client-side only: SSE `done` event → if `document.hidden` dan user grant notifPermission → `new Notification(characterName, { body: firstSentence, icon: avatar })`.
- Tambah toggle `notifyOnReply` di `/settings`.
- Low effort, high retention.

---

## X4. LCM Phase 2–4 yang belum selesai (BRAINSTORM §11-12)

T4.x sudah cover Phase 1 + sebagian Phase 2 (D0→D1 summary DAG). Yang masih **belum ada**:

### X4.1 · `context_blobs` externalization (Phase 2 sisa)
- **Migrasi baru** `0026_context_blobs.sql`:
  ```
  context_blobs(id, session_id, mime_type, size_bytes, content_ref text,
                digest text, created_at)
  ```
- `content_ref` → R2 key untuk payload > 8KB; digest summary (~300 tokens) stay inline di `context_nodes.content` dengan `blobRef: {id}` pointer.
- Target payload: tool outputs, long scene artifacts (VN mode), generated images caption metadata, imported lorebook entries besar.
- Prompt assembly **hanya** baca digest; user operator bisa `expand` untuk full content di ops UI.

### X4.2 · `context_node_sources` lineage table (Phase 2 sisa)
- **Migrasi baru** `0027_context_node_sources.sql`:
  ```
  context_node_sources(context_node_id, source_type enum('message','node','blob'),
                       source_id uuid, range_start int, range_end int,
                       PRIMARY KEY (context_node_id, source_type, source_id))
  ```
- Wire di `context-compaction.ts` — saat compact, tulis lineage per node.
- Ops UI: node detail page munculin full source message list + klik-to-expand ke raw chat_messages.

### X4.3 · `session_context_state` frontier (Phase 2 sisa)
- **Migrasi baru** `0028_session_context_state.sql`:
  ```
  session_context_state(session_id PRIMARY KEY, last_compacted_turn int,
                        maintenance_debt int, snapshot_fresh_at timestamptz,
                        wake_up_packet jsonb, frontier_depth int)
  ```
- Tracks apa yang sudah/belum di-compact per session → enables idempotent background cron `context-maintenance.ts` yang proses backlog bertahap.
- **Wake-up packet** (snapshot-style) di-precompute saat session idle > 1 jam; dibaca saat user `open` session → cold-start latency turun.

### X4.4 · Context retrieval primitives surface (Phase 3)
Saat ini cuma ada `retrieveCompactedContext()` monolitik + ops drill-down routes. Yang belum: internal API konsisten untuk orchestrator.

- **File baru** `packages/server/src/services/context-retrieval.ts` dengan 4 primitives:
  - `search(sessionId, query, k)` → hybrid RRF over {messages FTS, node summaries FTS, vector}
  - `describe(nodeId)` → include child summaries + lineage (bukan full content)
  - `expand(nodeId)` → full content + resolved blob digests
  - `expand_query(sessionId, query)` → search → pick top relevant → auto-expand; one-call convenience for orchestrator "the model asked about X, give me full detail"
- Orchestrator adopt `expand_query` saat detect recall question (pattern `"ingat ga waktu..."`, `"apa yang kamu bilang soal..."`).

### X4.5 · Typed memory graph (Phase 4)
T4.9 `character_facts` = subject/predicate/object tunggal per character. Yang belum: **edge table** untuk relasi antar fact + cross-character + cross-session.

- **Migrasi baru** `0029_memory_graph.sql`:
  ```
  memory_graph_nodes(id, user_id, kind enum('user','character','location','item','event','promise','mistake'),
                     canonical_name text, metadata jsonb)
  memory_graph_edges(id, from_node_id, to_node_id, predicate text,
                     valid_from, valid_to, confidence real, source_message_id)
  ```
- Enables queries: "semua promise Lysandra ke user yang belum completed", "timeline relationship Rei-user across all sessions", "mistakes registry + their correction chain as graph neighborhood".
- Ops UI: graph visualizer di `/ops/users/:id/memory-graph`.

### X4.6 · Smart-trigger recall/save policy (Phase 3, Human-like-memory-skill lesson)
- Hari ini memory save = fire-and-forget tiap turn (scheduleSummary, extractPromises, diary per 10 turn). Memory recall = tiap turn lewat RRF.
- Policy yang belum: **demand-sensitive trigger** — skip recall kalau turn pendek (< 20 char) atau clearly greeting-only (`classify = 'smalltalk'` via small-model). Save trigger hanya fire saat detect milestone (mood spike > 0.4, new subject introduced, user explicitly promise).
- **File baru** `services/memory-policy.ts::shouldRecall(turn)`, `::shouldSave(response)`.
- Saving: 40–60% LLM cost turun di tail turn yang mundane.

---

## X5. REDESIGNv2 D1–D6 (⏳ semua pending)

Status dari REDESIGNv2 §last table — belum dimulai sama sekali.

- **D1** · Character purge Tahap A+B (hide retired + seed-beta-3 Rei/Lysandra/Kaia only) + kolom `language`, `is_retired`, `allow_in_stories`. Effort: sedang. **Ship duluan** sebelum D2 karena fusion home butuh clean cast.
- **D2** · Fusion home `/` — PosterCard, DiscoverRail, GenreChip, LanguageChip, `useAdaptiveHero`. Ganti homepage lama (yang sudah di-redesign minimalis tadi) dengan rail-driven layout. Reuse komponen dari redesign simple kemarin (IZStoryShelf) sebagai salah satu rail, bukan pengganti full.
- **D3** · Creator profile publik — migrasi `0025_creator_profiles.sql` (handle + bio + profileIsPublic), routes `/api/creators/:handle`, page `/creators/@handle`, `CreatorBadge` component.
- **D4a** · VN stories schema + engine — migrasi `0026_stories.sql` (tables: `stories`, `story_scenes`, `story_runs`, `story_character_refs`), `routes/stories.ts`, `services/story-runner.ts`, cast picker.
- **D4b** · VN FE — `/stories`, `/stories/[id]`, `/stories/[id]/play`, `/studio/stories`, `VNScene` component, seed `"Three Are Waiting"` (3 scene × 3 karakter beta, kinetic linear, 1 ending).
- **D5** · Letters — migrasi `0027_letters.sql`, BullMQ `letter-reply` queue + worker (6–24h delay, respect quiet hours), FE `/letters` inbox + `/letters/[id]` detail, CTA dari chat toolbar.
- **D6** · Polish — Framer Motion rail transitions, aurora skeleton, footer feed ("semalam N karakter menulis diary…"), Fraunces + Noto Serif JP font, dark palette refinement.

**Konflik nomor migrasi** dengan X4: D3=0025 clash dengan X2.7=0025. Resolusi: X2.7 geser ke `0030_agent_configs.sql` atau tunggu D3 ship dulu — D3 effort lebih rendah. Final reconciliation saat execution week.

---

## X6. MARINARA Phase H sisa (belum shipped)

Dari MARINARA_AUDIT.md §3 Phase H, yang PLANv2 lewati (H1 + H7 + H12 shipped):

- **H2 World Info Inspector UI** — depends F1 (shipped). Efek: UI di `/sessions/[id]/world-info` munculin active lore entries + token each + trigger source (keyword match vs vector sim). Reuse data dari `GET /api/sessions/:id/active-lore` (shipped wk 5).
- **H3 Per-scene backgrounds + weather overlays** — `scene_state.location` → CDN URL map (`packages/server/src/lib/scene-backgrounds.ts` whitelist), CSS-only weather layer (`rain`/`snow`/`fog` via canvas). Respect `prefers-reduced-motion`.
- **H4 Character galleries (R2)** — migrasi baru `character_galleries(id, character_id, r2_key, caption, tags[], order_index)`; upload UI di `/characters/[id]/edit` gallery tab; lightbox di chat header avatar klik.
- **H5 Regex scripts (re2-wasm)** — **overlap** dengan X2.5. Resolusi: X2.5 adopt Marinara schema (superior — punya `minDepth/maxDepth/promptOnly`), H5 jadi **referensi saja**, tidak ship terpisah.
- **H6 Custom trackers** — reuse `[STATE:]` parser dengan tag baru `[TRACK: key=value]`; creator define key schema di character editor; display di chat side panel sebagai live bars.
- **H8 Illustrator prompt generator** — text-only (no image gen): one-shot small-model call per scene produce image prompt ("Describe scene as Midjourney prompt, 80 tokens"); save to `chat_messages.metadata.illustratorPrompt`; copy-button UI untuk user paste ke tool mereka.
- **H9 Connection test/duplication** — overlap dengan X2.2 (test-ping sudah di-detail). Tambahan: "Duplicate" button clone connection config dengan suffix "(copy)" — effort XS, ship bersama X2.2.
- **H10 Discord mirror** — opt-in per-session webhook URL di `sessions.metadata.discordWebhook`; `services/discord-mirror.ts` forward user+assistant message async. Respect NSFW — strip explicit content untuk channel non-NSFW-marked.
- **H11 Light mode theme** — `prefers-color-scheme: light` token set di `tailwind.config.ts`. Not urgent; ship di D6 polish.

---

## X7. Stretch / §4 originals sisa

- **Echo Chamber reactions** (MARINARA Phase Stretch) — paid novelty; other subscribers di session lihat emoji reaction stream realtime saat karakter reply. Pakai Supabase Realtime channel `session:${id}:reactions`. Post-monetization surface.
- **Prompt-cache visibility** (Marinara §2.4 last row) — parse `prompt_tokens_cached` / `cache_creation_input_tokens` dari OpenRouter + Anthropic response headers; surface di Prompt Info overlay (X3.1) + per-user cost dashboard.
- **Avatar zoom/crop editor** (MARINARA §2.2) — client-side canvas crop di `/characters/[id]/edit`; simpan cropped ke R2 variant `avatar_square_512.jpg`.
- **§4 #3 Persona vs character A/B preview** (belum shipped) — di preset editor (G2), rendered preview split 2 panel: "how model sees persona" (resolve `{{user}}` + `appendPersona`) vs "how it sees character" (resolve `{{char}}` + `appendCharacterBrief`). Diagnostic aid.
- **§4 #4 Public lorebook library** (belum shipped) — post-F1 marketplace; `lorebooks.visibility enum('private','unlisted','public')`, moderated curation, `/library/lorebooks` page. Jalan setelah creator-profile D3.

---

## X8. PLANv2 §11 "What's explicitly not yet done" — FE backfill

Dari PLANv2 bagian akhir, yang disebut **belum dilengkapi FE**:

- **`/settings/schedules`** — UI untuk H7 BullMQ scheduled messages; list upcoming + edit cadence + cancel.
- **`/handoff`** desktop + **`/handoff/claim`** mobile — QR reader + JWT redeem flow. Backend `routes/handoff.ts` shipped tapi no UI.
- **Backstory tier editor** di `/characters/[id]/edit` — array editor untuk `backstoryTiers: [{trustThreshold: int, text: string}]`. Backend `backstory-reveal.ts` shipped.
- **Quiet-hours UI** di `/settings` — input `user.metadata.quietHoursStart/End` (time picker, default 22:00/08:00 user-tz). Planner sudah baca field ini.
- **Diary rollup ke BullMQ repeatable** — saat ini `setInterval` 24h di `services/character-diary-rollup.ts`; risk multi-process double-emit. Migrate ke `queue.add(..., { repeat: { pattern: '0 3 * * *' } })`.

---

## X9. Perf audit sisa (MARINARA §2.7)

Yang belum ter-confirm setelah §6 cache-bust:

- **React Profiler streaming-bubble split** — overlap dengan X2.8 (tier-1). Ship satu paket.
- **`useShallow` / `useSyncExternalStore` pattern** — audit TanStack Query selector di chat page; identify object-identity re-render hotspot.
- **Tracker-before-output-format order** — verify `builder.ts appendSceneState` running **before** `appendOutputFormat` instruction block. Quick grep + diff sufficient.
- **Double-rAF commit vanishing-message guard** — overlap dengan X2.8; pastikan `lib/sse.ts` event `done` handler wrap state commit di `requestAnimationFrame(() => requestAnimationFrame(() => setState(...)))`.

---

## X10. Execution order usulan (14-day advanced batch)

Asumsi semua yang di §X1 status-map sudah ✅. Jalankan berurutan:

| Hari | Ship | Kenapa urutan ini |
|---|---|---|
| 1 | X2.1 XML wrap + X2.8 streaming isolation (pair: low risk, high baseline) | Foundation untuk snapshot comparison |
| 2 | X2.2 BYOK test-ping + X7 "Duplicate connection" (H9) | 1 hari full |
| 3 | X3.7 browser notification + X7 prompt-cache visibility parser | XS pair |
| 4–5 | X2.3 CBS macros subset + X3.6 `{{button}}` | Paling enable futures |
| 6 | X2.6 lorebook decorators + recursive scan | Reuse existing F1 pipeline |
| 7–8 | X2.5 regex scripts 4-mode (H5 merge) | Schema = Marinara superior |
| 9–10 | X2.7 agent pipeline framework (batching + runInterval) | Foundational, unlock custom validators |
| 11 | X2.4 marker-based reorderable preset | Needs X2.1 wrap + X2.3 macros done |
| 12 | X3.1 Prompt Info overlay + X3.2 auto-continue + X3.3 real tokenizer | Quality pass |
| 13 | X8 FE backfill (schedules/handoff/backstory/quiet-hours/diary BullMQ) | Catch up PLANv2 debt |
| 14 | X4.3 frontier state + X4.6 smart-trigger policy | Cost-saver tail |

**Setelah 14-day batch**, masuk REDESIGNv2 track (D1 → D5) yang paralel-able dengan Phase 4 LCM (X4.1/4.2/4.4/4.5) karena beda area touch.

---

## X11. Konflik & dedupe final

| Item A | Item B | Overlap | Resolusi |
|---|---|---|---|
| X2.2 BYOK test-ping | X6 H9 connection test/dup | Exact feature | Merge — ship bersama di hari 2 |
| X2.5 regex scripts | X6 H5 regex scripts | Exact feature | Adopt Marinara schema (X2.5); H5 closed sebagai "referensi" |
| X2.7 agent pipeline | `orchestrator.ts runSinglePass` existing | Replace possibly | Backward-compat via adapter `executeBuiltInAgent(type, ctx)`; flag `AGENT_PIPELINE_ENABLED` gate |
| X4.5 memory_graph | T4.9 `character_facts` | Layer above | Graph = cross-table edge layer; facts remain leaf fact storage. Both coexist. |
| X4.1 `context_blobs` | R2 storage existing (avatars) | Re-use R2 | Share R2 bucket; namespace key `blob/${sessionId}/${blobId}` |
| X5 D3 `0025_creator_profiles.sql` | X2.7 `0025_agent_configs.sql` | Migration number | Whichever ships first keeps 0025; other bumps +1. Plan: D3 dulu, X2.7 → 0030. |
| MARINARA §3 CYOA | PLANv2 wk 6 F3 ✅ | Already shipped | Skip — in status map |
| Risu §R auto-continue | X3.2 | Same feature | Single ticket in X3.2 |
| Risu §N emotion sprite | MARINARA agent #10 Expression Engine | Similar | X7 tier-3 single ticket, logit-bias decay optional |

Semua konflik ter-resolve. Tidak ada item yang muncul di dua tempat tanpa pointer.

---

## X12. Open questions (revisi dari MARINARA_AUDIT §9)

1. **X2.7 Agent pipeline** — migrate ALL 6 built-in validators dalam 1 PR, atau bertahap (continuity dulu, format+tone+repetition+refusal menyusul)? (Default: bertahap, 2 validator per PR, shadow-mode 3 hari.)
2. **X4.5 memory_graph** — ship user-level (cross-session) dari awal, atau session-scoped dulu lalu expand? (Default: session-scoped dulu — lower risk.)
3. **X5 D4 VN stories** — allow public cast dari karakter user lain (moderated), atau built-in-only first? (Default: built-in-only MVP "Three Are Waiting".)
4. **X3.4 Tavern Card import** — bundle `@xenova/transformers` PNG-chunk lib (heavy) atau tulis parser sendiri (ringan, maintain sendiri)? (Default: parser sendiri ≈ 200 LOC.)
5. **X4.6 Smart-trigger recall/save policy** — pakai small-model classify (cost per turn) atau deterministic heuristic (regex + length + mood delta)? (Default: heuristic; measure false-negative rate, tingkatkan ke LLM kalau > 20%.)

---

*Section revision: PLANv3 advanced backlog · 2026-04-22 · konsolidasi MARINARA_AUDIT.md + BRAINSTORM.md §11–14 + REDESIGNv2.md + PLANv2.md §11 sisa. Semua item unimplemented-only; tidak ada duplikasi dengan shipped stack per status-map §X1.*
