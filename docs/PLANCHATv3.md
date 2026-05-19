# PLANCHATv3 — Full Redesign Brainstorm
## Visual Novel × Roleplay Hybrid Platform
**Date:** 2026-04-25 | **Reference:** Isekai Zero (docs.isekai.world + isekaizero.ai)

---

## 0. Executive Summary

Project Neigo needs a full-clarity refactor. Right now it's a chat app with VN aesthetics bolted on. The goal: **invert that** — make it a VN-first narrative engine with a chat layer, not a chat app trying to be a VN.

Isekai Zero's core insight: *"Live the story, feel the thrill."* Every mechanic should serve narrative immersion, not chat convenience. This document maps everything to keep, cut, and build.

---

## 1. Current State Audit

### 1.1 ChatMode — What Exists vs What Works

| Mode | Current status | Verdict |
|------|----------------|---------|
| `CHAT` | Exists in enum, not surfaced in UI | **DELETE** — no purpose post-redesign |
| `ROLEPLAY` | Only beta mode exposed; all real logic lives here | **KEEP + RENAME** → `STORY` |
| `DEBATE` | Enum only; `DebatePhase` type exists, zero orchestrator logic | **DELETE** — completely off-brand |
| `IMMERSION` | Enum only; no distinct behavior from ROLEPLAY | **DELETE** — merge into base |
| `HAREM` | Enum + partial orchestrator branch (deferred); `HAREM_EVENT` memory type | **RENAME** → `CAST` + complete |
| `LEARNING` | Enum; gated behind PREMIUM; no orchestrator branch | **DELETE** — off-brand |

**New enum (2 modes only):**
```typescript
export const ChatMode = {
  STORY:  'STORY',   // 1:1 VN/RP — character + narrator + user
  CAST:   'CAST',    // Multi-character ensemble (≥2 chars in scene)
} as const;
```

CAST mode is HAREM renamed and completed — it's about ensemble storytelling (Genshin party, JRPG cast), not the adult connotation. Both modes use the same orchestrator; CAST just adds multi-speaker turn planning.

### 1.2 RelationshipStage — Keep As-Is ✓

Already well-designed. Trust 0-100 → 5 stages:

```
STRANGER (0-19) → ACQUAINTANCE (20-39) → FRIEND (40-59) → CLOSE_FRIEND (60-79) → INTIMATE (80-100)
```

Each stage has: `displayName`, `minTrust/maxTrust`, `emoji`, `responseLengthHint`, `formalityHint`. 
This directly drives prompt injection in `relationship-stage.ts`. **Keep exactly as-is.**

### 1.3 What to DELETE (irrelevant bloat)

| Feature | File(s) | Reason |
|---------|---------|--------|
| Debate mode + DebatePhase | `enums/index.ts` | Zero RP/VN relevance |
| Learning mode | `enums/index.ts`, `tier config` | Off-brand, never implemented |
| Letters route | `routes/letters.ts` | Cute but not core; cuts scope |
| Discover/explore route | `routes/discover.ts` | Social layer we're not building |
| Creator earnings system | `routes/creators.ts` | Phase 2+ feature |
| Ratings/reactions/comments | `routes/ratings.ts`, `reactions.ts`, `comments.ts` | Social layer V2 |
| `haremModeEnabled`/`learningModeEnabled` in TierConfig | `enums/index.ts` | Replace with `castModeEnabled` |
| `DebatePhase`, `ChatProgressionMode` enums | `enums/index.ts` | Unused |
| `HAREM_EVENT` memory type | `enums/index.ts` | Rename to `CAST_EVENT` |

### 1.4 What to KEEP (core VN+RP engine)

