> ✅ **STATUS (apr 2026): HISTORICAL DECISION LOG.** v7 single-voice + Supabase + pgvector + relationship/mood + 4-layer memory + LCM all shipped. 🔴 §6 NSFW opt-in toggle and 🔴 §8 'Lin' roster entry are obsolete — see [BACKLOG.md](BACKLOG.md) 'Retired items'. Remainder still describes current reality.

---

# Project Neigo — Brainstorm & Decision Log

> Living document. Append to the bottom — do not rewrite history.
> Scope: product, launch, content, safety, infrastructure decisions.
> Source-of-truth for *why* things are built the way they are.

---

## 1. Product positioning

Web-first immersive roleplay / companion chat. Ported logic from an Android/KMP
roleplay app; rebuilt on a modern TypeScript stack so it can run globally from a
single PWA. **v7 direction:** one voice — **Crescent** (Hermes-4 405B) — fully
uncensored, never forgets. Differentiator is not multi-pass anymore; it is a
single premium voice with structured memory, personality anchoring, and
anti-drift scaffolding. Multi-pass is retained in code only for HAREM mode
(hidden from beta).

Target audience: readers and creative-writing users who want deep persona
consistency, emotional realism, and slow-burn relationships — not
"assistant-style" chat.

## 2. Locked technical decisions

- **Monorepo:** pnpm workspaces + Turbo. Packages: `@neigo/shared`,
  `@neigo/server`, `@neigo/web`.
- **Runtime:** Bun + Hono server, Next.js 15 App Router web, React 19, Tailwind
  v4. SSE streaming. PWA-installable.
- **DB:** Postgres with `pgvector`. Drizzle ORM. Local via Docker; production on
  **Supabase** (project `xbbvdtfmfpqsetreialv`).
- **Cache/queue:** Redis (local docker, Upstash in prod).
- **AI provider:** Nous Research `inference-api.nousresearch.com` with
  `Hermes-4-405B` as the primary model. OpenAI-compatible; we only hit
  `/chat/completions` with SSE streaming. API key resolution order:
  `NOUS_API_KEY → AI_API_KEY → OPENROUTER_API_KEY` (for back-compat).
- **Auth:** bespoke JWT + httpOnly cookie. We do *not* use Supabase Auth —
  Supabase is used purely as a Postgres + PostgREST + Storage host.
- **Data API + automatic RLS:** Supabase Data API is enabled. Every table has
  RLS turned on at the database level. Our server connects as table owner
  (`postgres` role) so RLS does not block it, while external PostgREST access
  via anon/authenticated roles is default-deny. Policies can be added per
  table as features ship.
- **Language of prompts:** *all system prompts and scaffolding are written in
  English* so the product is globally usable from day one. Character personas
  may be authored in any language (the model inherits that voice naturally).

## 3. Orchestration pipeline (v7)

Per turn, by mode:

- **CHAT / ROLEPLAY / LEARNING / DEBATE / IMMERSION** — **single LLM call**
  (Hermes-4-405B) with directive preamble + character card + memory context +
  Author's Note at depth. Output goes through regex post-processing only:
  refusal-guard sanitizer → repetition detector → tone-drift detector →
  `[STATS:…]` parser. If sanitizer trips, **one** retry with a stronger
  preamble; otherwise stream to user.
- **HAREM** — retained multi-pass: Director → Narrator → Lead → React ×N →
  Silent ×N → Whisper (drama ≥ 3). Hidden from beta UI; kept for post-beta
  reactivation. `cross-pass-consistency.ts` only runs here.

Background (batched, queued):
- Memory crystallization every ~15 turns (on Crescent; cheap).
- Scene recap card on user demand (1 extra call).

Amortized LLM calls per user turn: ~1.08.
Hallucinations still logged to `hallucination_log`. See v7 audit for the
consequence trail (no `<think>`, no model picker, no session-lock model, no
auto-downgrade).

## 4. Memory system

Pinned memories + emotional memories + LORE + SUMMARY, all retrievable via
pgvector cosine similarity. RAG is opt-in per session (`ragEnabled`). Embeddings
are 1536-dim, indexed with IVFFlat (`lists=100`), added via a raw-SQL migration
(`drizzle/0001_pgvector.sql`) because drizzle-kit cannot emit `vector(N)`.

## 5. Relationship + emotional model

- Trust score drives `RelationshipStage` (Stranger → Acquaintance → Friend →
  Close → Intimate).
- Mood escalates/de-escalates per turn from stats (`trust/affection/tension/
  jealousy`) parsed from the model's `[STATS: …]` tail.
- Anchor prompts re-inject personality every N turns.
- Presence manager handles who's "in scene" in HAREM mode.
- Safe-fallback generator produces an in-character stall if a pass fails
  validation.

## 6. Content & safety

- **NSFW mode is opt-in and 18+-gated.** Default off. User must explicitly set
  `ageConfirmed=true` via `PATCH /api/auth/nsfw`. Flag lives on `users`.
- When off, prompt injects a "Content Boundaries" block — tasteful, no graphic
  content. Emotional intimacy is allowed.
- When on, prompt injects a "Mature Content" block that permits explicit prose
  but lists non-negotiable hard limits: minors, non-consensual framed as
  desirable, real identifiable people, bestiality, incest with biological
  minors. Refusals must happen *in character*.
- Web UI gates the toggle behind an age-confirmation modal with the hard limits
  spelled out. Banner is shown while NSFW is active.

## 7. Tiering

Tier enum: `FREE`, `PREMIUM`, `PREMIUM_PLUS`. Configs are centralized in
`@neigo/shared` and enforced server-side before session/turn creation. Limits
cover sessions/day, turns/session, max characters, harem mode, learning mode.

