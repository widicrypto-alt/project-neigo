# PLANVNv1 — VN Presentation System (Kinetic Launch)

> **Version:** v1 (Apr 23 2026) · **Author:** architect pass · **Scope lock:**
> aligned with [PLANDESIGNv1.md](PLANDESIGNv1.md) §0 (kinetic-only launch, bundled assets, VN≠Threads, Studio mobile read-only) and [BETA_FOCUS_CONTRACT_v1.md](BETA_FOCUS_CONTRACT_v1.md) (no TTS / no audio, visual presence only).
>
> **Reading order:** this doc replaces the scattered VN notes in PLANBv2 / PLANBv7 / REDESIGNv2 with a single *executable* VN plan anchored to the code we actually have. Update as an increment by adding `PLANVNv2.md`; never silently mutate a locked version.
>
> **Head migration at time of writing:** `0053_related_entities_mv.sql`. Any schema in this doc assumes `0054_queued_for_publish.sql` landed and starts new migrations at **`0055_*`**.

---

## Legend

- `⛔` non-goal / removed from scope
- `🅼` MVP slice — what ships for beta VN launch
- `🅢` scalable slice — v2+ once kinetic is validated
- `🅞` OPTIONAL — explicit opt-in with justification
- File refs link to real files; code not yet written is called out as `TODO`.

---

## A. App Understanding

### A.1 What Project Neigo is

A web-first **Roleplay + Visual Novel** platform, Indonesia-first UX, mobile-first shell.
Not a companion app; not a chat assistant. References locked in [docs/PLANDESIGNv1.md](PLANDESIGNv1.md) §0: IsekaiZero, JanitorAI, Letterboxd, Ren'Py. **Stories are the product, characters are the actors, scenes are the entry point.**

### A.2 What the codebase is actually doing

1. **Chat/Roleplay orchestrator is the matured core.** Multi-pass pipeline in [packages/server/src/services/orchestrator.ts](../packages/server/src/services/orchestrator.ts) with five ROLEPLAY validators (repetition, continuity, refusal, tone-drift, format-drift), `[STATE:]` / `[TRACK:]` tag extraction, `session.metadata.sceneState`, `characterDynamicStates`, retry chain with correction messages, auto-continue, and shadow/live agent pipeline.
2. **Stories are published content.** [packages/server/src/routes/stories.ts](../packages/server/src/routes/stories.ts) drives CRUD + scenarios + cast + `/start` seeder + social rails. Detail projection via [services/detail-extensions.ts](../packages/server/src/services/detail-extensions.ts) (`computeVnReadiness`, `computeStoryTokenCache`).
3. **VN presentation is currently *chat-chrome*.** `/stories/:id/play` is a redirect stub; scenarios seed a real `chat_sessions` row through [services/story-session-seeder.ts](../packages/server/src/services/story-session-seeder.ts). VN mode = `<html data-vn="true">` CSS flip ([components/stories/VNProjectionToggle.tsx](../packages/web/src/components/stories/VNProjectionToggle.tsx)) over [app/chat/[sessionId]/page.tsx](../packages/web/src/app/chat/%5BsessionId%5D/page.tsx).
4. **Visual presence is shipped**, single-figure only: [lib/presence.ts](../packages/web/src/lib/presence.ts) reducer + orchestrator, [WaifuSprite.tsx](../packages/web/src/components/WaifuSprite.tsx) rendering a 4×3 sheet with per-expression framing from on-disk `framing.json` at [public/sprites/](../packages/web/public/sprites/). Contract frozen in [PRESENCE_CONTRACT_v1.md](PRESENCE_CONTRACT_v1.md).
5. **Scene environment is schema-ready, art-light.** [components/chat/SceneBackground.tsx](../packages/web/src/components/chat/SceneBackground.tsx) renders CSS gradients keyed off `sceneState.location`; [WeatherOverlay.tsx](../packages/web/src/components/chat/WeatherOverlay.tsx) handles rain/snow/fog/night/storm/sunset. No real background art shipped despite PLANDESIGNv1 §0 row 4 commitment.
6. **Asset pipeline is production-grade.** R2 presigned PUT + sharp EXIF-strip + webp thumb/md/lg + CF moderation (see [services/r2-storage.ts](../packages/server/src/services/r2-storage.ts), [image-variants.ts](../packages/server/src/services/image-variants.ts), [image-moderation.ts](../packages/server/src/services/image-moderation.ts)). Character gallery (`character_images`) already supports `kind='expression'` — unused by FE.

### A.3 Real product direction

Per [PLANDESIGNv1.md](PLANDESIGNv1.md) §0 locked rows:
- **VN at launch:** linear (kinetic) only. No branching editor, choices park to v2.
- **Assets:** shipped starter library (bundled BG/motifs + deterministic fallback cover). User uploads deferred.
- **Separation:** VN runs live in `story_runs`; they **do not** enter Threads (`chat_sessions`). The current seeder *bridges* them — that bridge is a beta compromise that must be honored visually (VN surface ≠ chat surface) even though the underlying session is a `chat_sessions` row.
- **Mobile-first.** Forge (authoring) is desktop-only; Studio on mobile is read-only.
- **English-first UI.** Persona-language override is output-only.

