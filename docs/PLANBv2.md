> 🟡 **STATUS (apr 2026): SCHEMA + STUDIO SHIPPED, CINEMA ROUTE DEFERRED.** 2.1 schema ✅ (migrations 0040–0049) · 2.2 story-seed ✅ · 2.3 scenario auto-advance ✅ · 6a studio ✅. 🟡 2.4 VN-render — toggle shipped, renderer missing. ❌ 2.5 home story rails · ❌ 2.6 portrait-left mobile layout · ❌ 3 cinema chrome components (orphan) · ❌ 4 rails/explore APIs. Decision: mount orphan chrome inside `/chat/[sessionId]` when `metadata.storyId` present (cheaper) OR build `StoryChatFrame` route (PLANBv7 W-E). → [BACKLOG.md](BACKLOG.md) B1.1.

---

# PLANBv2 — Storylines: narrative chat with scenario spine (IsekaiZero-style)

> **Pivot from v1 draft:** we are **not** building a pure VN player. The
> reference is IsekaiZero (@isekai_zero, @aburakadabura, etc.): stories are
> **chat sessions seeded by a multi-cast scenario spine**, played by typing
> in-persona, with VN rendering as an optional overlay — not the loop.
> User directive: *"Jangan murni game atau VN."*

---

## 0. Reference canon — what IsekaiZero actually ships

Observed from reference screenshots ("Her Summon" by @aburakadabura, the
ISEKAI ZERO season winners rail, and the in-play scenario view):

### 0.1 Home (`/`)
```
┌─────────────────────────────────────────────────────────┐
│  HIDUPKAN CERITA, RASAKAN SENSASINYA                    │
│  [◀]  ╭──╮ ╭──╮ ╭──╮ ╭══╮ ╭──╮ ╭──╮ ╭──╮ ╭──╮  [▶]     │  ← featured carousel
│       ╰──╯ ╰──╯ ╰──╯ ╰══╯ ╰──╯ ╰──╯ ╰──╯ ╰──╯          │    of character/story cards
│                    ● ● ● ○ ○ ○ ○                        │
├─────────────────────────────────────────────────────────┤
│  🔥 Pilihan                                           ▶ │  ← horizontal rail
│  [card] [card] [card] [card] [card]                     │
├─────────────────────────────────────────────────────────┤
│  🏆 Piala ISEKAI ZERO — Pemenang Musim 1              ▶ │  ← seasonal winners
│  [card] [card] [card] [card] [card]                     │
├─────────────────────────────────────────────────────────┤
│  📈 Trending Hari Ini                                 ▶ │
│  [card] [card] [card] [card] [card]                     │
└─────────────────────────────────────────────────────────┘
```

Card anatomy: **story cover (9:16 portrait) + tier badge + title + plays·chats +
one-line hook + creator handle**. Not a character portrait — a **story** card.

### 0.2 Story detail (`/stories/[id]`)
```
┌──────────────────────────┬──────────────────────────────┐
│ [◀ back]        [⋯ menu] │  Casts  [7]                  │
│                          │  ▢ ▢ ▢ ▢ ▢ ▢ ▢   ← 7 portrait
│                          │  ▢             tiles w/ name │
│   ┌──────────────────┐   │                              │
│   │                  │   │  ┌────────────────────────┐  │
│   │  hero cover      │   │  │ Her Summon             │  │
│   │  carousel        │   │  │ She wanted a guardian… │  │
│   │                  │   │  │ Dipublikasikan 20 Mar  │  │
│   │                  │   │  └────────────────────────┘  │
│   │         ◀ ▶      │   │  [#Summoner] [#Fantasi] …    │
│   └──────────────────┘   │                              │
│                          │  💬 412k  💭 3k  ♥ 655  🔖 1k│
│                          │  🌹 2                         │
│  🏷 Publik · SFW         │  ┌────────────────────────┐  │
│  62 (14 Tersembunyi)     │  │ @aburakadabura  [Ikuti]│  │
│                          │  └────────────────────────┘  │
│                          │                              │
│                          │  Informasi Detail        [▲] │
│                          │  Plot | Skenario | Log       │
│                          │  ┌────────────────────────┐  │
│                          │  │ > CHOOSE YOUR FORM     │  │
│                          │  │  ┌──┐ ┌──┐ ┌▣▣┐ ┌──┐   │  │ ← scenario selector
│                          │  │  │S │ │G │ │SP│ │B │   │  │   (visual grid of
│                          │  │  └──┘ └──┘ └──┘ └──┘   │  │    7 paths; each = a
│                          │  └────────────────────────┘  │   scenario start)
│                          │                              │
│                          │  💬 119 komentar              │
│                          │  [comment] [comment] ...     │
├──────────────────────────┴──────────────────────────────┤
│ [🔖] [♥]  ╔═══════ Mulai Sekarang ════════╗             │ ← sticky CTA bar
└─────────────────────────────────────────────────────────┘
```

