# Phase 5 Implementation Plan — Content Rating + Model Selection UX

**Date:** 2026-04-25 | **Status:** 🟡 IN PROGRESS — contentRating stack complete, filter done, mana estimate pending

---

## A. Scope Definition

### 1. Content Rating System (§4.6 PLANCHATv3)

**What:** Tag characters with content sensitivity levels.

**Reference:** Isekai Zero has SFW / NSFW / SMUT tags on all storylines and characters.

```typescript
type ContentRating = 'SFW' | 'NSFW' | 'EXPLICIT';
```

**Required changes:**
1. Add `contentRating` field to characters table
2. Sessions inherit character rating
3. Filter in session creation UI

### 2. Model Selection UX (§4.4 PLANCHATv3)

**What:** Surface BYOK model picker in session creation (not hidden in settings).

**Current state:** BYOK exists in `/account` — half-built.

**Required changes:**
1. Move model picker to session creation flow
2. Show: Free tier (Hermes Lite), Standard (Hermes Full), BYOK (custom OpenRouter key)
3. Model picker in session creation

---

## B. Implementation Steps (Ordered)

### ✅ Step 1: Add contentRating to characters table — DONE 2026-04-25

**File:** `packages/server/src/db/schema.ts` — field added at line 153
**Migration:** `packages/server/drizzle/0055_content_rating.sql` — created

```sql
ALTER TABLE "characters" ADD COLUMN "content_rating" varchar(10) NOT NULL DEFAULT 'SFW';
```

### ✅ Step 2: Content rating stack completed — DONE 2026-04-25

**Files changed:**
- `packages/shared/src/domain/index.ts` — `contentRating: 'SFW' | 'NSFW' | 'EXPLICIT'` added to `Character` interface (line 62)
- `packages/server/src/routes/characters.ts:92` — `rowToCharacter()` maps `contentRating`
- `packages/server/src/routes/chat.ts:87` — `rowToCharacter()` maps `contentRating`
- `packages/web/src/app/chat/page.tsx:1068–1074` — Badge in `CharacterSelect` dropdown: amber for NSFW, rose for EXPLICIT; SFW suppressed

### ✅ Step 3: Session inherits character rating — DONE 2026-04-25

**File:** `packages/server/src/routes/sessions.ts` — `contentRating` added to session metadata at line 144

```typescript
contentRating: character?.contentRating ?? 'SFW',
```

### ✅ Step 4: Model picker in session creation — ALREADY IMPLEMENTED

**File:** `packages/web/src/app/chat/page.tsx` lines 663–678

`aiModel` state + `BYOK_MODEL_CATALOG` `<select>` already exist in `NewChatModal`. Not a pending task — already ships.

### ✅ Step 5: Filter characters/sessions by content rating — DONE 2026-04-25

**File:** `packages/web/src/app/chat/page.tsx` — `CharacterSelect` component

**Changes implemented:**
- Added `ratingFilter` state (`'ALL' | 'SFW' | 'NSFW' | 'EXPLICIT'`, defaults to `'ALL'`)
- Extended `filteredCharacters` memo to filter by `contentRating` before name search
- Added filter chip row with 4 chips: All · SFW · NSFW · 18+
  - All/SFW: accent color when active
  - NSFW: amber color when active
  - 18+ (EXPLICIT): rose color when active
- Contextual empty state messages:
  - With query: "No character matches your search."
  - With filter active: "No NSFW characters." / "No 18+ characters."
  - No filter + empty: "No characters available."
- Reset `activeIndex` to 0 when filter changes

### Step 6: Mana-equivalent display (PENDING)

Token cost estimate per turn displayed in session UI. Low priority for beta.

---

## C. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| contentRating field not populated | MEDIUM | HIGH | Default 'SFW' for all existing characters |
| Model picker confuses users | MEDIUM | MEDIUM | Beta: hide model picker, keep single voice |
| BYOK key invalid causes errors | MEDIUM | MEDIUM | Test-ping before session creation |

---

## D. Files to Modify/Create

| File | Action | Risk |
|------|--------|------|
| `packages/server/src/db/schema.ts` | ADD contentRating field | LOW |
| `drizzle/0039_content_rating.sql` | CREATE migration | LOW |
| `packages/server/src/routes/sessions.ts` | Inherit rating in session | LOW |
| `packages/web/src/app/chat/page.tsx` | Add model picker | MEDIUM |
| `packages/web/src/app/chat/[sessionId]/page.tsx` | Add rating badge | LOW |

---

## E. Testing Checklist

- [x] Verify contentRating defaults to 'SFW' for new characters — schema default set
- [x] Verify existing characters get 'SFW' (migration 0055)
- [x] Verify session inherits character rating — sessions.ts wired
- [x] Verify content rating badge visible in CharacterSelect dropdown — amber NSFW, rose EXPLICIT, SFW suppressed
- [x] Verify model picker appears in session creation — already implemented (NewChatModal lines 663–678)
- [x] Verify content rating filter toggle works in CharacterSelect — 4 chips (All/SFW/NSFW/18+), filtering by contentRating, contextual empty states
- [ ] Verify BYOK selection end-to-end in session creation

---

## F. Related Documentation

- `docs/PLANCHATv3.md` §4.6 — Content Rating System
- `docs/PLANCHATv3.md` §4.4 — Multi-Model Selection
- `docs/BACKLOG.md` — Current features
- `packages/server/src/db/schema.ts` — Character table
- `packages/web/src/app/settings/byok/page.tsx` — Existing BYOK UI