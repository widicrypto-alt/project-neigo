> ✅ **STATUS (apr 2026): IMPLEMENTED — execution audit trail.** Weeks 1–14 all shipped; §4.1 post-wk14 originals (diary rollup, backstory, QR, recap) live.

---

# PLANv2 — Post-Marinara Deep-Audit Execution Plan

> **Scope.** Actionable execution plan that layers on top of
> [`MARINARA_AUDIT.md`](MARINARA_AUDIT.md) v2. This document goes one level
> deeper: (a) mines Marinara's **version-by-version evolution** (v1.1 → v1.5.3)
> for *sequencing wisdom*, (b) cross-references 677 public file paths in their
> main branch against our workspace to finalise integration points, (c) pulls
> open-enhancement signals from their issue tracker as product-risk advisories,
> and (d) resolves priority ordering for the next 14 weeks with explicit file
> paths on **our** side.
>
> **Clean-room discipline.** Unchanged from v2: README / CHANGELOG / release
> notes / issue metadata / file-path Trees API only. No `packages/**` blob
> opened. AGPL-3.0 §13 remains our hard line — every new idea below is
> re-specified in our stack, not copied.
>
> **Plain-language note (Indonesian).** Ide-ide di sini disaring dari
> Marinara Engine tapi semua implementasi ditulis ulang dari nol di stack
> kita — tidak ada blob source mereka yang dibuka. Supaya kita tetap bebas
> lisensi non-AGPL dan tidak punya kewajiban publish source ke user network.
>
> **Audit date:** 2026-04-21 · **Target repo:** `Pasta-Devs/Marinara-Engine`
> @ `main=7320164c`, `fix/more-sidecar-fixes=b09f601d` (5 commits ahead, 100%
> local-sidecar hardening — **out of scope**, no transferable ideas).
>
> **Corpus consulted this round (metadata-only):**
>
> - 11 tagged releases with bodies (v1.1.0 → v1.5.3 — see §1).
> - `CHANGELOG.md` (canonical, 5 bumps back to v1.4.6).
> - `CLAUDE.md`, `CONTRIBUTING.md` (dev workflow only; no algorithmic IP).
> - `git/trees/main?recursive=1` — 677 file paths classified (§2).
> - `compare/main...fix/more-sidecar-fixes` — confirmed single-concern branch.
> - Issues/Discussions — 40 most-recent titles + 5 open-enhancement bodies.
> - `packages/client/.instructions.md` — verified **present** (HTTP 200) but
>   **not opened** (would count as an implementation blob).

---

## 0. What changes vs. `MARINARA_AUDIT.md` v2

| Dimension | v2 audit | v2 → **PLANv2** delta |
|---|---|---|
| Version coverage | v1.4.6 → v1.5.3 (5 releases) | **v1.1.0 → v1.5.3 (16 tags, 11 bodies)** |
| File-tree depth | Surface-level bucket check | **677 paths classified across 11 feature buckets** (§2) |
| Branch audit | Confirmed "main + one fix branch" | **Compared fix branch diff** — 5 commits, pure local-sidecar |
| Issue signals | Not analysed | **5 open enhancements weighed as product risk** (§3) |
| Sequencing | 12-week raw order | **Revised by Marinara's shipped-order wisdom** (§4) |
| File-level wiring | Generic hand-waving | **Explicit path pairs: theirs → ours** (§5) |

Two findings that **contradict** v2 audit and must land first:

1. Marinara only added **Saved Presets in v1.5.0** — 19 months after launch,
   AFTER agents, lorebooks, personas, games. It's a *power-user crown* feature,
   not an early must-have. **Defer our `G2 Preset system`** from week 8 to
   week 11; ship macros alone first.
2. Marinara fixed **"vanishing messages after streaming"** in v1.4.8 with a
   triple-layer cache-bust. Our audit flagged it as a post-mortem; **promote to
   P0 now** — do this week, zero new features.

---

## 1. Version-evolution insights (new corpus)