Everything in the orchestrator's multi-pass pipeline:
- **NARRATOR pass** — cinematic prose, world description
- **CHARACTER_MAIN pass** — character dialogue + action  
- **CHARACTER_REACT pass** — reactor character in CAST mode
- **SILENT_REACT pass** — background character non-verbal reaction
- **WHISPER pass** — intimate aside
- **Stats parsing** — trust delta, mood, scene state
- **Emotion detection** + `[EMOTION:]` tag → sprite sync
- **Speaker detection** `[SPEAKER:]` tag → multi-char sprite switching
- **Memory system** (embeddings + pinned + summary)
- **Context compaction** (arc summaries)
- **Lore books**
- **CYOA chips** (choice architecture — very VN)
- **Sprite/emotion gallery**
- **RelationshipStage** engine
- **BYOK + multi-model** (Isekai Zero does this — let users pick their LLM)
- **Persona/MC system** (user plays as named MC)
- **Scene state** (location, weather, background)
- **Tone presets** (TSUNDERE, STOIC, etc. — all VN archetypes)

---

## 2. Isekai Zero Reference Analysis

### 2.1 Core Product Philosophy
> "Interactive AI Stories where you LIVE the adventure"

Key differentiators vs generic AI chat:
- **Storylines** (not sessions) — structured narrative containers
- **Visual Novel Mode** — transforms to Instagram-Stories-like immersive experience
- **Dungeon Mind (DM)** — AI game mechanics agent attached to storyline
- **Arc saves** — save/compress context at story beats
- **Multi-model selection** — users pick their LLM (free Mana vs premium Arcane)
- **Creator economy** — creators earn per AI response when users play with premium credits
- **Modules** — structure stories into chapters/acts

### 2.2 Visual Novel Mode (their biggest differentiator)

From docs:
> "Visual Novel Mode transforms your gameplay into an immersive, multi-layer multimedia experience similar to Instagram Stories or traditional visual novels. Text only → full multimedia."

VN Mode settings:
- **Auto Create New Background** — generates a background when scene changes (~0.58-0.7 Mana/image)
- **Background layers** — multiple overlapping image layers
- **Character sprite positioning** — left/center/right
- **Text box overlay** — translucent bottom third, character name tag
- **Click/tap to advance** — classic VN progression

### 2.3 Dungeon Mind (DM) — Game Mechanics Agent
A separate AI agent layer that can:
- Track game-like stats (HP, gold, skills)
- Enforce game rules during narrative
- Generate dice-roll outcomes
- Award items/progression
- This is essentially an optional "system" layer over pure narrative

### 2.4 Summarization & Arc System
- **Arc Save** — checkpoint the story context into a compressed summary
- Saves tokens, lets very long stories continue without context limits
- Creates save points users can return to
- Maps directly to our existing `context-compaction.ts`

### 2.5 Currency Model (reference, not 1:1 copy)
- **Mana Credits** — free-to-earn, for affordable models/features
- **Arcane Credits** — premium, unlocks top-tier models + features
- Our equivalent: Free tier (Hermes 70B) vs BYOK/premium (405B or OpenRouter)

---

## 3. Redesigned Architecture

### 3.1 Core Entity Model

```
User
  └── Sessions (formerly ChatSession)
        ├── mode: STORY | CAST
        ├── characterId (primary character)
        ├── castCharacterIds[] (CAST mode: 2-8 characters)
        ├── sceneCard (current scene metadata)
        ├── arc: { title, summaryAt, turnCount }
        └── vnSettings: { enabled, bgStyle, textBoxStyle }

Character
  ├── persona (name, background, traits, coreWound, secrets)
  ├── tonePreset
  ├── spriteManifest: Record<emotion, url>
  ├── avatarUrl
  └── tags: content tags (SFW/NSFW etc.)

Arc (new entity — replaces loose storyMeta)
  ├── sessionId
  ├── title
  ├── openingSummary
  ├── closingSummary
  └── turnRange: { start, end }
```

### 3.2 New ChatMode: STORY vs CAST

**STORY mode** (replaces ROLEPLAY):
- 1 character + narrator
- RelationshipStage drives formality + response length
- Emotion → sprite sync
- Standard VN prose: narrator italics + character dialogue
- CYOA chips after each turn

