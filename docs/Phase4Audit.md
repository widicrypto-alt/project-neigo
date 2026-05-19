# Phase 4 Production Audit — Arc System

**Date:** 2026-04-25
**Scope:** Arc Save System — `arc-manager.ts`, `stats-parser.ts`, `orchestrator.ts`, `sessions.ts`, `ArcCheckpoint.tsx`, `page.tsx`
**Reference:** `docs/Phase4Plan.md`, `docs/PLANCHATv3.md §4.1`

---

## A. Executive Verdict

**Phase 4 is FUNCTIONAL but NOT fully production-ready.**

✅ **Data pipeline** — end-to-end wired (STORY mode)
✅ **API endpoint** — `GET /api/sessions/:id/arcs` exists and returns correctly
✅ **UI badge** — `ArcCheckpoint` renders in page.tsx header
⚠️ **CAST mode arc detection** — dead code (tag already stripped before re-parse)
⚠️ **CAST transcript window** — too narrow, misses secondary character messages
⚠️ **Fallback arc summary** — saves content-free string to DB on LLM failure
❌ **Arc onclick handler** — empty (`/* future: arc history panel */`)
❌ **Arc summary quality** — 15/25 (threshold: 18/25); no dynamic state captured

---

## B. Data Flow Verification

### STORY mode — PASS

```
Model emits [ARC_SAVE] or [ARC_SAVE: Title]
  → stats-parser.ts parseAndStripArcSave() — strips tag, returns { arcSave }
  → orchestrator.ts runMainCharacterPass() line 1440 — detects trigger
  → saveModelTriggeredArc() → generateArcSummary() → saveArcCheckpoint()
  → memories table: type=SUMMARY, content=JSON_prefix+summary
  → GET /api/sessions/:id/arcs → getArcCheckpoints()
  → page.tsx useQuery(['arcs', sessionId])
  → <ArcCheckpoint turnCount={...} title={...} />
```

Every step is verified from code.

### CAST mode — PARTIAL FAIL

CAST calls `runMainCharacterPass()` which strips [ARC_SAVE] and saves the cleaned
content to DB. The CAST-specific arc detection block (orchestrator.ts:1140–1175)
then re-reads the DB message and calls `parseAndStripArcSave(lastMsg.content)` —
but the tag is already gone. `arcSave.triggered` is always `false` in this path.

**Net effect:** Model-triggered arc saves for CAST sessions are actually handled
inside `runMainCharacterPass()` (STORY path), not the CAST-specific block. The
CAST block is dead code. Functionality is correct via the STORY path; the dead
code block is misleading but harmless because `hasArcAtTurn()` deduplication
prevents double-saves.

Auto-trigger (every 30 turns) fires correctly for CAST via `shouldAutoTriggerArc()`
at orchestrator.ts:1161 — this path is NOT dead.

---

## C. Structural Bugs

### Bug 1 — CAST Transcript Window Too Narrow

**File:** `packages/server/src/services/arc-manager.ts:173–174`

**Code:**
```typescript
const fromIdx = fromTurn * 2 - 2;
const toIdx   = toTurn * 2 + 2;     // ← assumes only N*2+1 for ASSISTANT
```

**Actual orchestrator turnIndex encoding (verified):**
```
N*2 + 0  → USER
N*2 + 1  → NARRATOR or CHARACTER_MAIN
N*2 + 2  → second CHARACTER pass
N*2 + 3  → REACTOR
N*2 + 4  → SILENT
N*2 + 5  → WHISPER
```

**Impact:** For CAST sessions, messages at offsets +3, +4, +5 (REACTOR, SILENT,
WHISPER) for the final turn in the window are excluded from the arc summary
transcript. Background reactions and whisper drama — the defining content of
CAST mode — are dropped from the summary LLM call.

STORY mode (single character, max N*2+1) is unaffected.

**Fix:** Change `toIdx = toTurn * 2 + 2` → `toIdx = toTurn * 2 + 6`.

---

### Bug 2 — Fallback Summary Saves Content-Free String

**File:** `packages/server/src/services/arc-manager.ts:273–275`

**Code:**
```typescript
const fallbackSummary = `Story arc covering turns ${fromTurn}–${currentTurn}. Key events occurred during this segment.`;
checkpoint = await saveArcCheckpoint(sessionId, currentTurn, fallbackSummary, arcTitle);
```

This fires when `generateArcSummary()` returns null (LLM failure, network error,
or summary length < 40 chars). The string is semantically empty but persists to
DB as a SUMMARY-type memory and is served via the API.

**Impact:** `ArcCheckpoint` badge renders successfully. If arc summaries are
injected into future system prompts (current behavior: they are not, but this
is the designed use), this string would consume context tokens while contributing
no narrative information — worse than nothing.

**Fix:** Do not call `saveArcCheckpoint()` when summary is null. Log a warning
and return `{ compaction, checkpoint: null }` instead.

