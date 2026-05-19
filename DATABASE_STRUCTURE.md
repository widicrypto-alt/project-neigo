# Project Neigo Database Structure - Exploration Report

## Overview
This project uses **Drizzle ORM** with **PostgreSQL** as the primary database. The schema includes 30+ tables for characters, stories, chat sessions, and user management.

---

## 1. DATABASE CONFIGURATION

### Drizzle Config Location
- **File**: [packages/server/drizzle.config.ts](packages/server/drizzle.config.ts)
- **Schema file**: `packages/server/src/db/schema.ts`
- **Migrations directory**: `packages/server/drizzle/`
- **Database connection**: Uses `DIRECT_URL` (primary) or `DATABASE_URL` (fallback)
- **Default**: `postgres://postgres:postgres@localhost:5432/neigo`

---

## 2. SCHEMA - CHARACTER TABLES

### 2.1 Main Character Table
**File**: [packages/server/src/db/schema.ts](packages/server/src/db/schema.ts#L88)

**Table**: `characters`
```
- id (PK)
- ownerId (FK → users)
- name
- avatarUrl (varchar 500) — main avatar URL
- persona (jsonb) — full character data (~30+ fields)
  - age, gender, personality, speechStyle
  - likes, dislikes, background, worldInfo
  - exampleDialogues, tags
  - spriteSheetUrl (sprite connection 🔗)
  - birthday, coreTraits, dynamicTraits, etc.
- tags (jsonb array)
- folder
- tonePreset
- isBuiltIn, isPublic, isRetired
- allowInStories
- language, languagesSpoken
- slug, tagline, descriptionMd, descriptionHtml
- loreSectionsMd, exampleDialogMd
- publishedAt, createdAt, updatedAt
- AND ~20+ more fields for discovery, stats, moderation
```

### 2.2 Character Gallery Images
**File**: [packages/server/src/db/schema.ts](packages/server/src/db/schema.ts#L165)

**Table**: `character_images` — Multi-image gallery per character
```
- id (PK)
- characterId (FK → characters)
- userId (FK → users)
- kind: 'avatar' | 'portrait' | 'scene' | 'expression' | 'ref'
- r2Key (Cloudflare R2 storage reference) — sprite/asset connection 🔗
- url (public URL)
- width, height, bytes
- mime (image/webp, etc.)
- alt, caption
- nsfw, moderationStatus, moderationReason
- perceptualHash
- orderIndex, isPrimary
- metadata (jsonb)
- createdAt, updatedAt
```

### 2.3 Character Image Quota
**Table**: `character_image_quota`
- Rate-limit tracking per user per day

### 2.4 Related Character Tables
- **character_diary**: Story entries per character
- **character_facts**: Facts/lore per character
- **character_dynamic_states**: Per-session mood/state tracking
- **character_mode_profiles**: Mode-specific personality overrides

---

## 3. SCHEMA - STORY TABLES

### 3.1 Stories (Main Table)
**File**: [packages/server/src/db/schema.ts](packages/server/src/db/schema.ts#L847)

**Table**: `stories` — Visual novel / kinetic stories
```
- id (PK)
- title, synopsis, tagline
- coverImageUrl (varchar 500)
- language (default: 'id')
- authorId (FK → users)
- status: 'draft' | 'published' | 'featured' | 'archived'
- mode: 'kinetic' (MVP) | 'branching' (future)
- requiredTier: 'FREE' | 'PAID' | 'FOUNDER'
- cast (jsonb array) — [{characterId, displayName, role}]
- openingSceneId (FK → story_scenes, circular)
- metadata (jsonb)
  - tags, contentWarnings, estimatedMinutes
- slug, plotMd, plotHtml
- aiPlotMd, aiGuidelinesMd, aiReminderMd
- isAdvancedMode, isSecretMode
- isAdult18plus, containsMinors
- playAsCharacterId
- dungeonMindEnabled
- openingQuote, openingQuoteBy
- ~15+ more fields for stats, discovery, moderation
- publishedAt, createdAt, updatedAt
```

### 3.2 Story Scenes
**File**: [packages/server/src/db/schema.ts](packages/server/src/db/schema.ts#L931)

**Table**: `story_scenes` — Individual scenes within a story
```
- id (PK)
- storyId (FK → stories)
- orderIndex
- title, backgroundImageUrl, bgmUrl
- openingNarration (text)
- characterCues (jsonb) — [{characterId, position, expression}]
  - position: 'left' | 'center' | 'right'
- dialogueLines (jsonb) — [{speakerCharacterId, text}]
- sceneType: 'narration' | 'dialogue' | 'choice' | 'ending'
- nextSceneId (FK → story_scenes)
- choices (jsonb array)
- endingSlug
- tileImageUrl, tileSubtitle, tileOrder
- personaPrompt
- openingInputHint
- castSubset (jsonb — character IDs in this scene)
- metadata (jsonb)
- createdAt, updatedAt
```

### 3.3 Story Runs
**Table**: `story_runs` — Player progress through stories
```
- id, userId, storyId
- openingSceneId, currentSceneId
- status: 'in_progress' | 'completed'
- endingSlug
- seededSessionId (chat session linked to story)
```

### 3.4 Story Character References
**Table**: `story_character_refs`
- Link table: (storyId, characterId) primary key
- source: 'owned' | 'public' | 'builtin'

---

## 4. MIGRATIONS - CHARACTER & STORY RELATED

### Character Migrations
| File | Description |
|------|-------------|
| [0010_character_diary.sql](packages/server/drizzle/0010_character_diary.sql) | Character diary/story entries |
| [0011_character_facts.sql](packages/server/drizzle/0011_character_facts.sql) | Character facts/lore |
| [0012_character_chapter.sql](packages/server/drizzle/0012_character_chapter.sql) | Character discovery chapter metadata |
| [0024_character_language_retire.sql](packages/server/drizzle/0024_character_language_retire.sql) | Multi-language + retirement flag |
| [0040_character_gallery.sql](packages/server/drizzle/0040_character_gallery.sql) | **Character image gallery with R2 storage** 🔗 |
| [0041_character_images_rls.sql](packages/server/drizzle/0041_character_images_rls.sql) | Row-level security for character images |
| [0047_character_details.sql](packages/server/drizzle/0047_character_details.sql) | Public detail page fields |

### Story Migrations
| File | Description |
|------|-------------|
| [0026_vn_tables.sql](packages/server/drizzle/0026_vn_tables.sql) | **Core story/scene/run/cast tables** 🔗 |
| [0039_story_scenarios.sql](packages/server/drizzle/0039_story_scenarios.sql) | Story reactions/comments/social |
| [0048_story_details.sql](packages/server/drizzle/0048_story_details.sql) | Rich story detail page fields |

### Full List of Migrations
[packages/server/drizzle/](packages/server/drizzle/) contains 54 migration files:
- 0001–0054 (see directory listing for all)

---

## 5. SEED FILES & DATA POPULATION

### Main Seed File
**File**: [packages/server/src/db/seed.ts](packages/server/src/db/seed.ts)

**Purpose**: Seed minimal demo data (one admin user + sample characters)

**Command**: 
```bash
pnpm --filter @neigo/server seed
# OR
bun --env-file=../../.env run src/db/seed.ts
```

**What it does**:
- Creates demo user: `admin@neigo.my.id` (password: `demopass123`)
- Inserts `BUILTIN_CHARACTERS` from `./seed-characters.js`
- Sets up character persona fields including `spriteSheetUrl`

### Planned/Referenced Seed Files (may not exist yet)
From [packages/server/package.json](packages/server/package.json):

```json
"seed": "bun --env-file=../../.env run src/db/seed.ts",
"seed:content": "bun --env-file=../../.env run src/db/seed-demo-content.ts",
"seed:all": "pnpm seed && pnpm seed:content",
"seed:fantasy-chars": "bun --env-file=../../.env run src/db/seed-fantasy-chars.ts",
"seed:fantasy-content": "bun --env-file=../../.env run src/db/seed-fantasy-content.ts",
"seed:fantasy-content-2": "bun --env-file=../../.env run src/db/seed-fantasy-content-2.ts",
"seed:fantasy-all": "pnpm seed:fantasy-chars && pnpm seed:fantasy-content && pnpm seed:fantasy-content-2"
```

**Note**: These seed files are referenced but may not exist. The `seed-characters.js` is imported in seed.ts but file not found — may be generated at runtime.

### Agent Seeding
**File**: [packages/server/src/services/agents/seed.ts](packages/server/src/services/agents/seed.ts)
- Exports `BUILTIN_AGENTS` array
- Exports `ensureBuiltinAgents(userId)` function
- Referenced in auth flow to auto-seed agents on signup

---

## 6. DATA FILES (Fixtures & Test Data)

### Character Data
- [data/characters/lysandra_onboarding_starters.json](data/characters/lysandra_onboarding_starters.json)
- [data/characters/lysandra_onboarding_starters.md](data/characters/lysandra_onboarding_starters.md)
- [data/characters/lysandra_virelle.json](data/characters/lysandra_virelle.json)
- [data/characters/lysandra_virelle.md](data/characters/lysandra_virelle.md)

### Test Conversations
- [data/conversations/harem_100v4_5_20260413_102341.json](data/conversations/harem_100v4_5_20260413_102341.json)
- [data/conversations/kaia_memory_probe_20260420042537..json](data/conversations/kaia_memory_probe_20260420042537..json)
- [data/conversations/kaia_office_100_20260420041439..json](data/conversations/kaia_office_100_20260420041439..json)
- [data/conversations/lysandra_stresstest_20260420230617..json](data/conversations/lysandra_stresstest_20260420230617..json)
- [data/conversations/roleplay_20turn_v1_20260414_113736.json](data/conversations/roleplay_20turn_v1_20260414_113736.json)

### Generation Scripts
- [data/gen-kaia-memory-probe-100.ts](data/gen-kaia-memory-probe-100.ts)
- [data/gen-kaia-office-100.ts](data/gen-kaia-office-100.ts)
- [data/gen-lysandra-stresstest-150.ts](data/gen-lysandra-stresstest-150.ts)

### Reference Template
- [data/character_template.md](data/character_template.md) — Canonical character JSON schema

---

## 7. SPRITE & ASSET CONNECTIONS 🔗

### Sprite Sheet URL in Character Persona
**Location**: Character → `persona.spriteSheetUrl`
- Defined in [packages/server/src/db/schema.ts](packages/server/src/db/schema.ts#L88) → `characters.persona` (jsonb)
- Stored as nullable string field in persona
- Example reference in [packages/server/src/db/seed.ts](packages/server/src/db/seed.ts) (line 50)

### Sprite Manifest Routes
**File**: [packages/server/src/routes/sprite-manifest.ts](packages/server/src/routes/sprite-manifest.ts)

**Endpoints**:
- `GET /api/characters/:id/sprite-manifest` — Fetch sprite manifest
- `POST /api/characters/:id/sprite-manifest/presign` — Get R2 presigned URL
- `PUT /api/characters/:id/sprite-manifest/:slot/:name` — Upload sprite asset
- `DELETE /api/characters/:id/sprite-manifest/:slot/:name` — Remove sprite asset

**Asset Storage**: Cloudflare R2
- Sprite sheets organized by character slug
- Path pattern: `sprites/<character-slug>/<outfit>/<pose>/<expression>.webp`

### Sprite Generation Utility
**File**: [packages/server/src/db/generate-placeholder-sprites.ts](packages/server/src/db/generate-placeholder-sprites.ts)

**Purpose**: Generates placeholder 4×3 sprite sheets (PNG) for built-in characters

**Output Location**: `packages/web/public/sprites/<slug>/sheet.png`

**Characters included**:
- kaia-schneider
- lin-yue
- rei-aizawa
- elara-vesmont
- changli

**Frame Layout** (12 frames × 480×480px):
- idle, listening, speaking, thinking
- typing, searching, calculating, fixing
- success, error, alert, sleeping

### Character Image Gallery (R2-backed)
**Table**: `character_images`
- **r2_key**: Cloudflare R2 key for image storage
- **url**: Public CDN URL
- **kind**: Type of image ('avatar', 'portrait', 'scene', 'expression', 'ref')
- Migration: [0040_character_gallery.sql](packages/server/drizzle/0040_character_gallery.sql)

### Frontend Asset Paths
- **Avatar fallback poster**: [packages/web/public/img/poster-01.svg](packages/web/public/img/poster-01.svg) (and 02, 03)
- **Sprite directory**: [packages/web/public/sprites/](packages/web/public/sprites/) *(currently empty, populated at runtime)*
- **Icon assets**: [packages/web/public/icon-*.svg](packages/web/public/)

---

## 8. ROUTES & SERVICES FOR CHARACTER/STORY

### Character Routes
- [packages/server/src/routes/personas.ts](packages/server/src/routes/personas.ts) — CRUD operations
- [packages/server/src/routes/sprite-manifest.ts](packages/server/src/routes/sprite-manifest.ts) — Sprite asset management

### Story Routes
- [packages/server/src/routes/stories.ts](packages/server/src/routes/stories.ts) — Story CRUD + scenario management

### Services
- [packages/server/src/services/story-runner.ts](packages/server/src/services/story-runner.ts) — Story progression engine
- [packages/server/src/services/story-session-seeder.ts](packages/server/src/services/story-session-seeder.ts) — Seeded chat sessions from scenarios
- [packages/server/src/services/detail-extensions.ts](packages/server/src/services/detail-extensions.ts) — Token cache + VN readiness

---

## 9. SUMMARY TABLE

| Category | Type | Location |
|----------|------|----------|
| **Config** | Drizzle | [packages/server/drizzle.config.ts](packages/server/drizzle.config.ts) |
| **Schema** | Main TypeScript | [packages/server/src/db/schema.ts](packages/server/src/db/schema.ts) |
| **Migrations** | SQL | [packages/server/drizzle/](packages/server/drizzle/) (54 files) |
| **Character Seed** | TypeScript | [packages/server/src/db/seed.ts](packages/server/src/db/seed.ts) |
| **Agent Seed** | TypeScript | [packages/server/src/services/agents/seed.ts](packages/server/src/services/agents/seed.ts) |
| **Character Data** | JSON/MD | [data/characters/](data/characters/) |
| **Test Data** | JSON | [data/conversations/](data/conversations/) |
| **Sprite Generation** | TypeScript | [packages/server/src/db/generate-placeholder-sprites.ts](packages/server/src/db/generate-placeholder-sprites.ts) |
| **Character Routes** | TypeScript | [packages/server/src/routes/personas.ts](packages/server/src/routes/personas.ts) |
| **Sprite Routes** | TypeScript | [packages/server/src/routes/sprite-manifest.ts](packages/server/src/routes/sprite-manifest.ts) |
| **Story Routes** | TypeScript | [packages/server/src/routes/stories.ts](packages/server/src/routes/stories.ts) |
| **Sprite Assets** | PNG/SVG | [packages/web/public/sprites/](packages/web/public/sprites/) + R2 |
| **Avatar Posters** | SVG | [packages/web/public/img/](packages/web/public/img/) |

---

## 10. KEY CONNECTIONS

### Character → Sprite Asset
```
characters.persona.spriteSheetUrl 
  → character_images.r2Key (R2 storage)
    → /api/characters/:id/sprite-manifest (manifest API)
      → Frontend rendering (SpriteStage, WaifuStage)
```

### Story → Character
```
stories.cast (jsonb array: [{characterId, displayName, role}])
  ↓
story_character_refs (link table)
  ↓
characters.id (join)
  ↓
character_images (gallery, avatar)
```

### Story → Scene → Dialogue
```
stories.openingSceneId
  → story_scenes (id, title, dialogueLines)
    → characterCues [{characterId, position, expression}]
      → characters (join for persona, spriteSheetUrl)
```

---

## 11. IMPORTANT NOTES

1. **Sprite Sheet URL field**: Located in `persona` (jsonb), not a separate column
2. **Character Images**: Use Cloudflare R2 storage for moderation workflow
3. **Avatar field**: Simple varchar(500) URL field on character (different from gallery)
4. **Story Scenes**: Fully support character positioning + expressions for VN rendering
5. **Migrations**: Include RLS (Row-Level Security) policies for proper access control
6. **Seed files**: Some referenced files don't exist yet (seed-fantasy-*.ts) — may be planned features
7. **Data fixtures**: Test conversations are JSON logs from testing, not auto-populated seeds

---

*Last Updated: 2026-04-25*
*Explored Structure: Complete character, story, sprite, and asset database architecture*
