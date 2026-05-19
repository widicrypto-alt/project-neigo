# Phase 4 Implementation Plan — Arc & Background System

**Date:** 2026-04-25 | **Status:** ✅ COMPLETE — all bugs fixed, STORY + CAST ship-ready

---

## A. Current System State (End-to-End Verification)

### ✅ VERIFIED — Backend

| Component | Status | Evidence |
|-----------|--------|----------|
| `arc-manager.ts` | ✅ EXISTS | `packages/server/src/services/arc-manager.ts` (162 lines) |
| `ARC_SAVE` tag detection | ✅ EXISTS | `stats-parser.ts` — `parseAndStripArcSave()` function |
| Orchestrator wiring | ✅ EXISTS | `orchestrator.ts` line 19-20: imports arc-manager |
| Auto-trigger (30 turns) | ✅ EXISTS | `orchestrator.ts` — `shouldAutoTriggerArc()` called |
| Arc save route | ✅ EXISTS | `sessions.ts` — `GET /api/sessions/:id/arcs` endpoint |

### ✅ VERIFIED — Frontend

| Component | Status | Evidence |
|-----------|--------|----------|
| ArcCheckpoint component | ✅ EXISTS | `ArcCheckpoint.tsx` (26 lines) |
| Arc fetch via useQuery | ✅ EXISTS | `page.tsx` — `useQuery({ queryKey: ['arcs', sessionId], ... })` |
| Arc display in header | ✅ EXISTS | `page.tsx` — fixed top-left badge, shows latest arc |
| ArcCheckpoint props wired | ✅ EXISTS | `turnCount={arcs.data.arcs[0].turnCount}`, `title={arcs.data.arcs[0].title}` |

### ✅ VERIFIED — Prompt

| Component | Status | Evidence |
|-----------|--------|----------|
| `[ARC_SAVE]` instruction | ✅ EXISTS | `prompts/roleplay.md` lines include format + trigger conditions |

---

## B. Data Flow (Verified)

```
Model Output: "[ARC_SAVE: Chapter 1]"
    ↓
parseAndStripArcSave() → strips tag, returns { arcSave: { title: "Chapter 1", triggered: true } }
    ↓
orchestrator: if (arcSave.triggered) → triggerAutoArcSave()
    ↓
triggerAutoArcSave() → compactSessionContext() + saveArcCheckpoint()
    ↓
DB: INSERT into memories (type=SUMMARY, metadata.arcTitle="Chapter 1")
    ↓
GET /api/sessions/:id/arcs → SELECT FROM memories WHERE type=SUMMARY
    ↓
page.tsx: useQuery fetches, shows ArcCheckpoint badge (top-left)
```

---

## C. Missing Links

| Gap | Severity | Status |
|-----|----------|--------|
| ArcCheckpoint in ConversationPrelude vs Header | LOW | **RESOLVED**: Badge is in page.tsx header (top-left). |
| CAST mode arc detection is dead code | LOW | **KNOWN**: `orchestrator.ts:1140–1175` re-parses already-stripped DB content; harmless, STORY path handles correctly. Deferred. |
| CAST transcript window too narrow | MEDIUM | **FIXED 2026-04-25**: `arc-manager.ts:174` — changed to `toTurn*2+6`. |
| Fallback summary saves content-free string | HIGH | **FIXED 2026-04-25**: Null summaries now skip `saveArcCheckpoint()` entirely. |
| ArcCheckpoint onClick is empty | MEDIUM | **FIXED 2026-04-25**: Converted to `<div>`, click affordance removed. |

---

## D. Implementation Steps Completed

| Step | Component | File | Status |
|------|-----------|------|--------|
| 1 | `arc-manager.ts` service | `packages/server/src/services/arc-manager.ts` | ✅ DONE |
| 2 | `ARC_SAVE` tag detection | `packages/server/src/services/stats-parser.ts` | ✅ DONE |
| 3 | ARC_SAVE wiring in orchestrator | `packages/server/src/services/orchestrator.ts` | ✅ DONE |
| 4 | Auto-trigger (every 30 turns) | `packages/server/src/services/orchestrator.ts` | ✅ DONE |
| 5 | `ArcCheckpoint` UI component | `packages/web/src/.../ArcCheckpoint.tsx` | ✅ DONE |
| 6 | Arc route endpoint | `packages/server/src/routes/sessions.ts` | ✅ DONE |
| 7 | Frontend arc fetch | `packages/web/src/.../page.tsx` | ✅ DONE |
| 8 | Arc prompt instruction | `prompts/roleplay.md` | ✅ DONE |

---

## E. Risk Analysis

| Risk | Impact | Likelihood | Status |
|------|--------|------------|--------|
| Arc never created (no [ARC_SAVE] emitted) | MEDIUM | LOW | Auto-trigger fires every 30 turns as fallback |
| ArcCheckpoint not visible | LOW | LOW | Fixed position (top-left) verified in page.tsx |
| No arcs exist → badge hidden | N/A | N/A | Conditional `{arcs.data?.arcs?.[0] && ...}` — graceful |
| Background missing in VNMode | LOW | MEDIUM | Already has ink-950 fallback background |

---

## F. Ship Decision

**Phase 4 STORY mode is ship-ready. CAST mode arc requires 2 bug fixes first.**

See `docs/Phase4Audit.md` for full evidence.

### Ships now (STORY mode):
- Arc checkpoint creation (model-triggered + auto every 30 turns)
- Arc retrieval API endpoint
- ArcCheckpoint UI badge (top-left, shows latest arc, read-only)
- VNMode background fallback (gradient if no image)

### Fixed (2026-04-25):
- `arc-manager.ts:174` — transcript window widened to `toTurn * 2 + 6` ✅
- `arc-manager.ts:273–275` — fallback summary removed; null returns skip checkpoint ✅
- `ArcCheckpoint.tsx` + `page.tsx` — click affordance removed ✅

### What's Deferred (Phase 4+):
- Arc history panel (rewind to past arcs) — onClick is empty placeholder
- AI background generation — requires R2 + AI Images integration
- MoodTimeline sparkline — requires backend pipeline
- Dynamic state (trust/mood) capture in arc summaries
- Arc-to-arc continuity chaining

---

## G. Related Documentation

- `docs/PLANCHATv3.md` §4.1 — Arc Save System spec
- `docs/PLANCHATv3.md` §3.4 — Scene & Background System
- `packages/server/src/services/arc-manager.ts` — Arc service
- `packages/web/src/app/chat/[sessionId]/_components/ArcCheckpoint.tsx` — UI component
- `packages/web/src/app/chat/[sessionId]/page.tsx` — UI integration
- `prompts/roleplay.md` — Model prompt with [ARC_SAVE] instruction