# PLANVNv2 — VN Kinetic MVP: Refined Build Plan

> ✅ **STATUS: ALL 8 STEPS SHIPPED (apr 2026).** BV1–BV8 confirmed live in code. This doc is now an execution log. For open VN work see [BACKLOG.md](BACKLOG.md) "Parked" section (BV-P1 onward).

> **Version:** v2 (Apr 23 2026) · **Supersedes:** PLANVNv1 §F and the BV1–BV13 BACKLOG section.
> PLANVNv1 §A–§E remain the design reference. This doc is the *build* plan only — no new design decisions.
>
> **What changed:** a code audit revealed PLANVNv1's execution plan had 13 tickets, 6 new files, 2 new endpoints, and a new shared-package module. After grounding against the actual running code, the same outcome needs **8 steps, 0 new files, 0 new endpoints, 0 new migrations.**
>
> **Head migration:** `0054_queued_for_publish.sql`. No new migrations needed for MVP.

---

## Key Findings (vs PLANVNv1 assumptions)

| PLANVNv1 claim | Code reality |
|---|---|
| `storyScenes.backgroundImageUrl` not consumed by FE | `startStorySession` already writes `chat_sessions.scene_card.background = scenario.backgroundImageUrl`. Data is in DB. `SceneBackground` just never reads it. |
| New `POST /api/sessions/:id/scene/advance` endpoint needed | `POST /api/runs/:runId/advance` exists in `routes/stories.ts` L956. Handles `storyRuns.currentSceneId`, optimistic lock, ending detection, `endingReached`. Returns full `ScenePayload` including `backgroundImageUrl`, `characterCues`, `nextSceneId`. |
| `session_events.event_type` has a CHECK constraint → migration needed | `varchar(30)` with no constraint. Zero migration needed. |
| `mapScene` in `story-runner.ts` doesn't return VN fields | It already maps `backgroundImageUrl`, `characterCues`, `openingNarration`, `nextSceneId`, `sceneType`, `endingSlug`, `choices`. |
| `@neigo/shared/vn/*` DTO package needed | No third consumer exists. Premature. |
| `BUNDLED_BG_SLUGS` 12-slug English enum would improve BG system | `SceneBackground` already fuzzy-matches bilingual location tokens (`kamar`, `kafe`, `taman`, `rumahsakit`, …). An English-only slug enum is a regression. |
| 10-expression VN enum needed; all 33 sprite sheets need re-authoring | `framing.json` maps *presence activities*, not emotions. Zero sheets support expression-keyed frames. |
| `[SCENE_ADVANCE]` sentinel parser needed | PLANVNv1 §G already deferred this. User-tap only at MVP. |
| Full-screen dim `<VNTransition>` component needed | CSS `transition-opacity` on the existing `SceneBackground` layer *is* the transition. |
| Multi-slot `<VNStage>` component needed | Single slot already works via `SpritePanel`. Multi-slot is art debt and presence coordination debt at this stage. |
| `metadata.vnMode: 'kinetic'` flag needed | `metadata.storyId` is sufficient discriminator. Adding a parallel flag has no consumers. |

**Net result.** 10 of the 13 BV tickets in PLANVNv1 BACKLOG are either already done, duplicates of existing infra, or premature abstractions. The 3 real gaps are: (1) `SceneBackground` doesn't read `sceneCard.background`, (2) `advanceRun` doesn't patch `chat_sessions` after advancing, (3) no "Next scene" button in the VN chrome.

---

## MVP Architecture

### Data flow: scenario → session → render

```
Author in Forge
  └─ PATCH /api/stories/:id/scenarios/:sid
       { backgroundImageUrl, nextSceneId, sceneType, endingSlug }
       ─→ story_scenes row (all columns already exist)

User picks scenario tile
  └─ POST /api/stories/:id/start  [story-session-seeder.ts]
       ─→ chat_sessions.scene_card = {
              background: scenario.backgroundImageUrl,  ← ALREADY WRITTEN
              location:   null,                          ← seed from openingNarration
              weather:    null
          }
       ─→ chat_sessions.metadata = { storyId, storyRunId,
              scenarioId, personaPrompt, ... }
       ─→ story_runs.current_scene_id = scenarioId
       ─→ Narrator opening message (already inserted)

FE: /chat/[sessionId]/page.tsx
  └─ reads session.sceneCard.background
       ─→ passes to SceneBackground as backgroundUrl prop   ← EXTEND
       ─→ SceneBackground: <img> branch | gradient fallback ← EXTEND
  └─ reads session.sceneCard (castSubset/characterCues)
       ─→ SpritePanel resolves primary char              ← EXTEND (minor)
  └─ reads session.metadata.scene.nextSceneId
       ─→ StoryActionBar shows "Next scene" button       ← NEW (one button)

User taps "Next scene"
  └─ POST /api/runs/:runId/advance { fromSceneId, elapsedSeconds }
       ─→ advanceRun() [story-runner.ts — already complete]
            - updates story_runs.current_scene_id = next.id
            - sets completedAt + endingReached on endings
            - returns { run, nextScene: ScenePayload, completed }
       ─→ EXTEND: also patches chat_sessions.scene_card  ← EXTEND
            { background: next.backgroundImageUrl, location: ... }
       ─→ EXTEND: appends NARRATOR scene-change message   ← EXTEND
       ─→ EXTEND: inserts session_events scene_advance    ← EXTEND

FE receives advance response
  └─ invalidates ['session', id] query → SceneBackground crossfades
  └─ if completed: toast + route to /stories/:id?ending=<slug>
```