## 8. Built-in characters

Curated roster designed to showcase Hermes-4 strengths:

- **Kaia Schneider** — disciplined/logical/protective, tonePreset `FORMAL`.
- **Lin Yue** — calm, emotionally intelligent, elegant, tonePreset
  `MELANCHOLIC`.
- **Rei Aizawa** — stoic, introvert, slow-burn, tonePreset `STOIC`.
- Legacy demo characters (Elara, Seraphine) kept for back-compat.

Each persona includes `coreTraits`, `dynamicTraits`, `verbalHabits`,
`conflictStyle`, and explicit `forbiddenTopics` so refusal behaviour is
persona-driven, not system-driven. Intimacy progression is gated by in-character
trust, not by the NSFW flag alone.

## 9. Beta-launch strategy (advisory — revisit before going public)

1. **Soft launch** — invite list of ~50 users. Goal: collect persona-drift
   reports and turn-failure samples. Logging focuses on validator rejects and
   hallucination_log.
2. **Public beta** — PWA-only, no paid tier yet. Free tier caps enforced; abuse
   prevented by per-user turn budgets. NSFW remains off by default.
3. **Paid tier** — Stripe integration. Premium unlocks HAREM + longer memory
   window + priority queue. PremiumPlus unlocks learning mode + private
   characters + higher daily session cap.
4. **Safety posture** — logs of NSFW-enable toggles and of every refusal
   retained for 30 days. DMCA/report endpoint from day one.
5. **Scaling path** — single Bun server behind Cloudflare; Postgres on Supabase;
   queue via Redis; image storage on R2. All horizontal scaling points
   identified but not yet automated.

## 10. Change log

- 2026-04-16: initial port from roleplayapp. Phases 0–8 scaffolded.
- 2026-04-17: switch AI backend from OpenRouter default to Nous direct
  (`Hermes-4-405B`). Add `NOUS_API_KEY`.
- 2026-04-17: NSFW opt-in with 18+ gate implemented end-to-end (schema,
  endpoint, prompt directive, settings UI).
- 2026-04-17: three polished built-in characters added (Kaia, Lin, Rei).
- 2026-04-17: migrate production DB to Supabase (`xbbvdtfmfpqsetreialv`). Data
  API enabled. Automatic RLS turned on for every table (owner bypass; external
  roles default-deny).
- 2026-04-17: lock all prompt scaffolding to English.
- 2026-04-18: **v7 collapse** — drop thinking mode, drop 70B/DeepSeek, drop
  multi-pass for CHAT/ROLEPLAY/LEARNING/DEBATE/IMMERSION. Single voice
  ("Crescent" = Hermes-4-405B). Model picker removed, session-lock model
  removed, per-pass temperature removed, `<think>` splitter removed. HAREM
  kept as multi-pass (hidden from beta UI).
- 2026-04-18: add in-memory IP rate-limit middleware (register/login/chat
  turn), per-user cost counter + circuit breaker in `ai-proxy`, wire
  refusal-guard sanitizer in single-pass path with one retry.
- 2026-04-18: **v7 persona/memory** — add Author's Note at depth (inserted
  4 messages from the tail of the conversation, recency-biased anti-drift)
  in `personality-anchor.ts` + wired into `orchestrator.runTurn`; add
  structured memory crystallization schema (`zCrystallizationResult`,
  `buildCrystallizationPrompt`, `parseCrystallizationResponse`) in
  `memory-manager.ts` so background summaries become typed JSON with
  salience + emotion + turnRef instead of free-form prose.

## 11. 2026-04-18: Hermes-LCM adoption analysis for Project Neigo

This note is a **technical adoption memo**, not a generic feature brainstorm.
Decision target: whether Project Neigo should adopt the `hermes-lcm` pattern, and
if yes, how it should be translated into our own Postgres + Hono + TypeScript
stack without dragging Hermes plugin assumptions into the codebase.

### Current-state audit of Project Neigo context + memory pipeline

- **Active context is windowed.** The live prompt is still built primarily from
  recent transcript replay: `Orchestrator.loadHistory(sessionId, limit=30)`
  loads the latest conversation window from `chat_messages`, maps it to
  `AiMessage[]`, and sends that into prompt assembly. This gives reliable short
  memory, but it does not create a first-class recall path for older turns once
  they fall outside the active window.
- **Long-term memory is semantic, not lossless.** Durable recall currently lands
  in `memories` via pgvector retrieval (`MemoryRetriever.retrieve`) plus
  periodic background crystallization / summary writes (`scheduleSummary()`).
  This is good at emotional beats, promises, and lore, but it is not the same
  as transcript-preserving context compaction.
- **`chat_messages` already gives us durable raw transcript storage.** We are
  not missing persistence. What is missing is a dedicated layer that turns old
  transcript into hierarchical context artifacts that can be searched,
  inspected, and expanded back into source detail.
- **There is no summary graph today.** Project Neigo has no leaf / parent summary
  DAG, no compaction frontier, no explicit maintenance debt tracking, and no
  operator-facing context diagnostics comparable to LCM status / doctor /
  describe flows.
- **Memory side effects are fragmented.** Durable knowledge currently enters the
  system through several separate mechanisms: summary crystallization in
  `scheduleSummary()`, promise extraction in `extractAndPinPromises()`, and
  secondary tool-call routing in `evaluateToolCalls()`. The result is useful,
  but not unified under one context-management model.

### What `hermes-lcm` solves that Project Neigo does not currently solve

- **Immutable-first transcript handling** as a deliberate architecture, not just
  “messages happen to be stored in a table”.
- **Hierarchical summary compaction** where old raw conversation becomes leaf
  summaries, then condensed session-arc summaries, while preserving source
  lineage.