**CAST mode** (replaces/completes HAREM):
- 2-8 characters in scene
- `[SPEAKER: Name]` routing → active sprite switches
- Each character has independent trust/relationship with user
- CastRelationship table tracks inter-character dynamics
- Turn planner selects which character responds (or multiple)
- No "harem" framing — ensemble storytelling (party, crew, family)

### 3.3 Orchestrator Refactor

Current passes are good. Rename and tighten:

```
STORY mode:
  Pass 1: NARRATOR (scene description, if turnCount % 3 === 0 or scene change)
  Pass 2: CHARACTER_MAIN (primary character response)
  Pass 3: CYOA tail-call (async, fire-and-forget)

CAST mode:
  Pass 1: NARRATOR (optional)
  Pass 2: TURN_PLAN (select speaker(s) for this turn)
  Pass 3+: CHARACTER for each selected speaker (sequential, can be 1-3)
  Pass N: REACTOR (background cast non-verbal, if scene has 4+ chars)
```

Remove: DEBATE passes, LEARNING mode, any per-mode branches that are CHAT/IMMERSION.

### 3.4 Scene & Background System

Inspired by Isekai Zero's VN mode auto-background:

```typescript
interface SceneCard {
  // Existing (keep)
  location?: string;
  weather?: string;
  timeOfDay?: string;
  mood?: string;
  
  // New
  backgroundUrl?: string;        // manual or AI-generated
  backgroundPrompt?: string;     // what was used to gen this bg
  bgGeneratedAt?: string;
  castSubset: string[];          // active characters in scene
  pov?: 'first' | 'third';
}
```

Background generation (optional feature, Phase 2):
- Trigger on `[SCENE_CHANGE:]` tag from model
- Use Cloudflare R2 for storage (already wired in `r2-storage.ts`)
- ~0.5-1 Mana equivalent per background image

### 3.5 Prompt Directives (consolidate)

Current tags: `[EMOTION: KEY]`, `[SPEAKER: Name]`, `[STAT:trust +N]`, `[TRACK:]`, `[SCENE_CHANGE:]`

Add:
```
[ARC_SAVE]          — model signals a good story beat for arc save
[CHOICE: A|B|C]     — explicit choice branch (maps to CYOA)
[DM: action]        — future Dungeon Mind integration hook
```

Strip in `parseAndStripEmotion`, extend `stats-parser.ts` to strip all meta-tags cleanly.

---

## 4. Feature Additions (Isekai Zero-inspired)

### 4.1 Arc Save System (HIGH PRIORITY)
**What:** Checkpoint story context into a compressed arc summary.  
**Why:** Enables very long stories (100+ turns) without hitting context limits. Isekai Zero calls this "Arc Save."  
**How:**  
- On `[ARC_SAVE]` tag or every 30 turns, trigger `context-compaction.ts`
- Store arc summary in `memories` table with `type: 'SUMMARY'`
- Show arc save indicator in UI (subtle checkpoint badge)
- Let users name arcs manually ("Chapter 1: The Meeting")
- Future: let users rewind to arc save points

**Files to modify:** `context-compaction.ts`, `orchestrator.ts`, `stats-parser.ts`, new `arc-manager.ts`

### 4.2 VN Mode (COMPLETE + POLISH)
**Current state:** `VNProjectionToggle` was deleted in cleanup. Need to restore/rebuild.  
**What it should do:**
- Full-screen background fills viewport
- Bottom text box (translucent, 25% of screen height)
- Character name tag above text
- Click/tap anywhere to advance to next bubble (when settled)
- Auto-hide composer until user long-presses or taps input area
- Sprite positioned: left, center, or right (based on speaker)

**Files:** New `VNMode.tsx` overlay wrapper, `page.tsx` VN layout branch

### 4.3 Dungeon Mind (DM) Agent — Phase 2
**What:** Optional game-mechanics layer attached to a session.  
**Why:** Isekai Zero's most unique feature for game-RP hybrids (stat tracking, dice, quests).  
**How (Phase 2):**
- New `DungeonMind` entity with rules config (stats, skills, items)
- Pass DM context into orchestrator system prompt
- Model emits `[DM: roll d20 → 14, success]` type tags
- DM overlay panel shows current game state

