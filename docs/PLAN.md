> ✅ **STATUS (apr 2026): IMPLEMENTED — architectural reference.** Migration plan complete; head is `0051`. See [INDEX.md](INDEX.md) for live backlog. Tech stack (Next 15 / Hono / Drizzle / Postgres / Bun) matches reality exactly. §5 SSE multi-bubble is retained for HAREM mode only; beta collapsed to single-voice per [BETA_FOCUS_CONTRACT_v1.md](BETA_FOCUS_CONTRACT_v1.md).

---

# Project Neigo Project — Migration Plan (Locked Brainstorm)

> **Status:** This document is the *source of truth* for the migration.
> Any deviation must be justified and added to the Change Log at the bottom.

## 1. Vision

Web-first, mobile-friendly roleplay/chat app ported from the Android/KMP `roleplayapp`.
Keep the *logic* (prompts, multi-pass orchestration, managers, domain models, stat systems).
Drop the *infrastructure* (Android Room, Hilt, Compose, Gradle KMP).
Rebuild UI/backend with modern TypeScript stack.

## 2. Tech Stack (Locked)

### Frontend (`packages/web`)
- **Framework:** Next.js 15 (App Router, RSC where useful, client components for chat)
- **UI:** React 19 + Tailwind CSS v4 + `clsx` + `tailwind-merge`
- **State:** Zustand (client UI state) + TanStack Query (server cache)
- **Forms:** React Hook Form + Zod
- **Animation:** Framer Motion (bubble reveals)
- **PWA:** `next-pwa` (mobile install + offline shell)
- **Icons:** `lucide-react`
- **Auth client:** cookie-based session (httpOnly) via server

### Backend (`packages/server`)
- **Runtime:** Bun
- **Framework:** Hono (fast, edge-friendly)
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL (Supabase or Neon; local dev via Docker)
- **Cache / Queue:** Redis (Upstash in prod, local redis via docker)
- **Auth:** JWT + httpOnly cookies, bcrypt
- **Validation:** Zod (shared with frontend)
- **Streaming:** SSE (Server-Sent Events) — multi-bubble protocol
- **AI proxy:** Direct OpenRouter / Hermes-4-405B; streaming passthrough
- **File storage:** Cloudflare R2 (character avatars, scene images)
- **Payments:** Stripe SDK (tier upgrades)

### Shared (`packages/shared`)
- Zod schemas, TS types, enums (ChatMode, Tier, etc.), constants, prompt types

### DevOps
- **Monorepo:** pnpm workspaces + Turborepo
- **Lint/Format:** ESLint (flat config) + Prettier
- **TS:** strict mode, `@total-typescript/tsconfig` base
- **Deploy:** Vercel (web) + Railway or Fly.io (server) — or Coolify self-host
- **CI:** GitHub Actions (typecheck + test + build)

## 3. Monorepo Structure