- **Retrieval primitives for compacted context**: search, describe, expand, and
  answer-from-expanded-context. This is the key distinction from ordinary RAG.
- **Large-output externalization** so oversized payloads do not poison prompt
  assembly while still remaining losslessly retrievable later.
- **Lifecycle / maintenance state** for tracking compaction frontier, deferred
  backlog work, rollover/reset semantics, and operator-safe cleanup.

### Adoption decision: what we take, rewrite, and reject

- **Adopt directly as concepts:** immutable transcript discipline, summary DAG
  semantics, source-lineage retrieval, externalized large-payload storage, and
  operator diagnostics for compacted context.
- **Rewrite for Project Neigo:** storage engine, orchestration hooks, retrieval
  services, and diagnostics must be rebuilt as Postgres-native Project Neigo
  services and internal routes. We should not port Hermes plugin mechanics,
  SQLite assumptions, or Python host interfaces.
- **Keep `memories` as-is in role, not as the only memory substrate.**
  `memories` should remain the **semantic / relationship memory layer**:
  emotional beats, promises, lore, milestones, and vector retrieval. It should
  not be overloaded to also behave like a lossless transcript compaction store.
- **Add a separate context compaction layer.** The LCM-inspired layer should be
  responsible for transcript recall and prompt assembly, while `memories`
  continues to power semantic and relationship-aware retrieval.
- **Reject direct drop-in reuse.** Hermes-specific engine registration,
  plugin/tool schemas, SQLite FTS implementation details, and slash-command
  surfaces are reference material only.

### Proposed Project Neigo architecture evolution

- Add **context-node storage** as a new Postgres-native subsystem. This stores
  leaf summaries and condensed parent summaries with explicit source lineage
  back to `chat_messages` or lower-depth nodes.
- Add **session context lifecycle state** to track the compaction frontier,
  pending maintenance debt, last processed transcript point, and future
  retention / rollover actions.
- Add an internal **context retrieval surface** with four primitives:
  `search`, `describe`, `expand`, and `expand_query`. This should be usable by
  orchestrator code first, and only later exposed to ops / debugging surfaces if
  needed.
- Revise prompt assembly so active context becomes:
  **system prompt + selected context summaries + fresh tail + semantic memories**.
  This is the core architectural shift. `memories` remains in the prompt, but
  no longer carries the full burden of recovering older transcript detail.
- Treat **older-than-window transcript recall** as a first-class path. When the
  orchestrator needs detail older than the active 30-turn replay window, it
  should search compacted transcript context first, then expand source detail as
  needed, instead of relying only on vector memories.
- Treat **large payloads** separately from ordinary chat text. Tool outputs,
  generated scene artifacts, or future oversized structured blobs should be
  externalized and referenced from context nodes rather than kept inline in
  prompt-critical text.
- Treat **operator diagnostics** as part of the system, not polish. We need
  internal visibility into node counts, compression ratio, backlog debt,
  frontier position, and expansion fidelity if this layer is going to be
  trusted in production.

### Decision-complete rollout recommendation

1. **Phase 1 — transcript search + context diagnostics**
   Build transcript search and session-level diagnostics directly on top of
   existing `chat_messages`. Goal: recover old details older than the active
   prompt window without changing prompt assembly yet. This gives immediate
   value and validates query behavior on real transcripts.
2. **Phase 2 — leaf compaction**
   Introduce structured context nodes that summarize old transcript ranges into
   bounded leaf summaries with source lineage. Keep prompt assembly conservative:
   selected summaries + fresh tail, no deep condensation yet.
3. **Phase 3 — DAG condensation + drill-down retrieval**
   Add parent-node condensation, `describe` / `expand` / `expand_query`
   retrieval, and operator tooling for inspection. This is the point where the
   context layer becomes meaningfully LCM-like.
4. **Phase 4 — payload externalization + lifecycle / retention**
   Add large-output externalization, maintenance debt handling, cleanup /
   retention policy, and broader cross-session context support where useful.

### Risks, constraints, and recommended defaults

- **Default: Postgres-native, not SQLite-native.** Project Neigo already runs on
  Supabase/Postgres; matching existing infra matters more than mirroring
  `hermes-lcm` internals.
- **Default: keep `memories` and context nodes separate.** Merging them would
  blur semantic memory and transcript recall into one table with conflicting
  retrieval semantics.
- **Default: start session-scoped.** Cross-session context retrieval can come
  later. The first problem to solve is reliable recall inside one long-running
  session after old turns leave the active window.
- **Constraint: prompt budget remains hard.** Hierarchical summaries must reduce
  prompt pressure, not quietly recreate transcript bloat under a different
  name.
- **Constraint: retrieval correctness matters more than compression ratio.** A
  smaller context layer that can be inspected and expanded is more valuable than
  an aggressive summarizer that hides detail.
- **Risk: semantic memory and transcript compaction can fight each other.** If
  we do not keep the roles distinct, we will end up duplicating facts,
  diverging summaries, and confusing prompt assembly.
- **Risk: operator invisibility.** If context compaction lands without search,
  describe, and expand surfaces, debugging misremembered scenes will become
  harder, not easier.

### Final recommendation

Adopt the **architecture pattern** of `hermes-lcm`, not the implementation
shell. Project Neigo should keep `memories` as its semantic / relationship memory
layer, then add a new Postgres-native transcript compaction layer for lossless
context recall. The correct end state is not “replace our memory system with
LCM”; it is “pair semantic memory with inspectable transcript compaction so the
orchestrator can recover older details without bloating the active prompt.”

## 12. 2026-04-18: Memory architecture follow-up after MemPalace, MindBank, and Human-like-memory-skill