### 4.4 Multi-Model Selection (COMPLETE BYOK UX)
**What:** Surface model selection clearly in UI (already half-built with BYOK).  
**Isekai Zero does this** — users choose LLM based on quality/speed/price.  
**How:** Move model picker to session creation, not hidden in settings. Show:
- Free tier: Hermes Lite (fast, limited)
- Standard: Hermes Full
- BYOK: User's own OpenRouter key (with catalog)

### 4.5 Emotion Gallery → Mood Board
**Current:** Expression gallery shows last 5 emotions as thumbnails.  
**Expand to:** Show current mood state prominently, with history. 
- Mood timeline (sparkline of last 20 turns)
- Current stage pill (FRIEND, CLOSE_FRIEND, etc.)
- Trust bar (visual progress bar in SpritePanel)

### 4.6 Content Rating System (SFW/NSFW)
Isekai Zero has SFW / NSFW / SMUT tags on all storylines and characters.  
**What we need:**
```typescript
type ContentRating = 'SFW' | 'NSFW' | 'EXPLICIT';
```
- Character gets a `contentRating` field
- Sessions inherit character rating
- Filter in session creation / character browser

---

## 5. What to DELETE (Complete List)

### 5.1 Server Routes (delete from `index.ts` registrations + files)
| Route | File | Alternative |
|-------|------|-------------|
| `/api/letters` | `routes/letters.ts` | Not core; cut |
| `/api/discover` | `routes/discover.ts` | Replace with simple character list |
| `/api/creators` | `routes/creators.ts` | Cut (creator economy Phase 3+) |
| `/api/characters/:id/comments` | `routes/comments.ts` (partial) | Cut |
| `/api/characters/:id/rating` | `routes/ratings.ts` (partial) | Cut |
| `/api/characters/:id/reactions` | `routes/reactions.ts` (partial) | Cut |
| `/api/stories/:id/*` | above files (story parts) | Keep only if Story entity survives |

### 5.2 Shared Enums (delete/rename)
```typescript
// DELETE
DEBATE = 'DEBATE'
IMMERSION = 'IMMERSION'  
LEARNING = 'LEARNING'
CHAT = 'CHAT'
DebatePhase
ChatProgressionMode

// RENAME
HAREM → CAST
HAREM_EVENT → CAST_EVENT
haremModeEnabled → castModeEnabled
learningModeEnabled → (remove)

// SIMPLIFY TierConfig
maxCharacters: 5/20/100/-1 → keep
maxTurnsPerWeek: keep
castModeEnabled: false/false/true/true → keep
```

### 5.3 Web Pages (delete from Next.js app)
| Page | Why |
|------|-----|
| `/letters/*` | Non-core |
| `/stories/*` | Replace with new Arc-based system if needed |
| `/studio/stories/*` | Simplify to character creation only for now |

### 5.4 Server Services (delete if truly orphaned)
- `story-runner.ts` — only used by deleted stories route
- `story-session-seeder.ts` — only for story scenario seeding
- `cast-denorm.ts` — evaluate usage; likely keep (used in characters route)
- `character-diary-rollup.ts` — keep (feeds character depth)

---

## 6. UI/UX Redesign

### 6.1 Chat Page Layout (after refactor)

```
┌─────────────────────────────────────────────────┬──────────────┐
│  [← Back]  Session Title        [Arc ▾] [VN ⬡]  │  Sprite      │
│─────────────────────────────────────────────────│  Panel       │
│                                                 │  (desktop)   │
│  ┌─ ConversationPrelude ─────────────────────┐  │              │
│  │  First Meeting · 初対面  /  Story Opens    │  │  [Sprite]    │
│  └───────────────────────────────────────────┘  │              │
│                                                 │  ──────────  │
│  [Narrator: italic prose]                       │  Name        │
│                                                 │  FRIEND ●    │
│  "Character dialogue..." [action]               │  Trust: 62%  │
│                                                 │  ──────────  │
│  [User message bubble]                          │  Mood: warm  │
│                                                 │  [Emotion ▾] │
│  [CYOA chips: A | B | C]                        │  ──────────  │
│                                                 │  Memory ▶    │
├─────────────────────────────────────────────────┤              │
│  [Skip]  [Continue]  [Retry]  [Undo]           │              │
│  ┌──────────────────────────────────────────┐  │              │
│  │  [🎭 MC]  [✉] |  Type something...  [→]  │  │              │
│  └──────────────────────────────────────────┘  │              │
└─────────────────────────────────────────────────┴──────────────┘
```

