> ✅ **STATUS (apr 2026): IMPLEMENTED — clean-room provenance trail.** 25-agent mapping, Phase F/G/H, and originals (diary rollup, trust-gated, QR handoff, recap push) all shipped. Kept for AGPL §13 provenance. Execution log: [PLANv2.md](PLANv2.md) §11.

---

# Marinara Engine — Deep Audit & Idea-Mining (Clean-Room v2)

> **Supersedes** `CLEANROOM_NOTES.md` (kept for history). Wider, deeper, and with an
> explicit **integration graph** so every proposed feature connects without
> contradicting what we already shipped.
>
> **Audit date:** 2026-04-21 · **Target repo:** `Pasta-Devs/Marinara-Engine`
> @ `7320164…` (branch `main`, plus `fix/more-sidecar-fixes`).
>
> **Corpus consulted (doc + metadata only — no source code opened):**
>
> - `README.md` (full, incl. feature matrix of 25 agents)
> - `CHANGELOG.md` (v1.4.6 → v1.5.3)
> - `CLAUDE.md`, `CONTRIBUTING.md`
> - GitHub Trees API (`/git/trees/main?recursive=1`) — **file paths only**, which
>   are metadata and non-copyrightable. They confirm *that* a feature exists;
>   its implementation is re-specified from README behaviour.
> - Public branches list (`/branches`) — only `main` + one fix branch; no
>   hidden experimental line of work to study.
>
> **Corpus NOT consulted** (deliberately, for AGPL hygiene):
> any blob under `packages/client/src/`, `packages/server/src/`,
> `packages/shared/src/`, prompt templates, Drizzle schemas, or agent configs.
>
> **License posture.** Marinara Engine is AGPL-3.0. `project-neigo` is
> network-deployed at `roleplay.neigo.my.id`. AGPL §13 would, if we
> imported any covered code/schema/prompt, force us to publish full neigo
> source to every network user — incompatible with our commercial posture.
> **Ideas are not copyrightable; expression is.** Everything below is re-specified
> behaviour, implemented from scratch in our stack.

---

## 0. TL;DR — what changes after this audit

1. Prior roadmap (`CLEANROOM_NOTES.md` Phase F–H) **remains valid**. This
   document refines priorities, adds three new candidates, and resolves
   dependency order.
2. **Top 3 wins** (best impact-to-effort, all integrate with live code):
   - **F1 Lorebooks v1 + Knowledge Retrieval (chunked RAG)** → biggest
     content-lock-in lever; reuses `embeddings.ts` + pgvector that are
     already wired.
   - **F3 CYOA Choices** → biggest mobile-UX lever; 1 small extra AiProxy
     call per turn, rides on the SSE infrastructure we rebuilt in E2.
   - **G1 Personas** + **G2 Macro/Preset** as one combined shipment →
     unlocks creator cockpit *and* backfills a gap the migration plan
     already hinted at.
3. Nothing in this audit **contradicts** live shipped systems (E1–E5, Sections
   A–C, M4–M6). All additions attach at well-documented seams (see §6
   integration graph).
4. New ideas surfaced this round: **Chat Summary popover** (lightweight, reuses
   `context-compaction`), **XML-wrapped prompt sections** (engineering posture,
   not user-facing), **Tracker-order discipline** (builder.ts audit).

---

## 1. Product thesis guardrails (unchanged)

Every idea must pass these filters. This is non-negotiable; items that fail
get downgraded or dropped.

| # | Guardrail | Filter |
|---|---|---|
| 1 | ROLEPLAY-only UI | No Conversation DM mode, no Game/RPG/VN mode. |
| 2 | Indonesian + Tokyo-adult register | Copy, macros, seeded examples in non-formal bahasa; Rei persona preference. |
| 3 | Web-native SaaS | No local launchers, no llama-cpp/MLX/Docker consumer install, no SQLite target. |
| 4 | Tier + BYOK aware | New features respect `TIER_CONFIG` limits and the BYOK fallback chain. |
| 5 | Immersion > power-user toggles | Advanced panels are opt-in; first-run stays a wizard. |
| 6 | No AGPL surface | No copied deps, code, prompt, schema. Re-specify only. |

---

## 2. What Marinara ships, what we ship, and the gap

### 2.1 Chat & Roleplay surface