Section 11 established the first big conclusion: Project Neigo needs a dedicated
transcript-compaction layer next to `memories`. After reviewing `MemPalace`,
`hermes_mempalace`, `MindBank`, and `Human-like-memory-skill`, the conclusion
gets sharper: the right end state for Project Neigo is **not one memory system**.
It is a **memory stack** with distinct jobs for raw transcript recall, semantic
relationship memory, structured graph facts, and explicit recall/save policy.

### What each repo adds to the picture

- **MemPalace** is strongest on **verbatim recall discipline**. It treats raw
  history as primary material, scopes retrieval structurally, and builds a
  usable “wake-up” flow for session bootstrap. The core lesson for Project Neigo is
  that old conversation should stay searchable as source text, not be forced
  immediately into paraphrased memory objects.
- **`hermes_mempalace`** is strongest on **lifecycle hooks and memory
  operations**. It shows where memory work belongs in agent flow:
  turn-start prefetch, pre-compress context injection, session-end extraction,
  and specialized stores such as diary, profile, and mistake registry.
- **MindBank** is strongest on **Postgres-native hybrid memory and graph
  structure**. It combines FTS + vector retrieval, temporal graph versioning,
  session namespaces, maintenance routes, and snapshot-style context loading.
  This repo is the closest infrastructure fit for Project Neigo's stack.
- **Human-like-memory-skill** is strongest on **policy**. Its best idea is not
  storage; it is the rule that memory recall and memory writes should be
  explicit, useful, and smart-triggered rather than sprayed into every turn.

### Updated diagnosis of Project Neigo

- `chat_messages` already gives Project Neigo a durable raw transcript.
- `Orchestrator.loadHistory(sessionId, limit=30)` means the live prompt still
  depends on a recent-window replay model.
- `memories` + pgvector still handle long-term semantic recall well enough for
  emotional beats, promises, lore, and milestone summaries.
- `scheduleSummary()`, `extractAndPinPromises()`, and `evaluateToolCalls()`
  prove that memory side effects already exist, but they are spread across the
  system rather than governed by one coherent memory architecture.

The gap is now clearer than it was in Section 11: Project Neigo does not lack
storage. It lacks **memory stratification**. Raw transcript, compacted context,
semantic memory, and structured facts still blur together operationally.

### Revised target architecture for Project Neigo

Adopt a four-layer memory model:

- **Layer 0 — Raw transcript truth**
  `chat_messages` remains the immutable source of conversation truth.
- **Layer 1 — Context compaction**
  Add session-scoped context nodes that summarize older transcript ranges into
  leaf and parent summaries with source lineage and drill-down expansion.
- **Layer 2 — Semantic / relationship memory**
  Keep `memories` for emotionally important facts, promises, preferences, lore,
  milestones, and embedding-powered retrieval.
- **Layer 3 — Structured graph memory**
  Add a later graph-like layer for durable typed facts: user profile,
  character-profile facts, cast relationships, diary entries, mistakes,
  decisions, unresolved beats, and session-arc links.

This is the first architecture that cleanly maps all four reference repos into
Project Neigo without flattening them into one overloaded table.

### What Project Neigo should adopt directly

- **From MemPalace:** verbatim-first recall, scoped retrieval, and wake-up
  packet generation before prompt assembly.
- **From `hermes_mempalace`:** hook timing for turn-start prefetch,
  pre-compress injection, session-end extraction, and specialized memory
  surfaces such as diary and mistake tracking.
- **From MindBank:** Postgres-native hybrid retrieval, temporal facts/edges,
  maintenance surfaces, session snapshots, and namespace discipline.
- **From Human-like-memory-skill:** smart-trigger recall/save policy so memory
  operations happen when they are useful, not on every turn by default.

### What must be rewritten for Project Neigo

- All storage must remain **Postgres-native**. Do not import ChromaDB, local
  SQLite, or filesystem-bound plugin layouts as first-class dependencies.
- All orchestration must live in **Hono/TypeScript services**, not Hermes
  plugins or external skill wrappers.
- Retrieval must plug into the current prompt path around
  `Orchestrator.loadHistory()` and `MemoryRetriever.retrieve()`, not replace the
  whole turn system.
- Any graph layer must respect Project Neigo's natural axes:
  `user_id`, `character_id`, `session_id`, `mode`, and future `arc_id`.

### What Project Neigo should reject

- **Reject palace taxonomy as the primary schema.** Wings/rooms/drawers are a
  good mental model and maybe a future inspector UI, but Project Neigo's real
  retrieval axes are session, character, arc, relationship stage, and mode.
- **Reject verbatim-only memory as the full answer.** MemPalace-style recall is
  excellent for fidelity, but roleplay continuity also needs abstraction,
  salience, and emotional compression.
- **Reject always-on full memory work every turn.** Human-like-memory-skill is
  right here: recall and save should be policy-driven and demand-sensitive.
- **Reject turning everything into a graph on day one.** MindBank proves the
  value of graph memory, but Project Neigo should earn that complexity after the
  transcript compaction layer is stable.
- **Reject drop-in plugin reuse.** `hermes_mempalace` is reference architecture,
  not a dependency target.

### New Project Neigo interfaces this suggests

At behavior level, Project Neigo should gain:

- **`context_nodes`**
  Hierarchical summaries over `chat_messages`, with depth, time range, token
  budget, salience, and source references.
- **`context_node_sources`**
  A lineage table linking nodes back to message ranges or child nodes.
- **`session_context_state`**
  Frontier tracking for compaction progress, maintenance debt, last processed
  turn, and wake-up snapshot freshness.
- **`context_blobs`**
  Externalized large payloads for oversized tool output, structured artifacts,
  or future media-derived text.
- **`memory_graph_nodes` / `memory_graph_edges`**
  A later typed-fact layer for profile facts, diary, promises, mistakes,
  cast links, decisions, and arc-level connections.