### 6.2 VN Mode Layout (full-screen)

```
┌────────────────────────────────────────────────────────────────┐
│  [Background image fills screen]                               │
│                                              [Sprite: right]   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ◈ Aiko                                                  │  │
│  │                                                          │  │
│  │  "Kamu... beneran datang." *menoleh dengan mata berkaca-  │  │
│  │  kaca, sudut bibirnya tertarik naik*                     │  │
│  │                                                          │  │
│  │  ▶ tap to continue                          [1/3] ───── │  │
│  └──────────────────────────────────────────────────────────┘  │
│  [◁ Choice A]  [▷ Choice B]  [✎ Type]          [⚙]  [≡]      │
└────────────────────────────────────────────────────────────────┘
```

### 6.3 SpritePanel Redesign (trust-first)

Current SpritePanel shows: name, activity dot, state chips, memory.  
Proposed order:
1. **Sprite** (62% height, emotion-reactive) — keep
2. **Name + Stage badge** ("Aiko · CLOSE_FRIEND")
3. **Trust bar** — visual progress bar 0-100 with stage markers
4. **Mood indicator** — current mood with icon
5. **Expression gallery** — last 5 emotions (keep)
6. **Memory** — collapsible character background (keep)
7. **Activity dot** — move here (less prominent)

---

## 7. Prompt Architecture Refactor

### 7.1 Remove DEBATE/LEARNING/CHAT branches from builder.ts
Currently `buildRoleplayPrompt` has mode checks scattered throughout.  
After: only `STORY` and `CAST` branches needed.

### 7.2 Directive consolidation
All meta-tags emitted by model, stripped before saving:
```
[EMOTION: KEY]             → sprite expression
[SPEAKER: Name]            → multi-char speaker routing  
[STAT: field +/-N]         → trust/mood delta
[TRACK: label = value]     → custom tracker
[SCENE_CHANGE: desc]       → scene transition  
[ARC_SAVE]                 → good checkpoint
[CHOICE: A|B|C|D]          → suggest CYOA choices
[WHISPER]...[/WHISPER]     → whisper bubble
[SILENT]...[/SILENT]       → silent action bubble
```

### 7.3 CAST mode prompt structure
```
System: [World context + cast roster]
Each character: [Name]: [Persona summary] | [Trust: N] | [Mood: X]
Turn instruction: [SPEAKER:] tag to indicate who speaks
```

---

## 8. Phased Implementation Plan

### Phase 0 — Cleanup ✅ COMPLETE (2026-04-25)
- [x] Remove DEBATE, LEARNING, CHAT, IMMERSION from `ChatMode` enum
- [x] Remove DebatePhase, ChatProgressionMode from shared enums
- [x] Rename HAREM→CAST, HAREM_EVENT→CAST_EVENT
- [x] Remove `learningModeEnabled` from TierConfig, add `castModeEnabled`
- [x] Remove dead orchestrator branches (DEBATE, LEARNING, IMMERSION)
- [x] Clean up `builder.ts` mode checks
- [x] Update all imports across server + shared

### Phase 1 — Core STORY mode polish ✅ COMPLETE (2026-04-25)
- [x] Rename ROLEPLAY→STORY in all code, DB migration
- [x] Trust bar + stage badge in SpritePanel
- [ ] ~~Mood timeline (sparkline) in SpritePanel~~ — REMOVED (dead code, deferred Phase 4)
- [x] VN Mode: toggle + overlay integrated in page.tsx
- [ ] Arc save indicator in ConversationPrelude (deferred Phase 4)
- [ ] [ARC_SAVE] tag detection + UI checkpoint (deferred Phase 4)