Each entry: year-phase, what shipped, **what we learn about sequencing**.

| Tag | Shipped | Insight for our roadmap |
|---|---|---|
| v1.1.0 | Windows installer. | — out of scope |
| v1.2.0 | Agent **Retry** button; agent **Activity** indicator; pinned gallery. | Agent observability ships **before** full agent expansion. Implies: build `/ops/sessions/[id]/context` agent-activity panel **before** adding F2 Narrative Director. |
| v1.3.0 | PWA-only, character tags, mobile bubble UI, peek-prompt params. | Mobile polish was prioritised **over** agent count. Our P0.5: audit `packages/web/src/components/BottomBar.tsx` and `Sidebar.tsx` for mobile regressions. |
| v1.4.0 | Conversation mode, scenes, **combat**, image-gen, **autonomous msgs**, **23 agents**, lorebook+embeddings, memory-recall, discord webhook. | Their "big bang". We don't do big bangs — lesson: **F1 lorebooks + knowledge retrieval are paired**, ship together or skip both. |
| v1.4.5 | **CYOA Choices**, haptic, bulk delete, always-send button. | CYOA came **alone with haptic**. Confirms CYOA is 1-shot + small surface. Fits our F3 definition. |
| v1.4.6 | Bot Browser (Chub), **Chat Folders**, **Slash commands** (+ `/roll`), **AI Lorebook Maker**, Discord-webhook, ComfyUI workflows. | Slash commands + Lorebook Maker shipped in same release — low-cost pair. We combine into one **week-10 shipment**. |
| v1.4.7 | **Persona Groups**, AI Persona Maker, PNG-card import, **quick switchers**, notification bubbles. | Persona system is a **multi-week feature cluster**, not a single ticket. Splits G1 into G1a (personas), G1b (groups), G1c (switcher popover). |
| v1.4.8 | **Cache-busting for vanishing messages** (triple-layer), mode-switch cache invalidation, `CORS_ORIGINS=*` fix. | **P0 — retrofit now**: ensure our SW `NetworkOnly` on `/api/*`, server `Cache-Control: no-store` on streaming endpoints, client `cache: 'no-store'` fetches. See §6 audit block. |
| v1.5.0 | **Game Mode** (full), auto sprite gen, **presets**, multi-select, spellbooks, Gemma-4 (local). | Presets ship 19 months in. **Deferred**. |
| v1.5.1 | Game polish. | — out of scope (game mode) |
| v1.5.2 | App-language selector, avatar side panel, **NanoGPT**, **max-context trim**, reasoning-tag stripping (`<thought>`, `<\|think\|>`). | **Reasoning-tag stripping** — add to our `scene-state-parser.ts` preamble before `[STATE:]` scan. Also: audit [`context-compaction.ts`](packages/server/src/services/context-compaction.ts) clamps to `AI_MODEL_CONFIG[model].maxContext`. |
| v1.5.3 | **Character galleries**, swipe delete, **prompt-cache visibility**, bold-dialogue toggle, Discord mirror for all modes, session recordings accessible. | Swipe **delete** came 11 months after swipe itself — means message-history UI (G3) can ship without deletion first. Also: **session recordings** surface a UI wraps their equivalent of our [`orchestrator-replay.ts`](packages/server/src/services/orchestrator-replay.ts). |

### 1.1 Ordering rules extracted

1. **Observability before expansion** — ship agent-activity / prompt-inspection UI *before* adding new agents.
2. **Mobile polish before power features** — audit mobile breakpoints weekly.
3. **Cache discipline on every streaming endpoint** — three layers (server header, fetch option, SW strategy).
4. **Persona = cluster, not ticket** — plan 3 shipments.
5. **Presets are late-game** — don't invest before a real power-user cohort.
6. **Reasoning-model defences in the parser, not the client** — strip thought-tags server-side.

---

## 2. File-tree classification (677 blobs, paths only)