- **Internal retrieval surfaces**
  `search`, `describe`, `expand`, `expand_query`, `wake_up`, and later graph
  neighborhood retrieval for typed facts.

### How prompt assembly should evolve

The current effective path is still close to:

- `system prompt + recent transcript tail + semantic memories`

The revised path should become:

- `system prompt + wake-up snapshot + selected compacted transcript summaries + fresh tail + semantic memories + mode-specific graph facts`

That single change answers the biggest current weakness. When a detail is older
than the active 30-turn window, the orchestrator should not guess from semantic
memory alone. It should:

1. Search compacted transcript context.
2. Expand source-linked details from `chat_messages` if needed.
3. Only then blend in `memories` for emotional meaning, preferences, or lore.

This is a much healthier division of labor than forcing `memories` to stand in
for both semantic recall and transcript recovery.

### Large outputs and oversized context

All four reference repos reinforce the same lesson from different angles:
oversized context should not stay inline forever.

- Tool outputs, long scene artifacts, imported notes, or future generated logs
  should be externalized into `context_blobs` with compact summaries stored in
  context nodes.
- Prompt assembly should pull the digest first, not the full payload.
- Operators must still be able to expand the full source during debugging.

This gives Project Neigo a path to absorb future heavy features without poisoning
latency or prompt budget.

### Effects on Project Neigo modes and features

- **ROLEPLAY** benefits the most from transcript compaction + wake-up context.
  Scene continuity, callback accuracy, and slow-burn emotional consistency all
  improve when old beats can be reopened rather than vaguely embedded.
- **HAREM** benefits from both compaction and later graph memory. Cast
  relationships, jealousy history, private promises, and scene-specific
  callbacks become much easier to stabilize.
- **CHAT** mainly benefits from wake-up snapshots and smart-trigger recall. The
  gain is steadier continuity, not heavy graph reasoning.
- **LEARNING** and **DEBATE** benefit more from MindBank-like typed facts and
  temporal graph edges: claims, positions, evidence, unresolved questions, and
  preference changes become queryable instead of being buried in transcript.
- **IMMERSION** benefits from a cleaner split between atmosphere/history recall
  and semantic memory, reducing drift when long-running sessions get dense.

Beyond memory quality, this architecture unlocks better operator features:

- context inspector / node tree
- wake-up packet preview
- searchable old-scene recovery
- promise board / mistake registry / diary later
- maintenance diagnostics for compaction debt and stale snapshots

### Updated rollout recommendation

1. **Phase 1 — transcript search + wake-up diagnostics**
   Build search and operator diagnostics on top of `chat_messages`, and add a
   session wake-up packet for cold starts or long idle gaps.
2. **Phase 2 — leaf compaction + blob externalization**
   Add `context_nodes`, `context_node_sources`, and `context_blobs`, with
   conservative prompt use: selected leaf summaries plus fresh tail.
3. **Phase 3 — DAG condensation + smart-trigger policy**
   Add parent summaries, `describe` / `expand` / `expand_query`, and explicit
   smart-trigger rules for when recall/save work should run.
4. **Phase 4 — typed graph memory**
   Add profile facts, diary, cast links, promises, mistakes, and session/arc
   relationships using a MindBank-like typed graph layer.
5. **Phase 5 — operator tooling + cross-session memory**
   Add inspectors, maintenance routes, cross-session retrieval policy, and
   safer debugging around why a reply remembered or forgot something.

### Final recommendation

The improved recommendation is stronger than Section 11:

- keep `chat_messages` as truth,
- keep `memories` as semantic / relationship memory,
- add an LCM-like transcript compaction layer next,
- then add a MindBank-like typed graph layer later,
- and control both through Human-like-memory-skill-style smart-trigger policy.

That combination is the best fit for Project Neigo. It preserves fidelity for long
roleplay sessions, keeps prompt budgets sane, improves inspectability for the
team, and opens up future features like diary, mistake tracking, cast-memory
graphs, and reliable wake-up resumes without turning the app into a direct copy
of any one upstream repo.

---

## 13. Tier 3 Implementation — Context Compaction, Replay Harness, Continue UX

### Completed (2025-01)

**T3.10 — Context Compaction (Phase 1: LCM-inspired)**
- New table `context_nodes` (schema + migration `0008_context_nodes.sql`)
- Service `context-compaction.ts`: `compactSessionContext()` chunks old turns into
  leaf nodes with LLM-summarized content; `retrieveCompactedContext()` retrieves
  highest-salience nodes within a token budget (default 4000)
- Orchestrator wiring: fires compaction after done (turn >= 20), injects retrieved
  context as system message before history assembly
- Salience scoring: keyword-based (emotional/plot/scene markers), no LLM call

**T3.11 — Orchestrator Replay Harness**
- Deterministic validator regression tests: 9 scenarios covering repetition,
  refusal, format drift, POV drift, tone drift
- CLI: `pnpm --filter @neigo/server test:replay` (exit 0 = all pass)
- No LLM calls — tests validator functions only

**T3.12 — Continue / Retry UX (full stack)**
- Backend: `POST /:sessionId/continue` endpoint — loads last AI message, streams
  continuation via LLM, appends to existing message in DB
- Frontend: `isTruncated()` helper detects abrupt endings (no closing punctuation
  on messages > 100 chars); "Continue" button streams additional content into
  existing bubble via SSE

### Architecture notes
- Compaction only triggers for sessions with 20+ turns (saves LLM calls)
- Continue endpoint uses `turnIndex: -1` in done event to distinguish from
  normal turns; frontend handles `continued: true` flag
- Replay harness validates detector accuracy without network dependencies —
  scenarios use realistic text that triggers specific validator thresholds

