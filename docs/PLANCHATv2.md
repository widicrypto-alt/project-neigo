# PLANCHATv2 — Implementation Plan

> **Date:** 2026-04-24  
> **Depends on:** PLANCHATv1 (gap analysis)  
> **Format:** Phases ordered by impact/effort ratio  
> **Author:** Claude Sonnet 4.6

---

## Phase 0 — Quick Fixes (P0, XS effort, immediate impact)

These are bugs or near-trivial changes with high UX impact.

### 0.1 Fix `detectEmotion` not called in main `send()` done handler

**File:** `packages/web/src/app/chat/[sessionId]/page.tsx`  
**Lines:** ~749–773 (the `done` case in `send()`)

```typescript
// Inside the 'done' case, after setBubbles mapping:
setBubbles((b) =>
  b.map((x) => {
    if (!msgBuffers.has(x.id)) return x;
    const finalText = chatStreamingBuffer.getSnapshot(x.id);
    // ADD THIS:
    if ((x.kind === 'character' || x.kind === 'narrator') && finalText) {
      const emotion = detectEmotion(finalText);
      if (emotion) setDetectedEmotion(emotion);
    }
    return { ...x, content: finalText, pending: false };
  }),
);
```

**Needed import:** `detectEmotion` is already imported at top of file? Check — if not, add:
```typescript
import { detectEmotion } from '@/lib/content-detect';
```

---

### 0.2 Hide PresenceStrip when idle + neutral

**File:** `packages/web/src/app/chat/[sessionId]/_components/PresenceStrip.tsx`

```typescript
export function PresenceStrip({ presence, ... }) {
  // Hide when truly idle — sprites speak for themselves
  if (presence.activity === 'idle' && presence.affect === 'neutral') return null;
  // ... rest unchanged
}
```

Also: Remove the `affectLabel()` from the strip — just show activity.

---

### 0.3 Fix ConversationPrelude for multi-char / returning sessions

**File:** `packages/web/src/app/chat/[sessionId]/_components/ConversationPrelude.tsx`

Changes needed:
1. Hide the "First Meeting" card entirely when `turnCount > 0` (user is returning to an existing session)
2. For multi-char casts, change heading from "First Meeting · 初対面" to "Story Opens"
3. For multi-char casts, change title from "You and [Name]" to cast names joined

**Requires:** Pass `castSubset` + `turnCount` as props to `ConversationPrelude`, or extend `SessionState` type.

The simplest approach: extend `SessionState` in `types.ts` with `castNames?: string[]` and `turnCount?: number`, populated from `session.data`.

---

## Phase 1 — Emotion Tag Pipeline (P1, M effort, high impact)

This is the most impactful single improvement: direct LLM-emitted emotion → sprite sync.

### 1.1 Add `[EMOTION: X]` directive to prompt

**File:** `packages/server/src/prompts/builder.ts`  
**Method:** `buildRoleplayPrompt`

Add to the Stats Emission section:
```
## Emotion Emission
At the end of your response (on its own line after the blank line):
[EMOTION: KEY]
KEY must be one of: neutral, happy, sad, surprised, angry, embarrassed, curious, scared, smug, tender, conflicted, shy
Pick the emotion that best describes the character's facial expression in the final beat of your response.
Emit this on the SAME line as [STATS:] or on the line after it.
Combined example: [STATS: trust=+1|mood=warm] [EMOTION: happy]
```

Also add to `buildHaremPrompt` with per-character syntax:
```
## Emotion Emission (per active speaker)
[EMOTION: KEY character=NAME]
```

### 1.2 Parse `[EMOTION:]` tag in server chat route

**File:** `packages/server/src/routes/chat.ts`

In the response parser (wherever `[STATS:]` and `[STATE:]` are parsed):
```typescript
const EMOTION_TAG_RE = /\[EMOTION:\s*([a-z]+)(?:\s+character=(\w+))?\]/i;
const emotionMatch = line.match(EMOTION_TAG_RE);
if (emotionMatch) {
  const emotion = emotionMatch[1].toLowerCase();
  const characterName = emotionMatch[2] ?? null;
  yield { type: 'emotion', emotion, characterName };
}
```

### 1.3 Add `emotion` SSE event type to shared types

**File:** `packages/shared/src/types.ts` (wherever `SseEvent` is defined)

```typescript
| { type: 'emotion'; emotion: string; characterName?: string | null }
```

### 1.4 Handle `emotion` event in client

**File:** `packages/web/src/app/chat/[sessionId]/page.tsx`

In the `switch (evt.type)` block:
```typescript
case 'emotion':
  setDetectedEmotion(evt.emotion);
  break;
```

