# Live Backlog (apr 2026)

> **Single source of truth** for remaining actionable work. All other docs in this folder are historical / locked contracts. See [INDEX.md](INDEX.md) for status map.
>
> Migration head: `0054_queued_for_publish.sql`. Services: neigo-server (4000), neigo-web (3000).

Legend: 🅿️ priority (P0 blocker, P1 next-up, P2 nice-to-have, P3 deferred) · 🔗 origin doc

---

## P0 — blockers or near-blockers

### B0.1 — Agent pipeline: seed + live observe-only + compare/stats/debug ✅ SHIPPED (apr 2026) 🔗 PLAN_IMPLEMENTSv3 Day 9–10 / PLANv3 Tier 1 #7
- **Done:** `services/agents/seed.ts` ships `BUILTIN_AGENTS` (7 types — continuity, format-guardian, repetition, tone-guardian, world-state enabled as `post_processing`; director + chat-summary scaffolded, disabled) and `ensureBuiltinAgents(userId)` with module-level in-memory dedup (`seededUsers: Set<string>`). Invoked lazily from `GET /api/agents` and from `runPipelinePhase` before `loadEnabledAgents`. `orchestrator.ts` post-stream hook always fires `runPipelineShadow('post_processing', ...)`, and when `AGENT_PIPELINE_ENABLED` is set additionally fires a live `runPipelinePhase(..., { shadow: false })`. New endpoints: `GET /api/agents/runs?sessionId=&limit=` (grouped by `turnIndex`), `GET /api/agents/compare?sessionId=[&turnIndex=]` (pairs shadow/live runs by agentType+turnIndex, reports per-pair `agree: boolean | null` and overall `agreementRate`), `GET /api/agents/stats?sessionId=` (per-agent pass/retry/block/error counts + avg latency via SQL aggregation). FE: `AgentDebugPanel.tsx` collapsible panel in `/chat/[sessionId]`, gated by `?agentDebug=1` URL param, with Runs / Compare / Stats tabs. Shadow-compare A/B promotion to authoritative remains future work.

### B0.2 — Auto-continue orchestrator wiring ✅ SHIPPED (apr 2026) 🔗 PLAN_IMPLEMENTSv4 §12.3 / PLANv3 Tier 2 #16
- **Done:** `runSinglePass` now fires a single `[CONTINUE]` re-stream when the finalText is ≥80 chars and `isCompleteSentence` is false. Bounded to ROLEPLAY mode + attempt 0; reuses the same sampling with `maxTokens` clamped to 512. Gated by `env.AUTO_CONTINUE_ENABLED` (default true).

### B0.3 — Prompt Info overlay ✅ SHIPPED (apr 2026) 🔗 PLAN_IMPLEMENTSv4 §12.1 / PLANv3 Tier 2 #12
- **Done:** `GET /api/sessions/:id/messages/:mid/prompt-info` (owner-scoped) returns categorized `persona`/`context`/`history_*` messages + sampling params. `PromptInfoModal.tsx` renders collapsible color-coded cards. Triggered via the `Info` button in the per-bubble action bar.

---

## P0 — design redesign tracker (PLANDESIGNv1)

> Per-surface implementation progress for [PLANDESIGNv1.md](PLANDESIGNv1.md). Update each ticket after every implementation pass. Bump PLANDESIGN to v2 only if an *invariant* changes (cross-surface rules, locked decisions, or design tokens) — routine implementation progress lives here.

### B-DESIGN.0 — Phase 0 cross-cutting wins ✅ SHIPPED (apr 2026)
- [x] Sidebar nav re-label + subtitles → English-first (Discover, Stories, Threads, Letters, Studio, Persona, Account) — `Sidebar.tsx`
- [x] TopBar `TITLE` map updated to match nav (`/chat` → "Threads", `/letters` → "Letters", `/stories` → "Stories", `/studio` → "Studio")
- [x] `messages/en.json` `nav.roleplay` → "Threads", `nav.settings` → "Persona"
- [x] Persona page heading "Settings" → "Persona"; subtitle → "Persona & API Key."
- [x] Persona "You" section — English copy (Name / Age / Gender / Pronouns / Short bio); placeholders rewritten
- [x] Removed "Lihat Usage & Limit" link from form-action area (was navigation disguised as form action)
- [x] Save button → "Save changes" / "Saving…"
- [ ] Strip remaining Indonesian copy from each surface as it is touched in B-DESIGN.A–F

