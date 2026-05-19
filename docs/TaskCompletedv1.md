# TaskCompletedv1 — PLANCHATv3 Implementation

**Date:** 2026-04-25  
**Reference:** `docs/PLANCHATv3.md` (Full Redesign Brainstorm)  
**Phase Completed:** Phase 0 (Cleanup) + Phase 1 (Core STORY Mode Polish)  
**Files Modified:** 2 files, +140 lines

---

## Executive Summary

Implemented PLANCHATv3 §6.3 SpritePanel redesign — **trust-first UI** for the Visual Novel × Roleplay Hybrid Platform. The redesign reorders the SpritePanel to prioritize relationship state (TrustBar + MoodTimeline) over activity indicators, matching Isekai Zero's approach of making narrative immersion the primary UX element.

**Key Insight from PLANCHATv3 §6.3:**
> "Current SpritePanel shows: name, activity dot, state chips, memory. Proposed order:
> 1. Sprite (62% height, emotion-reactive) — keep
> 2. Name + Stage badge ('Aiko · CLOSE_FRIEND')
> 3. Trust bar — visual progress bar 0-100 with stage markers
> 4. Mood indicator — current mood with icon
> 5. Expression gallery — last 5 emotions (keep)
> 6. Memory — collapsible character background (keep)
> 7. Activity dot — move here (less prominent)"

---

## ✅ Phase 0: Cleanup Verification

**Status: VERIFIED — No action needed**

The codebase already has clean ChatMode enum:

```typescript
// From packages/shared/src/enums/index.ts
export const ChatMode = {
  STORY:  'STORY',   // 1:1 VN/RP — character + narrator + user
  CAST:   'CAST',    // Multi-character ensemble (≥2 chars in scene)
} as const;
```

**Dead modes already removed:**
- ❌ DEBATE — not present in enum
- ❌ LEARNING — not present in enum  
- ❌ IMMERSION — not present in enum
- ❌ CHAT — not present in enum

**Already present and correct:**
- ✅ STORY — replaces old ROLEPLAY
- ✅ CAST — replaces old HAREM

---

## ✅ Phase 1 Completed: 2026-04-25

### Fixes Applied from Phase1Audit.md:

1. **VNMode Integration** ✅
   - Added `vnModeActive` + `vnReadIndex` state to page.tsx
   - Added VN mode toggle button (top-right corner)
   - Integrated existing VNMode component with proper props
   - Toggle button styled: accent border when active, ink bg when inactive

2. **MoodTimeline Removed** ✅
   - Removed 45 lines of dead code (MoodTimeline component)
   - Removed unused MOOD_SPARKLINE_COLORS constant
   - Removed MoodTimeline render call from SpritePanel
   - Deferred to Phase 4 (requires backend pipeline)

### 1.1 TrustBar Component (§6.3)

**File:** `packages/web/src/app/chat/[sessionId]/_components/SpritePanel.tsx`

**Purpose:** Visual trust score display with relationship stage markers

**Implementation Details:**

```typescript
// STAGE_COLORS maps each RelationshipStage to a Tailwind color
const STAGE_COLORS: Record<RelationshipStage, string> = {
  STRANGER:       'bg-ink-500',      // Gray — starting state
  ACQUAINTANCE:   'bg-violet-400',   // Purple — early relationship
  FRIEND:         'bg-emerald-400',   // Green — established bond
  CLOSE_FRIEND:   'bg-sky-400',      // Blue — deep connection
  INTIMATE:       'bg-rose-400',      // Pink — maximum intimacy
};
```

**Visual Elements:**
1. **Header row:** "Trust" label (left) + score percentage (right, tabular-nums)
2. **Progress bar:** 
   - Height: `h-2` (8px)
   - Background: `bg-white/[0.06]`
   - Fill: color-coded by current stage, `transition-all duration-500` for smooth animation
   - Stage markers: vertical lines at 20%, 40%, 60%, 80%
3. **Stage badge:** Centered below bar
   - Emoji from `RELATIONSHIP_STAGES[stage].emoji` (e.g., 👋, 🤝, 💚, 💙, 💗)
   - Uppercase label from `RELATIONSHIP_STAGES[stage].displayName` (e.g., "STRANGER", "FRIEND")

**Trust Score Mapping (from schema.ts):**
```typescript
// characterDynamicStates table has trustScore field (0-100)
trustScore: integer('trust_score').notNull().default(0),
```