Also handle in `handleRegenerate`'s onEvent (same pattern).

### 1.5 Strip `[EMOTION:]` from rendered bubble content

In `chat.ts` when building the content string, strip the emotion tag before saving to DB (like `[STATS:]` and `[STATE:]` are stripped).

---

## Phase 2 — Multi-Character Sprite Switching (P1, M effort)

### 2.1 Fetch sprites for all cast members

**File:** `packages/web/src/app/chat/[sessionId]/page.tsx`

Replace the single `characterId` sprite fetch with a multi-character fetch:

```typescript
// New state
const [spritesMap, setSpritesMap] = useState<Map<string, {
  avatarUrl: string | null;
  spriteSheetUrl: string | null;
  spriteManifest: Record<string, string> | null;
}>>(new Map());

const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

// Fetch sprites for all cast members
const castIds = sceneCardCastSubset ?? (characterId ? [characterId] : []);
useEffect(() => {
  if (castIds.length === 0) return;
  Promise.all(
    castIds.map(async (id) => {
      const [charData, manifestData] = await Promise.allSettled([
        api.get<{ character: Character }>(`/api/characters/${id}`),
        api.get<{ manifest: { expressions: Record<string, string> } }>(
          `/api/characters/${id}/sprite-manifest`
        ),
      ]);
      return {
        id,
        avatarUrl: charData.status === 'fulfilled' ? charData.value.character.avatarUrl : null,
        spriteSheetUrl: charData.status === 'fulfilled' ? charData.value.character.spriteSheetUrl : null,
        spriteManifest: manifestData.status === 'fulfilled' ? manifestData.value.manifest.expressions : null,
      };
    })
  ).then((results) => {
    setSpritesMap(new Map(results.map((r) => [r.id, r])));
  });
}, [castIds.join(',')]);
```

### 2.2 Track active speaker from bubble events

In the `send()` `onEvent` handler, when a character bubble arrives:
```typescript
case 'character':
case 'reactor': {
  if (evt.characterId) setActiveSpeakerId(evt.characterId);
  // ... rest of existing handling
}
```

