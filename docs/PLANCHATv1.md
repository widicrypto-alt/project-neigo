# PLANCHATv1 — Chat Redesign Brainstorm & Gap Analysis

> **Date:** 2026-04-24  
> **Scope:** Full brainstorm of what to add, change, and remove from the chat page  
> **Reference:** https://github.com/beranalpa/chat-neigo-project  
> **Inspiration:** isekaizero.ai design patterns  
> **Author:** Claude Sonnet 4.6

---

## 1. Current State Overview

The chat page (`/chat/[sessionId]`) currently has:

| Component | Status |
|-----------|--------|
| VN prose layout (story-scroll, Fraunces italic) | ✅ Implemented (prev session) |
| Inline SpritePanel sidebar (w-1/5, not fixed) | ✅ Implemented (prev session) |
| Emotion detection via `detectEmotion` keyword scan | ✅ Exists in `content-detect.ts` |
| Sprite manifest (emotion → CDN URL) | ✅ Loaded from API |
| `detectedEmotion` state → `WaifuStage` | ✅ Wired |
| Action bar (Continue / Retry / Undo) | ✅ Above composer |
| Multi-character cast support (`sceneCardCastSubset`) | ✅ Partial — primary only |
| User-as-MC / PersonaSwitcher | ✅ Partial |
| SSE keepalive + QUIC fix | ✅ Fixed (prev session) |
| ConversationPrelude ("First Meeting · 初対面") | ⚠️ Always shows, wrong for multi-char |
| Presence strip idle/neutral text | ⚠️ Shows even when nothing is happening |
| Speaker-based sprite switching | ❌ Missing |
| Emotion tag in LLM output (`[EMOTION: X]`) | ❌ Missing — only keyword scan |
| Multi-char story opener text | ❌ Wrong ("You and X" for group casts) |
| `detectEmotion` called in main `send()` done handler | ❌ Bug — only called in `handleRegenerate` |

---

## 2. User's Stated Desires → Analysis

### A. Narrator-based / Visual Novel

**Current:** All AI messages use `display-italic` prose (narrator + character identical style).  
**Gap:** Still missing:
- True VN-style text box at bottom with click-to-advance (optional / toggle)
- Distinct visual treatment between NARRATOR (3rd person prose) vs CHARACTER (spoken dialogue block)
- Currently both use the same `text-ink-100/90` — narrator should be slightly dimmer `text-ink-300/90`

**Recommendation:** Keep the unified prose style (it works well) but add:
1. `kind === 'narrator'` gets `text-ink-300/90` + slightly smaller line-height (already done ✅)
2. Add a VN-mode toggle that presents a classic text box overlay at bottom (optional feature)

---

### B. Sprites detect emotion from AI response (real-time)

**Current:**  
- `detectEmotion(finalText)` is called inside `handleRegenerate`'s done handler ✅  
- `detectEmotion` is **NOT** called in the main `send()` function's `done` handler — **BUG**  
- Emotion is keyword-scanned from prose text (body language descriptions)

**Better approach — LLM-emitted emotion tags:**
- Add `[EMOTION: happy]` to the Stats Emission section of the prompt
- Server parses the tag from the response stream (like `[STATS:]`)
- Emits a new SSE event: `evt.type === 'emotion'` with `evt.emotion` string
- Client updates `detectedEmotion` from the SSE event directly (no keyword guessing)
- Keyword scan as fallback when no `[EMOTION:]` tag present

**Fix needed (minimal):** Wire `detectEmotion` into `send()` done handler — 2 lines.  
**Enhancement:** Add `[EMOTION:]` tag to prompt + SSE event pipeline.

---

### C. Sprites detect who is speaking (multi-character, real-time)

**Current:**  
- `speakerId` is set on each bubble (`evt.characterId`)  
- `primaryCharacterId = sceneCardCastSubset?.[0]` — always the first cast member  
- `SpritePanel` receives only ONE character's sprite data  
- When Character B speaks, sprite still shows Character A

**Plan:**
1. Fetch sprite manifests for ALL cast members (not just primary)
2. Store a `spritesByCharacterId: Map<string, SpriteData>` in page state
3. When a character bubble arrives (`evt.characterId`), update `activeSpeakerId`
4. `SpritePanel` receives `activeSpeakerId` + the sprites map, shows the right character
5. For solo sessions (1 character), behavior unchanged

**Speaker label chip:**
- When `activeSpeakerId !== primaryCharacterId`, show a small character name badge at top of sprite panel
- Helps orient the user in multi-character scenes

---

### D. User as MC / replace character MC

**Current:**  
- PersonaSwitcher lets user pick a persona (name + personality)
- When persona is active, prompt treats user as a named character
- User bubbles always show as pink gradient right-aligned pill