The **scenario grid is the star**. It's rendered inline in the detail page
(not a modal). Each tile = a starting path with cast, setting, opening
prompt. Think "choose your form / route" at the very top of the funnel.

### 0.3 Play (`/stories/[id]/play?scenario=…`)
```
┌────────────────┬────────────────────────────────────────┐
│                │ ◀ Her Summon · SCENARIO 1 — THE SLIME  │
│                │                              [🔍] [⚙]  │
│   ┌────────┐   │ ───────────────────────────────────────│
│   │        │   │                                        │
│   │        │   │  One moment you exist. The next,       │
│   │  full- │   │  you're on cold stone. No body. No feet│
│   │ height │   │  You're a puddle on the floor of a     │
│   │portrait│   │  small room lit by candles…            │
│   │ of     │   │                                        │
│   │ active │   │  "You're still a summon," she says     │ ← narrative prose,
│   │speaker │   │  quietly. "You're still mine." She     │   dialogue inline in
│   │        │   │  extends one hand, palm up. "I'm Vesna"│   colored quotes
│   │        │   │                                        │
│   └────────┘   │  ┌─────────────────────────────────┐   │
│                │  │ 🎮 Coba Visual Novel         🔹-1│   │ ← optional VN toggle
│                │  └─────────────────────────────────┘   │
│                │  ┌─────────────────────────────────┐   │
│                │  │ Perkiraan biaya pesan pertama   │   │ ← cost preview
│                │  │ DeepSeek V3.2  ~8,774↓ ~300↑    │   │
│                │  └─────────────────────────────────┘   │
│                │  ┌─────────────────────────────────┐   │
│                │  │ ◀   📖 Skenario Awal  1/7    ▶  │   │ ← scenario pagination
│                │  └─────────────────────────────────┘   │
│                │                                        │
│                │  [✕] [✨ LANJUT] [↻ ULANGI] [⌫ HAPUS] │ ← chat turn actions
│                │  [▢ Putar Otomatis (Novel Visual)]     │
│                │                                        │
│                │  Bicaralah sebagai The Slime,          │ ← persona-locked input
│                │  jelaskan apa yang kamu lakukan…   [🎤]│   (mode=open_ended)
└────────────────┴────────────────────────────────────────┘
```

### 0.4 Verdict on "VN or not?"

**It is a chat.** Not a VN. But rendered with strong visual chrome:
portrait anchored left, prose flows right, dialogue inline in colored
quotes by speaker, cost and scenario progress always visible.

The **"Coba Visual Novel"** button is a **render mode toggle**, not the
default. Tapping it flips prose → VN textbox-at-bottom with auto-advance.
Data flow and LLM calls are identical; only CSS/layout changes.

---

## 1. Current state (workspace-grounded)

### 1.1 Data — [packages/server/drizzle/0026_vn_tables.sql](packages/server/drizzle/0026_vn_tables.sql)