### What is reused (zero change)

- `chat_sessions` + `storyRuns` schema — all columns needed already exist
- Orchestrator, all 5 validators, `applyHygiene`, `appendSceneState`
- `scene-state-parser`, `[STATE:]` / `[TRACK:]` pipeline
- `WaifuSprite` + `SpritePanel` + `WaifuStage` + `WeatherOverlay`
- `StoryActionBar`, `VNProjectionToggle`, `ScenarioPaginationChip`
- `advanceRun` logic in `story-runner.ts` (fully handles run state)
- `mapScene` in `story-runner.ts` (already returns all VN fields)
- `listScenarios` in `story-session-seeder.ts`
- `session_events` table (no constraint on event_type)

### What is extended (existing files only)

- `story-session-seeder.ts` — extract `seedSceneIntoSession()` helper; seed `sceneState.location` on start
- `story-runner.ts` — `advanceRun` patches `chat_sessions.scene_card` + appends scene-change narrator message + writes `session_events`
- `routes/stories.ts` — zod validator for scenario PATCH gains 3 new fields; cycle guard on `nextSceneId` save
- `SceneBackground.tsx` — accept + render `backgroundUrl` prop; gradient is fallback
- `SpritePanel.tsx` — resolve primary char from `scene_card` cast before session cast; POV hide
- `StoryActionBar.tsx` — "Next scene" conditional button; EN copy pass
- `studio/stories/[id]/edit/page.tsx` — 3 new form fields
- `detail-extensions.ts` — `computeVnReadiness` +10 for scene chain
- `analytics.ts` — 2 new event names
- `messages/en.json` + `messages/id.json` — `vn.*` namespace keys

### Newly created

- **Zero new components**
- **Zero new routes**
- **Zero new migrations**
- One helper export in `story-session-seeder.ts`

---

## Execution Plan — 8 Steps

Steps are ordered by dependency. Steps 3/4 and 5 can run in parallel.

---

### Step 1 — Extract `seedSceneIntoSession` helper
**Goal.** Single function that writes `chat_sessions.scene_card` + `metadata.sceneState.location` from a `ScenarioRow`. Called on start and on advance. Eliminates the current gap where `sceneCard.location` is always null on start.

**File.** `packages/server/src/services/story-session-seeder.ts`

**What changes.**
- Extract from `startStorySession`: the `sceneCard` construction + metadata writes → `seedSceneIntoSession(sessionId: string, scenario: ScenarioRow): Promise<void>`.
- Signature writes:
  - `chat_sessions.scene_card = { background: scenario.backgroundImageUrl ?? null, location: derivedLocation, weather: null }`
  - `chat_sessions.metadata.sceneState.location = derivedLocation` (derive from `scenario.openingNarration` first 20 chars, or leave null)
- `startStorySession` calls the new helper instead of inline.
- No DB schema change.

**Risk.** Low. Refactor only, behavior identical on start path.

---

### Step 2 — Verify `GET /api/sessions/:id` returns `sceneCard`
**Goal.** Confirm the sessions route includes `scene_card` in its response payload so the FE can read `session.sceneCard.background`.

**File.** `packages/server/src/routes/sessions.ts` — read-only audit.

**What changes.** If `sceneCard` is excluded from the session projection, add it. Otherwise no change.

**Risk.** Minimal. Additive field.

---

### Step 3 — `SceneBackground` renders authored image
**Goal.** When `backgroundUrl` prop is set, render `<img>` above the gradient layer. Gradient stays as fallback.

**File.** `packages/web/src/components/chat/SceneBackground.tsx`