**Desired behavior:**
- If user is "playing as" a character (persona active), their send bubble shows the persona's name tag
- Visual distinction: persona-user bubbles get a different left-aligned style when in deep roleplay mode
- System should understand "User is Luna" in multi-char scenes and not show Luna's sprite (already partially done via `storyPlayAsCharacterId`)

**Changes:**
1. BubbleView: When `b.kind === 'user'` and `mcName` is active, show a small `[mcName]` tag on the bubble or use a different color (amber instead of pink)
2. ConversationPrelude: Show persona name prominently when active
3. Prompt already handles this ✅

---

### E. Stories with 3+ characters: no "First Meeting · 初対面" / "You and X"

**Current:** `ConversationPrelude` always shows:
```
First Meeting · 初対面
You and [characterName]
```

**Problem:** For group casts (harem mode, multi-char stories), "You and Luna" is wrong.

**Fix for ConversationPrelude:**
```tsx
// When castSubset has 2+ characters:
const castNames = castSubset.map(id => characters[id]?.name).filter(Boolean)
const title = castNames.length > 1
  ? castNames.join(' · ')           // "Luna · Aria · Kai"
  : `You and ${state.characterName}`

const heading = castNames.length > 1
  ? 'Story Opens'                   // instead of "First Meeting · 初対面"
  : 'First Meeting · 初対面'
```

Also: For sessions where `turnCount > 0` AND they're NOT a first meeting (already have history), consider hiding the card entirely or replacing with a "Continuing from..." label.

---

### F. Remove idle/neutral presence indicators

**Current:** PresenceStrip always shows `Presence · idle · neutral` when nothing is happening.

**User intent:** Sprites should speak for themselves — no need for text labels when idle.

**Changes:**
1. Hide PresenceStrip entirely when `presence.activity === 'idle'` and `presence.affect === 'neutral'`
2. Only show when actively `thinking`, `typing`, `speaking`, `error`, `listening`
3. Keep the sprite's activity dot in SpritePanel (that's useful)
4. Remove the `affectLabel()` text — keep only the activity label when non-idle

**Implementation:**
```tsx
// In PresenceStrip — add conditional render
if (presence.activity === 'idle' && presence.affect === 'neutral') return null;
```

Or show a simpler "..." dots when thinking instead of the full strip.

---

### G. Prompting improvements for VN/narrator style

**Current prompt directives (ROLEPLAY mode):**
- Third person past tense ✅
- *italics* for action, "quotes" for dialogue ✅
- Format contract (strict separator) ✅
- Stats emission ✅

**Missing/to improve:**

1. **Emotion tag emission** — Add to prompt:
   ```
   ## Emotion Emission
   At the end of each response, emit: [EMOTION: KEY]
   KEY must be one of: neutral, happy, sad, surprised, angry, embarrassed, curious, scared, smug, tender, conflicted, shy
   Pick the emotion that best describes the character's facial expression right now.
   ```

2. **Speaker identification in multi-char** — For HAREM mode, add:
   ```
   ## Speaker Tags
   When multiple characters speak in one response, prefix each block with:
   [SPEAKER: CharacterName]
   This tells the UI which sprite to display.
   ```

3. **Narrator vs character clarity** — Current prompt asks for "third person past tense" but doesn't distinguish:
   - Pure narration (no character speaking) → model should write only prose, no dialogue quotes
   - Character moment (character speaks) → model should use "quoted dialogue"
   - Add: narrator-turn trigger word `[NARRATOR]` when the turn is narration-only

4. **Opening scene for multi-char** — When `castSubset.length > 1` and `turnCount === 0`:
   - Don't start with "First Meeting" energy
   - Use scene-card's `openingNote` or a default "mid-scene" opening
   - Add to `appendOpeningTurnsDirective`: "If this is a multi-character scene, you are already in the scene together"

---

### H. Explore isekaizero.ai patterns (based on training knowledge)

Key patterns from isekai-style AI chat platforms (isekaizero.ai, Character.ai, Spicy AI, etc.):

**Layout:**
- Full-height character art on right/left side (not just 62% panel)
- Translucent text panel floating over background art (not sidebar)
- Gradient background that matches character's color scheme
- Mobile: art fills entire background, text box at bottom 30% of screen

**UX patterns:**
1. **Click/tap to advance** — Tap anywhere to show next text segment (VN-style paging)
2. **Auto-scroll mode** — Option to auto-advance text at reading pace
3. **Swipe left/right** — Navigate between regenerated alternatives (already have swipe ✅)
4. **Expression gallery** — Small strip of emotion thumbnails showing character's current state
5. **Chapter/scene markers** — Prominent scene title cards (not just dividers)
6. **Background music + ambient SFX** — BGM that matches scene mood
7. **Dialogue history sidebar** — Collapsible list of past exchanges
8. **Text speed control** — Slow/fast streaming speed
9. **Skip to end** — Button to finish current streaming output instantly
10. **Save/load points** — Named save points within a session (branch variant)
11. **Gallery** — All character expressions collected from the session
12. **Affection meter** — Visual hearts/bar showing relationship progress (currently in state chips)