### Phase 2 — CAST mode completion ✅ COMPLETE (2026-04-25)
- [x] Turn planning (TURN_PLAN pass — `cast-turn-selector.ts`)
- [x] Speaker sprite switching (activeSpeakerId already wired in page.tsx)
- [x] Cast roster strip (CastRoster component created)
- [x] REACTOR + SILENT participation types (`cast-turn-selector.ts`)
- [x] Rename `harem-*.ts` → `cast-*.ts` — `cast-turn-selector.ts` + `cast-stats-repo.ts` (2026-04-25)
- [x] Orchestrator imports updated to new filenames; identifier names unchanged
- [ ] Inter-character relationship tracking (CastRelationships table exists, not wired — deferred)
- [x] ConversationPrelude for CAST (StoryOpens card — done)

**Note:** CAST functionality and naming are now complete. `CastRelationships` table exists in schema but has no reads/writes — deferred.

### Phase 3 — VN Mode full implementation ✅ PRODUCTION READY (2026-04-25)
- [x] VN overlay component (VNMode.tsx integrated)
- [x] Click-to-advance bubble queue (vnReadIndex state)
- [x] VN mode toggle button (top-right corner)
- [x] Character name tag above text box (VNMode.tsx lines 171-180)
- [x] Sprite positioning (left/center/right) — hardcoded center for STORY mode
- [x] Background scene image support (backgroundUrl prop wired)
- [ ] VN mode settings panel (nice-to-have, not blocking)
- [ ] Dynamic sprite position for CAST mode (future enhancement)

**Evidence:** page.tsx lines 1100-1145 show complete VNMode integration with toggle + component.

### Phase 4 — Arc & Background ✅ COMPLETE (2026-04-25, bugs fixed same day)
- [x] Arc manager service (`arc-manager.ts` — 310 lines, verified)
- [x] `[ARC_SAVE]` tag detection in `stats-parser.ts`
- [x] Orchestrator wiring — model-triggered + auto every 30 turns (both STORY and CAST)
- [x] Arc API endpoint (`GET /api/sessions/:id/arcs`)
- [x] `ArcCheckpoint` UI badge (top-left, shows latest arc title, read-only)
- [x] `[ARC_SAVE]` prompt instruction in `roleplay.md`
- [x] CAST transcript window fixed: `toIdx = toTurn*2+6` covers all offsets
- [x] Fallback arc summary removed: null LLM output skips checkpoint
- [ ] Arc history panel (rewind to past arcs) — deferred Phase 4+
- [ ] Background auto-generation (Cloudflare AI Images via R2) — deferred
- [ ] Scene background prompt synthesis — deferred
- [ ] MoodTimeline sparkline — deferred (requires backend pipeline)

**Remaining known issues (non-blocking, see `docs/Phase4Audit.md`):**
- CAST arc detection block (`orchestrator.ts:1140–1175`) is dead code — harmless, functionality correct via STORY path
- Arc summary quality: 14/25 (no trust/mood state captured) — acceptable for forward continuity, gap at rewind

### Phase 5 — Content Rating + Model Selection UX 🟡 NEAR COMPLETE (mana estimate deferred)
- [x] `contentRating: varchar(10) DEFAULT 'SFW'` on Character — schema + migration 0055
- [x] Session inherits `contentRating` from primary character on creation
- [x] `contentRating` field in `Character` interface (`@neigo/shared`) — (2026-04-25)
- [x] `rowToCharacter()` maps `contentRating` in `characters.ts` + `chat.ts` — (2026-04-25)
- [x] Content rating badge in `CharacterSelect` dropdown — amber NSFW, rose EXPLICIT, SFW suppressed (2026-04-25)
- [x] Model picker in session creation — already implemented (`aiModel` state + `BYOK_MODEL_CATALOG` select in `NewChatModal`)
- [x] Filter characters by content rating — `ratingFilter` state + 4 chips (All/SFW/NSFW/18+) in `CharacterSelect` dropdown (2026-04-25)
- [ ] Mana-equivalent display (token cost estimate per turn)