**What changes.**
```tsx
// Add prop
interface SceneBackgroundProps {
  location: string | undefined;
  backgroundUrl?: string | null;  // ← new
}

// Render: if backgroundUrl, show <img>; always render gradient beneath
```
- `<img>` attrs: `fetchpriority="high"` for opening scene only (pass `isOpening: boolean` flag from chat page); `loading="eager"`; `decoding="async"`; `className="absolute inset-0 w-full h-full object-cover"`.
- Vignette + bottom gradient mask via `after:` pseudo — prevents white BGs from washing out the text.
- `prefers-reduced-data`: skip image, gradient only.
- Chat page passes `session.sceneCard?.background ?? null` as `backgroundUrl`.

**FE impact.** `chat/[sessionId]/page.tsx` — adds `backgroundUrl` prop to `<SceneBackground>`. One line.

**Risk.** Low. Fallback is current behavior.

---

### Step 4 — `SpritePanel` primary character from scene cast
**Goal.** On VN sessions, the sprite shows the first character in `scene_card.castSubset` (i.e., the scenario's authored cast) rather than falling back to the session's characterId.

**File.** `packages/web/src/app/chat/[sessionId]/_components/SpritePanel.tsx`

**What changes.**
- If `session.sceneCard?.castSubset?.[0]` exists, use it as `primaryCharacterId`.
- If `session.metadata.storyId` is set and `primaryCharacterId === session.metadata.story.playAsCharacterId` → return `null` (POV hide).
- All other logic unchanged.

**Risk.** Medium. Test: (a) classic chat sprite unchanged; (b) presence orchestrator keyed by characterId — character swap on advance must reset presence state. Add to presence replay harness.

---

### Step 5 — `advanceRun` re-seeds chat session + events
**Goal.** After advancing `storyRuns`, patch the live chat session so the FE sees the new scene on query invalidation.

**File.** `packages/server/src/services/story-runner.ts` — extend `advanceRun`.

**What changes.** After the existing `db.update(schema.storyRuns)`:

1. Look up `storyRuns.seededSessionId` (join or second query). If set:
   - `db.update(chatSessions).set({ sceneCard: { background: nextScene.backgroundImageUrl, location: derivedLocation, weather: null } })`.
   - Insert `chat_messages` row: `{ role: 'system', speakerType: 'NARRATOR', content: '[Scene: <title>] <openingNarration>', metadata: { kind: 'scene_change', sceneId: nextSceneId } }`. Not rendered in `BubbleView` — add `kind='scene_change'` guard to renderer.
   - Insert `session_events`: `{ sessionId, eventType: 'scene_advance', payload: { fromSceneId, toSceneId: nextSceneId } }`.
2. Returns existing `{ run, nextScene, completed }` — response shape unchanged.

**Schema note.** `storyRuns` has `seededSessionId` column (written by `startStorySession`). Straight join.

**Risk.** Medium. The scene-change system message counts toward context token budget — tag it with `metadata.kind='scene_change'` so history-trim logic can identify it. The `BubbleView` must filter it (or it will render as a bubble). Check `BubbleView.tsx` for where it skips system messages; add `kind='scene_change'` exclusion if needed.

---

### Step 6 — "Next scene" button in `StoryActionBar`
**Goal.** VN chrome shows "Next scene →" when `session.sceneCard?.nextSceneId` is non-null and the last stream is not in flight.

**File.** `packages/web/src/components/stories/StoryActionBar.tsx`

**What changes.**
- Add `nextSceneId?: string | null` + `runId?: string` + `fromSceneId?: string` + `isStreaming: boolean` to props.
- Render button when `nextSceneId && !isStreaming`.
- On click: `POST /api/runs/${runId}/advance { fromSceneId, elapsedSeconds: elapsed }`.
- On response: React Query `invalidateQueries(['session', sessionId])` → SceneBackground + SpritePanel react to new `sceneCard`.
- On `completed === true`: `trackEvent('vn_ending_reached', { endingSlug, storyId })` → `router.push('/stories/${storyId}?ending=${endingSlug}')`.
- EN copy: "Next scene" (tooltip). Strip existing Indonesian tooltips ("LANJUT / ULANGI / HAPUS / Matikan mode VN") in same commit.
- i18n keys: `vn.nextScene`, `vn.theEnd`, `vn.sceneChange` added to `messages/en.json` + `messages/id.json`.
- Analytics: `trackEvent('vn_scene_advance', { fromSceneId, toSceneId: nextSceneId, storyId })`.

**Chat page** passes the new props: `runId = session.metadata.storyRunId`, `fromSceneId = session.sceneCard.currentSceneId` (or the `storyRuns.currentSceneId` returned in the session response — check which is in payload), `nextSceneId = session.sceneCard.nextSceneId`, `isStreaming`.

**Risk.** Medium. The "next scene" button must be invisible until the stream buffer is flushed (use existing `isStreaming` state in chat page). If user advances before the buffer flushes, the scene-change message will land mid-conversation visually.

---

### Step 7 — Studio 3-field scenario authoring
**Goal.** Authors can set `backgroundImageUrl`, `nextSceneId`, `sceneType` per scenario in Forge. Server validates and cycle-guards.

**Files.**
- `packages/server/src/routes/stories.ts` — extend the `PATCH /api/stories/:id/scenarios/:scenarioId` zod schema.
- `packages/web/src/app/studio/stories/[id]/edit/page.tsx` — three new form rows.

**Server changes.**
```ts
const zScenarioPatch = z.object({
  // existing fields
  title: z.string().max(120).optional(),
  personaPrompt: z.string().max(4000).optional(),
  openingMd: z.string().max(4000).optional(),
  openingInputHint: z.string().max(200).optional(),
  tileSubtitle: z.string().max(160).optional(),
  castSubset: z.array(z.string().uuid()).optional(),
  // new VN fields
  backgroundImageUrl: z.string().url().max(500).nullable().optional(),
  nextSceneId: z.string().max(36).nullable().optional(),
  sceneType: z.enum(['narration', 'dialogue', 'ending']).optional(),
  endingSlug: z.string().max(40).nullable().optional(),
});
```
- `nextSceneId` validation on save: (1) if non-null, check it belongs to same story and is not `self.id`; (2) DFS cycle check (≤ 64 nodes) starting from `self.id`. Return `422 { error: 'cycle_detected' }` or `422 { error: 'invalid_next_scene' }`.

**FE changes.** Three new rows in the scenario edit form:
- `backgroundImageUrl`: URL `<input>` with preview `<img>` (small, 120px, shown when URL non-empty). Label: "Background image URL".
- `nextSceneId`: `<select>` populated from sibling scenarios (already fetched for `ScenarioListPanel`). Label: "Next scene (leave empty for open-ended)". Excludes self.
- `sceneType`: `<select>` with options `narration | dialogue | ending`. Label: "Scene type". When `ending`, show `endingSlug` text input.

**Accessibility.** Desktop-only per PLANDESIGNv1 §0 row 10. Mobile Studio stays read-only.

**Risk.** Low. All columns exist. Validator is additive.

---

### Step 8 — `computeVnReadiness` + analytics events + ending UX
**Goal.** Reward authored scene chains in readiness score; add analytics; show ending banner.

**Files.**
- `packages/server/src/services/detail-extensions.ts` — `computeVnReadiness`.
- `packages/web/src/lib/analytics.ts` — 2 new event names.
- `packages/web/src/app/stories/[id]/page.tsx` — `?ending=<slug>` banner.

**Readiness changes.** Currently: plot 30 + scenarios 25 + cast 20 + openingQuote 15 + playAs 10 = 100. Rebalance: plot 25 + scenarios 20 + cast 20 + openingQuote 10 + playAs 5 + **scene chain 10** + **authored BG 10** = 100. "Scene chain" = at least one `storyScenes` row has `nextSceneId` set or `sceneType='ending'`. "Authored BG" = at least one `storyScenes.backgroundImageUrl` non-null. Update suggestion strings accordingly.

**Analytics.** `trackEvent('vn_scene_advance', ...)` — Step 6. `trackEvent('vn_ending_reached', ...)` — Step 6. No new `analytics_events` table changes needed.

**Ending UX.** `GET /api/stories/:id` already returns the story. On `/stories/:id?ending=<slug>`, show a dismissible banner above the hero: "You reached an ending: <endingSlug>". One conditional in `stories/[id]/page.tsx`. No new component.

**Risk.** Low.

---

## Execution Order

```
Step 1 (seeder helper)
  └─ Step 2 (verify session payload)  ← parallel with 1
       ├─ Step 3 (SceneBackground img)
       └─ Step 4 (SpritePanel cast)
            └─ Step 5 (advanceRun re-seeds chat)
                 └─ Step 6 (Next scene button)
                      └─ Step 8 (readiness + analytics + ending)

Step 7 (Studio authoring)  ← independent, run parallel with 3–6
```

Steps 1+2 unblock Steps 3+4. Steps 3+4 unblock Step 5. Step 5 unblocks Step 6. Step 7 is fully independent. Step 8 is polish, runs last.

---

## What is Parked (from PLANVNv1 + new)

All parked items from PLANVNv1 §D.3 remain parked. Updated trigger language:

| Item | Trigger |
|---|---|
| Bundled BG library (12 slugs in `public/vn/bg/`) | After authored `backgroundImageUrl` uptake is measurable (> 50% of published stories have a BG set). |
| Multi-slot `<VNStage>` (left/center/right) | After single-slot is stable AND art team delivers expression-mapped sheets. Not before. |
| 10-expression VN enum + `expressions.json` per character | Same as VNStage. Zero value without sheets. |
| `[SCENE_ADVANCE]` model sentinel parser | After scene advances by user tap are validated by usage; measure if authors want model-driven scene transitions. |
| `@neigo/shared/vn/*` DTO package | After a third consumer (beyond server + FE chat page) needs the types. |
| `character_images.kind='expression'` FE consumer | After multi-slot stage ships. |
| Dedicated `/vn/[runId]` cinema route | After chat-chrome UX ceiling is measured (transcript readability signal). |
| Branching Forge editor | v2+, not this cycle. |
| `characters.sprite_sheet_url` column | With expression override work. |
| `bgmUrl` audio player | Parked per BETA_FOCUS_CONTRACT §4.G. |
| `vnMode: 'kinetic'` metadata flag | No consumer needed; `metadata.storyId` is sufficient. |

---

## Failure Modes (condensed from analysis)

| # | Mode | Mitigation |
|---|---|---|
| 1 | LCP regression from authored BG image | Step 3: `fetchpriority="high"` opening only; subsequent advances from cache; `prefers-reduced-data` skip. |
| 2 | Advance fires while stream in flight | Step 6: button gated on `!isStreaming`. Server: reject if session has a message with `status='streaming'` in last 60s → 409. |
| 3 | `scene_change` message renders as bubble | Step 5: tag `metadata.kind='scene_change'`; Step 6: `BubbleView` filters it. |
| 4 | Advance drops trackers / affection | Step 1: `seedSceneIntoSession` writes only `scene_card.*` and `sceneState.location`. Never touches `trackers` or `castDynamicStates`. Unit test. |
| 5 | `nextSceneId` cycle / dangling ref | Step 7 server: existence + same-story + DFS guard on save. Step 5 advance: double-check at runtime, return 409. |
| 6 | Presence stalls on character swap | Step 4: presence reducer resets on `characterId` change (verify in existing reducer). Add replay-harness scenario. |
| 7 | Ending reached but user doesn't notice | Step 6: advance response `completed=true` → route push with `?ending=` query. Step 8: story detail banner. |
| 8 | Indonesian copy in new "Next scene" button | Step 6 must include EN copy pass on all `StoryActionBar` strings in same commit. |
| 9 | Context window grows with scene-change messages | `metadata.kind='scene_change'` lets trim logic count but skip rendering. Keep as-is for MVP (≤ 10 scenes = ≤ 10 synthetic messages). |
| 10 | `sceneCard.nextSceneId` not in session payload | Step 2 catches this. `sceneCard` is a jsonb column; whatever is written at start is returned. But `nextSceneId` is a `storyScenes` field — it needs to be added to `sceneCard` during seed and re-seed. Add to Step 1. |

---

## Changelog vs PLANVNv1

| PLANVNv1 ticket | PLANVNv2 disposition |
|---|---|
| BV1 — Shared VN DTOs | **Removed.** No third consumer; premature package. |
| BV2 — `metadata.vnMode` flag | **Removed.** `metadata.storyId` sufficient. |
| BV3 — Bundled BG library | **Parked.** Authored URL path first. |
| BV4 — `<VNBackdrop>` new component | **Collapsed into Step 3** — extend `SceneBackground.tsx`. |
| BV5 — `<VNStage>` multi-slot | **Parked.** Single slot via `SpritePanel`. |
| BV6 — `<VNTransition>` full-screen dim | **Removed.** CSS opacity on BG layer is the transition. |
| BV7 — `[SCENE_ADVANCE]` sentinel parser | **Parked.** User-tap only. |
| BV8 — New advance endpoint | **Collapsed into Step 5** — extend existing `advanceRun`. |
| BV9 — "Next Scene" FE action + EndingCard | **Step 6** — no EndingCard component; toast + query-param banner instead. |
| BV10 — Forge VN authoring panel | **Step 7** — 3 inline fields, no new component. |
| BV11 — `computeVnReadiness` rebalance | **Step 8.** |
| BV12 — Analytics + EN copy audit | **Steps 6 + 8.** |
| BV13 — BG prefetch on `[STATE: location=]` | **Removed.** Cache on advance is sufficient. |

---

*End of PLANVNv2.*