Marinara's feature surface grouped by regex bucket. Each row confirms/denies
an item already mapped in v2 audit and, where numeric counts matter, gives
effort hints.

| Bucket (regex) | Their count | Confirms / informs |
|---|---|---|
| `agent` | 17 files | 23-agent pipeline concentrated in `services/agents/` + `retry-agents-route.ts` + 1 schema + 1 shared types. Tight shape — confirms our `services/*` direct-call pattern is structurally fine (no agent bus needed). |
| `lorebook` | 12 | `keyword-scanner.ts`, `prompt-injector.ts`, `lorebook-maker.routes.ts`, `st-lorebook.importer.ts`, schema + storage + types. **Mirrors our F1 proposal 1:1.** Import-from-ST is out of scope. |
| `persona` | 3 | `PersonaEditor.tsx`, `persona-maker.routes.ts`, shared types. Minimal. Our G1a fits. |
| `preset` / `prompt` | 27 | **Largest surface.** `prompt/assembler.ts`, `format-engine.ts`, `merger.ts`, `marker-expander.ts`, `chat-presets.routes.ts`, `prompts.routes.ts`, `prompt-reviewer.routes.ts`, `default-preset.json`. → Our [`builder.ts`](packages/server/src/prompts/builder.ts) is a baby version of this. Fair warning: do NOT try to rebuild the whole system; cherry-pick (see §5). |
| `macro` / `marker` / `variable` | 3 | `shared/utils/macro-engine.ts`, `prompt/marker-expander.ts`, migration helper. **Shared-package placement** — confirms our G2 plan to put macros in `@neigo/shared`. |
| `memory` / `embed` | 2 | `local-embedder.ts`, `memory-recall.ts`. Thin. Validates our richer stack (M1–M6: diary, facts, snapshots, DAG, temporal graph, benchmarks) as a **moat**. |
| `folder` / `gallery` | 10 | `chat-folders.routes.ts` + storage, `character-gallery.storage.ts`, `gallery-recovery.ts`. `gallery-recovery` is a new idea (§4.7). |
| `swipe` / `branch` / `variant` | 0 matches | Behaviour lives inside message/chat services without a dedicated subdir. Implies: it's **small** and can collapse into our existing `chat_messages` schema (per our G3 plan). |
| `slash` / `command` | 2 | `slash-commands.ts` (client) + `character-commands.ts` (server). **Both** ends implement. Our G4 audit correctly pushes parsing client-side; server side only sees typed flags. |
| `discord` / `webhook` | 1 | Single service; opt-in mirror. Confirms our H10 (per-session toggle) is right-sized. |
| `schedule` / `autonomous` / `notif` | 6 | **Two services**: `schedule.service.ts` (time-of-day cadence) and `autonomous.service.ts` (idle-trigger). Confirms: our H7 needs **two** BullMQ queues, not one. `schedule-send` (cron-style) vs `autonomous-nudge` (idle-triggered — already shipped in E1). |
| `regex-scripts` | 8 | Full subsystem (routes, storage, schema, seed). Regex sandboxing at this scope is a real project; H5 stays P2. |
| `game` | 50+ | Completely out of scope (thesis guardrail 1). Sprite/ambient assets (`default-game-assets/**`) are creator content we don't reuse. |
| `import` (st-/marinara) | 8 | Importers for SillyTavern + self-import. **Skip**, thesis mismatch. |
| `haptic`/`buttplug` | (not in tree, agent only per CHANGELOG) | **Skip** permanently. |

### 2.1 What this adds on top of v2

- **Prompt assembler/merger** is confirmed: Marinara has *four* prompt-composition files. Our single [`builder.ts`](packages/server/src/prompts/builder.ts) is fine for now; when we add preset editing (G2, deferred), only then split.
- **Macro engine in `shared`**, not per-app — we adopt the same placement.
- **Dual autonomous-messaging service split** — our BullMQ should add
  `session-schedule` as a third queue name alongside `session-nudge` and
  `session-return`.