---

## D. Arc Summary Quality Score

Evaluated against `generateArcSummary()` system prompt (arc-manager.ts:204–221):

| Criterion | Score (0–5) | Notes |
|-----------|-------------|-------|
| Narrative Integrity | 4 | Rules cover conflicts, revelations, emotional progression, unresolved threads |
| Key Event Coverage | 3 | Transcript is complete for STORY; CAST final-turn secondary beats missed (Bug 1) |
| Character State Accuracy | 2 | No trust score, mood, or relationship stage injected into summary prompt — model infers from dialogue only |
| Continuity Safety | 2 | Fallback fires on LLM failure; saves content-free string; no quality gate |
| Compression Quality | 3 | 350 max tokens, 3–5 sentences, third-person prose is correct. REACTOR/SILENT/WHISPER collapsed to "Character" — speaker identity lost in CAST summaries |

**Total: 14/25 — Below production threshold (18/25)**

Primary driver of low score: no dynamic state capture and unchecked fallback path.

---

## E. Additional Findings

### 1. ArcCheckpoint onClick is empty

**File:** `packages/web/src/app/chat/[sessionId]/page.tsx:1114`

```tsx
onClick={() => {/* future: arc history panel */}}
```

The badge has full click affordance (`hover:bg-accent-500/20`, `cursor-pointer`)
but performs no action. Users who tap the pulsing checkpoint badge get no
response. Either the affordance must be removed or a minimal arc detail sheet
must be implemented.

### 2. userId hardcoded to 'system'

**File:** `packages/server/src/services/arc-manager.ts:95`

```typescript
userId: 'system',
```

`getArcCheckpoints()` does not filter by userId (only sessionId + type), so
there is no current retrieval impact. However, if future queries add userId
constraints, arc checkpoints will be invisible. Low severity, track for Phase 4+.

### 3. Arc summaries don't capture dynamic state

`generateArcSummary()` builds a transcript from `chatMessages` only. It does
not load `characterDynamicStates.trustScore`, `mood`, or `lastRelationshipStage`
at checkpoint time. Model must infer relationship state from dialogue alone.

For current use (forward continuity via live DB state), this is acceptable.
For future rewind/restore functionality, the arc checkpoint will be incomplete
without persisted dynamic state.

---

## F. Production Readiness Assessment

| Component | Status | Verdict |
|-----------|--------|---------|
| STORY mode arc save (model-triggered) | ✅ Wired | SHIPS |
| STORY mode arc save (auto 30-turn) | ✅ Wired | SHIPS |
| CAST mode arc save (model-triggered) | ⚠️ Works via STORY path; CAST block is dead code | SHIPS (with note) |
| CAST mode arc save (auto 30-turn) | ✅ Wired | SHIPS |
| API endpoint | ✅ Wired | SHIPS |
| ArcCheckpoint badge (read-only) | ✅ Renders | SHIPS (remove click affordance) |
| ArcCheckpoint history/rewind | ❌ Empty handler | DEFERRED |
| Arc summary quality (STORY) | ⚠️ 14/25 | SHIPS WITH KNOWN LIMITATION |
| Arc summary quality (CAST) | ⚠️ 12/25 (Bug 1 degrades further) | BLOCKED BY Bug 1 |
| Fallback summary | ⚠️ Saves garbage on LLM failure | FIX BEFORE SHIP |
| Background auto-generation | ❌ Not implemented | DEFERRED |

---

## G. Required Fixes

| Priority | Fix | File | Status |
|----------|-----|------|--------|
| HIGH | Do not save fallback summary to DB; return null on LLM failure | `arc-manager.ts:273–275` | ✅ FIXED 2026-04-25 |
| MEDIUM | Widen CAST transcript window: `toIdx = toTurn * 2 + 6` | `arc-manager.ts:174` | ✅ FIXED 2026-04-25 |
| MEDIUM | Remove click affordance from ArcCheckpoint or implement basic detail sheet | `ArcCheckpoint.tsx` + `page.tsx` | ✅ FIXED 2026-04-25 |
| LOW | Dead code comment: document CAST arc detection block is intentionally superseded | `orchestrator.ts:1140` | deferred |

---

## H. What Ships Now vs Deferred

### Ships ✅ (all bugs fixed as of 2026-04-25):
- Arc checkpoint creation (model-triggered + auto every 30 turns) — STORY + CAST
- Arc retrieval endpoint
- ArcCheckpoint badge (top-left, shows latest arc title, read-only, non-interactive)
- CAST transcript window fixed: covers offsets N*2+0..N*2+5
- Fallback summary removed: null summaries skip checkpoint entirely

### Deferred:
- Arc history panel (rewind to past checkpoints)
- AI background generation (R2 + Cloudflare AI Images)
- Dynamic state (trust/mood) capture in arc summaries
- Arc-to-arc continuity chaining