The VN presentation system we design here must work inside those rails — not fight them.

---

## B. What Matters for This VN (relevance filter applied)

| System | Relevant? | Why |
|---|---|---|
| **Background system** | ✅ core | `storyScenes.backgroundImageUrl` exists, `SceneBackground` only renders gradient. Closing this gap is the single highest-impact VN visual lift. |
| **Character sprite system** | ✅ core | `WaifuSprite` renders one figure; `storyScenes.characterCues[{position, expression}]` already models a multi-slot stage but FE ignores it. Multi-slot + expression mapping is the second-highest lift. |
| **Scene State** | ✅ core, mostly shipped | `[STATE:]` parser already grounds location/weather/time; we extend it to drive BG + sprite pose selection deterministically instead of only CSS palette. |
| **Scene transition** | ✅ core | Linear kinetic VN requires explicit scene boundaries. Currently there is no "next scene" beat inside a seeded chat; `storyScenes.nextSceneId` chain is dormant. Needed to make kinetic feel like VN and not a chat tinted blue. |
| **Choice mode (hybrid)** | 🅞 OPTIONAL v2 | Schema supports it (`choices`, `sceneType='choice'\|'ending'`). Launch is kinetic; revisit only when kinetic is validated. |
| **VN authoring (Studio)** | ✅ supporting | You cannot ship a VN runtime without a writable authoring path. Current Forge is form + scenario list; it must be minimally extended with BG/cue/expression inputs. |
| **Shared VN DTOs** | ✅ infra | `Scenario`/`Scene`/`Cue` types are re-declared ad-hoc in both FE and server (see Tech-debt §E.2). Must live in `@neigo/shared`. |
| **Audio (BGM/SFX)** | ⛔ parked | [BETA_FOCUS_CONTRACT_v1.md](BETA_FOCUS_CONTRACT_v1.md) §4.G says no TTS / no audio stack. `bgmUrl` column stays dormant. |
| **Branching graph editor** | ⛔ parked | PLANDESIGNv1 §0 row 3. |
| **History log / backlog pane** | 🅞 OPTIONAL | Useful VN UX, but duplicates the chat transcript we already render. Defer unless projection diverges enough that transcript becomes unreadable. |
| **Save slots** | ⛔ mostly irrelevant | Kinetic VN + autosave via `story_runs.currentSceneId` is already the save. Manual "Save 1/2/3" is non-goal. |
| **Auto-advance / skip** | 🅞 OPTIONAL v2 | Non-trivial with streamed LLM scenes; defer. |
| **Name input / POV customization beyond `playAsCharacterId`** | ⛔ | Already modeled by personas + `stories.playAsCharacterId`. |
| **Sprite animation (blink, lip-flap)** | ⛔ | Cost vs payoff is terrible against the presence mood crossfade we already ship. |

---

## C. Deep Brainstorm by System

All systems assume the **Kinetic VN invariants**:
1. A VN session is a `chat_sessions` row *marked* as VN by `metadata.storyId` *and* `metadata.vnMode === 'kinetic'` (new flag — currently implicit via `VNProjectionToggle` localStorage).
2. A VN "scene" is a *scene-state window* inside that session, bounded by the orchestrator emitting `[SCENE_ADVANCE]` tokens or the author advancing through a pre-authored `storyScenes.nextSceneId` chain.
3. The presentation layer subscribes to two signals: **authored scene** (from the seeded scenario / scene chain) and **live scene state** (from `[STATE:]`). Authored data is the ground truth for cast & background; live state is additive.

---

### C.1 Background System

**Goal.** Render a per-scene background image (with graceful CSS-gradient fallback) that crossfades on scene advance and tints in response to weather/time-of-day.

**Recommended design.**