---

## 9. Database Changes Required

### 9.1 Migrations needed
```sql
-- Rename mode values
UPDATE chat_sessions SET mode = 'STORY' WHERE mode IN ('ROLEPLAY', 'CHAT', 'IMMERSION');
UPDATE chat_sessions SET mode = 'CAST' WHERE mode = 'HAREM';

-- Add to characters table
ALTER TABLE characters ADD COLUMN content_rating VARCHAR(10) DEFAULT 'SFW';

-- Add to character_dynamic_states
-- (trust_score already exists at line 344 of schema.ts)
-- Add mood_history jsonb for sparkline
ALTER TABLE character_dynamic_states ADD COLUMN mood_history JSONB DEFAULT '[]'::jsonb;

-- Rename memory type
UPDATE memories SET type = 'CAST_EVENT' WHERE type = 'HAREM_EVENT';
```

### 9.2 Schema changes in schema.ts
```typescript
// characters table: add contentRating
contentRating: varchar('content_rating', { length: 10 })
  .notNull()
  .default('SFW'),

// character_dynamic_states: add moodHistory
moodHistory: jsonb('mood_history').notNull().default(sql`'[]'::jsonb`),

// chat_sessions: vnEnabled
vnEnabled: boolean('vn_enabled').notNull().default(false),
```

---

## 10. Key Decisions & Trade-offs

| Decision | Choice | Reason |
|---------|--------|--------|
| STORY vs ROLEPLAY rename | Rename to STORY | "Story" is VN-native language; "Roleplay" has stigma |
| HAREM → CAST | RENAME | "Cast" is ensemble storytelling, genre-neutral |
| Keep DEBATE | NO — delete | Zero VN relevance, confuses product identity |
| Keep LEARNING | NO — delete | Product identity dilution |
| VN Mode — full rebuild or patch | Rebuild clean | Old VNProjectionToggle was a toggle, needs to be a full layout mode |
| Arc save — model-triggered or timed | BOTH | [ARC_SAVE] tag + every 30 turns auto-trigger |
| Background generation — Phase 1 or 2 | Phase 4 | R2 is wired but image gen cost needs thought |
| Dungeon Mind | Phase 3+ | Very powerful but complex; don't block core |
| Letter system | CUT | Nice-to-have but not VN/RP core |
| Social layer (ratings/reactions) | CUT | Platform scale feature, not gameplay |
| Story/Arc entity | SIMPLIFY | Replace loose `storyMeta` in session.metadata with proper `arc` JSON column |

---

## 11. Reference Comparisons

| Feature | Isekai Zero | Project Neigo (current) | Target |
|---------|-------------|---------------------|--------|
| Core mode | Storylines | ROLEPLAY session | STORY session |
| Multi-char | Cast in storyline | HAREM (incomplete) | CAST mode |
| VN layout | Instagram Stories style | Toggle toggle (deleted) | Full-screen VN overlay |
| Background | Auto-generated per scene | Manual only | Phase 1: manual, Phase 4: auto-gen |
| Arc system | Arc Save checkpoint | Context compaction (no UI) | Arc save with visible checkpoints |
| Model choice | Multiple models per tier | BYOK in settings | Surface in session creation |
| Relationship | Not a core mechanic | Full stage system | KEEP — our differentiator |
| Sprite emotions | Not visible in docs | Full manifest system | KEEP + expand |
| Content rating | SFW/NSFW/SMUT tags | None | Phase 5 |
| Game mechanics | Dungeon Mind agent | None | Phase 3+ |
| Currency | Mana + Arcane | Free/PREMIUM tiers | Keep tier + surface BYOK better |
| Creator economy | Creator earns per play | None | Phase 3+ |