**Most valuable to implement NOW (high impact, medium effort):**
- Expression gallery strip below sprite
- Scene title cards with actual styling
- Skip-to-end button for streaming
- Background art behind text (already partially done with `SceneBackground`)

---

## 3. What to ADD

| Priority | Feature | Effort |
|----------|---------|--------|
| P0 | Fix `detectEmotion` not called in main `send()` done handler | XS |
| P0 | Hide PresenceStrip when idle+neutral | XS |
| P0 | Fix ConversationPrelude for multi-char casts | S |
| P1 | Add `[EMOTION: X]` tag to prompt + SSE event + client wiring | M |
| P1 | Multi-character sprite switching (activeSpeakerId) | M |
| P1 | Speaker name chip in SpritePanel for multi-char | S |
| P2 | User (MC) bubble visual distinction when persona active | S |
| P2 | LLM `[SPEAKER: Name]` tag for multi-char turns | M |
| P2 | Narrator-only turn prompt directive | S |
| P3 | Skip-to-end button for streaming | S |
| P3 | Expression gallery strip (current + recent emotions) | M |
| P3 | Scene title card with background preview | M |
| P3 | VN text-box mode toggle (overlay at bottom) | L |

---

## 4. What to REMOVE / SIMPLIFY

| Item | Reason |
|------|--------|
| PresenceStrip when idle+neutral | Clutters the composer area with irrelevant state |
| `First Meeting · 初対面` for multi-char | Contextually wrong; jarring |
| `You and [Name]` for group casts | Wrong when 3+ characters |
| `affect` label in PresenceStrip | Redundant with sprite's visible emotion |
| `Presence` heading label | Redundant — the pill already communicates state |
| Activity dot color for `success` state | Only shown momentarily; can just use idle color |

---

## 5. What to EDIT / IMPROVE

| Item | Current | Target |
|------|---------|--------|
| `narrator` bubble color | `text-ink-300/90` | Correct ✅ |
| `character` bubble color | `text-ink-100/90` | Good ✅ |
| ConversationPrelude | Always "First Meeting" | Smart based on cast + turnCount |
| Emotion detection timing | Only on regen | Every turn done event |
| SpritePanel data | Single character | All cast members |
| Prompt emotion section | No `[EMOTION:]` tag | Add tag emission |
| Multi-char prompt | Only "focused speaker" | Speaker tags per block |
| Opening turns for multi-char | Generic "already mid-thought" | "Already in scene together" |

---

## 6. Architecture Notes

### Sprite switching for multi-char
```
page.tsx:
  spritesByCharId: Map<string, { manifestUrl, spriteManifest, avatarUrl }>
  activeSpeakerId: string | null  ← updated on each character bubble

SpritePanel now receives:
  - characterId: string | null (active speaker)
  - spritesByCharId: Map
  - (resolves the right sprite internally)
```

### Emotion tag pipeline
```
Prompt:
  [EMOTION: KEY] appended to each response

Server (chat.ts parseTag):
  case 'EMOTION': emit({ type: 'emotion', emotion: evt.emotion })

Client (page.tsx):
  case 'emotion': setDetectedEmotion(evt.emotion)
```

### ConversationPrelude smart header
```
castSubset (from session.sceneCard):
  0 or 1 → "First Meeting · 初対面" + "You and [Name]"
  2+     → "Story Opens" + cast names joined with "·"

turnCount > 0 → Don't show the card at all (user is returning)
              OR show "Returning to [Name/Cast]" variant
```

---

## 7. Reference Repo Analysis (chat-neigo-project)

### Architecture
- **Single-page** React app: `StoryExperience` orchestrator + modular components
- **80/20 desktop split**: narrative column (flex-1) + SpriteStage (fixed ~20%)
- **Mobile**: single column, character image as full-screen backdrop behind text

### Component Map (reference → current project equivalent)