- **Gallery-recovery is a real file** — this is the "rebuild gallery manifest
  from blob listing when DB row is missing" pattern. We can mirror it for our
  R2 sprite sheet uploads when a character is restored from an export.

---

## 3. Open-issue signals (product risk advisories)

Their open enhancements expose **unsolved UX** even in a mature codebase.
We leapfrog by designing around them at launch.

| # | Their pain | Our move |
|---|---|---|
| #159 | Lorebook keywords must be entered one-by-one; comma-paste doesn't split. | F1 UI ships with a **token-chip input** that accepts `,`, `Enter`, and `newline` as separators, plus bulk-paste dialog. |
| #157 | "Lorebook Keeper" auto-edits fight user intent; no lock. | F1 schema has `enabled` + `lockedByUser` booleans from day 1. Keeper never edits locked entries. |
| #153 | Per-chat persona toggles require deep-menu dig. | G1c quick-switcher popover lives *next to composer*, not in Settings. |
| #152 | Can't edit image-gen prompts before generate; can't regen images alone. | Out of scope for us (no image-gen) — but **principle**: every AI-generated asset must surface its *input prompt* for edit before retry. Adopt this rule for E3 opening-line preview and future F1 AI Lorebook Maker entries. |
| #151 | Selfie prompts too thin. | Out of scope. |

### 3.1 Risk from closed issues worth retrofitting

- **#139** multi-line message collapsing after edit — audit [`packages/web/src/app/chat/[sessionId]/page.tsx`](packages/web/src/app/chat/%5BsessionId%5D/page.tsx) edit flow preserves `\n\n` boundaries.
- **#147** "Can't start a game" often points to startup env drift. Our deploy
  script already runs migrations; add a post-restart smoke test in
  [`ops/scripts/deploy-prod.sh`](ops/scripts/deploy-prod.sh).
- **#144** "Text inside quotation marks color without bold" — our bubble
  renderer must decouple `color` and `font-weight`; log as H11 subtask.

---

## 4. Revised 14-week execution order

Overwrites `MARINARA_AUDIT.md` §8. Integrates §1 sequencing rules and §3 risk
advisories. Each week lists a ship target, **touch paths on our repo**, and an
explicit acceptance smoke.

**Status legend:** ✅ shipped · 🔄 in progress · ⏳ pending