```sql
stories(id, title, mode[kinetic|branching|open_ended], cast jsonb,
        opening_scene_id, …)
story_scenes(id, story_id, order_index, background_image_url, bgm_url,
             opening_narration, character_cues jsonb, dialogue_lines jsonb,
             scene_type[narration|dialogue|choice|ending], next_scene_id,
             choices jsonb, ending_slug)
story_runs(id, user_id, story_id, current_scene_id, started_at,
           last_read_at, completed_at, ending_reached, reading_seconds)
           -- UNIQUE(user_id, story_id) → one run per user per story
```

### 1.2 UI — [packages/web/src/app/stories/[id]/play/page.tsx](packages/web/src/app/stories/[id]/play/page.tsx)

Linear kinetic reader. Advance-on-tap through pre-authored `dialogue_lines`,
then `next_scene_id`. **Does not talk to the LLM.** Branching/open_ended
modes are DB-modeled but UI-ignored.

### 1.3 Server — [packages/server/src/routes/stories.ts](packages/server/src/routes/stories.ts)

- `POST /api/stories/:id/runs` → upsert run, return current scene.
- `runsRouter` mounted at `/api/runs`:
  - `GET /:runId` → resume.
  - `POST /:runId/advance` → bumps `current_scene_id` to `next_scene_id`.

### 1.4 What's missing vs. the reference
| Reference feature | Current state |
|---|---|
| Story rail home | ❌ (home shows character rails only; see PLANBv5) |
| Scenario grid in detail page | ❌ (no "choose your form" selector) |
| Persona-locked chat loop on `/play` | ❌ (play is kinetic only) |
| LANJUT / ULANGI / HAPUS actions | ❌ (advance only; no regen/undo) |
| Cost preview | ❌ |
| Scenario pagination `1/7` | ❌ (sceneIndex is invisible) |
| VN-render toggle | ❌ (pure prose reader) |
| Story comments / social | ❌ |

---

## 2. Architecture: Storylines, not VN

### 2.1 Data reshape — one migration (0039_story_scenarios.sql)

```sql
-- Repurpose: a "scene" becomes a "scenario" = one full playable path.
-- Existing rows in story_scenes with scene_type='narration' already
-- fit the new semantics; add tiles and explicit chat handoff fields.
ALTER TABLE story_scenes
  ADD COLUMN tile_image_url text,       -- square tile for the grid selector
  ADD COLUMN tile_subtitle   text,      -- e.g. "Absorb · Mimic"
  ADD COLUMN tile_order      int NOT NULL DEFAULT 0,
  ADD COLUMN persona_prompt  text,      -- "You are The Slime. Speak in first person."
  ADD COLUMN opening_input_hint text,   -- "Bicaralah sebagai The Slime…"
  ADD COLUMN cast_subset     jsonb NOT NULL DEFAULT '[]'::jsonb; -- characterIds
                                          -- in scope for this scenario
                                          -- (Vesna always + this-form only)

-- Stories gain discovery fields mirrored from IsekaiZero
ALTER TABLE stories
  ADD COLUMN tagline        text,
  ADD COLUMN tags           text[] NOT NULL DEFAULT '{}',
  ADD COLUMN hero_carousel  jsonb  NOT NULL DEFAULT '[]',  -- [{url, caption?}]
  ADD COLUMN total_plays    int    NOT NULL DEFAULT 0,
  ADD COLUMN total_chats    int    NOT NULL DEFAULT 0,
  ADD COLUMN total_likes    int    NOT NULL DEFAULT 0,
  ADD COLUMN total_bookmarks int   NOT NULL DEFAULT 0,
  ADD COLUMN hidden_count   int    NOT NULL DEFAULT 0;     -- "62 (14 Tersembunyi)"

CREATE INDEX stories_trending_idx
  ON stories ((total_plays + total_chats * 2))
  WHERE visibility = 'public';

-- Story ↔ chat handoff: the run no longer advances to next scene; it
-- spawns (or resumes) a chat_sessions row seeded with persona + cast.
ALTER TABLE story_runs
  ADD COLUMN active_scenario_id uuid REFERENCES story_scenes(id),
  ADD COLUMN seeded_session_id  uuid REFERENCES chat_sessions(id),
  ADD COLUMN scenarios_completed text[] NOT NULL DEFAULT '{}'; -- slugs

-- Social (from §0.2 metrics row)
CREATE TABLE story_reactions (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id  uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  kind      text NOT NULL CHECK (kind IN ('like','bookmark','gift_rose')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id, kind)
);

CREATE TABLE story_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id    uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES story_comments(id) ON DELETE CASCADE,
  body        text NOT NULL,
  upvotes     int  NOT NULL DEFAULT 0,
  downvotes   int  NOT NULL DEFAULT 0,
  creator_flag boolean NOT NULL DEFAULT false, -- "OP" badge when author
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX story_comments_story_idx ON story_comments(story_id, created_at DESC);
```

