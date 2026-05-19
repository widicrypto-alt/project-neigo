# Chat Page Experience Layer Specification

**Status:** Draft v1  
**Created:** 2026-04-25  
**Parent Spec:** Character Rendering Architecture

---

## Overview

This document extends the [Character Rendering Architecture](./PLANVNv2.md) to define the complete Chat Page Experience Layer — the visual novel/roleplay interface combining character sprites, narrative display, user input, and atmospheric effects.

---

## Component Hierarchy

```
┌──────────────────────────────────────────────────────────────────────┐
│                        ChatPage (layout root)                        │
├─────────────────────────────┬────────────────────────────────────────┤
│                             │                                        │
│   CharacterStage (fixed)     │         ChatColumn (scrollable)       │
│   ├── AtmosphereLayer       │         ├── ChatHeader                │
│   │   ├── ParallaxBG        │         ├── MessageStream            │
│   │   ├── MoodLighting      │         │   └── Bubble[]              │
│   │   └── DustMotes         │         └── InputBar                  │
│   ├── SpriteLayer           │             ├── ModeSelector           │
│   │   ├── CurrentSprite     │             ├── Textarea              │
│   │   └── NextSprite        │             └── ActionButtons         │
│   ├── ExpressionGallery     │                                        │
│   └── EdgeGradients         │                                        │
│                             │                                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 1. CharacterStage (Fixed Panel)

### 1.1 Position & Dimensions

```css
.character-stage {
  position: fixed;
  left: 0;
  top: 0;
  width: 32%;           /* 32% of viewport */
  min-width: 360px;
  max-width: 560px;
  height: 100vh;
  z-index: 10;
}
```

### 1.2 AtmosphereLayer

**Parallax Background:**
- 3 depth layers: far (wall/window), mid (furniture), near (candles)
- Each layer responds to mouse position with different parallax intensity
- Far: 8px offset, Mid: 16px offset, Near (sprite): 6px offset

**Mood Lighting:**
```tsx
const MOOD_PRESETS = {
  candlelight: {
    key: 'rgba(255, 178, 110, 0.55)',
    rim: 'rgba(255, 200, 130, 0.35)',
    ambient: 'radial-gradient(ellipse 75% 60% at 50% 60%, rgba(80, 40, 18, 0.4) 0%, rgba(20, 12, 8, 0.85) 60%, rgba(8, 5, 3, 1) 100%)',
    tint: 'rgba(255, 160, 80, 0.10)'
  },
  moonlight: { /* ... */ },
  dawn: { /* ... */ }
}
```

**Dust Motes:**
- 12-14 floating particles
- Random drift animation (18-40s cycle)
- Opacity: 0.3-0.7
- Size: 1-3.5px

### 1.3 SpriteLayer

**Crossfade Transition:**
```css
.sprite-fade {
  transition: opacity 700ms ease, filter 900ms ease, transform 900ms ease;
}
```

**State Machine:**
```tsx
type CrossfadePhase = 'idle' | 'fading-out' | 'fading-in';

interface SpriteTransition {
  currentUrl: string;
  targetUrl: string;
  phase: CrossfadePhase;
  onComplete: () => void;
}
```

**Emotion States:**
```tsx
type Emotion = 'neutral' | 'smile' | 'laugh' | 'angry' | 'surprised' | 'sad' | 'thinking' | 'confused';
```

### 1.4 Expression Gallery

- Horizontal strip showing recent emotions (last 5 unique)
- Thumbnails with 48px height
- Click to pin emotion on sprite
- Auto-clears when new emotion arrives

---

## 2. ChatColumn (Scrollable Panel)

### 2.1 Layout

```css
.chat-column {
  flex: 1;
  overflow-y: auto;
  padding-top: 48px;
  padding-bottom: 240px;  /* Space for input bar */
}
```

### 2.2 Message Types

```tsx
type MessageType = 'narration' | 'dialogue' | 'thought' | 'action';