| Wk | Status | Ship | Our paths touched | Acceptance smoke |
|---|---|---|---|---|
| **1 (this week)** | ✅ | **P0 Cache-bust audit** (v1.4.8 retrofit) + **P0.5 Mobile breakpoint audit** | [`packages/web/public/sw.js`](packages/web/public/sw.js), [`packages/server/src/lib/sse.ts`](packages/server/src/lib/sse.ts), [`packages/web/src/lib/sse.ts`](packages/web/src/lib/sse.ts), `BottomBar.tsx`, `Sidebar.tsx`, `TopBar.tsx` | `curl` SSE endpoint shows `Cache-Control: no-store`; SW registers `NetworkOnly` for `^/api/`; mobile 360px width screenshot for each major route. |
| 2 | ✅ | **F4 Prompt Inspection** (dev-only; FOUNDER first) | New: `services/prompt-snapshot.ts`; extend [`orchestrator-replay.ts`](packages/server/src/services/orchestrator-replay.ts); new UI tab in [`packages/web/src/app/ops/sessions/[id]/context/page.tsx`](packages/web/src/app/ops/sessions/%5Bid%5D/context/page.tsx) | FOUNDER can see final prompt as sent for turnId; non-owner returns 403. |
| 3–4 | ✅ | **F1 Lorebooks v1** (schema + keyword scan + inject) | New migration `0016_lorebooks.sql`; new `services/lorebook/keyword-scan.ts`, `services/lorebook/retriever.ts`; extend [`prompts/builder.ts`](packages/server/src/prompts/builder.ts) `appendLoreContext(entries, depth)`; new routes file `routes/lorebooks.ts` | Turn with lore entry matching last message contains lore text in prompt snapshot (F4). Keyword-chip input from #159 works. |
| 5 | ✅ | **F1b chunked RAG + Inspector backend** | Extend `services/lorebook/retriever.ts` with pgvector cosine top-K; new `GET /api/sessions/:id/active-lore` returns injected entries + token counts | Inspector UI returns entries the model saw this turn. |
| 6 | ✅ | **F3 CYOA Choices** (small-model tail call) | New `services/cyoa-generator.ts`; extend `shared/src/schemas/index.ts` `SseEventType.CYOA_CHOICES`; client chip renderer `packages/web/src/components/chat/CyoaChips.tsx` | After `done`, `cyoa_choices` event carries 2–4 chips; tapping one POSTs to `/turn`. |
| 7 | ✅ | **Cache audit gate** + **F2 Narrative Director** | New `services/story-beat-planner.ts`; hook in [`orchestrator.ts`](packages/server/src/services/orchestrator.ts) `runSinglePass` pre-prompt | On stall heuristic, next turn's prompt contains one-line `NARRATIVE HINT: …` snapshot visible in F4. |
| 8 | ✅ | **G1a Personas** only (not groups, not switcher yet) | New migration `0017_personas.sql`; `sessions.activePersonaId` FK; routes `packages/server/src/routes/personas.ts`; minimal FE list page | Session resolves `{{user}}` to persona name; falls back to `user.displayName` when null. |
| 9 | ✅ | **G1c Quick persona switcher popover** + **G2 Macros only** (no presets yet) | New `packages/shared/src/utils/macros.ts` (resolver); new `packages/web/src/components/chat/PersonaSwitcher.tsx` | `{{char}}`, `{{user}}`, `{{time}}`, `{{date}}`, `{{location}}`, `{{weather}}`, `{{persona}}` resolve in prompt. Switcher anchored to composer on mobile & desktop. |
| 10 | ✅ | **G3a Message swiping** (no delete yet) + **G4 Slash commands** | Extend `schema.chatMessages`: `swipeIndex`, `swipeRoot`; new [`packages/web/src/lib/slash-commands.ts`](packages/web/src/lib/slash-commands.ts) client parser only | Swipe chevrons work; `/sys`, `/narrator`, `/continue`, `/as`, `/scene`, `/impersonate`, `/random`, `/help` all parsed client-side. |
| 11 | ✅ | **G2 Preset system** (late-game per §1) + **G3b branching** | New `prompt_presets` table + editor in `packages/web/src/app/settings/presets/`; new `POST /api/sessions/:id/branch` | User saves preset; new session branches from messageId with `parentSessionId` logged in `session_events`. |
| 12 | ✅ | **G5 AI Lorebook Maker** + **G6 Prompt Reviewer** (PAID) | New `services/lorebook-maker.ts` (one-shot AiProxy); new `services/prompt-reviewer.ts` (cheap pass) | Gen entry shows under F4 as reviewed; score logged to `session_events`. |
| 13 | ✅ | **H1 Chat folders** + **H12 Chat summary popover** | New `chat_folders` table + drag-drop UI; reuse [`context-compaction.ts`](packages/server/src/services/context-compaction.ts) for H12 | Chats filter by folder; summary shows 3-bullet gist of last N turns. |
| 14 | ✅ | **H7 Scheduled autonomous messages** | Extend [`lib/queue.ts`](packages/server/src/lib/queue.ts) with `session-schedule` queue; new `services/schedule-planner.ts` | User-configured 19:00 ping fires on BullMQ delay; respects `quietHours`. |

### 4.1 Originals (from `MARINARA_AUDIT.md` §4) slot after wk 14