### 2.2 The play loop is a **chat session** with extra chrome

```
user picks scenario tile on /stories/:id
  → POST /api/stories/:id/start  { scenarioId }
    → server: upsert story_runs.active_scenario_id
    → server: create chat_sessions with:
        metadata.storyRunId     = runId
        metadata.storyId        = storyId
        metadata.scenarioId     = scenarioId
        metadata.scenarioIndex  = "1/7"
        personaPrompt           = scenario.persona_prompt
        cast                    = scenario.cast_subset  (+ Vesna)
        openingSystemMessage    = scenario.opening_narration
      returns { sessionId, scenarioTitle, scenarioIndex, ... }
  → redirect to /stories/:id/play?session=<sessionId>

/play page:
  mounts a **reused chat core** (same as /chat/[sessionId])
  + story chrome frame (portrait-left layout, scenario pagination bar,
    VN-mode toggle, cost estimate, persona-locked input hint)
  ─ chat turn actions `LANJUT / ULANGI / HAPUS` map to existing chat
    endpoints (regenerate / undo / continue respectively — already built
    per Section B memory: DELETE /turns/last, POST /chat/:id/regenerate,
    POST /chat/:id/continue)
```

**Key insight:** we are **reusing the existing chat runtime, prompt
builder, memory graph, cost accounting, everything.** `/play` is a **view
over a chat_session**, decorated with story metadata. Zero new LLM
plumbing.

### 2.3 Scenario pagination (`1/7` chip)

Once a scenario's chat session reaches a `[SCENARIO_COMPLETE]` marker
(emitted by orchestrator via `[STATE: scenario_complete=true]` — reuses
the scene-state parser from existing memory) the client surfaces a
*"Lanjut ke Skenario 2/7?"* prompt. Accepting:

1. Appends scenario slug to `story_runs.scenarios_completed`.
2. Posts a soft-divider system message into the same chat session with
   the next scenario's `opening_narration` and swaps `persona_prompt` in
   `session.metadata` (builder picks it up on next turn).
3. Bumps `metadata.scenarioIndex` and emits a session_event.

**One chat session per run, not per scenario.** The user's whole journey
through Her Summon lives in one transcript so cross-scenario memory
(affection, promises) carries.

### 2.4 VN-mode toggle — render-only

`"Putar Otomatis (Novel Visual)"` button:

- Flips a **client-only** `renderMode` state: `prose` → `vn`.
- `vn` mode renders each assistant message through a `<VNProjection>`
  component that:
  1. Parses prose into `{ speaker?, text }` chunks (regex for
     `"…"` → dialogue, prose → narration).
  2. Sequences chunks with typewriter reveal (40 ms/char).
  3. Anchors speaker portrait from `scenario.character_cues`.
  4. Tap/auto-advance between chunks; finished chunks append to a
     chat-style scrollback beneath.
- **No new server calls.** Same underlying assistant message.
- Respects `prefers-reduced-motion`: no typewriter, no slide.

This is much lighter than a full Ren'Py-style stage and sidesteps the
"branching VN script" authoring burden entirely.

### 2.5 Home & Explore (story rails)