| Marinara (README) | neigo today | Verdict | Action |
|---|---|---|---|
| Three modes (Conversation / Roleplay / Game) | ROLEPLAY only (E4 locked UI) | ❌ Out of scope | — |
| "Connected system" (cross-mode memory) | Single-mode; [`memory-manager.ts`](packages/server/src/services/memory-manager.ts), [`memory-retriever.ts`](packages/server/src/services/memory-retriever.ts) | ✅ sufficient | — |
| Character management (avatar, personality, backstory, system prompt) | Full wizard (E3) | ✅ | — |
| Bot Browser (Chub.ai import) | — | ❌ Skip | Brand + legal risk; curated directory later, if ever. |
| Chat Folders (named, color-coded) | — | ⭐ P2 | `chat_sessions` already has metadata jsonb; add `folderId` FK + `folders` table. |
| Avatar zoom + drag-to-pan | Static upload | ⭐ P2 | Client-only canvas crop at upload time. Improves sprite stitching output. |
| Persona system (multi-user-personas) | Single `user.displayName` | 🟡 P1 | See §3 G1. |
| Group chats | `castCharacters` + `harem-turn-selector` | ✅ | — |
| Chat branching | `session_events.branch` logged, no UI | ⭐ P1 | Add `parentSessionId` + `branchedFromMessageId` columns; branch button. |
| Message swiping (alternate responses) | single response; `/regenerate` replaces | ⭐ P1 | `chat_messages.swipeIndex`; new `/regenerate` variant that keeps siblings. |
| Slash commands | — | ⭐ P1 | **Client-side parser**; never allow server to match user strings. Commands: `/sys`, `/narrator`, `/as`, `/continue`, `/impersonate`, `/scene`, `/random`, `/help`. |
| SillyTavern import | — | ❌ Skip | Different audience. |

### 2.2 Visual & immersive

| Marinara | neigo | Verdict | Action |
|---|---|---|---|
| Sprite system with emotion switching | `/img/sprites`, MOOD event in orchestrator | ✅ | Explicit `mood→sprite` JSON map per character (remove implicit lookups). |
| Custom backgrounds (per-scene) | — | ⭐ P2 | Extend `scene-state-parser` `location` key → CDN background URL; palette per world. |
| Weather overlays (rain/snow/fog) | — | 🟠 P2 | CSS-only layer driven by scene-state `weather`. |
| Two themes (Y2K + ST classic) | Own dark theme | ❌ Skip | — |
| Light mode | Dark only | 🟡 nice-to-have | `prefers-color-scheme` when roadmap capacity exists. |

### 2.3 AI agent system — the headline (25 agents)

Mapping Marinara doc-names → neigo equivalents. `✅` = already implemented;
`⭐`/`🟡`/`🟠` = gap classification; `❌` = out of scope.