### B-DESIGN.A — Discover redesign ✅ SHIPPED (apr 2026) 🔗 PLANDESIGNv1 §3.A
- [x] Killed 400px character hero banner
- [x] Top rail: title + subtitle + segmented `All · Roleplay · Visual Novels` (`FormatFilter.tsx`)
- [x] Continue strip — unified RP threads + VN saves, sorted by `last_opened_at`, format badge per item (`ContinueCard.tsx`). Backed by new `GET /api/runs?limit=` endpoint joining `story_runs` × `stories`.
- [x] Tone rail (sticky), max-3-active narrative-tone chips (`ToneRail.tsx`)
- [x] Featured tonight (1 hero 2×2 + 2 tall 1×2)
- [x] Editorial mosaic (`grid-auto-flow`-style mixed sizes via variant CSS)
- [x] Removed "Karakter baru" section + creator CTAs
- [x] Removed language chip row
- [x] Single `StoryCard` component with `format: 'rp' | 'vn'` prop — `CharacterPosterCard` is no longer mounted on Discover
- [ ] **Future:** "More like what you've played" personalized row (deferred — needs ≥2 completed sessions signal + recommender)
- [ ] **Future:** infinite scroll for the mosaic (current cap is the API's 30-row default)

### B-DESIGN.C — Threads redesign ✅ SHIPPED (apr 2026) 🔗 PLANDESIGNv1 §3.C
- [x] Left pane header → "Threads" eyebrow + "Your threads" h2 (was "Your Threads" + "Roleplay")
- [x] Bare `+` icon button → full-width labeled `+ New thread` pill button
- [x] Right empty state → 3 functional pathway cards (Start from a story / Start from a character / Start from scratch), each wired to a real route or the new-thread modal
- [x] Replaced "A quiet room. / Pick a thread… / Start new thread" with **"The page is blank." / "Pick a story, pick a character, or start something of your own."**
- [x] English-first: delete confirm row "Hapus session ini? / Hapus / Batal" → "Delete this thread? / Delete / Cancel"; aria-label "Hapus session" → "Delete thread"
- [x] Verified VN saves never appear here (sessions endpoint returns chat_sessions only; story_runs is a separate table)
- [x] `lastMessagePreview` rendered under thread title — `Sidebar.tsx:382–383` reads `session.lastMessagePreview`; `sessions.ts:69` already exposes it.
- [ ] **Future:** 3-step new-thread modal (origin → opening scene → confirm) — current modal is single-step

### B-DESIGN.E — Studio redesign ✅ SHIPPED (apr 2026, v1) 🔗 PLANDESIGNv1 §3.E
- [x] Studio index page rewritten English-first, story-first framing ("Make a story or a character. The world is yours to draft.")
- [x] Action dock: two primary maker CTAs — `New visual novel` (VN badge, paid-tier gated with upgrade path) + `New character` (Cast badge)
- [x] Library section: top 6 stories rendered as 16:9 cover cards with VN format badge + status chip (Live/Featured/Draft/Archived); top 8 characters as compact rows
- [x] Empty-library state teaches the format: "Begin with a single character — give them a name, a voice, a wound."
- [x] Removed Indonesian copy ("Buat karakter baru", "Tempatmu mencipta —", etc.)
- [x] Exported `gradientFor` from `StoryCard` for shared deterministic cover fallback
- [ ] **Future (v2):** library tabs (Stories · Characters · Scenarios · Drafts) with counts and bulk import
- [ ] **Future (v2):** Forge 3-pane split (220/flex/360) with live `StoryCard`/bubble preview
- [ ] **Future (v2):** VN linear-scenes step rail; mobile read-only mode

### B-DESIGN.B — Stories (VN) redesign ✅ SHIPPED (apr 2026) 🔗 PLANDESIGNv1 §3.B
- [x] 4-col grid (3 md / 2 sm / 1 mobile) using shared `StoryCard` `variant="standard"` (portrait 3:4)
- [x] Real or generated cover required — uses `gradientFor(id)` deterministic fallback inside `StoryCard`; outline-book placeholder banned
- [x] Card metadata: pull-quote (openingQuote||synopsis), tone tags, runtime metaLabel, cast strip — all plumbed through `StoryCardItem`
- [x] `VN` format badge top-left (icon `BookOpen`, format='vn')
- [x] Filters refactor: sort (Newest/Popular/Shortest/Longest) + length (Any/<30/30-60/60+) + dynamic genre chips (top 8). Locale chips removed.
- [x] English-first headline ("Stories to step into.") and structured empty states ("No stories yet." cold-start with maker CTA, "Nothing matches those filters." with reset)
- [x] **Future:** "Popular" sort wired end-to-end — server has `orderBy totalPlays + totalChats*2` (stories.ts:912) but FE stories/page.tsx fetches without sort param and client switch has no `popular` case (falls through to server default). Fix: pass `?sort=popular` to API. Add completion indicator once user-progress join exposed.

### B-DESIGN.F — Persona redesign ✅ SHIPPED (apr 2026, v1) 🔗 PLANDESIGNv1 §3.F
- [x] Hero header with 64px avatar (initial fallback) + eyebrow + display name + auto-derived summary line ("28 · Female (she/her) — first 14 words of bio")
- [x] Segmented nav re-labeled: `You · Preferences · API & models` (was `Persona · API Key`)
- [x] Sticky save dock at bottom appears only when persona is dirty; primary `Save changes` + secondary `Discard` (also inline Discard inside form)
- [x] New `Preferences` tab placeholder with Mature-content notice (locked, "Disabled in beta") + "More controls coming" hint
- [x] BYOK hero copy fully Englishfied ("Bring your own key", checkmarks, "No key yet?…")
- [x] BYOK disclaimer footer Englishfied + "Saving…" everywhere
- [x] Existing `displayName !== ` dirty-check covers Save-button enabled state
- ~~**Future: age-gated NSFW toggle**~~ — **Retired.** BETA_FOCUS_CONTRACT §C permanently removes the toggle. `/api/auth/nsfw` returns `not_available_in_beta`. No toggle surface planned.
- [ ] **Future:** Language override (AI output only); reading speed / sound / notifications when API exists

### B-DESIGN.D — Letters redesign ✅ SHIPPED (apr 2026) 🔗 PLANDESIGNv1 §3.D
- [x] CTA renamed `+ New correspondence` (gradient pill); compose panel opens with **met-first character dropdown** (uses `/api/characters` — no more raw-text character-id field)
- [x] Filter tabs Englishfied: `All · Awaiting reply · Unread · Read` with live count badges (queued + unread)
- [x] Inbox rows now 96px min, with `StatePill` showing real delay: `Awaiting reply · 4h`, `Unread · 2d`, `Read`
- [x] Empty state: decorative sample-letter scrim (rotated -2°, blurred behind) + 2-sentence explainer + `Write the first one` CTA
- [x] Compose: paper-toned textarea (`bg-[#1a1622]`, font-display, leading-relaxed) with `Dear…` placeholder; success state reads **"Sent. Expect a reply in 6–24 hours."**
- [x] Empty-cast guard: when user has met no one, dropdown swaps to a "Find a character" link to Discover
- [x] All Indonesian copy removed (`Surat`, `Belum dibaca`, `Mengirim…`, `Tulis surat`, `Tiba 4 jam lalu`, `Karakter`, etc.)
- [ ] **Future:** `Archived` tab (needs `letters.archivedAt` field in API response); 6–24h delay enforcement is server-side already

---

## P1 — VN kinetic presentation tracker (PLANVNv2) ✅ ALL SHIPPED (apr 2026)

> All 8 steps confirmed live in code. Spec: [PLANVNv2.md](PLANVNv2.md). Design reference: [PLANVNv1.md](PLANVNv1.md) §A–§E.
> **0 new migrations · 0 new components · 0 new routes.** Delivered as extensions of existing files.

### BV1 — Extract `seedSceneIntoSession` helper ✅ SHIPPED (apr 2026) 🔗 PLANVNv2 Step 1
- **Done:** `story-session-seeder.ts:87` — `seedSceneIntoSession(sessionId, scenario)` extracts and writes `chat_sessions.scene_card = { sceneId, background, location: null, weather: null, nextSceneId, castSubset }`. `startStorySession` is a thin caller. `storyPlayAsCharacterId` written to `session.metadata` for POV-hide use by FE.

### BV2 — `scene_card` in session API response ✅ SHIPPED 🔗 PLANVNv2 Step 2
- **Done:** `sessions.ts` `GET /api/sessions/:id` includes `sceneCard` in payload. `ChatSession` interface in `@neigo/shared` typed correctly.

### BV3 — `SceneBackground` renders authored image ✅ SHIPPED (apr 2026) 🔗 PLANVNv2 Step 3
- **Done:** `SceneBackground.tsx:62–87` — `backgroundUrl?: string | null` prop; `<img>` with `fetchPriority`, vignette + bottom scrim via Tailwind pseudo; `navigator.connection?.saveData` guard skips image. Gradient fallback always mounted. Chat page passes `backgroundUrl={sceneBackground ?? null}` and `isOpening={!opened}`.

### BV4 — `SpritePanel` primary character from scene cast ✅ SHIPPED (apr 2026) 🔗 PLANVNv2 Step 4
- **Done:** `chat/[sessionId]/page.tsx:297–301` — `primaryCharacterId` derived from `sceneCard.castSubset[0]` overriding `session.characterId`. POV hide at line 782–991: suppresses `SpritePanel` when `storyId && storyPlayAsCharacterId && primaryCharacterId === storyPlayAsCharacterId`.

### BV5 — `advanceRun` re-seeds chat session ✅ SHIPPED (apr 2026) 🔗 PLANVNv2 Step 5
- **Done:** `story-runner.ts:357–410` — after `db.update(storyRuns)`, if `run.seededSessionId` set: patches `chatSessions.sceneCard`, inserts NARRATOR `scene_change` message (filtered from bubble mapper at `page.tsx:325`), inserts `session_events` row `eventType='scene_advance'`. Response shape unchanged `{ run, nextScene, completed }`.

### BV6 — "Next scene" button in `StoryActionBar` ✅ SHIPPED (apr 2026) 🔗 PLANVNv2 Step 6
- **Done:** `StoryActionBar.tsx:25–140` — `nextSceneId/runId/fromSceneId/isStreaming` props; "Next scene →" button visible when `nextSceneId && !isStreaming`; `POST /api/runs/${runId}/advance` → query invalidation → analytics → `router.push(/stories/${storyId}?ending=...)` on completion. `vn.*` i18n keys in `en.json` + `id.json`.

### BV7 — Studio 3-field scenario authoring ✅ SHIPPED (apr 2026) 🔗 PLANVNv2 Step 7
- **Done:** `routes/stories.ts:629–784` — Zod schema extended with `backgroundImageUrl/nextSceneId/sceneType/endingSlug`; DFS cycle guard ≤64 hops; returns `422 { error: 'cycle_detected' }`. Studio `edit/page.tsx` has URL input + 120px preview, `<select>` for `nextSceneId` (siblings, excl. self) and `sceneType`, conditional `endingSlug` input.

### BV8 — Readiness rebalance + ending banner ✅ SHIPPED (apr 2026) 🔗 PLANVNv2 Step 8
- **Done:** `detail-extensions.ts:145–233` — weights: plot 25 + scenarios 20 + cast 20 + openingQuote 10 + playAs 5 + sceneChain 10 + authoredBg 10 = 100. `stories/[id]/page.tsx:121–263` — dismissible ending banner when `?ending=<slug>` in URL.

### Parked (revisit triggers in PLANVNv2)
- **BV-P1** Bundled BG library (`public/vn/bg/*.webp`) — trigger: authored `backgroundImageUrl` set on > 50% of published stories.
- **BV-P2** Multi-slot `<VNStage>` (left/center/right) — trigger: art team delivers expression-mapped sprite sheets AND single-slot is validated.
- **BV-P3** 10-expression enum + `expressions.json` per character — trigger: same as BV-P2.
- **BV-P4** `[SCENE_ADVANCE]` model sentinel parser — trigger: user-tap advances validated by usage data; measure author demand for model-driven transitions.
- **BV-P5** Choice mode / branching — trigger: kinetic retention validated.
- **BV-P6** `@neigo/shared/vn/*` DTO package — trigger: third consumer beyond server + FE chat page.
- **BV-P7** `character_images.kind='expression'` FE consumer — trigger: BV-P2 ships.
- **BV-P8** Dedicated `/vn/[runId]` cinema route — trigger: chat-chrome UX ceiling measurable.
- **BV-P9** Branching Forge editor — v2+.
- **BV-P10** `characters.sprite_sheet_url` column — trigger: with BV-P2/P7.
- **BV-P11** `bgmUrl` audio player — parked per [BETA_FOCUS_CONTRACT_v1.md](BETA_FOCUS_CONTRACT_v1.md) §4.G.

---

## P1 — next up

### B1.1 — Story cinema chrome mounted in /chat ✅ SHIPPED (apr 2026) 🔗 PLANBv7 W-E / PLANBv2
- **Done:** option (b) implemented. `StoryActionBar`, `ScenarioPaginationChip`, `CostEstimateChip`, and `VNProjectionToggle` are all mounted inside `/chat/[sessionId]/page.tsx` conditionally when `session.metadata.storyId` is set. VN mode persists in `localStorage` and auto-enables when URL has `?vn=1`. `StoryActionBar` (LANJUT / ULANGI / HAPUS) is visible only when VN mode is active, keeping classic mode clean. The dedicated `StoryChatFrame` route remains out of scope.

### B1.2 — Translation pipeline polish ✅ SHIPPED (apr 2026) 🔗 PLANIMPv6 §5
- **Done:** budget enforcement (`translationsMonthlyUsd` default $0.50) was already live; migration `0052_translation_source_hash.sql` adds a sha1 `source_hash` column on `content_translations`. Translate route computes the source hash per request, serves cache only when hash matches, and replaces stale rows in place.

### B1.3 — VN-readiness recompute endpoint ✅ SHIPPED (apr 2026) 🔗 PLANIMPv4 §4.6
- **Done:** `computeVnReadiness()` heuristic (plot 30 / scenarios 25 / cast 20 / openingQuote 15 / playAs 10 = 100) lives in `services/detail-extensions.ts`. `POST /api/stories/:id/vn-readiness/recompute` (author-only) writes `stories.vn_readiness_pct` and returns a breakdown with Indonesian suggestions.

### B1.4 — `{{button::Label::trigger}}` macro + trigger route ✅ SHIPPED (verified apr 2026) 🔗 PLAN_IMPLEMENTSv2 Day 5 / X3.6
- **Done:** `renderCharacterContent` in `BubbleView.tsx` parses `{{button::…}}` into interactive chips; `POST /api/chat/:sessionId/trigger` (PLANv3 X3.6) validates trigger IDs against `character.persona.triggers` with the same rate limiter as `/turn`. Wired through `handleTrigger` in the chat page.

### B1.5 — context-maintenance cron + wake-up packet ✅ SHIPPED (apr 2026) 🔗 PLAN_IMPLEMENTSv4 §14.1 / X4.3
- **Done:** implemented as a cron pass (not BullMQ) in `services/context-maintenance.ts`. Every 15 min (first run +150s after boot) `runContextMaintenancePass()` scans up to 20 idle sessions (> 1h since last message), deterministically compacts the last 10 turns into a speaker-tagged summary, and upserts into `session_context_state.wake_up_packet` (no LLM). `readFreshWakeUpPacket(sessionId)` returns the packet only when `snapshotFreshAt >= session.lastMessageAt`, and `GET /api/sessions/:id` now returns `{ session, wakeUpPacket }` so the client can hydrate the cold-start banner before the first turn.

### B1.6 — `related_entities` MV + `/api/discover/related` ✅ SHIPPED (apr 2026) 🔗 PLANIMPv7 §3.3 / PLANBv5 §3.5
- **Done:** migration `0053_related_entities_mv.sql` creates the `related_entities(from_type, from_id, to_type, to_id, score)` MV via a co-reaction self-join (HAVING COUNT(DISTINCT user_id) >= 2), plus `related_entities_from_idx (from_type, from_id, score DESC)` and a unique `related_entities_pk_idx` so `REFRESH CONCURRENTLY` is possible. Cron `refreshRelatedEntities()` runs every 15 min (first +120s), preferring `REFRESH MATERIALIZED VIEW CONCURRENTLY` and falling back to a plain `REFRESH` on `0A000`. New `GET /api/discover/related/:entityType/:entityId?limit=12` (1–24) reads the MV, enriches rows with the owning character/story, and filters private / retired / flagged / deleted before returning. Exposed via `GET /api/discover/related/…` instead of `/picks` to match the consuming `RelatedGrid` convention.

### B1.7 — OG image edge route ✅ SHIPPED (apr 2026) 🔗 PLANIMPv7 §5.2
- **Done:** `packages/web/src/app/og-image/[entityType]/[entityId]/route.tsx` exports a 1200×630 branded gradient card via `next/og`’s `ImageResponse` (Next 15 built-in — no extra `@vercel/og` dep). `runtime = 'edge'`, `revalidate = 86_400`. Fetches character or story from `NEXT_PUBLIC_API_URL`, substitutes a neutral placeholder for private/flagged/deleted items, and renders title + tagline + subline + hero image.

### B1.8 — Slug redirect for stories ✅ SHIPPED (apr 2026) 🔗 PLANIMPv7 §5.1
- **Done:** `getStory()` accepts UUID or slug (slug lookup is a fallback, gated by a pattern check). `GET /api/stories/:id` falls through to the canonical UUID for all downstream queries. On the web side the story detail page `router.replace`s to `/stories/{slug}` once the payload resolves. Not a true 301 (SPA replace) but the canonical URL ends up in history within one render.  

---

## P2 — nice-to-have

### B2.1 — Orchestrator CHARS_PER_TOKEN cleanup ✅ SHIPPED (apr 2026) 🔗 PLANBv1 §4.2
- **Done:** `loadHistory()` now sizes the rolling window via `estimateTokensFast(m.content)` for both the initial accumulator and the trim loop. Last `CHARS_PER_TOKEN` constant in the orchestrator is gone.

### B2.2 — Lorebook re-tokenize backfill ✅ SHIPPED (apr 2026) 🔗 PLANBv1 §4.3
- **Done:** discovered already live — `packages/server/src/scripts/retokenize-lorebooks.ts` ships PLANBv1 X3.3, registered as `tokens:retokenize` in server `package.json`. Uses real `countTokensBatch` from `services/tokenizer.js` so the backfill produces production-accurate values (no `CHARS_PER_TOKEN` shortcuts).

### B2.3 — FE token chip in composer ✅ SHIPPED (apr 2026) 🔗 PLANBv1 §5 / PLANv3 #14
- **Done:** `POST /api/chat/estimate-tokens { sessionId?, content }` returns `{ tokens, contextTokens }` using the same `estimateTokensFast` baseline as the orchestrator window-sizing (no LLM). `packages/web/src/components/chat/TokenChip.tsx` debounces 400ms, hits the endpoint, and renders a compact monochrome chip (`250T / 4.2k`) in the Composer `trailing` slot. Hides when input is empty.

### B2.4 — Studio component extractions ✅ SHIPPED (apr 2026) 🔗 PLANIMPv4 §5
- **Done:** Three components extracted into `packages/web/src/components/studio/`:
  1. **`ScenarioListPanel`** — sidebar scenario list with Add button; wire into `studio/stories/[id]/edit/page.tsx` (replaces inlined `<aside>` block). Props: `scenarios`, `activeId`, `onSelect`, `onCreate`, `creating`.
  2. **`CharacterLinker`** — toggle-button multi-select for linking characters to a scenario's `castSubset`; replaces inlined cast block. Props: `cast`, `selected`, `onChange`, `allowSelectAll`, `disabled`. Shows mini avatars when `avatarUrl` is present.
  3. **`VnReadinessMeter`** — horizontal progress bar + optional checklist showing how VN-ready a story is (from `vnReadinessPct`). Color-tiered: ≥80% emerald / ≥50% amber / below red-neutral. Wired into `stories/[id]/page.tsx` (owner left sidebar, with checklist) and `studio/stories/[id]/page.tsx` (top of content area, hidden when 100%).

### Demo content seeder ✅ SHIPPED (apr 2026)
- **Done:** `packages/server/src/db/seed-demo-content.ts` is an idempotent seeder. Adopts 2 unowned built-in characters (Alina Chandra, Bastian Wijaya) into the demo user and flips `is_public=true`, then publishes 5 Indonesian stories with 11 total scenarios: *Kantor Tanpa Batas* (Kaia, 3 scn), *Malam di Perpustakaan Atas Bukit* (Rei+Lysandra, 2 scn), *Warung Kopi Senja* (Alina+Bastian, 2 scn), *Apartemen Lantai 7* (Rei, 2 scn), *Festival Musim Panas* (Kaia+Lysandra+Alina, 2 scn). Each story includes plotMd rendered via `renderAndSanitize`, opening quote, computed `vnReadinessPct` (51–71%), and `tokenCountCache`. Skips any story whose (title, authorId) pair already exists. Run on prod: `cd packages/server && bun --env-file=../../.env run src/db/seed-demo-content.ts`.

### B2.5 — Character rename cast-denorm worker ✅ SHIPPED (apr 2026) 🔗 PLANIMPv2 §2.3
- **Done:** new BullMQ queue `character-rename-denorm` (`lib/queue.ts`) processed by `services/cast-denorm.ts` which scans `stories WHERE cast @> [{characterId}]::jsonb` and resyncs every `cast[].displayName`. Worker registered in `startSessionWorkers()`. PATCH /api/characters/:id enqueues the job when `name` changes; falls back to inline run when Redis unavailable. Idempotent (only writes when displayName actually differs).

### B2.6 — `queued_for_publish` pre-flight ✅ SHIPPED (apr 2026) 🔗 PLANIMPv7 §1.4
- **Done:** new column `characters.queued_for_publish` (migration `0054_queued_for_publish.sql` + partial index). Helper `isPublishBlockedByPendingAvatar(characterId)` in `routes/characters.ts` checks the primary `character_images` row; PATCH /api/characters/:id and PATCH /:id/detail now refuse to flip `is_public=true` when the avatar is not yet `approved` and instead set `queued_for_publish=true`. Ops surface: `GET /api/ops/images/pending`, `POST /api/ops/images/:id/approve` (mirrors avatar_url + auto-publishes the character when `queued_for_publish && is_primary`, logs `metadata.autoPublished`), `POST /api/ops/images/:id/reject { reason }`. Moderation actions written to `moderation_actions` for audit.

### B2.7 — One-shot opt-in mass-publish banner ✅ SHIPPED (apr 2026) 🔗 PLANIMPv7 §1.3
- **Done:** new `routes/me.ts` mounted at `/api/me`. `GET /api/me/private-summary` returns `{ characterCount, storyCount, total }` (private chars + draft stories owned by user). `POST /api/me/mass-publish { includeCharacters?, includeStories? }` bulk-flips with avatar pre-flight: characters whose primary image is not yet `approved` are routed into `queued_for_publish=true` instead of being published outright; eligible ones get `is_public=true` + `published_at=COALESCE(...)` in a single batch UPDATE via `id = ANY($ids)`. Stories transition `status='draft' → 'published'`. FE: `MassPublishBanner.tsx` mounted on home page (`/`); shows only when `total > 0` and not dismissed; surfaces actual `charactersUpdated`/`storiesUpdated` in the success toast. Dismissal persists for 30 days via `localStorage`.

### B2.8 — Analytics events sink table ✅ SHIPPED (apr 2026) 🔗 PLANIMPv7 §6
- **Done:** discovered already live — `POST /api/analytics/events` (rate-limited, batch insert) writes into `analytics_events` (`routes/analytics.ts`), FE emits via batched `trackEvent` in `packages/web/src/lib/analytics.ts` with opt-out. Retention runs daily via the `analytics-purge` cron (`DELETE FROM analytics_events WHERE created_at < NOW() - INTERVAL '30 days'`). Retention window is 30d (not 90d as originally planned) — revisit if Phase H hardening needs a longer tail.

### B2.9 — DMCA ops route ✅ SHIPPED (apr 2026) 🔗 PLANIMPv7 §7
- **Done:** `POST /api/ops/dmca/takedown { entityType, entityId, reason, sourceUrl?, reporter? }` soft-deletes (sets `deleted_at`, marks `is_flagged_for_review`, hides from discover) and writes a `moderation_actions` row with `action='dmca_takedown'` plus structured metadata. `POST /api/ops/dmca/restore` reverses the action (counter-notice path). `GET /api/ops/dmca` returns the takedown audit log. New FE console at `/ops/dmca` mirrors the moderation page pattern (OPS_API_KEY in component state only).

### B2.10 — World Info Inspector UI ✅ SHIPPED (apr 2026) 🔗 PLAN_IMPLEMENTSv5 Track C H2
- **Done:** `/sessions/[id]/world-info/` upgraded to group entries by lorebook (collapsible sections with per-book token totals), resolves lorebook names via `GET /api/lorebooks`, highlights `matchedKeywords[]` inline inside each entry body via a regex-escaped `<mark>` overlay, and surfaces the budget-skipped count in both the summary chip row and a dedicated callout linking to Settings → Lorebooks. No API changes — `GET /api/sessions/:id/active-lore` already shipped the data shape.

### B2.11 — `[TRACK:]` parser + tracker bar FE ✅ SHIPPED (apr 2026) 🔗 Track C H6
- **Done:** parser (`parseAndStripTrackers`, `mergeTrackers`) and orchestrator wiring already complete; `session.metadata.trackers` is populated post-turn. This session adds the FE: `packages/web/src/components/chat/TrackerBar.tsx` renders tracker key-value pairs as a scrollable colored-chip row just below the story chrome bar whenever `session.metadata.trackers` is non-empty. Numeric values (including delta-applied results) show a subtle bar-fill for visual scale. Shown for all sessions (not just story sessions) so character roleplay trackers (e.g. affection, trust) surface naturally.

### B2.12 — Light-mode theme 🔗 Track C H11
- `next-themes` + light palette.

### B2.13 — Paste handling (turndown) + code highlight (shiki) ✅ SHIPPED (apr 2026) 🔗 PLANIMPv6 §8
- **Done:** `MarkdownEditor.tsx` adds an `onPaste` handler that lazy-loads `turndown` when `clipboardData.types` contains `text/html` (Google Docs / Notion / browser selection) and inserts converted Markdown at the caret; plain-text paste falls through to the browser default. `RichContent.tsx` lazy-imports `shiki` from a `useEffect` only when `<pre><code class="language-X">` blocks exist; restricted to a small whitelist (`ts/tsx/js/jsx/json/bash/sh/sql/py/md/yaml/html/css`) using the `github-dark-dimmed` theme. Highlighter blobs are dynamic-imported so non-MD pages pay zero cost.

### B2.14 — `R2_PUBLIC_DOMAINS` env-driven host allowlist ✅ SHIPPED (apr 2026) 🔗 PLANIMPv6 §4
- **Done:** added `R2_PUBLIC_DOMAINS` to `lib/env.ts` (CSV → trimmed lowercase array, empty list = pass-through). `services/rich-content.ts` `isAllowedImgSrc(src)` parses URLs and matches `host === d || host.endsWith('.' + d)`; the DEFAULT_PROFILE `transformTags.img` returns an empty `<span class="md-img-blocked">` when blocked, otherwise the original tag with `loading="lazy"`. `http(s):` only.

### B2.15 — Anchor click safety (client router intercept) ✅ SHIPPED (apr 2026) 🔗 PLANIMPv6 §3
- **Done:** `components/ui/RichContent.tsx` adds a delegated `onClick` on the wrapper div that walks `(e.target as HTMLElement).closest('a')`. Skips hash/mailto/modifier-clicks/middle-button/internal hosts (suffix allowlist `INTERNAL_SUFFIXES = ['neigo.app', 'neigo.app', 'localhost']`); for everything else: `e.preventDefault()` → `window.confirm('Buka tautan eksternal?\n\n' + href)` → `window.open(href, '_blank', 'noopener,noreferrer')`.

### B2.16 — Phase H hardening (PLANIMPv8)
- k6 load test, axe-core a11y scan, Lighthouse ≥85, p95 < 250ms.

---

## P3 — deferred / explicitly parked

- **Kismet / Memento / Ghostwriter / Remix** (REDESIGNv2 §7) — post-launch ideas.
- **Echo chamber, avatar crop, A/B persona preview, lorebook library** (PLAN_IMPLEMENTSv5 stretch / X7).
- **Tavern card import** (PLANv3 Tier 2 #15).
- **Phase-3 external sprite adapter** (PRESENCE_CONTRACT_v1 §14).
- **REDESIGNv2 D1 Tahap C hard-delete** — gated behind user `PURGE` token by design.
- **VN bundled background library** (BV-P1) — trigger: authored `backgroundImageUrl` set on >50% of published stories.
- **VN multi-slot `<VNStage>` + expression enum** (BV-P2/P3) — trigger: art team delivers expression-mapped sheets + single-slot validated.
- **VN branching / choice mode** (BV-P5) — trigger: kinetic retention validated.
- **Dedicated `/vn/[runId]` cinema route** (BV-P8) — trigger: chat-chrome UX ceiling measurable.
- **Forge 3-pane split** (B-DESIGN.E v2) — trigger: content supply proven at current pane.
- **Personalized "More like what you've played"** (B-DESIGN.A) — trigger: ≥2 completed sessions signal + recommender.
- **Letters Archived tab** — trigger: `letters.archivedAt` column added to schema.
- **B2.12 Light-mode theme** — trigger: brand/design decision.

---

## Retired items (do not revive without explicit re-decision)

- 🔴 NSFW opt-in toggle — removed from all surfaces. Model always runs uncensored server-side (BETA_FOCUS §C). Hard limits enforced at prompt level.
- 🔴 Light/Deep two-model picker — superseded by single voice (Crescent).
- 🔴 CHAT / HAREM / LEARNING / DEBATE / IMMERSION session modes — backend scaffolding exists but not exposed publicly. Only ROLEPLAY ships. Re-decision required to activate any.
- 🔴 BETA_LAUNCH §7 retention column names (`unresolved_beat`, `latent_question`, `callback_candidate`) — replaced by `character_diary` + `session_schedules`.
- 🔴 BRAINSTORM §8 built-in roster "Lin" — replaced by Rei/Lysandra/Kaia.
- 🔴 Legacy `DiscoverRail.tsx` — replaced by tokenized `Rail.tsx`.
- 🔴 4-family tokenizer factory — code chose cl100k universal proxy.
- 🔴 Rail-driven home (PLANIMPv5 Track A D2) — superseded by PLANBv7 home redesign.
- 🔴 NSFW.js client pre-check — moderation is server-authoritative.