**`/` (Home)** gains three story rails (complementary to character rails
redesigned in PLANBv5):

- `🔥 Pilihan` — curated by editorial flag `stories.featured_at`.
- `🏆 Piala ISEKAI ZERO` — this will become `🏆 Pemenang Musim N`; query
  rows tagged with season slug (`stories.tags @> ARRAY['season:s1']`).
- `📈 Trending Hari Ini` — order by
  `total_plays_24h + total_chats_24h * 2` (materialized view refreshed
  every 10 min).

**`/explore`** (new route) — search + filter by:
- tag, cast size, NSFW toggle, content tier, creator, completion time.
- Sort: newest, top plays, top chats, top likes.

### 2.6 Mobile layout rules

- **Portrait**: portrait anchored top-left (40% height), prose scrolls
  below, action bar sticky at bottom above keyboard.
- **Landscape / desktop**: portrait anchored left (40% width, full
  height), prose scrolls right, action bar across prose column bottom.
- Tap zones exclude top-bar and action bar.
- Haptic tick on `LANJUT` tap (iOS `navigator.vibrate(8)`).
- Uses `dvh` for stage height to avoid iOS URL-bar jumps.

---

## 3. Frontend component map

```
app/
  page.tsx                         ← add <StoryRails /> block
  explore/page.tsx                 ← NEW: search + filter
  stories/
    page.tsx                       ← browse all; optional (explore covers it)
    [id]/
      page.tsx                     ← REBUILD: hero carousel + casts grid +
                                      scenario tiles + comments + sticky CTA
      play/
        page.tsx                   ← REBUILD: mounts <StoryChatFrame>
                                      wrapping the same hooks as /chat

components/
  home/
    StoryRails.tsx                 ← rails fetcher (featured/winners/trending)
    StoryCard.tsx                  ← 9:16 cover + tier badge + metrics
  stories/
    StoryHeroCarousel.tsx          ← left column carousel (images only)
    StoryCastStrip.tsx             ← casts grid (7 portraits + overflow)
    StoryMeta.tsx                  ← title + tagline + publish + tags
    StorySocialRow.tsx             ← plays · chats · ♥ · 🔖 · 💬 · gift
    StoryCreatorCard.tsx           ← @handle + tagline + [Ikuti]
    StoryInfoTabs.tsx              ← Plot | Skenario | Log
    ScenarioPicker.tsx             ← the "CHOOSE YOUR FORM" grid
    StoryComments.tsx              ← reuse message composer from PRs where fit
    StoryStickyCTA.tsx             ← bookmark + like + Mulai Sekarang
  play/
    StoryChatFrame.tsx             ← layout: left portrait / right prose
    StoryActionBar.tsx             ← LANJUT/ULANGI/HAPUS/VN-toggle
    ScenarioPaginationChip.tsx     ← ◀ Skenario 1/7 ▶
    CostEstimateChip.tsx           ← model · tokens in/out
    VNProjection.tsx               ← client-only VN render of latest msg
    PersonaInputHint.tsx           ← "Bicaralah sebagai …"
```

The `/chat/[sessionId]` hooks (message list, streaming, regen, undo)
are extracted into `useChatSession(sessionId)` so both `/chat` and
`/play` mount them without duplication.

---