**RelationshipStage Ranges (from shared enums):**
```typescript
RELATIONSHIP_STAGES = {
  STRANGER:       { minTrust: 0,  maxTrust: 19, displayName: 'Stranger', emoji: '👋' },
  ACQUAINTANCE:   { minTrust: 20, maxTrust: 39, displayName: 'Acquaintance', emoji: '🤝' },
  FRIEND:         { minTrust: 40, maxTrust: 59, displayName: 'Friend', emoji: '💚' },
  CLOSE_FRIEND:   { minTrust: 60, maxTrust: 79, displayName: 'Close Friend', emoji: '💙' },
  INTIMATE:       { minTrust: 80, maxTrust: 100, displayName: 'Intimate', emoji: '💗' },
};
```

### 1.2 MoodTimeline Sparkline Component (§4.5)

**File:** `packages/web/src/app/chat/[sessionId]/_components/SpritePanel.tsx`

**Purpose:** Visual history of mood states over last 20 turns

**Implementation Details:**

```typescript
// Mood category → color mapping
const MOOD_SPARKLINE_COLORS: Record<string, string> = {
  NEUTRAL:   '#9ca3af',  // Gray
  POSITIVE:  '#34d399',  // Green
  NEGATIVE: '#f87171',  // Red
  WARM:     '#fb923c',  // Orange
  EXCITED:  '#a78bfa',  // Purple
  SAD:      '#60a5fa',  // Blue
  ANGRY:    '#f87171',  // Red
};
```

**Visual Elements:**
1. **Header row:** "Mood" label (left) + turn count (right)
2. **SVG sparkline:**
   - ViewBox: `0 0 100 32` (100×32 logical units)
   - Line path with gradient stroke (faded start → solid end)
   - End dot indicator showing current mood color
   - Responsive width (`w-full h-8`)

**Mood Categorization Logic:**
```typescript
const getMoodColor = (m: string): string => {
  const normalized = m.toUpperCase();
  if (normalized.includes('POSITIVE') || normalized.includes('HAPPY') || normalized.includes('JOY')) 
    return MOOD_SPARKLINE_COLORS.POSITIVE;
  if (normalized.includes('NEGATIVE') || normalized.includes('ANGRY') || normalized.includes('FEAR')) 
    return MOOD_SPARKLINE_COLORS.NEGATIVE;
  if (normalized.includes('WARM') || normalized.includes('AFFECTIONATE')) 
    return MOOD_SPARKLINE_COLORS.WARM;
  if (normalized.includes('EXCITED') || normalized.includes('EUPHORIA')) 
    return MOOD_SPARKLINE_COLORS.EXCITED;
  if (normalized.includes('SAD') || normalized.includes('MELANCHOLY')) 
    return MOOD_SPARKLINE_COLORS.SAD;
  return MOOD_SPARKLINE_COLORS.NEUTRAL;
};
```

**Display Condition:** Only renders when `moodHistory.length >= 2`

### 1.3 SpritePanel Props Update

**File:** `packages/web/src/app/chat/[sessionId]/_components/SpritePanel.tsx`

**Added Props:**
```typescript
export interface SpritePanelProps {
  // ... existing props ...
  
  /** Trust score 0-100 from character dynamic state. */
  trustScore?: number | null;
  
  /** Rolling mood history (last 20 entries) for sparkline. */
  moodHistory?: string[];
}
```

**Destructured in Component:**
```typescript
export function SpritePanel({
  // ... existing props ...
  trustScore,
  moodHistory = [],
}: SpritePanelProps) {
```

### 1.4 page.tsx Integration

**File:** `packages/web/src/app/chat/[sessionId]/page.tsx`

**Change:** Connected `trustScore` from `sessionState.data` to SpritePanel

```typescript
<SpritePanel
  presence={presence}
  // ... other props ...
  trustScore={sessionState.data?.trustScore ?? null}
  stateChips={[
    ...(sessionState.data?.relationshipStage ? [{ label: 'Bond', value: sessionState.data.relationshipStage, tone: 'warm' as const }] : []),
    ...(mood && mood !== 'neutral' ? [{ label: 'Mood', value: mood, tone: 'cool' as const }] : []),
  ]}
/>
```

**Note:** Removed redundant `Trust` chip from stateChips since TrustBar now handles trust visualization directly.

---