---

## 14. Tier 4 — Full Memory Overhaul Plan (Re-implementation)

Based on deep analysis of 5 external memory repos:
- `stephenschoettler/hermes-lcm` (LCM paper, DAG compression, drill-down)
- `spfcraze/MindBank` (PG+pgvector, hybrid RRF, temporal graph) ← closest stack
- `MemPalace/mempalace` (verbatim storage, benchmark methodology)
- `NehuenD/hermes_mempalace` (Mistakes Registry, Character Diary)
- `qwang6-1936520/Human-like-memory-skill` (skipped — SaaS wrapper)

Goal: re-implement memory/consistency layer from Tier 3's partial LCM into a
production-grade unified system, entirely TS-native on existing stack
(Postgres+pgvector+Drizzle+Bun), zero new runtime deps.

### Guiding principles

1. **No stack shift.** All schema additions go in existing Drizzle `schema.ts`
   + migration SQL. No ChromaDB, no Ollama, no Neo4j, no MCP layer.
2. **Additive, never replace.** Existing `memories`, `chat_messages`,
   `context_nodes`, `character_dynamic_states` stay source-of-truth. New tables
   are overlays.
3. **Every feature ships behind a feature flag** via `env.ts` so rollback is a
   one-line revert, not a code surgery.
4. **Validators/observers write data, prompts read data.** Clean separation —
   any feature that silently changes prompt content without persisting
   evidence is rejected.
5. **Benchmarks gate merges.** Phase 6 benchmark suite becomes CI check for
   regressions in recall@5 / consistency retry-rate.

### Phase map (10 tasks, priority-sorted by ROI)

### T4.1 — Mistakes Registry (highest ROI)

**Source:** hermes_mempalace (mempalace_record_mistake / search / recall)

**Problem solved:** Validators currently reactive — detect drift, retry, move
on. No long-term memory of what patterns the model tends to violate in each
session. Means recurring drift on turn 40 gets re-detected with no prior
awareness.

**Deliverables:**

```ts
// packages/server/drizzle/0009_session_mistakes.sql
CREATE TABLE session_mistakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  turn_index INT NOT NULL,
  kind TEXT NOT NULL,            -- 'tone_drift'|'pov_drift'|'format_drift'|'repetition'|'refusal'|'continuity'
  excerpt TEXT NOT NULL,         -- truncated problematic text (≤ 240 chars)
  correction TEXT NOT NULL,      -- corrective instruction that fixed it
  resolved_in_turn INT,          -- null if still pending; set when retry succeeded
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON session_mistakes (session_id, kind);
CREATE INDEX ON session_mistakes (session_id, created_at DESC);
```

- New table 21 in `schema.ts`
- New service `mistakes-registry.ts`: `recordMistake()`, `recentMistakes(sessionId, limit=3)`
- Wire in `orchestrator.ts` `runSinglePass()`: on successful retry, call `recordMistake`
- Wire in `prompts/builder.ts`: when building system prompt, append
  `## Recent Drift Patterns (DO NOT REPEAT)` block with top-3 recent mistakes
- Feature flag: `MISTAKES_REGISTRY_ENABLED` (default true)

**Expected impact:** 30-50% reduction in same-kind drift retries after turn 20.

### T4.2 — Hybrid RRF search for memories

**Source:** MindBank (`/api/v1/search/hybrid` using FTS + pgvector RRF)

**Problem solved:** Current memory retrieval is FTS-only. Dense (pgvector)
results are computed but RRF-fusion isn't used; we pick either top-K vector or
top-K FTS, missing semantic+lexical overlap.

**Deliverables:**
- New utility `memory-retriever.ts::hybridSearchRRF(sessionId, query, k=10)`:
  1. Run FTS → rank list A
  2. Run pgvector cosine → rank list B
  3. RRF: `score(doc) = Σ 1 / (60 + rank_i)` over both lists
  4. Return top-K
- Replace current `getRelevantMemories()` call sites with hybrid version
- Keep FTS-only path as fallback when embedding unavailable
- Feature flag: `MEMORY_HYBRID_RRF_ENABLED`

**Expected impact:** Retrieval recall improvement from ~70% to ~90% on
in-session recall (extrapolated from MindBank benchmarks).

### T4.3 — Character Diary (emotional continuity)

**Source:** hermes_mempalace (AAAK diary entries)

**Problem solved:** Current `memories` are fact-based snapshots. No
*perspective* — character doesn't "remember how they felt" about past
interactions, only what happened. Emotional continuity breaks across sessions.

**Deliverables:**

```sql
-- packages/server/drizzle/0010_character_diary.sql
CREATE TABLE character_diary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  turn_range_start INT NOT NULL,
  turn_range_end INT NOT NULL,
  entry TEXT NOT NULL,           -- 1-2 paragraph 1st-person reflection
  mood TEXT,                     -- dominant emotion while writing
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON character_diary (session_id, turn_range_end DESC);
CREATE INDEX ON character_diary (character_id, user_id, created_at DESC);
```

- New service `character-diary.ts::writeDiaryEntry(session, turnStart, turnEnd)`
  - LLM call with temp 0.7, maxTokens 250
  - System prompt: "Write a brief 1st-person diary entry from {character.name}'s
    perspective about turns {start}–{end}. Focus on feelings and impressions
    of the user, not events."
- Trigger: every 10 turns, fire-and-forget after `emit({ type: 'done' })`
- Retrieve: when building roleplay prompt, load 2 most-recent diary entries
  for this `(character_id, user_id)` pair across ALL sessions; inject as
  `## Inner Reflections (character's private feelings)` block
- Feature flag: `CHARACTER_DIARY_ENABLED`