```
project-neigo/
├─ package.json                  # workspace root
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ .env.example
├─ .gitignore
├─ README.md
├─ PLAN.md                       # THIS FILE
├─ packages/
│  ├─ shared/                    # TS types, Zod schemas, enums, constants
│  │  ├─ src/
│  │  │  ├─ domain/              # Character, ChatSession, Message, Memory, HaremStats…
│  │  │  ├─ enums/               # ChatMode, Tier, RelationshipStage…
│  │  │  ├─ schemas/             # Zod validators
│  │  │  └─ index.ts
│  │  └─ package.json
│  ├─ server/                    # Hono + Bun + Drizzle
│  │  ├─ src/
│  │  │  ├─ db/
│  │  │  │  ├─ schema.ts         # Drizzle tables (15+)
│  │  │  │  ├─ client.ts
│  │  │  │  └─ migrations/
│  │  │  ├─ routes/
│  │  │  │  ├─ auth.ts
│  │  │  │  ├─ characters.ts
│  │  │  │  ├─ sessions.ts
│  │  │  │  ├─ chat.ts           # SSE multi-bubble
│  │  │  │  ├─ memories.ts
│  │  │  │  └─ tier.ts
│  │  │  ├─ services/
│  │  │  │  ├─ ai-proxy.ts
│  │  │  │  ├─ orchestrator.ts   # port of RoleplayOrchestrator
│  │  │  │  ├─ multi-pass.ts     # port of MultiPassPromptFactory
│  │  │  │  ├─ memory-manager.ts
│  │  │  │  ├─ harem-selector.ts
│  │  │  │  ├─ mood-escalation.ts
│  │  │  │  ├─ relationship-engine.ts
│  │  │  │  ├─ stats-parser.ts
│  │  │  │  ├─ personality-anchor.ts
│  │  │  │  ├─ repetition-detector.ts
│  │  │  │  ├─ tone-drift-detector.ts
│  │  │  │  ├─ pass-validator.ts
│  │  │  │  ├─ pass-sanitizer.ts
│  │  │  │  ├─ cross-pass-checker.ts
│  │  │  │  ├─ safe-fallback.ts
│  │  │  │  ├─ reality-anchor.ts
│  │  │  │  ├─ episodic-memory.ts
│  │  │  │  ├─ presence-manager.ts
│  │  │  │  ├─ session-date.ts
│  │  │  │  ├─ learning-manager.ts
│  │  │  │  └─ character-dynamic.ts
│  │  │  ├─ prompts/
│  │  │  │  ├─ builder.ts        # port of PromptBuilder.kt
│  │  │  │  └─ templates/        # .md files (chat, roleplay, debate, immersion, harem, learning)
│  │  │  ├─ middleware/
│  │  │  │  ├─ auth.ts
│  │  │  │  ├─ tier.ts
│  │  │  │  └─ error.ts
│  │  │  ├─ lib/
│  │  │  │  ├─ sse.ts
│  │  │  │  ├─ jwt.ts
│  │  │  │  └─ env.ts
│  │  │  └─ index.ts              # Hono app entry
│  │  ├─ drizzle.config.ts
│  │  └─ package.json
│  └─ web/                        # Next.js 15
│     ├─ src/
│     │  ├─ app/
│     │  │  ├─ layout.tsx
│     │  │  ├─ page.tsx           # Discover
│     │  │  ├─ login/
│     │  │  ├─ signup/
│     │  │  ├─ chat/[sessionId]/
│     │  │  ├─ characters/
│     │  │  │  ├─ page.tsx        # list
│     │  │  │  ├─ new/page.tsx
│     │  │  │  └─ [id]/page.tsx   # edit
│     │  │  ├─ settings/
│     │  │  └─ api/               # proxy routes if needed
│     │  ├─ components/
│     │  │  ├─ Sidebar.tsx
│     │  │  ├─ chat/
│     │  │  │  ├─ ChatWindow.tsx
│     │  │  │  ├─ Bubble.tsx
│     │  │  │  ├─ BubbleStream.tsx
│     │  │  │  ├─ SceneCard.tsx
│     │  │  │  ├─ StatsPanel.tsx
│     │  │  │  └─ Composer.tsx
│     │  │  └─ ui/                # button, input, card, dialog…
│     │  ├─ lib/
│     │  │  ├─ api.ts             # fetch wrapper
│     │  │  ├─ sse.ts             # SSE client
│     │  │  ├─ store/             # Zustand stores
│     │  │  └─ queries/           # TanStack Query hooks
│     │  └─ styles/globals.css
│     ├─ public/
│     ├─ next.config.ts
│     ├─ tailwind.config.ts
│     └─ package.json
├─ prompts/                       # Versioned prompt templates (source of truth)
│  ├─ chat.md
│  ├─ roleplay.md
│  ├─ debate.md
│  ├─ immersion.md
│  ├─ harem.md
│  └─ learning.md
└─ data/                          # Seed data
   ├─ characters.sample.json
   └─ conversations/              # 100-turn test logs
```

## 4. Database Schema (Drizzle / Postgres) — 15 Tables

Expanded from original 7:

1. **users** — id, email, password_hash, display_name, avatar_url, tier, tier_expires_at, created_at
2. **subscriptions** — id, user_id, tier, stripe_customer_id, stripe_sub_id, status, period_end
3. **characters** — id, owner_id, name, persona (30 fields from template as jsonb), avatar_url, is_public, created_at
4. **chat_sessions** — id, user_id, mode (ChatMode enum), title, scene_summary, turn_count, relationship_tier, scene_card jsonb, metadata jsonb, created_at, updated_at
5. **chat_session_members** — session_id, character_id, role (main/cast), joined_at
6. **chat_messages** — id, session_id, turn_index, role (system/user/assistant/narrator/reactor/silent/whisper), character_id nullable, content, metadata jsonb, created_at
7. **memories** — id, session_id, character_id nullable, kind (fact/episodic/anchor), content, embedding vector(1536), salience float, created_at
8. **character_dynamic_states** — session_id, character_id, mood, stagnation, jealousy, drift_score, last_updated
9. **character_mode_profiles** — character_id, mode, personality_override jsonb
10. **harem_stats** — session_id, character_id, affection (0–1000), loyalty (0–1000), jealousy (0–5), voice_score
11. **cast_relationships** — session_id, char_a_id, char_b_id, relationship_type, affinity
12. **group_activities** — id, session_id, activity_type, participants jsonb, outcome, created_at
13. **story_arcs** — id, session_id, name, stage, triggers jsonb, progress
14. **scene_templates** — id, owner_id nullable, name, setup jsonb, is_public
15. **world_bible_entries** — id, owner_id, title, content, tags, created_at
16. **learner_profiles** — user_id, target_language, level, goals jsonb
17. **learning_materials** — id, user_id, topic, content jsonb
18. **mistake_logs** — id, user_id, session_id, mistake, correction, created_at
19. **api_usage** — id, user_id, endpoint, tokens_in, tokens_out, cost_cents, created_at