## 4. API changes

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/stories/home/rails` | GET | `{featured,winners,trending}[]` with card payload |
| `/api/explore/stories` | GET | filters, sort, pagination |
| `/api/stories/:id` | GET | **extended** with `scenarios[]`, `social{}`, `creator{}` |
| `/api/stories/:id/start` | POST | `{scenarioId}` → creates chat session, returns sessionId |
| `/api/stories/:id/comments` | GET / POST | top-level + replies |
| `/api/stories/:id/reactions` | POST | `{kind:'like'\|'bookmark'\|'gift_rose'}` |
| `/api/stories/:id/follow-creator` | POST / DELETE | proxies to existing follows |
| `/api/runs/:runId/scenario-complete` | POST | append to `scenarios_completed` |

**Removed**: `POST /api/runs/:runId/advance` becomes a no-op shim that
redirects to `scenario-complete`. The "advance" concept disappears — all
progression happens via chat turns.

---

## 5. Rollout plan

1. **Migration 0039** — schema additions (back-compat; legacy `dialogue_lines`
   rows untouched; new fields have defaults).
2. **Server**:
   - `routes/stories.ts` extend GET `:id`, add `/start`.
   - New `routes/story-social.ts` (reactions + comments).
   - New `routes/explore.ts` (filter/search over stories).
3. **Chat session seeding helper** — `services/story-session-seeder.ts`
   — takes `{userId, storyId, scenarioId}` → creates a `chat_sessions`
   row with proper metadata + `persona_prompt` injection.
4. **Frontend**:
   - `StoryCard`, `StoryRails` on home.
   - Rebuild `stories/[id]/page.tsx`.
   - `ScenarioPicker` (the headline interaction).
   - `/play/page.tsx` → `StoryChatFrame` reusing `useChatSession`.
5. **VN projection** (behind `renderMode === 'vn'` flag, default `prose`).
6. **Explore route**.
7. **Social (comments + reactions)**.
8. **Materialized view** for trending (cron every 10 min).

---

## 6. Acceptance criteria

- [ ] Home shows three story rails + featured story carousel.
- [ ] `/stories/:id` shows hero carousel, casts strip, scenario picker,
      social row, creator card, sticky CTA, and at least Plot tab of
      info tabs.
- [ ] Picking a scenario starts a chat session seeded with
      `persona_prompt` + `cast_subset`; `/play` renders portrait-left
      layout with prose on the right.
- [ ] `LANJUT / ULANGI / HAPUS` map to continue / regenerate / undo on
      the same chat session.
- [ ] `[STATE: scenario_complete=true]` triggers a "next scenario?"
      prompt; accepting advances `scenarios_completed` and reseeds
      persona without creating a new session.
- [ ] VN-mode toggle flips rendering only; no extra LLM calls.
- [ ] Cost chip shows real model + tokens (uses the new
      `countTokens` from PLANBv1).
- [ ] Scenario pagination `1/7` always visible.
- [ ] `prefers-reduced-motion` disables typewriter in VN mode.
- [ ] Mobile: iOS Safari portrait works without URL-bar jump;
      action bar sits above the keyboard.

---

## 6a. Studio — character + story creation

Observed from reference sidebar: **`Home · Explore · Creation · Chats`**.
In our nav we already have `Studio` (`/studio/stories`). Expand it into a
proper creator surface: one index page with two creation flows, plus a
full story editor with scenario authoring.

### 6a.1 Routes

```
/studio                         ← NEW index (creator dashboard)
  ├─ "Buat karakter baru" → /characters/new    (existing 5-step wizard)
  ├─ "Buat cerita baru"   → /studio/stories    (existing list+create)
  ├─ "Karaktermu"         → /studio/characters (NEW list view, alias of
  │                          /characters but owner-scoped; lists public +
  │                          draft chars, quick actions)
  └─ "Ceritamu"           → /studio/stories (existing)