On `done` event, keep `activeSpeakerId` for the rest of the session (don't reset).

### 2.3 Update SpritePanel to resolve from spritesMap

**File:** `packages/web/src/app/chat/[sessionId]/_components/SpritePanel.tsx`

Pass the active speaker's data:
```typescript
// In page.tsx when rendering SpritePanel:
const activeSprite = spritesMap.get(activeSpeakerId ?? characterId ?? '') 
  ?? spritesMap.get(characterId ?? '');

<SpritePanel
  ...
  spriteSheetUrl={activeSprite?.spriteSheetUrl}
  avatarUrl={activeSprite?.avatarUrl}
  spriteManifest={activeSprite?.spriteManifest}
  ...
/>
```

### 2.4 Speaker name chip in SpritePanel (multi-char)

**File:** `packages/web/src/app/chat/[sessionId]/_components/SpritePanel.tsx`

Add a `speakerName` prop. When `castSubset.length > 1` and `speakerName` differs from primary character:
```tsx
{speakerName && castSize > 1 && (
  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
    <span className="rounded-full bg-ink-900/90 border border-white/[0.10] px-3 py-1 text-xs font-semibold text-ink-100 backdrop-blur-sm">
      {speakerName}
    </span>
  </div>
)}
```

---

## Phase 3 — Prompting Improvements (P2, S-M effort)

### 3.1 Multi-character speaker tags in HAREM/multi-char turns

**File:** `packages/server/src/prompts/builder.ts`

In `buildHaremPrompt`, add:
```
## Speaker Tags (STRICT)
When writing multi-character dialogue or actions, prefix each character's block with:
[SPEAKER: CharacterName]
This lets the UI switch sprites correctly. Example:
[SPEAKER: Luna]
*She turns to you, expression uncertain.*
"I wasn't expecting to see you here."

[SPEAKER: Aria]
*Aria glances between the two of you.*
"Oh, you two know each other?"
```

### 3.2 Parse `[SPEAKER:]` tag in server

In `chat.ts` response parser:
```typescript
const SPEAKER_TAG_RE = /^\[SPEAKER:\s*([^\]]+)\]/;
const speakerMatch = line.match(SPEAKER_TAG_RE);
if (speakerMatch) {
  currentSpeaker = speakerMatch[1].trim();
  // Look up character by name from cast
  currentSpeakerId = castByName.get(currentSpeaker) ?? null;
}
```

### 3.3 Opening scene for multi-char (no "First Meeting" framing)

In `appendOpeningTurnsDirective`:
```
// When castCharacters.length > 1:
'- This is a multi-character scene. ALL cast members are already present.',
'- Do NOT use "First Meeting" energy — treat the cast as already acquainted with context.',
'- Open with the scene in motion: action, dialogue, or reaction already underway.',
```

### 3.4 Narrator-only turn directive

Add a `narratorOnly` flag to `BuildPromptArgs`. When set:
```
## This Turn: NARRATOR ONLY
Write pure narration — no character dialogue this turn.
Describe the scene, environment, and character reactions in prose only.
Do not use quotation marks for speech. Use *italics* for subtle internal reactions only.
```

### 3.5 Improve emotion emission consistency

The current `appendOpeningTurnsDirective` should ALSO add:
```
'- Still emit [EMOTION:] even on opening turns.',
```

---

## Phase 4 — ConversationPrelude + User MC Visual (P2, S effort)

### 4.1 Smart ConversationPrelude

**File:** `packages/web/src/app/chat/[sessionId]/_components/ConversationPrelude.tsx`

Extend `SessionState` type (or pass props):
```typescript
interface ConversationPreludeProps {
  state: SessionState;
  castNames?: string[];    // resolved from sceneCardCastSubset
  turnCount?: number;      // session.turnCount
  activeMcName?: string | null;
}
```

Logic:
```typescript
function ConversationPrelude({ state, castNames, turnCount, activeMcName }) {
  // Returning session — show minimal "continuing" header
  if ((turnCount ?? 0) > 0) {
    return <ContinuingHeader state={state} castNames={castNames} />;
  }
  
  // Multi-character first opening
  if (castNames && castNames.length > 1) {
    return <StoryOpensCard castNames={castNames} activeMcName={activeMcName} />;
  }
  
  // Single character first meeting
  return <FirstMeetingCard state={state} />;
}
```

`StoryOpensCard`:
```tsx
<div className="rounded-[1.75rem] border border-white/[0.06] ...">
  <div className="text-[10px] uppercase tracking-[0.22em] text-accent-400 mb-1.5">
    Story Opens
  </div>
  <div className="display text-base text-ink-50">
    {castNames.join(' · ')}
  </div>
  {activeMcName && (
    <div className="text-[11px] text-ink-500 mt-2">
      Playing as <span className="text-ink-200">{activeMcName}</span>
    </div>
  )}
</div>
```

### 4.2 User MC bubble distinction

**File:** `packages/web/src/app/chat/[sessionId]/_components/BubbleView.tsx`

When `mcName` prop is present and bubble is `kind === 'user'`:
```tsx
// Add mcName prop to BubbleView
if (b.kind === 'user') {
  return (
    <div className="flex justify-end animate-fade-up pl-16 md:pl-32">
      {mcName && (
        <span className="self-end mb-1 mr-2 text-[10px] font-medium uppercase tracking-[0.14em] text-warmth-400/80">
          {mcName}
        </span>
      )}
      <div
        className="max-w-xl rounded-[1.6rem] px-4 py-2.5 text-sm text-white ..."
        style={{ background: mcName
          ? 'linear-gradient(135deg,#f59e0b 0%,#d97706 55%,#b45309 115%)' // amber for MC
          : 'linear-gradient(135deg,#ec4899 0%,#db2777 55%,#8b5cf6 115%)' // pink default
        }}
      >
        {b.content}
      </div>
    </div>
  );
}
```

Pass `mcName` through from `MessageList` → `BubbleView`.

---

## Phase 5 — UX Polish (P3, S-M effort)

### 5.1 Skip-to-end button during streaming

**File:** `packages/web/src/app/chat/[sessionId]/page.tsx`

When `sending === true`, show a "Skip" button above the composer:
```tsx
{sending && (
  <button
    type="button"
    onClick={() => {
      // Flush all streaming buffers immediately
      msgBuffers.forEach((_, id) => {
        const snap = chatStreamingBuffer.getSnapshot(id);
        if (snap) setBubbles(b => b.map(x => x.id === id ? { ...x, content: snap, pending: false } : x));
      });
    }}
    className="text-[11px] text-ink-500 hover:text-ink-200 transition-colors"
  >
    Skip ▸▸
  </button>
)}
```

### 5.2 Recent emotions expression gallery

**File:** `packages/web/src/app/chat/[sessionId]/_components/SpritePanel.tsx`

Track last 5 detected emotions and show as small sprite thumbnails below the main sprite:
```tsx
// In SpritePanel, below the sprite area:
{recentEmotions.length > 0 && (
  <div className="flex items-center gap-1.5 px-4 py-2 border-t border-white/[0.06]">
    {recentEmotions.map((emotion) => (
      <button
        key={emotion}
        className="h-8 w-8 rounded-lg overflow-hidden border border-white/[0.08] hover:border-white/[0.20]"
        onClick={() => setDetectedEmotionOverride(emotion)}
        title={emotion}
      >
        <img src={spriteManifest?.[emotion] ?? avatarUrl} alt={emotion} className="h-full w-full object-cover" />
      </button>
    ))}
  </div>
)}
```

### 5.3 Improved SceneBreak ornament

**File:** `packages/web/src/app/chat/[sessionId]/_components/BubbleView.tsx`

Current scene bubble already shows text content (location info). Enhancement: add a decorative ornament:
```tsx
if (b.kind === 'scene') {
  return (
    <div className="flex items-center justify-center gap-3 py-3 animate-fade-in">
      <span className="h-px flex-1 bg-white/[0.08]" />
      <div className="flex flex-col items-center gap-1">
        <span className="h-1 w-1 rounded-full bg-white/[0.15]" />   {/* ◆ */}
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink-500 px-1">
          {b.content}
        </span>
      </div>
      <span className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}
```

### 5.4 MemorySection in SpritePanel (reference feature)

**File:** `packages/web/src/app/chat/[sessionId]/_components/SpritePanel.tsx`

Add a collapsible memory section below state chips:
```tsx
{characterBio && (
  <details className="group">
    <summary className="flex items-center justify-between cursor-pointer text-[10px] font-medium uppercase tracking-[0.2em] text-ink-500 hover:text-ink-300">
      Memory
      <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
    </summary>
    <div className="mt-2 space-y-2 text-[12px] text-ink-400">
      {character.lastEvent && <p>{character.lastEvent}</p>}
      {character.currentGoal && <p className="text-ink-300">{character.currentGoal}</p>}
    </div>
  </details>
)}
```

This would require the `/api/sessions/:id/state` endpoint to return relevant character memory snippets.

---

## Phase 6 — VN Text-Box Mode (P3, L effort — future)

The full "classic VN" experience: bottom text box overlay on full-screen art.

### Concept
- Toggle via `vnMode` (already exists as `useVnMode()`)
- When `vnMode === true` AND the current route shows a story session:
  - Story background fills entire viewport
  - Text box floats at bottom 35% with semi-transparent backdrop
  - Click/tap anywhere in the upper 65% to advance to next bubble
  - Character art takes full viewport (not just 20% sidebar)
  - Action buttons become bottom-bar icons

### Key files affected
- `page.tsx` — conditional layout based on `vnMode`
- New component: `VNTextBox.tsx` — bottom overlay with scroll-through bubbles
- `SpritePanel.tsx` — full-screen variant when vnMode active
- `Composer.tsx` — minimal input bar in vnMode

### State management for click-to-advance
```typescript
const [vnReadIndex, setVnReadIndex] = useState(0); // which bubble user has "read"
const advanceVN = () => setVnReadIndex(i => Math.min(i + 1, bubbles.length - 1));
```

---

## Implementation Order

```
Phase 0 (XS, do first):
  ✓ 0.1 Fix detectEmotion in send() done
  ✓ 0.2 Hide PresenceStrip when idle
  ✓ 0.3 Fix ConversationPrelude multi-char

Phase 1 (M, core emotion feature):
  → 1.1 Add [EMOTION:] to prompt
  → 1.2-1.4 Parse + emit + handle in client

Phase 2 (M, multi-char sprites):
  → 2.1-2.4 Multi-char sprite switching + speaker chip

Phase 3 (S, prompt improvements):
  → 3.1-3.5 Speaker tags, narrator-only, opening scene

Phase 4 (S, visual polish):
  → 4.1 Smart ConversationPrelude
  → 4.2 MC bubble distinction

Phase 5 (S-M, UX polish):
  → 5.1 Skip-to-end button
  → 5.2 Expression gallery
  → 5.3 SceneBreak ornament
  → 5.4 MemorySection

Phase 6 (L, future):
  → Full VN text-box mode
```

---

## Files Changed Summary

| Phase | Files |
|-------|-------|
| 0.1 | `page.tsx` |
| 0.2 | `PresenceStrip.tsx` |
| 0.3 | `ConversationPrelude.tsx`, `types.ts` |
| 1.x | `builder.ts`, `chat.ts`, `shared/types.ts`, `page.tsx` |
| 2.x | `page.tsx`, `SpritePanel.tsx` |
| 3.x | `builder.ts`, `chat.ts` |
| 4.1 | `ConversationPrelude.tsx`, `MessageList.tsx`, `page.tsx` |
| 4.2 | `BubbleView.tsx`, `MessageList.tsx` |
| 5.x | `SpritePanel.tsx`, `BubbleView.tsx`, `page.tsx` |