| Reference | Current Project | Notes |
|-----------|----------------|-------|
| `StoryExperience` | `page.tsx` | Main orchestrator |
| `MessageStream` | `BubbleView` + `MessageList` | Prose rendering |
| `SpriteStage` | `SpritePanel` + `WaifuStage` | Right panel |
| `StoryPanel` | `MessageList` scroll container | Fade edges ✅ |
| `StateChips` | `SpritePanel` state chips | Collapsible on mobile |
| `MemorySection` | ❌ Not present | backstory/goals/relationship |
| `InputComposer` | `Composer` | Text input |
| `ActionButtons` | Above-composer bar | Continue/Retry/Delete |
| `MetaCard` | `CostEstimateChip` | Inline chip (not collapsible) |
| `ScenarioSwitcher` | `ScenarioPaginationChip` | Already exists ✅ |
| `Header` | Top nav | Different approach |
| `MobileBackdrop` | `SpritePanel` MobileBackdrop | Same approach ✅ |

### Content Types (reference defines 3 roles)
```typescript
type LLMOutput =
  | { kind: "text"; role?: "narration" | "dialogue" | "thought"; text: string; emotion?: string }
  | { kind: "image"; src: string; alt?: string; caption?: string }
  | string  // auto-classified
```
- **narration** → `text-foreground/90` regular serif
- **dialogue** → `font-medium text-primary` (amber/gold)
- **thought** → `italic text-muted-foreground/90`

**Current project has:** `narration`, `dialogue` (via `RichContent`), `silent`/`whisper` — but no explicit `thought` role in BubbleView

### Emotion Detection — Reference Approach
1. `detectEmotion(text)` — keyword regex scan (same as our `content-detect.ts` ✅)
2. Scans **all messages backwards** to find latest emotion (not just the latest turn)
3. Matches emotion → `sprites.find(s => s.emotion === emotion)` from manifest array
4. Image `src` match takes priority over emotion keyword match
5. Falls back to `initialSpriteId`

**Gap:** Our `detectedEmotion` is only updated on turn `done` event, not during streaming. Reference approach scans existing message list — similar but differs in timing.

### Auto-Sprite Logic (reference autoSpriteId)
```typescript
const autoSpriteId = useMemo(() => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const d = normalizeOutput(messages[i])
    if (d.type === "image") {
      const bySrc = sprites.find(s => s.src === d.src)
      if (bySrc) return bySrc.id
      continue
    }
    if (d.emotion) {
      const byEmotion = sprites.find(s => s.emotion === d.emotion)
      if (byEmotion) return byEmotion.id
    }
  }
  return initialSpriteId
}, [messages, sprites, initialSpriteId])
```
**Key difference from ours:** Scans ALL messages (memoized), not just the most recent.

### Scene Break Component
```tsx
function SceneBreak() {
  return (
    <div className="flex items-center justify-center py-2">
      <span className="h-px w-8 bg-border" />
      <span className="mx-3 h-1 w-1 rounded-full bg-border" />
      <span className="h-px w-8 bg-border" />
    </div>
  )
}
// Renders: ─ ◆ ─
```
Our current `scene` bubble renders text content + horizontal lines — more informative but less ornamental.

### Inline Dialogue Parsing (reference renderInlineDialogue)
```typescript
const QUOTE_RE = /("[^"]+"|“[^”]+”)/g
function renderInlineDialogue(text: string): ReactNode[] {
  const parts = text.split(QUOTE_RE)
  return parts.map((p, i) =>
    QUOTE_RE.test(p)
      ? <span key={i} className="font-medium text-primary">{p}</span>
      : p
  )
}
```
Our `parseSegments` in `BubbleView.tsx` handles the same pattern with `text-warmth-400` — functionally equivalent ✅

### MemorySection (reference — we're missing this)
```typescript
interface Memory {
  lastEvent?: string      // "She summoned you accidentally..."
  currentGoal?: string    // "Understand why you were summoned..."
  relationship?: string   // "Reluctant summoner / Curious slime"
}
```
This panel shows character backstory context in the sprite panel. We have state chips (Trust/Bond/Mood) but NOT a memory/goals display.

### Key Reference Differences from Current Project
1. **Font**: Lora (serif) vs our Fraunces — both valid, Fraunces is more distinctive ✅
2. **MemorySection**: Reference shows character memory/goals in sidebar — we show state chips only
3. **Collapsible mobile sections**: Reference collapses States+Memory on mobile — we hide panel entirely
4. **No [EMOTION:] tag**: Reference uses keyword-only detection (same as us currently)
5. **Single character only**: Reference has no multi-character support
6. **No SSE/streaming**: Reference is a static demo — no real streaming infrastructure

---

## 8. Next Steps

1. **PLANCHATv2** — Detailed implementation plan with exact file changes
2. **PLANCHATv3** — Reference repo integration (after agent completes)

Priority order for implementation:
1. P0 fixes (emotion detection bug, idle presence hide, multi-char prelude)
2. P1 emotion tag pipeline (adds real-time expression sync)
3. P1 multi-char sprite switching
4. P2 prompt improvements
5. P3 UX polish (gallery, skip button, VN mode)