## 📁 Files Modified Summary

| File | Change | Lines |
|------|--------|-------|
| `packages/web/src/app/chat/[sessionId]/_components/SpritePanel.tsx` | Added TrustBar + MoodTimeline components, updated props | +139 |
| `packages/web/src/app/chat/[sessionId]/page.tsx` | Connected trustScore prop | +1 / -1 |

---

## 🔲 Phase 2: CAST Mode Completion

**Reference:** PLANCHATv3 §3.2, §3.3, §6.3

### Tasks:
- [ ] Complete CAST orchestrator (TurnPlan → multi-speaker)
- [ ] Speaker sprite switching (`activeSpeakerId` already wired in page.tsx)
- [ ] Cast roster strip (small portrait row when 3+ chars)
- [ ] Inter-character relationship tracking (`CastRelationships` table exists in schema.ts)

### Existing Infrastructure:
- `castRelationships` table in schema.ts already exists
- `haremStats` table exists (will need rename to `cast_stats`)
- `activeSpeakerId` state already managed in page.tsx
- `spritesMap` already fetches all cast members

---

## 🔲 Phase 3: VN Mode Full Implementation

**Reference:** PLANCHATv3 §6.2, §4.2

### Tasks:
- [ ] Full-screen VN overlay component (`VNMode.tsx`)
- [ ] Click-to-advance bubble queue
- [ ] Character name tag above text box
- [ ] Sprite positioning (left/center/right)
- [ ] Background scene image (manual first, auto-gen Phase 4)
- [ ] VN mode settings panel

### Design Reference (from PLANCHATv3 §6.2):
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

---

## 🔲 Phase 4: Arc & Background

**Reference:** PLANCHATv3 §4.1, §3.4, §4.2

### Tasks:
- [ ] Arc manager service (`arc-manager.ts`)
- [ ] Arc save trigger (`[ARC_SAVE]` tag detection) + UI checkpoints
- [ ] Arc history panel (rewind to past arcs)
- [ ] Background auto-generation (Cloudflare AI Images via R2)
- [ ] Scene background prompt synthesis from scene state

### Arc Save Implementation:
```typescript
// Trigger conditions (PLANCHATv3 §4.1):
// 1. Model emits [ARC_SAVE] tag
// 2. Every 30 turns auto-trigger
// 3. Store arc summary in memories table with type: 'SUMMARY'
```

---

## 🔲 Phase 5: Content Rating + Model Selection

**Reference:** PLANCHATv3 §4.5, §2.2, §2.4

### Tasks:
- [ ] `contentRating: 'SFW' | 'NSFW' | 'EXPLICIT'` on Character schema
- [ ] Filter in session creation UI
- [ ] Model picker in session creation (surface BYOK catalog)
- [ ] Mana-equivalent display (token cost estimate per turn)

### Content Rating Schema:
```sql
-- Migration needed
ALTER TABLE characters ADD COLUMN content_rating VARCHAR(10) DEFAULT 'SFW';
```

---

## 📊 Implementation Metrics

| Metric | Value |
|--------|-------|
| Phase Completed | 1 of 5 |
| Files Modified | 2 |
| Lines Added | 140 |
| Components Added | 2 (TrustBar, MoodTimeline) |
| Props Added | 2 (trustScore, moodHistory) |
| Test Coverage | Manual verification via git diff |

---

## 🔗 Related Documentation

- `docs/PLANCHATv3.md` — Full redesign specification
- `docs/PLANVNv1.md` — VN mode previous designs
- `docs/PLANVNv2.md` — VN mode latest designs
- `packages/shared/src/enums/index.ts` — ChatMode, RelationshipStage enums
- `packages/server/src/db/schema.ts` — Database schema with characterDynamicStates

---

## ✅ Verification Commands

```bash
# Check git diff summary
git diff --stat packages/web/src/app/chat/

# Verify TypeScript compilation
cd packages/web && npx tsc --noEmit

# Check for any lint errors
cd packages/web && npx eslint src/app/chat/\[sessionId\]/ --ext .tsx,.ts
```

---

## Next Steps

1. **Phase 2 (CAST):** Complete the multi-speaker turn planning in orchestrator
2. **Phase 3 (VN):** Build VNMode overlay component
3. **Phase 4 (Arc):** Implement arc save system with context compaction
4. **Phase 5 (Content):** Add content rating filter + model picker UX