- **Source of truth order (first non-empty wins):**
  1. `storyScenes.backgroundImageUrl` for the current authored scene.
  2. A deterministic bundled slug resolved from `sceneState.location` against a bundled library (`packages/web/public/vn/bg/<slug>.webp` + `<slug>@2x.webp`).
  3. Existing CSS gradient palette from `SceneBackground` (today's behavior — kept as final fallback).
- **Presentation layer:** a single `<VNBackdrop />` component replacing the current `SceneBackground` when `data-vn=true` is set.
  - Two-layer crossfade (`current` / `next`) with 320ms transform-free opacity transition (budget-friendly on mid-tier Android).
  - Optional `<WeatherOverlay>` stays mounted on top; no change needed.
  - Optional vignette + top/bottom gradient mask so white-ish backgrounds don't kill the text box contrast.
- **Bundled starter library.** PLANDESIGNv1 §0 row 4 already committed to this.
  - Seed set ≈ **12 slugs** sized for coverage of the demo stories ([seed-demo-content.ts](../packages/server/src/db/seed-demo-content.ts)): `cafe-day`, `cafe-night`, `office-day`, `library-dusk`, `apartment-night`, `festival-evening`, `station-day`, `bedroom-night`, `classroom-day`, `park-dusk`, `street-rain`, `generic-dim`.
  - Ship as webp via [sharp image-variants](../packages/server/src/services/image-variants.ts) preset (same thumb/md/lg pipeline — we reuse it by preprocessing offline so the FE pulls from `/vn/bg/…` static path, not R2).
  - Enforce the existing sprite-style budget: ≤ **180 KB lg** per background (cap via [ops/scripts/sprite-budget.sh](../ops/scripts/sprite-budget.sh) extended with a `bg:budget` mode).

**Data model concept.**

- No new column required for 🅼 MVP (existing `storyScenes.backgroundImageUrl` is enough).
- New shared enum in `@neigo/shared`: `BUNDLED_BG_SLUGS` (frozen union of the 12 slugs) + a resolver `resolveBackground({ authored, location }) → { url, kind: 'authored'|'bundled'|'gradient' }`.
- Scene-state extension (🅢): `sceneState.bgSlug` can be *promoted* by the scene-state parser if the model emits `[STATE: bg=cafe-night]`. Whitelist against `BUNDLED_BG_SLUGS` to stop hallucinated slugs.

**Implementation notes.**

- Create `packages/web/src/components/vn/VNBackdrop.tsx`. Gate render on `data-vn`.
- Move the gradient palette out of `SceneBackground.tsx` into a small pure resolver in `@neigo/shared/vn/background-palette.ts`.
- Next.js `<Image>` is off the table for R2 URLs (bypassed today); keep `<img>` with `loading="eager"` for the *current* BG and `loading="lazy"` for prefetch candidates.
- **Prefetch pattern:** when the orchestrator streams `[STATE: location=...]`, hit a `<link rel="prefetch">` for the resolved URL before the crossfade fires.

**Risks / tradeoffs.**

- LCP regression: mobile LCP target is tight. Mitigation — only the *authored opening* BG is eager; mid-scene advances are crossfade from cache.
- Art licensing: bundled library must be either self-authored, CC0, or commissioned. Do NOT pull from random sources.
- Whitelisted slug drift: if the model emits `bg=coffee_shop` (not a slug), resolver must fall back — log a `scene_state_unknown_bg` analytics event so we curate.

**MVP vs scalable.**

- 🅼 **MVP:** `<VNBackdrop>` + 12 bundled BGs + `stories_scenes.backgroundImageUrl` consumed + crossfade + existing gradient fallback. No `[STATE: bg=]` extension yet.
- 🅢 **Scalable:** author-uploaded BGs via the existing R2 gallery pipeline (reuse `character_images`-like table → rename or add `story_images`), moderation-gated; `sceneState.bgSlug` promoted by parser; 3× DPR variants; day/night dual-variants per slug.

---

### C.2 Character Sprite System

**Goal.** Render 1–3 character sprites on a staged layout (`left`/`center`/`right`), with per-character expression resolved from authored cue OR live mood.

**Recommended design.**

- **Keep the existing 4×3 spritesheet convention** (`public/sprites/<slug>/sheet.webp` + `framing.json`). It already pairs to the presence activities contract — don't break it for a beta rewrite.
- **New component `<VNStage />`** in `packages/web/src/components/vn/VNStage.tsx` that owns up to 3 slots (`left`, `center`, `right`). Each slot renders a `<WaifuSprite>` keyed by `characterId + expression`.
- **Cue resolution order (first non-empty wins) for slot `S`, character `C`:**
  1. Authored scene cue: `storyScenes.characterCues.find(c => c.position === S)` — exposes `{characterId, expression}`.
  2. Session cast: if authored cue absent but `chat_sessions.castCharacterIds[i]` exists, place deterministically (primary → center, secondary → right, tertiary → left).
  3. Presence state: expression overridden by `presence.activity` mapping (idle → `neutral`, laughing → `happy`, etc. — mapping table lives next to the presence reducer).
- **Expression catalog.** Small fixed enum that both author (Forge) and runtime agree on:
  `neutral | happy | sad | angry | shy | surprised | thoughtful | smug | hurt | determined` (10 values).
  Mirrors and subsets `MoodKey` from [packages/shared/src/domain/mood.ts](../packages/shared/src/domain/mood.ts). Extend `moodMeta` or add `expressionMeta` — pick one; duplicating both is a trap.
- **Sprite→expression resolution:** reuse `framing.json` grid. Each expression gets one of the 12 cells; `framing.json` becomes the authoritative expression-map. Provide a per-character override file at `public/sprites/<slug>/expressions.json` that maps `expression → {row, col}`; fall back to a default map when absent.
- **Enter/exit animations.** Opacity + 12px Y translate, 260ms, respect `prefers-reduced-motion`. No bouncing, no parallax (budget & motion-sickness).

**Data model concept.**

```ts
// @neigo/shared/vn/cue.ts
export type VNSlot = 'left' | 'center' | 'right';
export const EXPRESSIONS = [
  'neutral','happy','sad','angry','shy','surprised','thoughtful','smug','hurt','determined'
] as const;
export type Expression = typeof EXPRESSIONS[number];

export interface VNCue {
  characterId: string;
  position: VNSlot;
  expression?: Expression;  // defaults to 'neutral'
  facing?: 'left' | 'right'; // optional mirror flag
}
```

Already partially in schema (`storyScenes.characterCues` jsonb L933 of [schema.ts](../packages/server/src/db/schema.ts)) — just needs a zod validator and a hoist to shared.

**Implementation notes.**

- The existing `SpritePanel` (right-aside lg+) and `WaifuStage` (mood aura) stay as-is for **classic chat**. VN stage is a *separate* component mounted only when `data-vn=true`.
- Multi-sprite → 3× the sheet bytes per scene. Enforce `sprites:budget:strict` (400 KB cap already in place via [ops/scripts/sprite-budget.sh](../ops/scripts/sprite-budget.sh)) across the *cast* of a single scene, not per character. Add a CI preflight that rejects scenarios whose cast sheets sum > 1.2 MB.
- `character_images.kind='expression'` schema slot (already present) becomes the **🅢 Scalable** override path: when a row exists, FE prefers it over the sheet frame. 🅼 MVP does NOT depend on this.
- POV handling: if `stories.playAsCharacterId === c.characterId` AND that character is in the cue list, hide the sprite in that slot (you don't see yourself). Already matches the POV-drift detector convention.

**Risks / tradeoffs.**

- **Sheet bloat.** 33 built-in characters × full expression coverage quickly breaks the 400 KB cap. Solve by splitting the 10-expression enum into **core-5** (`neutral, happy, sad, angry, shy`) that every sheet must ship, plus **extended-5** that are optional (resolver falls back to a core expression).
- **Expression drift via LLM.** Without a guard, the model can emit `[STATE: expression=blushing]`. Solution: sanitize in the scene-state parser against the enum; drop unknown values.
- **Layout collisions on small mobile.** At ≤ 360px width, render only the *center* slot; shift left/right to a faded background tier. No attempt at 3-figure staging under 640px.

**MVP vs scalable.**

- 🅼 **MVP:** `<VNStage>` with center + optional second slot; core-5 expressions only; authored cues consumed from `storyScenes.characterCues` + presence fallback. No `character_images.kind='expression'` consumption yet.
- 🅢 **Scalable:** 3-slot layout with mirror, extended-5 expressions, `character_images.kind='expression'` override, custom per-character sheet sizes, LLM-triggered expression changes mid-scene via `[STATE: expression_<slot>=happy]`.

---

### C.3 Scene State

**Goal.** Keep the already-shipped `[STATE:]` parser as the single authoritative runtime state, and extend it so it drives BG + sprite resolution without letting the model invent new data.

**Recommended design.**

- Current parser: [services/scene-state-parser.ts](../packages/server/src/services/scene-state-parser.ts) — stores `metadata.sceneState` (≤30 keys). Builder injects into prompts via `appendSceneState`. **Keep this architecture.** Do not add a parallel state store.
- **Introduce a typed VN-state slice** on top:

```ts
// @neigo/shared/vn/scene-state.ts
export interface VNSceneState {
  // already-tracked (keep)
  location?: string;
  weather?: 'clear'|'rain'|'snow'|'fog'|'storm'|'sunset'|'night';
  time_of_day?: 'dawn'|'morning'|'noon'|'afternoon'|'dusk'|'night'|'late_night';

  // new, whitelist-gated
  bg_slug?: BundledBgSlug;
  props?: string[];       // ≤ 8 short tokens
  mood_globally?: MoodKey;
}
```

- **Enforced whitelist in the parser.** Any key outside the schema is dropped. `bg_slug` is matched against `BUNDLED_BG_SLUGS`; mismatched → ignored + analytics `scene_state_unknown_bg`.
- **Authored scene state.** When a scenario opens, seed `metadata.sceneState` from `storyScenes.openingMd`-derived hints (author can explicitly set `bg_slug`, `time_of_day` via Forge inputs — see §C.6). The seeder [story-session-seeder.ts](../packages/server/src/services/story-session-seeder.ts) is the right place.

**Implementation notes.**

- Parser already max-30 keys. Add a second layer of validation: strip to VN schema before persisting when `metadata.vnMode === 'kinetic'` (don't lose general sceneState for classic chat).
- Builder: when in VN mode, prompt section should include `VN FACTS (stable unless scene advances): location=..., bg_slug=..., time_of_day=...` with stricter language than today's general sceneState section.

**Risks / tradeoffs.**

- Tension between "VN scene is authored" and "model may emit `[STATE:]`". Rule: authored fields are locked for the duration of the scene; model `[STATE:]` may only update `weather`, `mood_globally`, and `props`. Scene boundary (see §C.4) is the only place the full state may be replaced.

**MVP vs scalable.**

- 🅼 **MVP:** VN state slice with whitelist, authored seed fills `location` + `time_of_day` + `bg_slug`; model can only change weather/mood/props.
- 🅢 **Scalable:** author Forge inputs for full initial sceneState per scenario; deterministic BG prefetch on advance.

---

### C.4 Scene Transition

**Goal.** Make linear kinetic VNs actually *advance through scenes*. Today a seeded chat-chrome VN is a single running chat session; there is no visible scene boundary beyond the first scenario.

**Recommended design.**

- **Scene = prompt-windowed chunk with a start + end sentinel.**
- Two advancement triggers:
  1. **Authored (primary for kinetic).** Author links scenes via `storyScenes.nextSceneId` (column exists, dormant). Forge exposes a linear chain `[scene_1] → [scene_2] → [scene_end]`. Advance happens when the model emits `[SCENE_ADVANCE]` (new sentinel, whitelisted like `[STATE:]`) OR the user taps "→ Next Scene" button in the VN chrome.
  2. **Inline (for open-ended scenarios).** When `storyScenes.nextSceneId` is null, the scene is *terminal* and the session continues as free roleplay; no advance UI shown.
- **State on advance:**
  - Replace authored VN state slice (location, bg_slug, time_of_day) with the next scene's seed.
  - Append a synthetic system-role message: `SCENE CHANGE: <scene.title>\n<scene.openingNarration>` (not rendered as a bubble; stored in history for context).
  - Write `storyRuns.currentSceneId = next.id` (already a column).
  - Emit `session_events.event_type = 'scene_advance'` (reuse [0014_session_events.sql](../packages/server/drizzle/0014_session_events.sql) table).
- **Transition animation.** Full-screen dim (opacity 0 → 0.85 → 0 on a single `<div class="vn-transition">`), 420ms total. Cross-faded BG change happens under the dim. Respect `prefers-reduced-motion`: snap-cut, no dim.

**Data model concept.**

- Reuse `storyScenes.nextSceneId`, `storyScenes.openingNarration`, `storyScenes.sceneType` (`narration|dialogue|ending` — `choice` reserved for v2). No new column.
- Add to `VNSceneState`: `scene_index: number` (derived from `storyRuns.currentSceneId` position in the chain, cached in `session.metadata.scenarioIndex` — already live).

**Implementation notes.**

- New endpoint `POST /api/sessions/:id/scene/advance` → validates ownership, finds next `storyScenes.nextSceneId`, updates `story_runs.current_scene_id`, rewrites the VN slice of `metadata.sceneState`, appends the `SCENE CHANGE` system message, writes `session_events` row, returns the new scene payload. Lives in `packages/server/src/routes/sessions.ts` (alongside undo/branch/timeline).
- FE: in VN chrome, show `[→ Lanjut Scene]` / `[→ Next Scene]` button only when `currentScene.nextSceneId` is set AND the last assistant message has finished streaming. Re-use `StoryActionBar.tsx` layout (already there for LANJUT/ULANGI/HAPUS) but add an explicit `NextScene` action.
- The orchestrator's `[SCENE_ADVANCE]` sentinel: parse and strip identically to `[STATE:]`. If sentinel fires mid-stream, queue the advance to run after the current turn's retry chain + hygiene finishes — don't interrupt validators.

**Risks / tradeoffs.**

- Authors will misuse `nextSceneId` and build accidental loops. Server validator: reject `nextSceneId` cycles on save (DFS ≤ 64 nodes) in the `POST /api/stories/:id/scenarios` route.
- Ending detection. For kinetic, the last scene in the chain has `nextSceneId = null` AND `sceneType = 'ending'`. When reached, write `storyRuns.endingReached = endingSlug` and show a `The End` card. No credit roll, no ending gallery.
- Chat transcript will show every scene in one thread. This is acceptable in beta (VN = chat with chrome); backlog the split when we actually do dedicated VN environment.

**MVP vs scalable.**

- 🅼 **MVP:** authored linear chain, user-tap advance, BG+cast re-seed on advance, `SCENE CHANGE` system message, single ending slug.
- 🅢 **Scalable:** model-triggered `[SCENE_ADVANCE]`, multiple ending slugs, ending gallery, "return to previous scene" debug tool for authors.

---

### C.5 Choice Mode (Hybrid) — 🅞 OPTIONAL, v2 only

**Why optional.** PLANDESIGNv1 §0 row 3 locks launch to kinetic. Schema is ready (`storyScenes.choices`, `sceneType='choice'`), so this is a *forward-compatible* design — we must not ship something that blocks it later.

**Goal (when activated).** Hybrid between Ren'Py-style choice buttons and inline LLM-driven forks, so authors don't have to hand-author every branch.

**Recommended design (forward-compat only).**

- Author chooses choice *presentation* per scene: `inline_cyoa` (uses existing `CyoaChips` component from `/chat/[sessionId]/_components/CyoaChips.tsx`) or `scene_fork` (hard author branch).
- `inline_cyoa` → LLM generates 2–4 chips at end of scene, tap seeds the next turn (this already exists for classic chat).
- `scene_fork` → `storyScenes.choices = [{label, nextSceneId}]`; tap advances via the same `/scene/advance` endpoint with an explicit target.

**Now (MVP).** Do nothing in the VN runtime. But ensure:
- `VNCue` / `VNSceneState` / `nextSceneId` invariants don't assume a linear-only world.
- FE action bar leaves a reserved slot for future `[Pilih cabang]` button.

---

### C.6 VN Authoring (Studio / Forge) — supporting system

**Goal.** Make kinetic VN authoring feasible without writing raw JSON.

**Current state.** [studio/stories/[id]/edit/page.tsx](../packages/web/src/app/studio/stories/%5Bid%5D/edit/page.tsx) + [components/studio/ScenarioListPanel.tsx](../packages/web/src/components/studio/ScenarioListPanel.tsx) + `CharacterLinker`, `VnReadinessMeter`. Fields exposed are scenario-tile-level (tileImageUrl, tileSubtitle, castSubset, personaPrompt, openingMd, openingInputHint). Scene-level VN fields (`backgroundImageUrl`, `characterCues`, `nextSceneId`, `openingNarration`) are **not** editable in Studio.

**Recommended design.**

- Extend the scenario edit form with a **VN subsection** (collapsed by default) that exposes:
  - `background` — select from bundled slugs (dropdown) or paste R2 URL; preview below.
  - `time_of_day` / `weather` — select.
  - `cues` — up to 3 slot rows, each `{character from cast, expression from enum}`. Reuse `CharacterLinker` shape.
  - `nextSceneId` — linear "next" picker against the same story's scenes; empty → terminal.
  - `sceneType` — `narration | dialogue | ending` (choice hidden until v2).
  - `endingSlug` — only when `sceneType='ending'`.
- Forge desktop-only per PLANDESIGNv1 §0 row 10 — mobile Studio remains read-only.

**Implementation notes.**

- `PATCH /api/stories/:id/scenarios/:scenarioId` already accepts arbitrary scenario patches; just extend the zod validator in [routes/stories.ts](../packages/server/src/routes/stories.ts) to include the new fields.
- `computeVnReadiness` in [detail-extensions.ts](../packages/server/src/services/detail-extensions.ts) should add **+5 points** for "authored BG" and **+5 points** for "cues defined", rebalancing off the existing 100. Re-expose in the readiness breakdown.
- New FE component: `components/studio/VnSceneAuthoringPanel.tsx`. Lives next to `ScenarioListPanel`.

**Risks.**

- Discoverability of the VN subsection. Hide behind `isAdvancedMode` until authors ask for it (already a story-level flag).
- `nextSceneId` picker cycles — same server-side DFS guard as §C.4.

**MVP vs scalable.**

- 🅼 **MVP:** BG select + cues + nextSceneId + sceneType in Forge. No bulk import.
- 🅢 **Scalable:** CSV/markdown import of scene chains, live preview of the VN stage inside Forge (mini `<VNBackdrop>` + `<VNStage>` preview), ending gallery authoring, publish-time validator.

---

## D. Add / Remove Recommendations

### D.1 Add

| Item | Scope | Why |
|---|---|---|
| `@neigo/shared/vn/*` module with `VNCue`, `Expression`, `VNSceneState`, `BUNDLED_BG_SLUGS`, `resolveBackground` | 🅼 | Kill the ad-hoc `Scenario` / `Scene` interfaces currently redeclared in [stories/[id]/scenarios/page.tsx](../packages/web/src/app/stories/%5Bid%5D/scenarios/page.tsx), [stories/[id]/page.tsx](../packages/web/src/app/stories/%5Bid%5D/page.tsx), [story-runner.ts](../packages/server/src/services/story-runner.ts). |
| `components/vn/VNBackdrop.tsx`, `components/vn/VNStage.tsx`, `components/vn/VNTransition.tsx` | 🅼 | VN chrome specifically separated from `chat/` to avoid regressing classic chat visuals. |
| Bundled BG library at `packages/web/public/vn/bg/*.webp` (12 slugs) + `sprites:budget` extended to BGs | 🅼 | Closes the PLANDESIGNv1 §0 row 4 asset commitment. |
| `POST /api/sessions/:id/scene/advance` | 🅼 | Prerequisite for §C.4. |
| Migration `0055_vn_scene_advance_events.sql` — nothing to add structurally, but record `'scene_advance'` as an allowed `session_events.event_type` | 🅼 | Check if a CHECK constraint exists on `event_type` — if yes, extend; if not, this is a no-op. |
| `PATCH /api/stories/:id/scenarios/:scenarioId` zod extension for BG / cues / nextSceneId | 🅼 | Forge authoring. |
| Cycle-guard validator for `nextSceneId` | 🅼 | Prevent authored loops. |
| `characters.sprite_sheet_url` as a real column (migrated from `persona.spriteSheetUrl`) | 🅢 | Removes jsonb indirection; allows future per-character image pipelines without touching persona. |
| `character_images.kind='expression'` FE consumer as sprite override | 🅢 | Unblocks user-uploaded sprite expressions for v2. |

### D.2 Remove / explicitly not doing

| Item | Why |
|---|---|
| Reviving the dormant kinetic `/stories/:id/play` runner as a separate route | Violates PLANBv2 "VN is chat-chrome at beta" decision (see [BACKLOG.md](BACKLOG.md) B1.1). Future "dedicated VN environment" will be a v2 call, not a simultaneous second code path. |
| `storyScenes.bgmUrl` player | Beta contract forbids audio. Leave the column — don't wire it. |
| Save slots UI (1/2/3 manual saves) | `story_runs.currentSceneId` is the save. Multiple slots per user per story is non-goal for kinetic. |
| Auto-advance / skip read / text-speed slider | Streamed LLM scenes do not have a fixed duration — auto-advance would fight the stream. Defer permanently unless we switch to pre-rendered scenes. |
| Branching graph editor in Forge | Explicitly v2+ per §0. |
| Multi-sprite mood animation (blink, lip-flap, sway) | Budget & motion-sickness risk. Presence mood aura is the visual stand-in. |
| Audio ducking / BGM crossfade infra | Audio is out of scope. |

### D.3 Defer

| Item | Trigger to revisit |
|---|---|
| User-uploaded VN backgrounds via R2 | When bundled library is validated (≥ 2 beta weeks of usage + author feedback). |
| Expression override via `character_images.kind='expression'` | After MVP sprite stage ships; measure authors actually wanting it. |
| Choice mode (§C.5) | After kinetic retention is measured. |
| Dedicated `/vn/[runId]` cinema route (no chat chrome) | After chat-chrome VN shows a measurable UX ceiling (e.g. transcript readability complaints). |
| Studio desktop 3-pane Forge with live preview | Part of [BACKLOG.md](BACKLOG.md) B-DESIGN.E (already deferred to v2). |

---

## E. Production Readiness Gaps

Things that must exist before kinetic VN ships, not already covered above:

1. **Shared VN DTOs.** Two FE pages + two services declare `Scenario` separately. Centralize before any new VN code ships, or the gap compounds. Concrete move: hoist [stories/[id]/scenarios/page.tsx](../packages/web/src/app/stories/%5Bid%5D/scenarios/page.tsx) `Scenario` interface → `@neigo/shared/vn/scenario.ts`, then consume server-side in [story-session-seeder.ts](../packages/server/src/services/story-session-seeder.ts).
2. **`[SCENE_ADVANCE]` parser + orchestrator integration.** Mirror the `[STATE:]` parser architecture; do not reuse the same regex. Add to the orchestrator's post-stream hygiene *after* validators — never before retries.
3. **Server-side cycle guard on `nextSceneId`.** A single DFS on save prevents authored infinite loops that would otherwise wedge the `/scene/advance` endpoint.
4. **Readiness heuristic rebalance.** Current `computeVnReadiness` ignores VN visual authoring. Without an update, fully-authored kinetic stories look no readier than pure chat-seed stories.
5. **Budget CI for VN BG + cast sheets.** Extend [ops/scripts/sprite-budget.sh](../ops/scripts/sprite-budget.sh) to cap per-scene cast+BG payload (proposed: 600 KB per scene, strict mode fails CI).
6. **Reduced-motion + low-data respect.** `VNBackdrop` / `VNStage` / `VNTransition` must read `prefers-reduced-motion` and `navigator.connection.saveData`. Without this, mobile-first contract regresses.
7. **English-first copy audit on VN chrome.** `StoryActionBar` tooltips are still Indonesian (see [BACKLOG.md](BACKLOG.md) Tech-debt #6). New VN components must ship EN copy + `next-intl` keys.
8. **i18n keys for VN.** Add a `vn.*` namespace to [packages/web/messages/en.json](../packages/web/messages/en.json) and `id.json` for: `nextScene`, `theEnd`, `sceneChange`, `backgroundUnknown`, `expressionUnknown`.
9. **Analytics events.** Add `vn_scene_advance`, `vn_ending_reached`, `scene_state_unknown_bg`, `vn_mode_toggle` to [packages/web/src/lib/analytics.ts](../packages/web/src/lib/analytics.ts). These are the only way we measure if kinetic is working.
10. **Docs.** This file. Every VN implementation increment bumps `PLANVNvN.md` — don't mutate v1.

---

## F. Final Recommended Direction — Prioritized Roadmap

Ordered by **impact × feasibility**. Each ticket should land as a BACKLOG item (see new VN section appended to [BACKLOG.md](BACKLOG.md)).

### Pass 1 — Foundations (no user-visible VN change yet)

1. **[V1] Shared VN DTOs.** Hoist `VNCue`, `Expression`, `VNSceneState`, `Scenario`, `StorySceneDTO` into `@neigo/shared/vn/*`. Replace ad-hoc declarations. Ship `BUNDLED_BG_SLUGS` enum.
2. **[V2] VN flag on session metadata.** Promote `metadata.vnMode: 'kinetic' | null`. Set by `story-session-seeder.ts` when a scenario starts; consumed by builder + FE. Stops relying on localStorage `neigo.vn-mode` as a mode switch.
3. **[V3] Bundled BG library.** Ship 12 slugs to `packages/web/public/vn/bg/`. Extend `sprites-budget.sh` → `vn-assets-budget.sh`. CI gate.

### Pass 2 — Runtime visuals (the actual VN feel)

4. **[V4] `VNBackdrop` component.** Consume `storyScenes.backgroundImageUrl` → bundled slug → gradient. Replace `SceneBackground` *only when* `data-vn=true`.
5. **[V5] `VNStage` + core-5 expressions.** Up to 2 slots (MVP), authored cues consumed, presence fallback. Respect POV hide rule.
6. **[V6] `VNTransition` component + reduced-motion respect.**

### Pass 3 — Scene boundaries

7. **[V7] `[SCENE_ADVANCE]` parser + orchestrator post-stream integration.**
8. **[V8] `POST /api/sessions/:id/scene/advance` + `session_events` row + `storyRuns.currentSceneId` update.**
9. **[V9] FE "Next Scene" action in VN chrome** (extends `StoryActionBar.tsx`).

### Pass 4 — Authoring

10. **[V10] `VnSceneAuthoringPanel`** in Forge. BG / cues / nextSceneId / sceneType. `nextSceneId` cycle guard server-side.
11. **[V11] `computeVnReadiness` rebalance** to credit VN visual authoring.

### Pass 5 — Polish

12. **[V12] Analytics coverage + copy audit (EN-first)** on all VN components.
13. **[V13] Prefetch strategy for next-scene BG** (`<link rel="prefetch">` on `[STATE: location=]` emit).

### Parked — revisit triggers locked

- **[V-P1] User-uploaded BGs** — after Pass 5 ships + 2 weeks retention.
- **[V-P2] Expression override via `character_images.kind='expression'`** — after author demand signal.
- **[V-P3] Choice mode (§C.5).** — after retention validation.
- **[V-P4] Dedicated `/vn/[runId]` cinema route.** — after chat-chrome UX ceiling is measured.
- **[V-P5] Branching Forge editor.** — v2+.

---

## G. Uncertainties / open questions (non-blocking)

- **`session_events.event_type` constraint shape.** Unverified whether this is an enum/check constraint or a free string. If constrained, V8 needs a migration to allow `'scene_advance'`. Check [drizzle/0014_session_events.sql](../packages/server/drizzle/0014_session_events.sql) before writing V8.
- **Next Scene button vs model `[SCENE_ADVANCE]` priority.** If both fire in the same turn, the *user* tap should win — but we haven't decided whether model-initiated advance is enabled at MVP at all. Recommend: disable at MVP, ship user-tap only. Keep parser for later.
- **Mobile cast staging under 360px.** Current proposal: collapse to center slot. Unresolved: do we gray-out the left/right cue data or re-render as a mini-chip strip? Ship center-only for MVP, revisit on real device telemetry.
- **Sprite sheet bundling vs lazy-load for large casts.** Current per-scene cast is ≤ 3 characters; budget holds. A multi-ending story with 8+ distinct characters across scenes may break the cold-start budget. Defer solution until a real case appears.

---

## H. How to use this doc

- Treat §C as the normative spec for each VN system. If a pass's code diverges from §C, update §C in-place (still v1) **only if** the change is within one locked invariant (e.g. renaming a component); otherwise open `PLANVNv2.md`.
- §F is the ordering contract with [BACKLOG.md](BACKLOG.md). Every V{N} ticket lands in BACKLOG under the new VN section and references this doc.
- Every implementation increment must:
  1. Update the matching VN ticket in BACKLOG.
  2. Add the appropriate analytics event (§E.9) if user-visible.
  3. Update `computeVnReadiness` only when adding scoring inputs.
  4. Run `pnpm -r typecheck` + `pnpm quality:ci` + `pnpm sprites:budget:strict` (extended) before merging.

---

*End of PLANVNv1.*