| # | Marinara agent | neigo mapping | Verdict |
|---|---|---|---|
| 1 | World State (date/time/weather/location/cast) | [`scene-state-parser.ts`](packages/server/src/services/scene-state-parser.ts) | ✅ — add `weather`, `presentCast` keys |
| 2 | Quest Tracker | — | ❌ game mode |
| 3 | Character Tracker (mood/relationship/outfit/stats) | [`harem-stats-repo.ts`](packages/server/src/services/harem-stats-repo.ts) + [`relationship-stage.ts`](packages/server/src/services/relationship-stage.ts) + [`character-facts.ts`](packages/server/src/services/character-facts.ts) + [`character-diary.ts`](packages/server/src/services/character-diary.ts) | ✅ — consolidate into single `GET /session/:id/state-snapshot` endpoint |
| 4 | Persona Stats (needs/condition bars) | — | ❌ game mode |
| 5 | Custom Tracker (creator-defined fields) | — | ⭐ P2 — reuse `[STATE:]` parser pattern with `[TRACK: key=value]`; creator defines schema |
| 6 | Narrative Director (plot beats/NPCs) | `story_arcs` table exists, unused | ⭐ **P0** — see §3 F2 |
| 7 | Prose Guardian (variety) | [`repetition-detector.ts`](packages/server/src/services/repetition-detector.ts) | ✅ partial — extend with verbal-tic ledger per session |
| 8 | Continuity Checker | [`continuity-guard.ts`](packages/server/src/services/continuity-guard.ts) | ✅ |
| 9 | Combat | — | ❌ game mode |
| 10 | Expression Engine (emotion → sprite) | MOOD event → sprite | ✅ — make mapping explicit per character |
| 11 | Background Picker | — | ⭐ P2 — §2.2 |
| 12 | Echo Chamber (stream-chat reactions) | — | 🟠 P2 — paid-tier novelty |
| 13 | Prompt Reviewer (pre-gen critique) | — | ⭐ P1 — see §3 G6 |
| 14 | Illustrator (image prompt gen) | — | 🟡 P2 — generate prompt only; no image yet |
| 15 | Lorebook Keeper (auto-create entries) | — | ⭐ **P0** — §3 F1 |
| 16 | Immersive HTML (in-world HTML/JS) | — | 🟠 **DEFER permanently** — XSS minefield |
| 17 | Consistency Editor (post-hoc edits) | Retry chain re-runs full pass | ✅ — our retry semantic is safer than in-place edit |
| 18 | Spotify DJ | — | 🟠 niche; skip |
| 19 | Chat Summary (rolling condense) | [`context-compaction.ts`](packages/server/src/services/context-compaction.ts) | ✅ — **gap**: expose in FE debug panel (H2) |
| 20 | Knowledge Retrieval (chunked RAG) | `embeddings.ts` + pgvector already wired | ⭐ **P0** — §3 F1 couples to lorebooks |
| 21 | Schedule Planner (weekly cadence) | — | 🟡 P1 — feeds autonomous messenger |
| 22 | Response Orchestrator (who speaks next in group) | [`harem-turn-selector.ts`](packages/server/src/services/harem-turn-selector.ts) | ✅ |
| 23 | Love-Toys Control (Buttplug.io) | — | ❌ out of scope |
| 24 | CYOA Choices | — | ⭐ **P0** — §3 F3 |
| 25 | Autonomous Messenger | E1 BullMQ nudge + return | ✅ — extend with scheduled natural-language pings (H7) |

**Count:** of 25 documented agents, we already cover **8** (32%), will ship a
further **9** as explicit gaps (36%), and rationally **skip 8** (32%) for thesis/scope
reasons. Target coverage after Phase F–H: **68%** of the Marinara agent surface,
shaped to fit neigo's ROLEPLAY-only, SaaS-adult, Indonesian-register thesis.

### 2.4 Prompt engineering — our biggest gap

| Marinara | neigo | Verdict | Action |
|---|---|---|---|
| Preset System (save/load) | — | ⭐ P1 | Table `prompt_presets`; §3 G2 |
| Prompt Sections (drag-drop, depth, toggles) | Hard-coded order in [`builder.ts`](packages/server/src/prompts/builder.ts) | 🟡 P1 | Introduce `PromptSection[]` struct; default preset locks the canonical order |
| Lorebooks (keyword-triggered world entries) | — | ⭐ **P0** | §3 F1 |
| AI Lorebook Maker (gen from topic) | — | ⭐ P1 | §3 G5 |
| World Info Inspector (active entries + tokens) | — | ⭐ P1 | §3 H2 |
| Regex Scripts (user find/replace) | — | 🟡 P2 | Safety: `re2-wasm` capped runtime; never native `RegExp` on user input |
| Macro System (`{{char}}`, `{{user}}`, `{{time}}`) | partial, undocumented | ⭐ P1 | Formalise macros in shared; §3 G2 |
| Prompt Caching Visibility (OpenRouter/Claude) | `model-metrics.ts` tracks cost | 🟡 P2 | Parse `prompt_tokens_cached` / `cache_creation_input_tokens` when present |
| Prompt Inspection (show fitted prompt) | [`orchestrator-replay.ts`](packages/server/src/services/orchestrator-replay.ts) records passes | ⭐ P1 | UI: surface into `/ops/sessions/[id]/context`; gate to owner |
| XML-wrapped prompt sections | — | 🟡 P2 | `xml-wrapper.ts` pattern: wrap each section in explicit `<persona>…</persona>` etc. Small quality lift w/ Claude-family models |

### 2.5 Connections / providers

| Marinara | neigo | Verdict |
|---|---|---|
| Multi-provider (OpenAI/Anthropic/Google/Mistral/Cohere/OpenRouter/…) | Section C shipped | ✅ |
| Encrypted API keys at rest | BYOK AES; ops route audited | ✅ |
| Per-chat override | `sessions.aiModel` | ✅ |
| Connection duplication & testing | — | 🟡 P2 — "Test connection" 1-token ping |
| Local sidecar (Gemma-4, MLX) | — | ❌ out of scope |
| OpenRouter provider preference | — | 🟡 P2 — optional `byokProvider` hint → OpenRouter `provider.order` |