interface MessageNode {
  id: string;
  type: MessageType;
  speaker?: string;
  parts?: Array<{ kind: 'q' | 't'; text: string }>;
  text?: string;
  emotion?: string;  // For character dialogue
}
```

### 2.3 Bubble Styling

| Type | Style |
|------|-------|
| narration | EB Garamond 18.5px, #efe6d4, margin-bottom 26px |
| dialogue | Amber (#f4b870) highlighted quotes, speaker name badge |
| thought | Italic, 55% opacity, left border accent |
| action | Extra top margin (36px), used for scene beats |

### 2.4 Streaming Behavior

```tsx
// Paragraph-by-paragraph reveal
const revealDelay = 380 + Math.random() * 380; // 380-760ms per paragraph

// Auto-scroll to bottom on new message
scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
```

---

## 3. InputBar

### 3.1 Mode Selector

```tsx
const MODES = [
  { id: 'dialogue', label: 'Bicara', hint: 'Speak as the character' },
  { id: 'action', label: 'Aksi', hint: 'Perform an action' },
  { id: 'thought', label: 'Pikiran', hint: 'Share internal thoughts' },
];
```

### 3.2 Glass Container Styling

```css
.input-glass {
  background: rgba(20, 14, 9, 0.6);
  backdrop-filter: blur(20px) saturate(1.4);
  border: 1px solid rgba(232, 162, 90, 0.12);
  border-radius: 14px;
  transition: border-color 220ms ease;
}

.input-glass:focus-within {
  border-color: rgba(232, 162, 90, 0.35);
  box-shadow: 0 0 0 3px rgba(232, 162, 90, 0.06);
}
```

### 3.3 Action Buttons

- **Kirim** (Send) — Primary amber gradient button
- **Lanjut** (Continue) — Secondary, requests character continuation
- **Ulang** (Retry) — Regenerate last response
- **Hapus** (Clear) — Clear input

---

## 4. Animations

### 4.1 Keyframe Definitions

```css
/* Breathing (idle) */
@keyframes breathe {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-3px) scale(1.006); }
}

/* Candle flicker */
@keyframes flicker {
  0%, 100% { opacity: 0.92; }
  20% { opacity: 0.78; }
  40% { opacity: 1; }
  65% { opacity: 0.85; }
  80% { opacity: 0.95; }
}

/* Eye blink */
@keyframes blinkEye {
  0%, 92%, 100% { transform: scaleY(1); }
  94%, 96% { transform: scaleY(0.1); }
}

/* Dust drift */
@keyframes dustDrift {
  0% { transform: translate(0, 100vh); opacity: 0; }
  10% { opacity: 0.6; }
  90% { opacity: 0.6; }
  100% { transform: translate(20px, -10vh); opacity: 0; }
}

