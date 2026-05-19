# Phase 2 Implementation Plan — CAST Mode Completion

**Date:** 2026-04-25 | **Status:** ✅ COMPLETE

---

## Implementation Status

### ✅ COMPLETED (This Session)

| Step | Component | File | Status |
|------|-----------|------|--------|
| 1 | `planHaremTurn()` function | `packages/server/src/services/cast-turn-selector.ts` | ✅ DONE |
| 2 | TURN_PLAN pass in orchestrator | `packages/server/src/services/orchestrator.ts` | ✅ DONE |
| 3 | Speaker sprite switching | `packages/web/src/app/chat/[sessionId]/page.tsx` | ✅ DONE |
| 4 | `activeSpeakerId` state | `packages/web/src/app/chat/[sessionId]/page.tsx` | ✅ DONE |
| 5 | `CastRoster` component | `packages/web/src/app/chat/[sessionId]/_components/CastRoster.tsx` | ✅ DONE |
| 6 | REACTOR + SILENT participation types | `packages/server/src/services/cast-turn-selector.ts` | ✅ DONE |
| 7 | `HaremStats` tracking (affection/jealousy/loyalty) | `packages/server/src/services/cast-stats-repo.ts` | ✅ DONE |
| 8 | Rename `harem-*.ts` → `cast-*.ts` | `cast-turn-selector.ts` + `cast-stats-repo.ts` created, originals deleted | ✅ DONE 2026-04-25 |
| 9 | Orchestrator imports updated | `orchestrator.ts` + `services/index.ts` barrel updated | ✅ DONE 2026-04-25 |

### 📋 DEFERRED (non-blocking)

| Step | Component | Notes |
|------|-----------|-------|
| 10 | CastRelationships table (inter-char) | Schema exists (`castRelationships`), no reads/writes — UI not wired |
| 11 | ConversationPrelude for CAST | Story opens card for multi-char (StoryOpens already wired) |

---

---

## A. Phase 2 Architecture

### Existing Infrastructure (VERIFIED)

| Component | Status | Evidence |
|-----------|--------|----------|
| `planHaremTurn()` | ✅ EXISTS | harem-turn-selector.ts line 40 |
| `ParticipationType` enum | ✅ EXISTS | MAIN_SPEAKER, REACTOR, SILENT, ABSENT |
| `TurnPlan` interface | ✅ EXISTS | assignments[] + whisperPair |
| `activeSpeakerId` state | ✅ EXISTS | page.tsx manages this |
| `CastRoster` component | ✅ EXISTS | 77 lines, renders when 3+ chars |
| `haremStats` table | ✅ EXISTS | schema.ts, tracks affection/jealousy/loyalty |

### Core Algorithm (Weighted Turn Planning)

From `harem-turn-selector.ts`:

```typescript
// Scoring: affection*2 + jealousy*1.5 + loyalty - cooldownPenalty
const COOLDOWN_PENALTIES = [40, 25, 10];
const MAX_REACTORS = 2;
const MAX_SILENTS = 2;
const WHISPER_DRAMA_FLOOR = 3;

// Participation assignment:
// - Score #1: MAIN_SPEAKER
// - Score #2-3: REACTOR
// - Score #4-5: SILENT
// - Score 6+: ABSENT
```

### Data Flow

```
User Input
    ↓
orchestrator.ts → mode === 'CAST'
    ↓
planHaremTurn() → compute turn plan
    ↓
Pass 1: TURN_PLAN (select speakers)
Pass 2+: CHARACTER for each speaker (sequential)
Pass N: REACTOR (background non-verbal)
    ↓
Speaker tags → strip + route → activeSpeakerId
    ↓
page.tsx → sprite switching + CastRoster highlight
```

---

## B. Implementation Steps (Ordered)

### Step 1: Rename Files (Cosmetic — LOW RISK)

Rename server files to align with CAST naming:

| From | To |
|------|-----|
| `harem-turn-selector.ts` | `cast-turn-selector.ts` |
| `harem-stats-repo.ts` | `cast-stats-repo.ts` |

**Note:** Orchestrator import paths will need updating.

### Step 2: Create CastRelationships Table (MEDIUM RISK)

**File:** `packages/server/src/db/schema.ts`

```typescript
// Inter-character relationship tracking for CAST mode
export const castRelationships = pgTable(
  'cast_relationships',
  {
    sessionId: varchar('session_id', { length: 255 }).notNull(),
    charAId: varchar('char_a_id', { length: 255 }).notNull(),
    charBId: varchar('char_b_id', { length: 255 }).notNull(),
    relationshipType: varchar('relationship_type', { length: 50 }), // RIVAL, ALLY, RIVALRY, etc.
    tension: integer('tension').notNull().default(0),
    updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.charAId, t.charBId] }),
    index('cast_relationships_session_idx').on(t.sessionId),
  ],
);
```

### Step 3: Wire CastRelationships in UI (LOW RISK)

**File:** `packages/web/src/app/chat/[sessionId]/_components/CastRoster.tsx`

Add inter-character relationship indicators (e.g., rivalry glow between characters).

### Step 4: ConversationPrelude for CAST (LOW RISK)

**File:** `packages/web/src/app/chat/[sessionId]/_components/ConversationPrelude.tsx`

Display cast roster summary when mode === 'CAST':
- "Cast of [N] characters"
- Character avatars in row
- Story opening card with cast title

---

## C. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| File rename breaks imports | MEDIUM | LOW | Update all import paths in orchestrator.ts |
| CastRelationships unused | LOW | MEDIUM | It's an enhancement, not blocking |
| CastRoster not visible | LOW | LOW | Correctly hides when < 3 chars |

---

## D. Files to Modify/Create

| File | Action | Risk |
|------|--------|------|
| `packages/server/src/services/harem-turn-selector.ts` | RENAME | LOW |
| `packages/server/src/services/harem-stats-repo.ts` | RENAME | LOW |
| `packages/server/src/services/orchestrator.ts` | UPDATE imports | LOW |
| `packages/server/src/db/schema.ts` | ADD table | MEDIUM |
| `packages/web/src/.../CastRoster.tsx` | ENHANCE | LOW |
| `packages/web/src/.../ConversationPrelude.tsx` | ADD CAST branch | LOW |

---

## E. Testing Checklist

- [ ] Verify turn planning selects correct MAIN_SPEAKER
- [ ] Verify REACTOR + SILENT assignment limits
- [ ] Verify CastRoster highlights active speaker
- [ ] Verify CastRoster hides when < 3 characters
- [ ] Verify speaker sprite switches on [SPEAKER:] tag

---

## F. Related Documentation

- `docs/PLANCHATv3.md` §3.2 — CAST mode spec
- `docs/PLANCHATv3.md` §3.3 — Orchestrator refactor
- `packages/server/src/services/harem-turn-selector.ts` — Turn planning logic
- `packages/web/src/app/chat/[sessionId]/_components/CastRoster.tsx` — Cast UI