Postgres extensions: `pgvector` for memory embeddings.

## 5. SSE Multi-Bubble Protocol

Endpoint: `POST /api/chat/:sessionId/turn` → `text/event-stream`

Event types (name → payload):
- `scene` — `{ summary, location, time_of_day, atmosphere }` (from DIRECTOR pass)
- `narrator` — incremental text chunks (atmospheric prose)
- `character` — `{ characterId, chunk }` main character streaming
- `reactor` — `{ characterId, chunk }` reaction character (≤2)
- `silent` — `{ characterId, text }` one-sentence italic
- `whisper` — `{ characterId, text }` private 2–5 lines
- `stats` — `{ updates: [...] }` parsed `[STATS:...]` tags
- `relationship` — `{ characterId, newTier }`
- `error` — `{ message }`
- `done` — `{ turnIndex, messageIds }`

Client renders each event as a separate bubble in order.

## 6. Migration Phases

### Phase 0 — Foundation (scaffolding)
- Monorepo with pnpm + Turborepo
- Shared package with enums + Zod
- Env template, tsconfig base, lint/format
- PLAN.md (this doc) committed

### Phase 1 — Backend Core
- Hono app + env loader + error middleware
- Drizzle schema + migration CLI
- Auth: register/login/me with JWT+cookie
- Characters CRUD
- Sessions CRUD (no chat yet)

### Phase 2 — Prompt Extraction
- Extract 6 mode prompts from `PromptBuilder.kt` into `prompts/*.md`
- Port `PromptBuilder` to TypeScript (`prompts/builder.ts`)
- Unit tests comparing output against captured Kotlin output

### Phase 3 — Single-Pass Chat
- AI proxy service (OpenRouter/Hermes)
- `POST /api/chat/:sessionId/turn` → SSE single-character stream
- Web chat page with bubble rendering
- Anti-repetition + stats parsing

### Phase 4 — Multi-Pass Pipeline
- Port `MultiPassPromptFactory` (7 passes)
- Port `RoleplayOrchestrator`
- Wire pass validators, sanitizers, fallback
- SSE multi-bubble emission

### Phase 5 — Memory & Stats
- Port MemoryManager + EpisodicMemoryManager
- pgvector embeddings
- Port RelationshipStageEngine + PersonalityAnchor
- Port MoodEscalation + RepetitionDetector + ToneDriftDetector

### Phase 6 — Harem Mode
- HaremTurnSelector, HaremStats table
- Cast relationships, group activities
- Jealousy / affection / loyalty mechanics

### Phase 7 — Advanced Modes
- Debate, Immersion, Learning
- LearnerProfiles, MistakeLog

### Phase 8 — Polish
- PWA (next-pwa), mobile UX refinement
- Image uploads to R2
- Stripe tier upgrades
- Admin / usage dashboard

## 7. Rules & Constraints

- **Language:** TypeScript strict everywhere.
- **No Kotlin / Gradle / Android** in project-neigo.
- **Server-only secrets** (never leak to client).
- **Prompts** live in `prompts/*.md` (versioned source of truth); builder reads + composes.
- **All AI calls server-side.** Web never calls OpenRouter directly.
- **Mobile-first CSS** (design from 360px up).
- **Accessibility:** semantic HTML + focus states + aria labels.

## 8. Change Log

- **2026-04-17:** Initial plan locked. Migration started.
- **2026-04-21:** Clean-room Marinara Engine audit v1 — see [CLEANROOM_NOTES.md](CLEANROOM_NOTES.md). Phases F–H drafted.
- **2026-04-21:** Deep audit v2 — see [MARINARA_AUDIT.md](MARINARA_AUDIT.md). Supersedes v1. Adds integration graph (§6), conflict matrix (§5), 25-agent mapping (§2.3 — 32% covered, 36% planned, 32% out-of-scope), 6 original ideas not in Marinara (§4), and a 12-week execution order (§8). Clean-room rules preserved (AGPL-3.0 §13 safe).