- ✅ **Cross-session character diary rollup** (nightly BullMQ cron). → [`services/character-diary-rollup.ts`](packages/server/src/services/character-diary-rollup.ts), wired in [`lib/cron.ts`](packages/server/src/lib/cron.ts) at 24 h cadence.
- ✅ **Trust-gated backstory reveal**. → [`services/backstory-reveal.ts`](packages/server/src/services/backstory-reveal.ts) + `Character.backstoryTiers` in shared domain + `appendBackstoryReveal` in [`prompts/builder.ts`](packages/server/src/prompts/builder.ts).
- ✅ **QR device handoff** (reuses E2 SSE resume). → migration `0023_handoff_tokens.sql` + [`routes/handoff.ts`](packages/server/src/routes/handoff.ts) (`POST /api/handoff` + `POST /api/handoff/claim`).
- ✅ **Nightly recap push** (Web Push + BullMQ). → [`services/recap-push.ts`](packages/server/src/services/recap-push.ts), registered in [`lib/cron.ts`](packages/server/src/lib/cron.ts) at 24 h cadence, reuses existing `web-push` + `push_subscriptions` infra.

---

## 5. Integration pairs — their file → our file

One-to-one wiring so every ticket above has a concrete starting file on our
side. **Their paths are spec anchors; our paths are implementation targets.**

| Spec anchor (theirs) | Our target | Feature |
|---|---|---|
| `services/lorebook/keyword-scanner.ts` | **new** `packages/server/src/services/lorebook/keyword-scan.ts` | F1 |
| `services/lorebook/prompt-injector.ts` | extend [`packages/server/src/prompts/builder.ts`](packages/server/src/prompts/builder.ts) with `appendLoreContext` | F1 |
| `services/agents/knowledge-retrieval.ts` | **new** `packages/server/src/services/lorebook/retriever.ts` (uses existing `embeddings.ts`) | F1b |
| `shared/utils/macro-engine.ts` | **new** `packages/shared/src/utils/macros.ts` | G2 |
| `services/prompt/marker-expander.ts` | fold into the macro resolver above | G2 |
| `services/prompt/assembler.ts` + `merger.ts` | keep our single [`builder.ts`](packages/server/src/prompts/builder.ts) until wk 11; split only when presets land | deferred |
| `services/prompt/format-engine.ts` | **new** `packages/web/src/components/chat/bubble-format.ts` — client-only rendering rules | H11 |
| `routes/chat-presets.routes.ts` | **new** `packages/server/src/routes/presets.ts` | G2 (wk 11) |
| `routes/prompt-reviewer.routes.ts` | **new** `packages/server/src/routes/prompt-review.ts` | G6 |
| `routes/lorebook-maker.routes.ts` | **new** `packages/server/src/routes/lorebooks.ts` (`POST /:id/generate-entry`) | G5 |
| `routes/persona-maker.routes.ts` | **deferred** — replaced by our `character-opening-line.ts` pattern applied to personas | G1 follow-up |
| `services/conversation/autonomous.service.ts` | already live — [`packages/server/src/services/nudge-generator.ts`](packages/server/src/services/nudge-generator.ts) via BullMQ queue `session-nudge` | ✅ E1 |
| `services/conversation/schedule.service.ts` | **new** `packages/server/src/services/schedule-planner.ts` + queue `session-schedule` in [`packages/server/src/lib/queue.ts`](packages/server/src/lib/queue.ts) | H7 |
| `services/storage/gallery-recovery.ts` | future: `packages/server/src/services/assets/sprite-recovery.ts` for R2 | H4 follow-up |
| `lib/slash-commands.ts` (client) | **new** `packages/web/src/lib/slash-commands.ts` | G4 |
| `services/conversation/character-commands.ts` | we keep server-side lean — only accept typed flags on `/turn`, never raw `/` strings | G4 guardrail |
| `services/discord-webhook.ts` | **new** `packages/server/src/services/discord-mirror.ts` + per-session toggle | H10 |
| `db/default-preset.json` | **new** snapshot `packages/server/src/db/default-preset.json` seeded from current `builder.ts` output at wk 11 | G2 |

---

## 6. Cache-bust audit checklist (P0, do week 1)