/* Paragraph reveal */
@keyframes paragraphIn {
  from { opacity: 0; transform: translateY(6px); filter: blur(2px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
```

### 4.2 Transition Timings

| Transition | Duration | Easing |
|------------|----------|--------|
| Sprite crossfade | 700ms | ease |
| Sprite filter | 900ms | ease |
| Sprite transform | 900ms | ease |
| Parallax move | 400ms | cubic-bezier(.2,.6,.2,1) |
| Input focus | 220ms | ease |
| Button hover | 180ms | ease |

---

## 5. SSE Event Handling

### 5.1 Emotion Events

```tsx
interface EmotionEvent {
  type: 'emotion';
  emotion: string;  // e.g., "surprised", "angry", "neutral"
}

function applyEmotion(emotion: string) {
  setDetectedEmotion(emotion);
  setRecentEmotions(prev => {
    const deduped = [emotion, ...prev.filter(e => e !== emotion)];
    return deduped.slice(0, 5);
  });
}
```

### 5.2 Content Detection (Fallback)

```tsx
// If LLM doesn't provide explicit emotion, detect from text
const detectedEmotion = detectEmotion(finalText);
if (detectedEmotion) applyEmotion(detectedEmotion);
```

---

## 6. Mobile Responsiveness

### 6.1 Breakpoints

| Breakpoint | Layout |
|------------|--------|
| < 768px | Character behind chat (blurred backdrop) |
| 768px - 1024px | 30% character stage |
| > 1024px | 32% character stage |

### 6.2 Mobile Character Backdrop

```tsx
// When screen < md, character becomes blurred backdrop
{isMobile && (
  <div className="mobile-backdrop">
    <img src={spriteUrl} className="blur-lg opacity-30" />
  </div>
)}
```

---

## 7. Performance Considerations

### 7.1 Sprite Preloading

```tsx
useEffect(() => {
  if (!spriteManifest) return;
  // Preload critical emotions on mount
  const critical = ['neutral', 'happy', 'surprised'];
  for (const url of critical.map(k => spriteManifest[k]).filter(Boolean)) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = url;
    document.head.appendChild(link);
  }
}, [spriteManifest]);
```

### 7.2 Image Format

- **WebP** preferred (90% smaller than PNG)
- **PNG** fallback
- Sprite dimensions: 800×450 (16:9) or 600×800 (3:4 portrait)

### 7.3 Animation Optimization

```css
.will-change-transform {
  will-change: transform;
}
.sprite-container {
  transform: translateZ(0); /* Force GPU layer */
}
```

---

## 8. Accessibility

### 8.1 ARIA Labels

```tsx
<aside aria-label={`${characterName} sprite and context`}>
  <img alt={characterName} />
</aside>
```

### 8.2 Reduced Motion

```tsx
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersReducedMotion) {
  // Disable breathing, parallax, dust motes
}
```

---

## 9. Implementation Priority

| Priority | Component | Complexity |
|----------|-----------|------------|
| P0 | CharacterStage layout | Low |
| P0 | SpriteLayer with crossfade | Medium |
| P0 | InputBar | Medium |
| P0 | MessageStream | Medium |
| P1 | AtmosphereLayer (parallax/mood) | Medium |
| P1 | ExpressionGallery | Low |
| P2 | Mobile backdrop variant | Medium |
| P2 | SSE emotion handling | Low |

---

## 10. Immersive Chat 2.0 (Apr 2026 Update) ✅

### 10.1 Dynamic Character Themes
- [x] Implemented HSL-based dynamic color generation from speaker name/id.
- [x] Signature glow (bloom) and border colors per character.
- [x] Dynamic speaker badges matching character theme.

### 10.2 Expressive Text & Animations
- [x] Framer Motion typewriter reveal with per-character stagger.
- [x] Emotional reaction animations:
    - **Shake**: Triggered by `angry` emotion.
    - **Bounce**: Triggered by `happy`, `laugh`, or `playful` emotions.
- [x] Dialogue quotes automatically tinted with character's primary theme color.

### 10.3 Thought (Batin) Experience
- [x] Specialized layout for thoughts: centered, maximum 85% width.
- [x] Visual distinction: Transparent background (no bubble), italicized, literary font.
- [x] Automatic `(...)` wrapping (smart detection to avoid doubling).

---

## Appendix: File Structure

```
packages/web/src/
├── app/
│   └── chat/[sessionId]/
│       └── page.tsx              # Main chat page
├── components/
│   ├── character/
│   │   ├── CharacterStage.tsx    # Fixed character container
│   │   ├── SpriteLayer.tsx       # Crossfade sprite rendering
│   │   ├── AtmosphereLayer.tsx   # Parallax, mood, dust
│   │   └── ExpressionGallery.tsx  # Emotion thumbnail strip
│   ├── chat/
│   │   ├── ChatColumn.tsx        # Scrollable message area
│   │   ├── MessageStream.tsx     # Paragraph streaming