**Expected impact:** Cross-session emotional continuity ("Lysandra seems to
remember how she felt last time we met") — likely the single biggest UX win
for returning users.

### T4.4 — DAG D1 condensation

**Source:** hermes-lcm (depth-aware DAG, fanin-triggered condensation)

**Problem solved:** Current `compactSessionContext()` creates D0 (leaf) nodes
only. At turn 200+, session has 20+ D0 nodes. Retrieving them all blows
token budget; retrieving top-N by salience loses temporal coverage.

**Deliverables:**
- Extend `context-compaction.ts`:
  - `condenseDepth(sessionId, depth)`: when count of un-parented nodes at
    `depth` ≥ `LCM_CONDENSATION_FANIN` (default 4), summarize them into a
    single `depth+1` parent node; set `parentId` on children
  - Modify `retrieveCompactedContext()`: prefer highest-depth nodes first
    (fewer, denser), fall back to D0 for recent content
  - Add `LCM_INCREMENTAL_MAX_DEPTH=2` cap (D0→D1→D2 only; D3+ excessive for roleplay)
- Fire in `runTurn()` after D0 compaction finishes
- Feature flag: `CONTEXT_DAG_CONDENSE_ENABLED`

**Expected impact:** Sessions can scale from ~100 turns (current practical cap)
to 500+ without context blow-out.

### T4.5 — 5-factor importance scoring

**Source:** MindBank (recency 30% / frequency 25% / connectivity 20% /
explicit 15% / type 10%)

**Problem solved:** Current memory scoring uses a flat composite bug-fix from
Tier 1 but lacks connectivity + frequency signals. A memory referenced 5x is
treated same as one referenced once.

**Deliverables:**
- Extend `memories` table (migration `0011`):
  ```sql
  ALTER TABLE memories ADD COLUMN access_count INT DEFAULT 0;
  ALTER TABLE memories ADD COLUMN last_accessed_at TIMESTAMPTZ;
  ALTER TABLE memories ADD COLUMN explicit_pin BOOLEAN DEFAULT false;
  ```
- Bump `access_count` + `last_accessed_at` inside `hybridSearchRRF` whenever
  memory is included in retrieval
- `scoreMemory(m)`:
  ```
  recency    = exp(-hoursSinceAccess / 168)           -- decay over 1 week
  frequency  = log(1 + access_count) / log(20)        -- cap at ~3 plateau
  explicit   = m.explicit_pin ? 1 : 0
  type_w     = { core: 1.0, event: 0.7, preference: 0.6, ambient: 0.3 }[m.kind]
  connectivity = (# of other memories citing this one) / 10  -- cap 1.0
  score = 0.30*recency + 0.25*frequency + 0.20*connectivity + 0.15*explicit + 0.10*type_w
  ```
- Feature flag: `MEMORY_MULTI_FACTOR_SCORE_ENABLED`

**Expected impact:** Better memory pick for prompt injection; frequently-used
core facts stay sticky; stale ambient details drop.

### T4.6 — Session snapshot precompute

**Source:** MindBank (`/api/v1/snapshot`, pre-computed wake-up context)

**Problem solved:** Cold-start latency when user opens a long-idle session —
server runs retrieval from scratch. Users feel the 200-500ms delay.

**Deliverables:**
- Add `chatSessions.metadata.snapshot` jsonb field containing:
  ```ts
  {
    builtAt: ISO,
    turnCount: number,  // snapshot invalidates when this changes
    memoryIds: string[],      // top-20 memories
    diaryIds: string[],       // top-5 diary entries
    compactedNodeIds: string[], // top D1 nodes
    mistakes: string[],       // top-3 recent drift patterns
  }
  ```
- New cron task in `lib/cron.ts::rebuildStaleSnapshots()` every 15min:
  - Find sessions where `metadata.snapshot.turnCount` < `session.turnCount`
  - Rebuild snapshot async
- On `/open` endpoint: if snapshot is fresh (turnCount matches), use it
  directly; skip retrieval work in `runTurn()` for the first turn
- Feature flag: `SESSION_SNAPSHOT_ENABLED`

**Expected impact:** Cold-start first-turn latency drops ~40%.

### T4.7 — L1→L2→L3 summary escalation

**Source:** hermes-lcm (3-level escalation with convergence guarantee)

**Problem solved:** Current `summarizeChunk()` can produce summaries >2000
tokens if chunk is dense. When retrieved + injected, blows budget.

**Deliverables:**
- Extend `context-compaction.ts::summarizeChunk`:
  - L1 (default): detailed prose summary, ~400 tokens target
  - If output > `LCM_LEAF_CHUNK_TOKENS` (4000): re-summarize with "Compress
    to ≤ 8 bullet points" prompt (L2)
  - If L2 still > 2000: deterministic word-boundary truncate to 1500 (L3)
- Ensures forward progress — L3 is pure string op, cannot fail
- Feature flag: `LCM_ESCALATION_ENABLED`

**Expected impact:** Robustness; prevents rare runaway-summary blow-outs.

### T4.8 — Drill-down operator routes

**Source:** hermes-lcm (lcm_grep, lcm_describe, lcm_expand)

**Problem solved:** When debugging "why did character forget X", operators
have no way to inspect compacted context. Zero visibility into the DAG.

**Deliverables:**
- New routes under `ops.ts`:
  - `GET /api/ops/sessions/:id/context/overview` — DAG shape (depth
    distribution, node count, fresh tail size)
  - `GET /api/ops/sessions/:id/context/grep?q=...` — FTS over summaries +
    raw messages
  - `GET /api/ops/sessions/:id/context/node/:nodeId` — full node content +
    source message refs
- Admin-only (require `userRole = 'admin'`)
- Operator UI: new page `/ops/sessions/[id]/context` in web app (admin-only)

**Expected impact:** Team debug velocity up; catches bugs that users otherwise
just describe as "character forgot".

### T4.9 — Temporal fact graph

**Source:** MindBank (temporal versioning, valid_from/valid_to chains)

**Problem solved:** `character_dynamic_states` is single-row per
(session_id, character_id) — no history. We lose the arc: "Lysandra trust
went from 20→45→30→60 over 50 turns".

**Deliverables:**

```sql
-- packages/server/drizzle/0012_character_facts.sql
CREATE TABLE character_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,       -- e.g. 'Lysandra', 'user', 'room'
  predicate TEXT NOT NULL,     -- e.g. 'trust_toward_user', 'mood', 'location'
  object TEXT NOT NULL,        -- e.g. '45', 'melancholic', 'library'
  confidence REAL DEFAULT 1.0,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to TIMESTAMPTZ,        -- NULL = currently valid
  version_of UUID REFERENCES character_facts(id),  -- chain to previous version
  source_message_id UUID REFERENCES chat_messages(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON character_facts (session_id, subject, predicate) WHERE valid_to IS NULL;
CREATE INDEX ON character_facts (session_id, created_at DESC);
```

- New service `character-facts.ts`:
  - `assertFact(sessionId, subject, predicate, object, sourceMessageId)` —
    if same (subject, predicate) with different object exists as valid_to=NULL,
    close it (set valid_to=now()), create new one with version_of pointing to old
  - `currentFacts(sessionId)` — returns all facts where valid_to IS NULL
  - `factTimeline(sessionId, subject, predicate)` — full history
- Wire in `session-meta-extractor.ts`: extracted state changes become fact
  assertions
- Feature flag: `CHARACTER_FACTS_GRAPH_ENABLED`

**Expected impact:** Enables arc-based features later (relationship trajectory
visualization, "first time X happened" recall, conflict detection).

### T4.10 — Regression benchmark suite

**Source:** MemPalace (LongMemEval methodology, reproducible per-question)

**Problem solved:** We have 9-scenario validator replay harness, but NO
benchmark for memory recall quality. Regressions in retrieval can ship
unnoticed.

**Deliverables:**
- New directory `packages/server/benchmarks/`
- `longmemeval-style.ts`: 100 hand-crafted Q&A pairs based on planted
  conversation history
  - Insert 500-turn synthetic conversation with known facts scattered
  - For each question, measure whether correct fact is in top-5 retrieved
    memories + compacted nodes
- Script `pnpm --filter @neigo/server bench:memory`
- CI gate: fail if recall@5 drops > 5% from previous commit baseline

**Expected impact:** Prevents silent regressions as the memory layer evolves.

### Dependency graph

```
T4.1 Mistakes ──┐
                ├─── (independent, ship parallel)
T4.2 Hybrid RRF ┤
T4.3 Diary ─────┘

T4.4 D1 Condense ── depends on → T3.10 (already done)
T4.5 Multi-factor ── depends on → T4.2 (access_count bumped by retriever)
T4.6 Snapshot ── depends on → T4.1 + T4.2 + T4.3 + T4.4 (aggregates all)

T4.7 Escalation ── depends on → T3.10 (modifies summarizeChunk)
T4.8 Drill-down UI ── depends on → T4.4 (needs DAG to be meaningful)

T4.9 Fact graph ── independent (can ship anytime)
T4.10 Benchmark ── depends on → T4.2 + T4.4 minimum (to be meaningful)
```

### Suggested sequencing (shipping milestones)

**M1 — Memory Quality (ship together):** T4.1 + T4.2 + T4.3
Highest ROI, fully independent, max impact on the two pain points from
Section 5 (memory hallucination, character consistency).

**M2 — Context Scale:** T4.4 + T4.7
Unlocks 500-turn sessions; ships after M1 stabilizes.

**M3 — Retrieval Intelligence:** T4.5 + T4.6
Requires M1 data (access counts, diary, mistakes) to be meaningful.

**M4 — Observability:** T4.8
Ship once DAG has real data to inspect (after M2).

**M5 — Arc Features:** T4.9
Unlocks future UX (relationship timelines, etc).

**M6 — Quality Gate:** T4.10
Ship last as institutional safety net.

### Total budget estimate

- New tables: 4 (`session_mistakes`, `character_diary`, `character_facts`,
  columns added to `memories`)
- New migrations: 4 (0009–0012)
- New services: 4 (`mistakes-registry.ts`, `character-diary.ts`,
  `character-facts.ts`, extend `memory-retriever.ts` + `context-compaction.ts`)
- New routes: ~5 (ops drill-down endpoints)
- New feature flags: 9 (one per task)
- Extra LLM calls per turn: 0 in hot path (all fire-and-forget); +1 every 10
  turns for diary
- Extra DB queries per turn: +1 for mistakes lookup, +1 for diary fetch
  (both indexed, <5ms each)

### Rollout strategy

1. Phase each Milestone behind a single top-level flag
   (`MEMORY_OVERHAUL_PHASE=m1|m2|m3|...`)
2. Shadow-write data from new subsystems for 1 week before reading
3. A/B test prompt injection: 50% of sessions get new memory block, 50% don't,
   measure validator retry rate as proxy for consistency
4. Promote to default only after benchmark recall@5 stays flat or improves

### What this explicitly is NOT

- Not a rewrite. Existing memory/retrieval code stays wired.
- Not a dependency add. Zero new runtime packages; all in-TS on existing stack.
- Not a prompt overhaul. System prompt gets 3 new optional blocks (mistakes,
  diary reflections, compacted context) — rest unchanged.
- Not a schema breaking change. All additions; no columns removed, no FKs
  altered. Existing reads keep working if flags disabled.