/studio/stories                 ← existing (keep as author's story list)
/studio/stories/[id]/edit       ← NEW (the big one) — story + scenarios
/studio/characters              ← NEW (author-scoped character list,
                                   thin wrapper over existing /characters)
```

### 6a.2 Story editor — `/studio/stories/[id]/edit`

Three tabs: **Info**, **Cast**, **Scenarios**.

#### Info tab
- Title, tagline, synopsis (richtext, <= 2 KB).
- Cover image URL + hero carousel entries (`hero_carousel jsonb`).
- Tags (`tags text[]`) with autocomplete against existing top tags.
- Content warnings + required tier + language.
- Visibility (`draft → public`) + NSFW toggle (gated by author's own NSFW
  consent flag on `users`).

#### Cast tab
- Reuses existing `/api/stories/:id/cast/candidates` (owned/public/builtin).
- Drag-and-drop ordering (stored as `cast jsonb` array order).
- Per-entry role label ("Summoner", "Form", "NPC") free-text + suggested
  chips.

#### Scenarios tab (the headline addition)
- Left column: vertical list of scenarios (drag handle to reorder via
  `tile_order`).
- "+ Tambah skenario" button.
- Right column: selected scenario editor with:
  - **Tile**: title, subtitle ("Absorb · Mimic"), tile image URL, tile
    order.
  - **Persona prompt** (<= 1500 chars): plain-text field; preview shows
    how it will merge into the prompt builder (read-only preview panel).
  - **Opening narration** (rich-multiline, <= 4 KB): the first system
    message seeded into the chat session.
  - **Opening input hint** (<= 200 chars): placeholder text for the user
    composer ("Bicaralah sebagai The Slime…").
  - **Cast subset**: multi-select chips, constrained to the story's cast.
  - **Scene bed** (optional): `background_image_url`, `bgm_url`.
- "Simpan & Uji" button creates an author test run (starts a chat
  session with `metadata.authorTest = true` so it isn't counted toward
  public stats) and navigates to `/play?session=...`.

Validation rules:
- Cannot publish a story with zero scenarios.
- Each scenario must have: title, persona_prompt, opening_narration, at
  least one cast_subset member.
- Tile image optional; if missing, use a generated placeholder tile.

### 6a.3 Scenario CRUD endpoints

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/stories/:id/scenarios` | — | list (author-only for drafts) |
| POST | `/api/stories/:id/scenarios` | `{title, personaPrompt, openingNarration, ...}` | create |
| PATCH | `/api/stories/:id/scenarios/:scenarioId` | partial | update |
| DELETE | `/api/stories/:id/scenarios/:scenarioId` | — | delete (hard; any runs pointing to it fall back to story default) |
| POST | `/api/stories/:id/scenarios/reorder` | `{order: string[]}` | bulk `tile_order` |

Internally these write to `story_scenes` with `scene_type = 'narration'`
and treat each row as a full scenario. Legacy VN scenes that have
`dialogue_lines.length > 0` render a warning badge in the editor
("legacy dialogue script — will be ignored in chat mode") but are not
auto-deleted.

### 6a.4 Character studio — out of scope for this PR

Character creation already ships via `/characters/new`. Studio index
just links it. Future work may inline it as `/studio/characters/new`.

### 6a.5 Author test run vs. public run

`POST /api/stories/:id/start` accepts `{scenarioId, mode?: 'play'|'author_test'}`:
- `play` (default): standard flow, counts toward `total_plays`.
- `author_test`: only allowed for story owner; sets
  `session.metadata.authorTest = true`; does not increment plays;
  session lives under a special badge in `/studio` for quick resume.

---

## 7. Out of scope (explicitly)

- Branching choice trees with `requires`/`effects` gating. IsekaiZero
  ships **all 7 scenarios as parallel paths**, not a tree. We match that.
- Save slots. The chat session *is* the save.
- Author-authored dialogue scripts. Authors supply **seeds** (persona
  prompt, opening narration, cast subset, cover, tile), LLM does the rest.
- BGM / sprite transitions / Ren'Py parity. VN mode is aesthetic, not
  a script runtime.

---

## 8. References

- IsekaiZero public pages — reference screenshots attached in-session
  (`Her Summon` by @aburakadabura, ISEKAI ZERO season winners).
- Monogatari (for VN typewriter ergonomics only): <https://monogatari.io>
- Character.AI scenes (for mobile chrome precedent):
  <https://blog.character.ai/scenes/>
- `prefers-reduced-motion`:
  <https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion>
- Existing Section B endpoints we piggyback on:
  `DELETE /api/sessions/:id/turns/last`,
  `POST /api/chat/:sessionId/regenerate`,
  `POST /api/sessions/:id/branch` (for "what if I had picked a different
  form?" — free feature from Section B).