### 2.6 Export / data

| Marinara | neigo | Verdict |
|---|---|---|
| Export chats (JSONL / plain text) | [`sessions.ts`](packages/server/src/routes/sessions.ts) export route | ✅ |
| Character galleries (reference images) | — | ⭐ P2 (H4) — R2 + `character_galleries` table |
| Persona groups | — | 🟡 P2 (post-G1) |
| Discord mirror (outbound webhook) | — | 🟡 P2 (H10) — opt-in per session |
| Session recordings (v1.5.3) | `orchestrator-replay.ts` records | ⭐ P2 — expose owner-only read UI |

### 2.7 Performance & UX hardening (from their changelog, not copied)

Validated patterns to **audit in our own codebase** before they bite us:

| Pattern | Our audit action |
|---|---|
| Streaming re-render isolation (isolated streaming component, parent doesn't re-render per token) | Benchmark [`packages/web/src/app/chat/[sessionId]/page.tsx`](packages/web/src/app/chat/%5BsessionId%5D/page.tsx) with React Profiler; split streaming bubble into own `memo`-wrapped component. |
| Triple-layer cache busting on streaming endpoints (server `Cache-Control: no-store` + client `cache: 'no-store'` + SW `NetworkOnly`) | Verify [`packages/web/public/sw.js`](packages/web/public/sw.js) treats `/api/*` as `NetworkOnly`. SSE already bypasses SW cache. |
| Debounced `localStorage` writes with unload flush | Review presence-replay and any zustand `persist` middleware consumers. |
| Connection `maxContext` trim before send | Confirm [`context-compaction.ts`](packages/server/src/services/context-compaction.ts) clamps to `AI_MODEL_CONFIG[model].maxContext`. |
| Strip inline reasoning (`<thought>`/`<\|think\|>`) before `[STATE:]` parse | Future reasoning-model support: add prefix stripper before [`scene-state-parser.ts`](packages/server/src/services/scene-state-parser.ts). |
| Tracker/scene-state injected **before** output-format instructions | Inspect `builder.ts appendSceneState` vs. output-format block ordering. |
| Zustand `useShallow` to avoid object-identity re-renders | We lean on TanStack Query, not zustand, for server state — verify selector usage regardless. |
| Vanishing-message-after-streaming bug — fixed with double-rAF commit + retry | Guard against this in [`packages/web/src/lib/sse.ts`](packages/web/src/lib/sse.ts) (E2 reference). |

---

## 3. Priority roadmap (clean-room re-specs)

Ordered by `(user_impact × thesis_fit) / dev_cost`.

### Phase F — "Content lock-in" (P0)

#### F1 · Lorebooks v1 + Knowledge Retrieval

**Why it's #1**: Marinara's biggest content moat is that its users invest hours
into lorebook worlds and can't leave the platform. We already have pgvector
and embeddings — this is pure product value on top of infra we paid for.

- **Schema** (new migration `0015_lorebooks.sql`):
  - `lorebooks (id uuid pk, userId fk, name text, scope enum('USER','SESSION'), createdAt)`
  - `lorebook_entries (id uuid pk, lorebookId fk, title text, content text, keywords text[], priority int, depth int, enabled bool, tokenEstimate int, embedding vector(1536))`
  - `session_lorebook_links (sessionId fk, lorebookId fk, primary key)`
- **Retrieval pipeline** (on each turn):
  1. Tokenize last N user+assistant messages + current user input.
  2. Keyword pass: `WHERE enabled AND keywords && $tokens` with GIN index.
  3. Vector pass: cosine-sim top-K against `embedding` on remaining entries.
  4. Merge, priority-rank, budget-cap by estimated tokens (default 1500 tokens).
  5. Inject via `builder.ts` at a new section `appendLoreContext(entries, depth)`.
- **Tier limits**: FREE 1 lorebook × 20 entries; PAID 10 × 200; FOUNDER unlimited.
- **Failure mode**: on embedding-service failure, degrade to keyword-only.
- **Evidence-of-existence (from file tree):** Marinara has
  `lorebook.schema.ts`, `lorebook-maker.routes.ts`, panels `LorebooksPanel`,
  `LorebookMakerModal`. Confirms scope + that an AI maker exists.

#### F2 · Narrative Director (proactive beats)

- **Service** `story-beat-planner.ts` (new).
- **Triggers**: (a) every N turns (default 8), (b) stall heuristic — last 3
  turns have same mood + no new scene-state keys.
- **Data**: reuses existing `story_arcs` (migration 0010 / M5) — currently
  under-utilised.
- **Output**: a single soft directive prepended to the next orchestrator pass:
  *"Introduce [beat] naturally this turn; do not force it if the scene is mid-dialogue."*
- **Guardrails**:
  - Directive expires after 1 turn.
  - Never fires during emotional climax (if mood intensity > 0.8).
  - Max 1 directive per session per 24h at FREE tier.
- **Wiring**: enters `orchestrator.ts runSinglePass` pre-prompt hook, after
  scene-state injection, before validators.

#### F3 · CYOA Choices

- **One extra tail AiProxy call** after main stream `done`, using the small/cheap
  model (`AI_MODEL_CONFIG[SMALL].slug`).
- **Input**: last 1 assistant beat + persona voice brief.
- **Output contract**: JSON `{ choices: [{ text: string, tone?: 'warm'|'cold'|'neutral' }] }`, 2–4 items, each ≤ 80 chars.
- **SSE event**: new `cyoa_choices` appended to shared union (extend
  `SseEventType`). Transport-level; client renders chips below latest bubble.
- **Lifecycle**: chips clear on first user message or 2min idle.
- **Tier-gate**: FREE → 2 choices, PAID → 3–4.
- **Why this beats server cost**: Marinara ships this as a standard agent
  because it **increases DAU per session** — passive mobile taps beat typing.

#### F4 · Prompt Inspection (dev truth)

- Persist final prompt-as-sent per `turnId` to a short-lived buffer:
  Redis 24h hot copy; FOUNDER users also get jsonb persistence.
- UI: new tab in `/ops/sessions/[id]/context` — JSON viewer with
  syntax highlighting and token counts.
- Reuses [`orchestrator-replay.ts`](packages/server/src/services/orchestrator-replay.ts).
- Zero user-facing footprint; pure debug lever.

### Phase G — "Creator cockpit" (P1)

#### G1 · Personas

- `personas (id, userId, name, description, avatarUrl, defaultMacros jsonb, createdAt)`.
- `sessions.activePersonaId` fk nullable.
- `{{user}}` macro resolves to persona name (overrides `user.displayName`).
- Persona description injected at section depth in builder.
- Quick-switcher popover in composer (following Marinara's documented pattern).

#### G2 · Macro system + Preset system (combined shipment)

- **Canonical macros**: `{{char}}`, `{{user}}`, `{{time}}`, `{{date}}`, `{{location}}`, `{{weather}}`, `{{cast}}`, `{{trust <castId>}}`, `{{history <n>}}`, `{{persona}}`.
- Resolver lives in shared package: `@neigo/shared/macros` (new util).
- `prompt_presets (id, userId, name, sectionsJson, modelSlug, samplers jsonb)`.
- Default preset seeded from current `builder.ts` output (one-time snapshot).
- Advanced users can clone + edit; sessions ref `activePresetId`.
- FE: preset selector next to model picker.

#### G3 · Message swiping + chat branching

- **Swiping**: `chat_messages.swipeIndex int default 0`, `swipeRoot boolean`.
  `/regenerate` variant (`?mode=swipe`) keeps prior message at swipeIndex++ and
  marks the new one primary. Client shows chevrons.
- **Branching**: new route `POST /api/sessions/:id/branch` takes `messageId`;
  copies all messages ≤ that turnIndex into a new session with
  `parentSessionId`, `branchedFromMessageId`. Telemetry to `session_events`.

#### G4 · Slash commands (client-side parser)

Registry local to composer:

| Command | Behaviour |
|---|---|
| `/sys <note>` | Inject hidden system note for next turn (fails if > 400 chars). |
| `/narrator <beat>` | Force a narrator beat next turn; bypass normal orchestrator routing. |
| `/as <castId> <line>` | Attribute upcoming user line as a cast member. |
| `/continue` | Call existing `/continue` endpoint. |
| `/impersonate <castId>` | Ask model to write a user-side line from that cast's POV. |
| `/scene <key=value> …` | Directly set scene-state keys (location/time/mood/weather). |
| `/random` | Roll a d20 narrative prompt. |
| `/help` | Show command palette modal. |

**Security**: parser runs pre-POST on client. Server sees `systemOverride`
flag, never raw user `/` strings. Prevents prompt-injection via Marinara-style
server-side regex matching.

#### G5 · AI Lorebook Maker

- `POST /api/lorebooks/:id/generate-entry` — topic prompt → structured entry JSON.
- Mirrors E3 `character-opening-line` shape: one stateless `AiProxy.complete`,
  `temp 0.9`, `maxTokens 400`.
- `zValidator` on input; `rateLimit({ max: 10, windowMs: 60_000 })`.

#### G6 · Prompt Reviewer (critique gate)

- Cheap small-model pass before main generation.
- Score rubric (0–100 each): specificity, persona fidelity, NSFW-gate
  correctness (given tier).
- Logs to `session_events` as `{ eventType: 'prompt_review', score, issues[] }`.
- **PAID tier only**; FREE never sees this cost.
- Gate: if total score < 40, soft-warn user *and* silently rewrite. If < 20,
  refuse to send and prompt user to clarify.

### Phase H — "Polish & power" (P2)

| ID | Feature | Depends on |
|---|---|---|
| H1 | Chat folders (CRUD + drag-drop) | — |
| H2 | World Info Inspector UI | F1 |
| H3 | Per-scene backgrounds + weather overlays | F2 (scene-state extension) |
| H4 | Character galleries (R2) | — |
| H5 | Regex scripts (re2-wasm sandbox) | — |
| H6 | Custom trackers (creator-defined state keys) | F1 pattern |
| H7 | Schedule planner + scheduled autonomous msgs | E1 BullMQ |
| H8 | Illustrator prompt generator (text only) | — |
| H9 | Connection test / duplication UX | — |
| H10 | Discord mirror (opt-in outbound webhook) | — |
| H11 | Light-mode theme | — |
| H12 | Chat summary popover (reuses `context-compaction.ts`) | — |

### Stretch (P3 — earn it later)

- Echo Chamber (stream-style reactions during roleplay).
- Prompt-cache visibility surfacing.
- Avatar zoom/crop editor.

### Explicitly out of scope (won't build)

Game/DM mode · Conversation mode · Chub.ai/ST import · Local model sidecar ·
Haptic devices · Windows/Termux launchers · Immersive HTML injection (XSS).

---

## 4. Deeper brainstorm — ideas Marinara *doesn't* ship but the audit surfaced

While cross-referencing, a few original opportunities emerged that *extend
past* Marinara by exploiting what our stack uniquely has (Postgres + Redis +
BullMQ + web-SaaS):

1. **Cross-session character diary aggregation.** Marinara is session-scoped.
   Our [`character-diary.ts`](packages/server/src/services/character-diary.ts)
   already writes per-session. Add a nightly BullMQ cron that consolidates
   diary entries into a per-character "long memory" summary — characters
   *remember* across sessions. Huge immersion differentiator for returning
   users. **Rename proposal: "Ingatan Karakter"** (fits IN register).

2. **Trust-gated content unlock** (MEMORY PROBE integration). We already log
   trust scores in `relationship-stage.ts`. Ship a UI that visually reveals
   character backstory paragraphs as trust crosses thresholds. Not a Marinara
   feature; pure neigo thesis play.

3. **Persona vs. character voice A/B** in the preset editor (§G2). Split
   rendered preview into "how the model sees your persona" and "how it sees
   the character". Diagnostic aid while tuning presets.

4. **Public lorebook library** (post-F1). If/when we add marketplace surfaces,
   curated public lorebooks (moderated) become a network-effect lever.
   Marinara has Chub.ai integration; we build first-party curation.

5. **Session handoff between devices** (we have JWT + SSE resume from E2). Add
   a QR-scan quick-handoff from desktop to mobile mid-conversation. No LLM
   cost, pure infra play, feels magical.

6. **"Nightly recap" push notification** (we shipped Web Push + BullMQ).
   At user-configurable time, send `"Rei menanyakan apa kabar kamu"`. Cold-start
   re-engagement. Feeds into H7 schedule planner.

---

## 5. Conflict / contradiction matrix

For each proposed feature, where could it conflict with something already
shipped or with another proposal? Resolution recorded inline.

| Proposal | Potential conflict | Resolution |
|---|---|---|
| F1 Lorebooks | Context budget already tight after `context-compaction.ts` | Lorebook injector runs **after** compaction with its own budget (~1500 tok); compaction shrinks history further if combined total > maxContext. |
| F2 Narrative Director | Could fight with [`continuity-guard.ts`](packages/server/src/services/continuity-guard.ts) by introducing new facts mid-scene | Director emits directives pre-prompt only; continuity-guard still validates output post-gen. If director fact contradicts scene-state, **scene-state wins** (scene-state is ground truth). |
| F3 CYOA | Extra AiProxy call per turn → doubles small-model spend | Tier-gate, and run **async after** main stream — never block user reply. |
| F4 Prompt Inspection | PII leakage risk (exposes user messages in prompt) | Owner-only access, signed URLs, Redis TTL 24h, jsonb retention 7 days max even for FOUNDER. |
| G1 Personas | Legacy sessions have no personaId | Nullable FK; `{{user}}` falls back to `user.displayName` when null. |
| G2 Presets | Default builder output changes over time → saved presets drift | Snapshot the default preset at creation; show diff indicator if upstream builder changes. Users opt-in to upgrade. |
| G3 Swiping/Branching | `chat_messages` grows ×K per swipe | Cap swipes at 5 per turn; old swipes soft-deleted after 30 days at FREE. |
| G4 Slash | Server-side regex matching risks prompt injection | **Client-side only** parser; server gets typed flags, never raw `/` string. |
| G5 Lorebook Maker | User generates spam entries → abuse vector | rateLimit 10/min; tier-count limit on entries per lorebook. |
| G6 Prompt Reviewer | Can misfire and refuse legit prompts | Only refuse at score < 20; silent rewrite in 20–40 band logs a warning, doesn't block. |
| H3 Backgrounds/weather | Scene-state already injects location; adding assets loads at client | Preload top-3 background URLs on session open; lazy load rest. |
| H5 Regex scripts | ReDoS on user input | `re2-wasm` hard timebox (10ms total per turn); fall back to pass-through on timeout. |
| H7 Scheduled messages | Could spam user at 3 AM | Respect user's `quietHours` (new `user_preferences` column); default 22:00–08:00 user-tz. |
| Cross-session character diary (§4.1) | Storage growth | Summaries max 2KB per character per week; retention 1 year. |

**Contradictions with live code: none blocking.** All integration points land
in existing service seams (see §6).

---

## 6. Integration graph — "everything connects"

Where each proposal attaches to existing systems. Reading this confirms the
roadmap doesn't fork the architecture.

```
                    ┌──────────────────────────────────────────┐
                    │            orchestrator.ts                │
                    │           runSinglePass()                 │
                    └───────────────┬──────────────────────────┘
                                    │
      ┌─────────────────────────────┼─────────────────────────────┐
      │                             │                             │
  PRE-PROMPT                    STREAMING                     POST-STREAM
      │                             │                             │
  ┌───▼─────────────────────┐    ┌──▼──────────────┐         ┌────▼──────────┐
  │ builder.ts appendXXX    │    │ SSE sse.ts      │         │ Validators    │
  │ (ordered sections)      │    │ + sse-buffer E2 │         │ (5x retry)    │
  └───┬─────────────────────┘    └──┬──────────────┘         └────┬──────────┘
      │                             │                             │
      │  appendSceneState ✅         │  cyoa_choices 🆕 (F3)       │  continuity
      │  appendCharacterBrief ✅     │  stream_ready ✅            │  repetition
      │  appendMemory ✅             │  resume_paused ✅           │  tone-drift
      │  appendLoreContext 🆕 (F1)   │                             │  format-drift
      │  appendNarrativeHint 🆕 (F2) │                             │  refusal
      │  appendMacros (resolved) 🆕  │                             │
      │  (G2)                       │                             │
      │  appendPromptReview 🆕 (G6) │                             │
      └──────────┬──────────────────┘                             │
                 │                                                │
                 │    ┌──────────────────────────────┐            │
                 └────▶ Prompt snapshot → Redis/JSONB│◀───────────┘
                      │ (F4 Prompt Inspection)       │
                      └──────────────────────────────┘

  Parallel tracks that don't touch the per-turn path:
   · BullMQ cron ──▶ story-beat-planner (F2 scheduler)
                 ──▶ character-diary rollup (§4.1)
                 ──▶ scheduled autonomous msgs (H7)
   · GET /api/sessions/:id/state-snapshot (agent #3 consolidation)
   · Client composer ──▶ slash-command parser (G4) ──▶ typed flags
   · Personas (G1) ──▶ resolved by {{user}} macro (G2)
   · Presets (G2) ──▶ drive `sectionsJson` order in builder.ts
```

### Cross-cuts with shipped systems

- **E1 BullMQ** — H7 (schedule planner), §4.6 (nightly recap), §4.1 (diary
  rollup) all reuse the `session-*` queue pattern.
- **E2 SSE resume** — F3 `cyoa_choices` is just a new event type in the union;
  client swallows at transport layer if missing.
- **E4 ROLEPLAY-only UI** — every feature above is ROLEPLAY-mode-compatible by
  design; no proposal resurrects Conversation/Game enums.
- **E5 session_events** — F2 director triggers, F3 CYOA choices, G3
  branch/swipe, G6 reviewer all log here. Consistent telemetry surface.
- **C-section BYOK/fallback** — F3/G5/G6's extra AiProxy calls respect the
  same model resolution chain; failed BYOK still falls back to house key.
- **M4/M5/M6 memory stack** — F1 lorebooks is an *additive* retrieval layer
  above the existing memory graph, not a replacement.

---

## 7. Implementation discipline (clean-room rules)

For every Phase F–H ticket:

1. PR description starts with *"Per `MARINARA_AUDIT.md` §3 <ID>"* — audit trail baked in.
2. Implementer must **not** open any file under `Pasta-Devs/Marinara-Engine/packages/**` while coding. Clarifying questions go to README/CHANGELOG only.
3. No prompt strings copied. All prompt templates are authored in non-formal bahasa (neigo register).
4. No schema/table/column name copied. (Similarity is fine; literal copy is not.)
5. Every new npm dep audited for licence. AGPL transitive deps disqualifying.
6. Review gate: before merge, reviewer confirms diff contains no suspiciously close string to anything in Marinara README/CHANGELOG (spot check).
7. Each Phase F ticket lands behind a feature flag (`FEATURE_LOREBOOKS`, `FEATURE_NARRATIVE_DIRECTOR`, `FEATURE_CYOA`, `FEATURE_PROMPT_INSPECTION`) rolled out FOUNDER → PAID → FREE.

---

## 8. Suggested execution order (12-week view)

| Week | Ships |
|---|---|
| 1 | F4 Prompt Inspection (dev lever, zero risk) |
| 2–3 | F1 Lorebooks v1 (schema + keyword retrieval + builder injection) |
| 4 | F1 follow-up: chunked RAG + World Info Inspector backend |
| 5 | F3 CYOA Choices + H2 Inspector UI |
| 6 | F2 Narrative Director + story_arcs revival |
| 7 | G1 Personas + G2 macros (combined) |
| 8 | G2 Preset system + preset editor |
| 9 | G3 Message swiping + chat branching |
| 10 | G4 Slash commands + G5 AI Lorebook Maker |
| 11 | G6 Prompt Reviewer (PAID) + H12 Chat summary popover |
| 12 | H1 Chat folders + H11 Light mode + polish pass |

Phase H 3–10 queue behind this as capacity allows. §4 originals slot in after
Phase G3 (weeks 10+).

---

## 9. Open questions for user

1. **Indonesian register lock-in** still firm for every new UI string,
   macro-resolved preview, and seeded lorebook example? (Assumes yes.)
2. **Phase F roll-out**: FOUNDER-only first, then PAID, then FREE? Or go
   straight to PAID? (Default assumption: staged.)
3. **Lorebook sharing**: private-only at launch, or also per-cast public
   (moderated)? Affects schema choices in F1.
4. **CYOA billing**: extra per-turn small-model spend OK for FREE tier? Or
   gate CYOA itself behind PAID? (Default assumption: PAID only, saves infra.)
5. Keep `CLEANROOM_NOTES.md` as history file or delete it? (Kept in the
   current commit; duplicate headers between the two docs will diverge over time.)

---

*Document revision: v2.0 · clean-room · builds on CLEANROOM_NOTES.md v1*
*Produced: 2026-04-21*
*Source corpus limited to Marinara README / CHANGELOG / CLAUDE.md + GitHub Trees API (paths only). No `packages/**` blobs opened. AGPL-3.0 §13 considerations documented in §0.*