Derived from `[1.4.8]` post-mortem. Each line is a pass/fail gate.

1. [ ] [`packages/server/src/lib/sse.ts`](packages/server/src/lib/sse.ts) emits `Cache-Control: no-store, no-transform` header on every SSE response. *(Currently relies on `streamSSE` default.)*
2. [ ] [`packages/web/src/lib/api.ts`](packages/web/src/lib/api.ts) `fetch` wrapper sets `cache: 'no-store'` when the response type is SSE or when the URL starts with `/api/chat/`.
3. [ ] [`packages/web/public/sw.js`](packages/web/public/sw.js) matches `url.pathname.startsWith('/api/')` → `NetworkOnly`; confirm SSE fallthrough.
4. [ ] Mode-switch invalidation — since we're ROLEPLAY-only this is simpler; still verify TanStack Query invalidates the right keys when `aiModel` changes per-session (Section C).
5. [ ] Reasoning-tag stripping — add `stripThinkingTags(text): string` preamble to [`packages/server/src/services/scene-state-parser.ts`](packages/server/src/services/scene-state-parser.ts) before the `[STATE:` scan (regex: `/<(thought|think)>[\s\S]*?<\/\1>|<\|think\|>[\s\S]*?<\|\/think\|>/gi`).
6. [ ] Max-context clamp — confirm [`packages/server/src/services/context-compaction.ts`](packages/server/src/services/context-compaction.ts) reads `AI_MODEL_CONFIG[session.aiModel]?.maxContext ?? DEFAULT_MAX_CONTEXT` and clamps pre-send.
7. [ ] Double-rAF commit on streaming done — verify our SSE client doesn't race with React 18 concurrent commits (see [`packages/web/src/lib/sse.ts`](packages/web/src/lib/sse.ts) resume loop).

Any **unchecked** line by end of week 1 blocks F1 start.

---

## 7. Conflict recheck (vs. v2 matrix)

v2 §5 already resolved all proposals. PLANv2's new items checked against v2:

| New item (PLANv2) | Potential conflict | Resolution |
|---|---|---|
| Deferring presets to wk 11 | v2 said wk 8 | Persona work (wk 8–9) eats the week; presets would starve. Deferred presets don't block macros. |
| `session-schedule` as third BullMQ queue | E1 heartbeat already uses `session-nudge` + `session-return` | Separate queue name keeps deterministic jobIds scoped; heartbeats don't touch schedule queue. |
| Reasoning-tag stripper in parser | Could strip legitimate user-typed `<think>` | Only strip in **model-output** paths (orchestrator → parser), never user input. Document in service header. |
| Slash commands allow `/as` persona impersonation | Conflicts with G1 `activePersonaId` | `/as` writes to turn metadata only; doesn't mutate persona FK. |
| AI Lorebook Maker (wk 12) | Could generate NSFW entries bypassing tier gate | Tier check runs before AiProxy call; NSFW entries require `user.nsfwEnabled && user.ageConfirmed` AND the lorebook to be marked NSFW-owned. |

**No conflicts block shipment.**

---

## 8. Evidence of process

This doc is the artifact. Paired commits:

1. `c45cfd0` — `docs: deep Marinara Engine audit v2 (clean-room)` (v2 audit).
2. `<next>` — `docs: PLANv2 post-audit execution plan` (this file).
3. Week-1 deliverable: `feat: cache-bust audit retrofit (wk1)` hits §6.

Each subsequent PR message must cite:
> *"Per PLANv2 wk N §X: <one-line goal>. Clean-room: no Marinara blob opened."*

Reviewer checklist (before merge):
- [ ] No string literal > 8 words matches a Marinara README/CHANGELOG line.
- [ ] New npm dep is not AGPL (run `npm info <pkg> license`).
- [ ] Feature behind a `FEATURE_*` flag unless explicitly rolled out for the wave.

---

## 9. What is **not** in this plan

- Game / DM mode (thesis guardrail 1).
- Chub.ai / SillyTavern import (brand + legal).
- Local model sidecar / MLX / Gemma-4 on-device (SaaS only).
- Haptic / Buttplug.io integration.
- Windows / Termux / Android launchers.
- Immersive HTML injection (XSS minefield).
- Combat, dice, spellbooks, inventory, party, quests, travel, map.
- Regex-script power-user sandbox (earliest H5 wk 15+).
- Any feature that would force AGPL source disclosure.

---

## 10. Open questions (one pass, then we ship wk 1)

1. **Cache-bust audit (§6) OK to run unsupervised** — or pause after each
   checkbox to show the diff? *(Default: unsupervised, single commit per
   checkbox when feasible.)*
2. **Preset deferral (wk 8 → wk 11)** — sign off, or keep original order?
3. **FOUNDER-only roll-out for F1 lorebooks** — keep, or open to PAID on day 1?
4. **Reasoning-tag stripper** — apply to all models or only when model name
   matches `gemma|deepseek|think|reason`?

---

*Document revision: PLANv2 · post-MARINARA_AUDIT.md v2 · 2026-04-21*
*Corpus: README, CHANGELOG, 16 tag release notes, CLAUDE.md, CONTRIBUTING.md,*
*GitHub Trees API (paths only, 677 blobs), Issues API (40 titles, 5 open bodies).*
*No implementation blob under `packages/**` opened. AGPL-3.0 §13 posture unchanged.*

---

## 11. Execution progress (living log)

Status rollup for the 14-week plan + §4.1 follow-ups. Each commit lands
with a "Per PLANv2 wk N §X" line so the log here can be reconstructed
from `git log --grep='^Per PLANv2'` if this table drifts.

### 14-week core table

| Wk | Feature | Status | Representative commit(s) |
|---|---|---|---|
| 1 | Cache-bust + mobile breakpoints | ✅ | pre-session landings |
| 2 | F4 Prompt Inspection | ✅ | pre-session landings |
| 3–4 | F1 Lorebooks v1 | ✅ | pre-session landings |
| 5 | F1b RAG + Inspector backend | ✅ | pre-session landings |
| 6 | F3 CYOA Choices | ✅ | pre-session landings |
| 7 | Cache audit gate + F2 Director | ✅ | pre-session landings |
| 8 | G1a Personas backend + settings | ✅ | `a002e25`, `2c7b289`, `0d91448` |
| 9 | G1c quick-switcher + G2 macros | ✅ | `7813633` |
| 10 | G3a swipes + G4 slash commands | ✅ | `82231e7` |
| 11 | G2 presets + G3b branching verify | ✅ | `2a77f4b`, `488f7a5` |
| 12 | G5 Lorebook Maker + G6 Reviewer | ✅ | `8901aba` |
| 13 | H1 Chat folders + H12 summary popover | ✅ | `eb1ba55` |
| 14 | H7 Scheduled autonomous messages | ✅ | `5105d08` |

### §4.1 post-wk 14 follow-ups

| Item | Status | Landing commit |
|---|---|---|
| Cross-session character diary rollup | ✅ | post-wk14 batch |
| Trust-gated backstory reveal | ✅ | post-wk14 batch |
| QR device handoff | ✅ | post-wk14 batch |
| Nightly recap push | ✅ | post-wk14 batch |

### What's explicitly **not yet** done

- Frontend pages for the new backend surfaces — `schedules.ts`,
  `handoff.ts`, and recap/diary settings live as server APIs only.
  FE pages (`/settings/schedules`, `/handoff`, `/handoff/claim`,
  backstoryTier editor under character settings) are the next slice.
- `character-diary-rollup` runs on a 24 h `setInterval` only. Moving
  to a BullMQ repeatable job (so multiple server processes don't
  double-emit) is a wk 15+ task.
- Quiet-hours UI in user settings (the planner already reads
  `user.metadata.quietHoursStart/End` if set).

*Living-log revision: post-wk14 batch · ROLEPLAY beta scope unchanged.*
