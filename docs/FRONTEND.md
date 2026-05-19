> 🟡 **STATUS (apr 2026): PRINCIPLES STILL GOVERNING.** Design principles (one-thumb, WA literacy, ID-default), route map, bottom-nav, discover, ui primitives, design tokens, i18n, perf budgets, PWA — all shipped. 🟡 §2 component audit snapshot is stale (apr 21). 🟡 §6 'WaifuStage' not shipped as multi-figure stage; sprite remains singular.

---

# Project Neigo — Frontend Brainstorm & Redesign (pre-wk4)

> **Status.** Deep brainstorm before PLANv2 wk4. Cherry-picks signals from
> Marinara Engine's public frontend surface (README / CHANGELOG / Trees API
> only — see §18). All proposals re-specified in **our** stack.
>
> **Thesis.** Project Neigo ≠ Marinara. We are **ROLEPLAY-first**, **single
> companion**, **emotional-bond-driven**, **mobile-first**. Marinara is a
> desktop power-user tool with 24 agents, combat, game mode, bot browsers,
> Discord mirroring, Spotify, haptics. We delete ~80% of that surface on
> purpose.
>
> **Market.** Indonesia first → global later. Every decision below is stress-
> tested against a Jakarta commuter on a 3-year-old Android (Redmi 9 class),
> mid-tier 4G, data-cap anxiety, WhatsApp as the mental UX baseline.
>
> **Date.** 2026-04-21 · **Author.** `clean-room-study`

---

## 1. Market reality — Indonesia first, global later

### 1.1 Primary persona

- **Ayu, 24, Jakarta.** Marketing exec. iPhone 11 or Redmi Note 11. WA open
  12h/day. Reads Wattpad / AU Twitter on the MRT. Chats with AI companion
  one-handed, vertical, 4.7–6.1" screen.
- **Session shape.** 3–5 bursts of 3–10 minutes. Rarely at a laptop. Peak
  engagement = commute + before-bed.
- **Data sensitivity.** "Kuota" is real. Anything > 300 KB of images per open
  session is noticed. Auto-playing video is a sin.
- **Language.** Indonesian default. Code-mixing with Japanese honorifics +
  English loan-words is **natural**. Don't force pure EYD.

### 1.2 Scale-out personas (global later)

- **Priya, 29, Bangalore** — same mobile pattern, Hinglish, stricter on
  intimacy.
- **Mika, 19, Manila** — Tagalog + English, TikTok comment culture, GCash.
- **Ren, 27, Jakarta → Tokyo** — bridge persona for JP voice authenticity
  (matches owner's taste); not a market target.

Rule: **Indonesian default**, every string localizable, every payment gateway
pluggable, no Jakarta-only hardcoding.

### 1.3 Where Marinara's FRONTEND doc assumptions break here

| Marinara assumption | Indonesian reality | Our move |
|---|---|---|
| Desktop-first, 3-column Discord layout | One thumb, vertical phone | 1-col mobile shell + optional widescreen enhance |
| Right-side panels: Characters / Lorebooks / Presets / Connections / Agents / Personas / Bot Browsers | None relevant to Ayu | Hide behind one "Atur" sheet |
| Preset editor (prompt-sections + groups + macros) | Ayu has never seen a system prompt | **Zero preset UI in v1.** Founders-only `/ops` |
| Spotify, haptic, Discord webhooks, knowledge-source RAG UI | Distraction, scope creep | Not shipping |
| Bot browser (Chub / JannyAI) | Brand + legal + NSFW landmine | Curated Discover only |
| SillyTavern import UI | Zero user overlap | Not shipping |
| English-only strings | Ayu bounces in 8s | Indonesian default locale, not translation |

---

## 2. Current state — what we already have

Audit of `packages/web` as of 2026-04-21:

```
src/
├─ app/
│  ├─ layout.tsx          Inter + Fraunces, aurora, PWA meta, maxScale=1
│  ├─ page.tsx            Discover (home)
│  ├─ chat/               /chat (list) + /chat/[sessionId]
│  ├─ characters/new/     user character creator
│  ├─ settings/           single tabbed settings
│  ├─ account/            profile + tier + BYOK
│  ├─ login/              magic link + demo
│  ├─ ops/                FOUNDER diagnostics
│  ├─ debug/              dev-only
└─ components/
   ├─ AppShell.tsx        mobile drawer + swipe gesture + haptic
   ├─ BottomBar.tsx       3-tab nav (Discover / Roleplay / Settings)
   ├─ Sidebar.tsx         desktop sidebar
   ├─ TopBar.tsx          mobile header
   ├─ AuroraBackdrop.tsx  identity layer
   ├─ WaifuSprite.tsx     sprite renderer
   ├─ TimelinePanel.tsx   per-chat timeline
   ├─ DiscoverOnboarding.tsx
   ├─ PwaRegister.tsx     SW registration
   └─ RouteLoadingBar.tsx
```

**Good (keep):**
- Mobile-first shell, edge-swipe drawer, haptic feedback.
- 3-tab BottomBar mirrors WA/IG mental model.
- Next.js App Router (not a giant SPA) → code-splits by route, Android
  back-button works natively.
- `AuroraBackdrop` is our identity layer (Marinara has none).
- `viewport maximumScale=1` — intentional; composer never double-zooms mid-RP.

**Weak (refactor candidates before wk4 features land):**
- No unified **design tokens** doc. Tailwind has ink/accent but no canonical
  spacing/radius/motion scale.
- **Settings** is one fat tab holder — will crack under G1 (personas), G2
  (macros), F1 (lorebooks UI). Needs nested routing.
- **No i18n infra.** Copy is hardcoded. Adding locales later = string
  archaeology. Fix **before** wk4.
- **No skeleton/shimmer** primitives. Every page writes its own loading state.
- **No toast/banner** primitive. Errors go to `alert()` or inline divs.
- **No composer component** — chat input inline in `[sessionId]/page.tsx`.
  Will fight against G1 persona-switcher (wk9) + G4 slash-commands (wk10).
- **`WaifuSprite.tsx` is single-purpose.** F2 narrative director (wk7) needs
  a `<Stage>` concept with mood/position transitions.
- **No `components/ui/` primitives folder.** Drift risk.

---

## 3. Design principles

Priority order; when two conflict, higher wins.

1. **One thumb, one hand.** Every primary action reachable in the bottom 1/3
   of a 6.1" screen. No hamburger for primary flow.
2. **Silence beats chrome.** Cinematic calm. Aurora + character presence do
   the emotional work; UI chrome < 8% of viewport during active RP.
3. **WhatsApp literacy.** Message bubbles, long-press menu, typing dots. Don't
   invent gestures Ayu hasn't already learned.
4. **Indonesian soul, global chassis.** Default `id`; layout LTR; every
   string routed through `t()` from wk4.
5. **Low-fi fallback everywhere.** `prefers-reduced-motion` kill-switch on
   every animation. Offline SW serves last-known message list.
6. **One voice: Crescent.** UI never exposes model selector to free-tier.
   BYOK lives in `/account` behind a PAID gate.
7. **Zero power-user creep in v1.** No preset editor, no agent editor, no
   regex scripts, no macros UI. Founder-only in `/ops/*`.
8. **Ship the feeling, not the feature list.** Every wk4–wk14 FE ticket must
   answer: *"What does Ayu feel in the first 8 seconds?"*

---

## 4. Information architecture

### 4.1 Route map (Next.js App Router)

```
/                                 Discover (home)
/onboarding/*                     post-signup flow (≤3 screens, skippable)
/chat                             session list
/chat/[sessionId]                 active RP surface
/chat/[sessionId]/memories        pinned memories + summaries (sheet)
/chat/[sessionId]/lorebook        active lore preview (F1b wk5)
/characters/new                   progressive character creator
/characters/[id]                  view card (mine / public)
/account                          profile, tier, BYOK, push, export
/settings                         thin root: appearance, language, a11y
/settings/notifications           push + quiet hours
/settings/privacy                 consent, export, delete
/login                            magic link + demo (+ Google later)
/ops/*                            FOUNDER only — diagnostics, not product
```

Cuts:
- **No `/lorebooks/*` top-level** until wk5. Lorebook access lives *inside* a
  chat session — per-session scope first, global USER-scope later.
- **No `/presets/*` ever in v1.** PLANv2 wk11 adds them inside `/settings`.
- **No `/connections/*`, `/agents/*`, `/personas/*` as top-level.** Persona is
  a composer popover (G1c wk9), not a page.

### 4.2 Bottom nav stays 3 tabs

`Discover · Roleplay · Settings`. Never 4+ until we earn the real estate. Push
inbox (wk14) becomes a bell in `TopBar`, not a 4th tab.

### 4.3 Top bar logic

| Route | Left | Center | Right |
|---|---|---|---|
| `/` | avatar → `/account` | "Project Neigo" wordmark | search (wk13) |
| `/chat` | drawer menu | "Percakapan" | new-chat `+` |
| `/chat/[id]` | back | character name + mood dot | kebab → session menu |
| `/characters/*` | back | character name | share |
| `/settings` | back | "Pengaturan" | — |

---

## 5. Navigation & state model

### 5.1 URL-first, not state-first

Marinara's FRONTEND doc says: *"Navigation is entirely state-driven — there
is no URL router."* That's a desktop-SPA bias. For mobile + PWA:

- Android back button **must** work → URL-first.
- Deep links (viral share, push-notif click) **must** land on the right screen.
- Session resume after airplane-mode reboot must restore same route.

**Decision.** Next App Router is the source of truth. Zustand / TanStack Query
are **derived** from URL + server, never leading.

### 5.2 Zustand stores (trim Marinara's 6 to **3**)

| Store | Scope | Persisted |
|---|---|---|
| `ui.store.ts` | theme, language, reduced-motion, banner dismissals, composer drafts | ✅ localStorage |
| `chat.store.ts` | transient: `isStreaming`, `streamBuffer`, `abortControllers`, `typingFor[id]` | ❌ |
| `presence.store.ts` | presence orchestrator (already built), replay counters | ❌ |

Cut from Marinara: `agent.store`, `game-state.store`, `encounter.store`,
`gallery.store` — none apply.

### 5.3 TanStack Query key convention

```
['session', sessionId]
['session', sessionId, 'messages', { cursor }]
['session', sessionId, 'lore-preview']      // wk5
['session', sessionId, 'active-lore']       // wk5
['sessions']
['character', characterId]
['characters', 'discover', { mode, tag }]   // wk13
['me']
['me', 'lorebooks']                          // wk4
['me', 'lorebooks', lorebookId]
['me', 'personas']                           // wk8
```

Rules: resource → IDs → single options object. `staleTime` default 30s.

---

## 6. Core screen redesigns

### 6.1 Chat surface — `/chat/[sessionId]`

Current: one fat client component with sprite + timeline + messages +
composer inline.

Redesign:

```
┌──────────────────────────────────────────┐
│ ← Rei ● (mengetik…)                 ⋮    │  TopBar (thin, 48px)
├──────────────────────────────────────────┤
│                                          │
│          [WaifuStage]                    │  mood sprite + aura, ~40% vh
│                                          │
├──────────────────────────────────────────┤
│ [assistant bubble] 20:14                 │
│                  [user bubble] 20:14     │  messages, WA-style
│ [assistant bubble — streaming]           │  scroll-up = load older
│ ▌                                        │  long-press = action sheet
├──────────────────────────────────────────┤
│ [Composer]                          [→]  │  safe-area, auto-grow
└──────────────────────────────────────────┘
```

Components to extract in wk4 prep commit:

- `<WaifuStage />` — wraps `WaifuSprite`, owns mood crossfades, layered aura.
- `<MessageList />` — TanStack Virtual when > 80 messages.
- `<MessageBubble />` — role, timestamp, swipe-index (wk10), action sheet.
- `<Composer />` — auto-resize, draft cache, slot API for persona chip (wk9)
  + slash-menu (wk10), send button with budget indicator.
- `<StreamCursor />` — blinking caret at streaming tail.
- `<TypingDots />` — 3-dot animation, `prefers-reduced-motion` aware.
- `<SessionMenu />` (sheet) — rename, mute, export, delete.

Gestures (reuse WA, don't invent):
- Long-press message → action sheet (copy, regen, branch wk11).
- Pull-down top → refresh ("Memuat pesan lama…").
- Edge-swipe-right → open chat list drawer.
- Tap character name → character card sheet.

### 6.2 Discover — `/`

Purpose: first-impression + retention. Netflix + Spotify vibe, not Tinder.

```
┌───────────────────────────────────────┐
│ Selamat malam, Ayu.                   │  time-aware: pagi/siang/sore/malam
│ [Lanjutkan dengan Rei →]              │  big primary CTA if active session
│                                       │
│ ── Untuk kamu ──────────────────      │
│ [card] [card] [card] →                │  rec rail
│ ── Baru di Project Neigo ───────────      │
│ [card] [card] [card] →                │
│ ── Indonesia original ────────────    │
│ [card] [card] [card] →                │  local-first editorial tag
│                                       │
│ [Buat karakter sendiri →]             │  secondary CTA, PAID gate
└───────────────────────────────────────┘
```

Content rails backend ships wk13; wk4–12 ship static editorial JSON fallback.
Card: 3:4 portrait, name + one-line tagline + mood chip. Tap whole card.

### 6.3 Session list — `/chat`

```
┌───────────────────────────────────────┐
│ Percakapan                        [+] │
│ [🔍 Cari pesan…]                       │  FTS search (already shipped)
│                                       │
│ ┌─────────────────────────────────┐   │
│ │ 🌙 Rei                  20:14   │   │
│ │   "Aku tunggu kamu pulang…"    │   │  last msg preview + unread dot
│ └─────────────────────────────────┘   │
│ ┌─────────────────────────────────┐   │
│ │ 🌸 Lysandra            kemarin  │   │
│ └─────────────────────────────────┘   │
│                                       │
│ (empty state → Discover CTA)          │
└───────────────────────────────────────┘
```

Swipe-left on row → pin / mute / delete. No folders in v1 (H1 wk13).

### 6.4 Settings — nested, not tabbed

```
/settings                       root, 4 rows
  ├─ Tampilan                   theme + text size + reduced motion + data saver
  ├─ Bahasa                     id, en (+ jp v1.2?)
  ├─ Notifikasi                 push + quiet hours
  └─ Privasi                    export, delete, consent receipts
/account                        separate — profile + tier + BYOK
```

Nested > tabs because: (a) back button, (b) deep-link to sub-section, (c)
scales past 10 sub-sections without tab-strip overflow.

---

## 7. Component library — `components/ui/`

Create this folder in wk4 kick-off, **before** new features land.

| Component | Why now | Notes |
|---|---|---|
| `<Sheet />` | mobile action sheets, modals | Radix Dialog + Vaul drag-to-dismiss |
| `<Toast />` | replace `alert()` | Sonner; 1 global container |
| `<Skeleton />` | every page loading state | single class + `sr-only` text |
| `<Chip />` | keyword chips (F1), persona (G1c), CYOA (F3) | button variant |
| `<LongPress />` (hook) | message action sheet | 500ms default; a11y-safe |
| `<SafeArea />` | iOS notch + Android nav bar | `env(safe-area-inset-*)` |
| `<IconButton />` | 44×44 tap target (WCAG 2.5.5) | |
| `<EmptyState />` | Discover, chat list, search | illustration + CTA |
| `<ErrorState />` | per-route fallback | retry; Sentry link hidden |
| `<Banner />` | "Mode offline", "Kuota AI habis" | dismissible, `role=status` |

Rejected from Marinara's `ui/`:
- **ColorPicker** — users can't recolor bubbles in v1.
- **ExpandedTextarea** — fold into `<Sheet />`.
- **EmojiPicker** — native keyboard on Android is great; ship picker only
  when we hit markets with weak native IME.
- **GifPicker** (Giphy) — ID culture is WA stickers; also data-cost + legal.
- **HelpTooltip** — mobile has no hover. Inline help text or `ℹ` → sheet.

---

## 8. Styling & theming

### 8.1 Design tokens (lock down wk4)

New file: `packages/web/src/styles/tokens.css`, mapped into Tailwind v4
`@theme`. Smaller surface than Marinara's 20-section globals.

```
--space-1..8                 4px → 48px (8px grid)
--radius-sm|md|lg|xl|full    6 10 14 20 9999
--font-sans / --font-display Inter / Fraunces (already loaded)
--text-xs..3xl               12 14 16 18 22 28
--duration-fast|base|slow    120 220 420 ms
--easing-standard|enter|exit
--shadow-card|lift|hero
--ink-50..950                neutral scale
--accent-50..900             brand scale
--aurora-a|b|c               3-stop gradient anchors
```

No ad-hoc pixels after wk4. Grep CI flags magic numbers.

### 8.2 Typography

- **Inter** for UI/body, **Fraunces** italic for names / pull-quotes / hero.
- Both already via `next/font`. No custom-font upload (Marinara has `/api/fonts`
  — drop: MB + GDPR + zero ID value).

### 8.3 Themes

One theme: **Crescent Night** (current dark aurora). Light mode is post-wk14
stretch — Ayu uses dark 95% of the time on phone at night.

Rejected: Marinara's Glimmer, SillyTavern, user-custom theme sync. Too much
config-surface for no retention lift.

### 8.4 Motion

- Default motion on — cinematic is our identity.
- `@media (prefers-reduced-motion: reduce)` → durations → 0ms, aurora static,
  typing dots → `…` text, stream caret → static bar.
- Android low-battery (`navigator.getBattery?.() < 0.15`) → auto-reduce.

---

## 9. Internationalization (DO THIS BEFORE wk4)

**Library.** `next-intl` (plays nice with App Router + server components +
middleware locale detection). Alternative: `@lingui/*` if we need ICU for
Arabic (wk20+).

**Locales v1.** `id` (default), `en` (fallback). Add `jp` only if owner's
Japanese voice-overs require it.

Setup sketch:

```
packages/web/src/
├─ i18n/
│  ├─ config.ts              locales, defaultLocale='id'
│  └─ messages/
│     ├─ id.json             source of truth
│     └─ en.json             translated
└─ middleware.ts             locale-prefix redirect (opt-in: /en/...)
```

Copy rules:
- Write Indonesian first. Translate to English **after** copy lands.
- Never concat: `"Chat dengan " + name` → `t('chatWith', { name })`.
- Semantic keys: `discover.greeting.evening`, not `string42`.
- Pluralization: trust ICU `{count, plural, =0 {...} one {...} other {...}}`.

**Why now.** Retrofitting i18n into 40 hardcoded `<span>Tampilan</span>` is
hours of tedium. Retrofitting into 0 strings is minutes. Wk4 lorebooks UI
will ship 60+ new strings; retrofit cost compounds.

---

## 10. Performance & data-cost budget

### 10.1 Hard budgets

| Metric | ID market target | Global stretch |
|---|---|---|
| FCP (4G, Redmi 9) | ≤ 1.8s | ≤ 1.2s |
| LCP | ≤ 2.5s | ≤ 2.0s |
| TTI (chat page) | ≤ 3.0s | ≤ 2.0s |
| Main JS (gzip) | ≤ 180 KB initial | same |
| Per-route chunk (gzip) | ≤ 90 KB | same |
| Character rail image | ≤ 30 KB AVIF/WebP | same |
| Sprite sheet | ≤ 200 KB first, ≤ 80 KB swap | same |
| Cold JS parse (Redmi 9) | ≤ 350 ms | n/a |
| Per-turn SSE payload | ≤ 4 KB meta + tokens | same |

### 10.2 Measurement

- Lighthouse CI on PR (`packages/web/lighthouse.budgets.json`).
- `next build` output checked in CI.
- Canonical reference phone: owner's Redmi 9.

### 10.3 Image strategy

- AVIF primary, WebP fallback.
- `<Image />` from `next/image` always; never bare `<img>`.
- Sprite sheets pre-composed server-side (already via `stitch-sprites.ts`);
  one request per mood bundle.
- Lazy-load everything below the fold.
- Aurora = CSS gradient, no image.
- Default avatar = SVG monogram, not raster.

### 10.4 Data-saver mode (design for it now, ship wk15+)

Toggle in `/settings/tampilan`: **"Hemat kuota"**.
- Disable aurora animation → static gradient.
- Sprite set 1 pose only, no expression swap.
- Card images compressed to 24 KB max.
- Disable background image in chat.
- Copy: "Beberapa efek cinematic akan dimatikan."

---

## 11. PWA, offline, keep-alive

### 11.1 Current posture

`public/sw.js` + `PwaRegister.tsx` exist. Manifest covers icons + standalone.

### 11.2 Cache strategy (locked in wk1)

- `/api/*` → **NetworkOnly** (no stale chat data).
- Static assets → **StaleWhileRevalidate** w/ hashed filenames.
- Offline fallback: `public/offline.html` (exists).

### 11.3 Add before global

- **Background sync** for queued user messages (Android only; iOS falls back
  to retry-on-open).
- **Notification permission UX**: never prompt on first load. Ask on 3rd
  session or when user opts in via `/settings/notifications`.
- **Install prompt**: custom banner after 2 sessions; WA-familiar "Pasang"
  CTA; dismissible with 30-day cooldown.
- **Web Push** (wk14 per PLANv2 H7) — reuse `0005_push.sql`.

### 11.4 Reject Marinara's keep-alive

Marinara's `lib/keep-alive.ts` uses Web Locks + BroadcastChannel to prevent
tab sleeping. Don't adopt. Indonesian users background tabs deliberately to
save battery/data. Waking silently is rude. Our **presence orchestrator**
already handles reconnect on focus resume — correct pattern.

---

## 12. Accessibility

### 12.1 WCAG 2.2 AA baseline

- Contrast ≥ 4.5:1 body text vs backdrop. Aurora dimmed under text via
  `.glass` utility — audit at wk4.
- Tap targets ≥ 44×44 CSS px. Verify BottomBar (currently ~40px; fix wk4).
- Focus rings visible: 2px outline + 2px offset, accent color. Never
  `outline: none` without replacement.
- `Escape` closes sheets; composer always focusable.
- Landmarks: `header`, `nav`, `main`, `complementary`. Every icon button
  has `aria-label`.

### 12.2 Indonesian a11y notes

- Android TalkBack is the realistic bar; iOS VoiceOver secondary.
- Avoid idiom-as-icon. Dot-dot-dot menu is fine; heart/moon metaphors get
  spoken literally and confuse.
- Respect system font-size. Body uses `rem`, not locked `16px`.

### 12.3 Cognitive load

- Max 7 visible actions per screen (Miller); 5 is better.
- First-session Discover has exactly 2 CTAs: "Mulai dengan Rei" + "Lihat
  karakter lain".

---

## 13. Telemetry / analytics philosophy

- **No PII to third-parties.** Self-hosted Plausible or Umami. No GA4, no
  Hotjar, no session replay.
- **UU PDP 2022 consent banner** at first load: explicit accept for analytics;
  functional cookies exempt.
- **Privacy-first events only**: `discover_open`, `session_start`,
  `session_turn_sent`, `session_end`, `push_enabled`, `tier_upgraded`.
  Never `message_content_*`.
- FOUNDER ops dashboard stays separate in `/ops/*`.

---

## 14. Cherry-picked Marinara ideas — accept / defer / reject

| Feature | Verdict | Path |
|---|---|---|
| 3-column Discord layout | ❌ reject | 1-col mobile + optional widescreen |
| Right-panel persistence (mountedPanels Set) | ⚠ n/a | No multi-panel UI |
| Chat modes (Conversation / Roleplay / VN) | ⚠ partial | Roleplay only in v1; VN post-wk14 maybe |
| Message bubbles + long-press actions | ✅ accept | Extract `<MessageBubble />` wk4 |
| Infinite-scroll pagination | ✅ accept | TanStack Virtual + cursor API |
| Per-message: edit / copy / regen / delete / branch / peek | ⚠ partial | copy+regen wk5, branch wk11, peek=FOUNDER |
| Draft persistence per chat | ✅ accept | `ui.store` |
| Emoji / GIF pickers | ❌ reject | Native keyboard wins in ID |
| Slash commands (`/scene`, `/roll`) | ⚠ defer wk10 | G4 |
| Agent Activity indicator + Retry | ⚠ defer | Ship if F2 wk7 needs visibility |
| Echo chamber (Twitch viewer sim) | ❌ reject | Breaks single-companion thesis |
| Combat / encounter UI | ❌ reject | Out of scope |
| Roleplay HUD (time / loc / weather) | ⚠ micro | Accept one tiny scene-state chip; never full HUD |
| Weather particles | ❌ reject | Data + battery |
| Sprite expressions | ✅ accept | Exists; extend via F2 wk7 |
| Background crossfade | ⚠ defer | wk13+ |
| Scene system (branching mini-RP) | ⚠ defer | Fold into G3b branching wk11 |
| Visual Novel mode | ❌ reject v1 | Revisit global |
| Full-page editors per resource | ⚠ partial | Characters yes; Lorebooks=sheet; Presets=never |
| Modal system + `<Suspense>` | ✅ accept | Via `<Sheet />` |
| Chat folders | ⚠ wk13 | H1; flat list until > 12 chats |
| Chat summary popover | ✅ accept wk13 | H12; `context-compaction.ts` exists |
| Custom theme editor + server sync | ❌ reject | One theme only v1 |
| Font upload | ❌ reject | Inter + Fraunces only |
| Cursor swap (Y2K) | ❌ reject | Desktop-only vanity |
| Custom tools / function-call cards | ⚠ defer | Post-wk14 |
| SillyTavern bulk import | ❌ reject | Legal + brand + thesis |
| Chub / CharacterTavern / JannyAI browsers | ❌ reject | Moderation nightmare ID |
| Persona system (G1a/b/c) | ✅ accept wk8–9 | PLANv2 |
| AI Persona Maker | ⚠ defer | Reuse `character-opening-line.ts` pattern |
| AI Lorebook Maker | ⚠ accept wk12 | G5 |
| Prompt Reviewer | ⚠ FOUNDER-only | G6 per PLANv2 |
| Preset editor + macros | ⚠ defer wk11 | G2 |
| Macros (`{{user}}`, `{{time}}`, `{{roll}}`) | ✅ wk9 | `packages/shared/src/utils/macros.ts` |
| Connections (BYOK) UI | ✅ accept | Already in `/account`; polish wk4 |
| Knowledge-source RAG UI | ❌ reject | Only global lorebooks; no per-doc upload |
| Bulk delete / multi-select messages | ⚠ defer | wk15+ |
| Swipe-delete chats | ✅ accept | WA-familiar |
| Haptic / Buttplug.io | ❌ reject | Permanently out |
| Spotify | ❌ reject | Licensing + ID DSP fragmentation |
| Discord webhook mirror | ⚠ PAID toggle | H10 wk14+ |
| Session recordings UI | ⚠ FOUNDER | `/ops/sessions/[id]/replay` exists |
| Gallery-recovery from blob listing | ✅ accept | Mirror for R2 sprites wk15+ |
| Prompt-cache visibility | ✅ FOUNDER | `/ops/sessions/[id]/context` |
| CYOA Choices (2–4 chips post-turn) | ✅ accept wk6 | F3 |
| Reasoning-tag stripping | ✅ accept | Server-side parser (wk1) |
| Bold-dialogue toggle | ⚠ defer | Low-prio polish |
| Character galleries | ⚠ defer | wk15+ |
| `/api/updates/check` version skew | ✅ accept | Prevents white-screen after deploy |

---

## 15. Risks & mitigations (pre-wk4)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| i18n retrofit cost balloons | H | H | **Land next-intl before wk4 lorebooks UI.** Non-negotiable. |
| Chat surface becomes 1500-line God component | H | M | Extract `<WaifuStage>` / `<MessageList>` / `<Composer>` in wk4 prep commit |
| Aurora tanks low-end battery | M | M | `prefers-reduced-motion` + battery API gate |
| Sprite sheets overshoot data budget | M | H | CI budget + LQIP placeholder |
| `WaifuSprite` can't handle F2 mood transitions | M | M | Prototype `<Stage>` crossfade in wk4 spike |
| No toast → inconsistent error UX | H | M | Ship `<Toast>` in wk4 UI-primitives commit |
| Composer can't host persona chip + slash menu | M | H | Extract `<Composer>` with slot hooks now |
| `maxScale=1` breaks a11y for low-vision | L | M | Revisit — unlock + own double-tap capture on stage |
| Back-button doesn't close sheets | M | M | Hook `history.pushState` in `<Sheet>` primitive |
| Discover rails empty for new ID users | H | H | Editorial-curated JSON rail until wk13 |
| Onboarding 8 screens → 60% drop | H | H | Max 3 screens, skippable; core path: name → taste tag → first chat |

---

## 16. Wk4 pre-flight checklist (BEFORE F1b UI features)

Each line = one PR-sized unit.

1. [ ] **UI primitives** in `components/ui/`: `<Sheet>`, `<Toast>`, `<Skeleton>`,
   `<Chip>`, `<IconButton>`, `<EmptyState>`, `<Banner>`.
2. [ ] **Design tokens** `styles/tokens.css` + Tailwind `@theme` mapping.
3. [ ] **next-intl** setup: `id` default + `en` fallback; extract every
   hardcoded string into `messages/id.json`.
4. [ ] **Chat surface decomposition**: extract `<WaifuStage>`, `<MessageList>`,
   `<MessageBubble>`, `<Composer>`, `<StreamCursor>`, `<TypingDots>`.
5. [ ] **Composer slot API** for persona chip (G1c) + slash-menu (G4).
6. [ ] **44×44 tap-target audit**: BottomBar + TopBar + TimelinePanel.
7. [ ] **Reduced-motion + battery-level gate** for aurora + typing dots.
8. [ ] **Lighthouse budgets file** + CI check.
9. [ ] **Settings route split**: `/settings`, `/settings/notifications`,
   `/settings/privacy`. Remove fat-tab page.
10. [ ] **UU PDP 2022 consent banner** + privacy copy.

Target: land as 3–5 commits, authored `clean-room-study`, zero Marinara blob.

---

## 17. Open questions (before wk4 kick-off)

1. **i18n library** — `next-intl` (my rec) vs `@lingui/*`?
2. **Sheet library** — Radix Dialog + Vaul (my rec) vs bespoke Framer?
3. **Toast library** — Sonner vs bespoke?
4. **`maximumScale`** — keep 1 for cinematic, or unlock for WCAG AAA?
   My rec: unlock + own double-tap capture on stage.
5. **Widescreen breakpoint** — switch to 2-col at `lg:` (1024px) or `xl:`
   (1280px) — skipping tablet entirely?
6. **Aurora impl** — pure CSS gradient (battery) or Canvas/WebGL (smoother)?
   My rec: stay CSS.
7. **Offline scope** — last N messages read-only, or full composer queued send?
8. **Discover editorial** — owner-authored `characters/discover.json` until
   wk13 algo?
9. **Character viral share** — PNG card + embedded JSON (Marinara community
   de-facto) or URL-only? PNG creates a surface we may not want.
10. **Onboarding length** — 3 screens vs 1 screen + in-chat tutorial?

> **Decisions locked 2026-04-21 — see §17.1 below.**

---

## 17.1 Decisions (locked for wk4 kick-off)

Each decision = one sentence verdict + rationale + concrete artifact to
build. No more debate after this section unless a new constraint surfaces.

### Q1 — i18n library: **`next-intl`**

- **Verdict.** Ship `next-intl` v3+ (App Router native).
- **Rationale.** RSC-compatible, middleware locale negotiation built-in,
  ICU pluralization out of the box, tree-shakeable per-route messages. Lingui
  is better for Arabic/RTL scale; we don't need it until wk20+. Rolling our
  own = six months of string bugs.
- **Concrete setup.**

  ```
  packages/web/
  ├─ src/i18n/
  │  ├─ config.ts                 { locales: ['id','en'], defaultLocale: 'id' }
  │  ├─ request.ts                getRequestConfig() for RSC
  │  └─ messages/
  │     ├─ id.json                source of truth
  │     └─ en.json                mirror (keys identical)
  ├─ src/middleware.ts            createMiddleware — prefix strategy 'as-needed'
  └─ next.config.ts               plugin: createNextIntlPlugin('./src/i18n/request.ts')
  ```

- **Route prefix strategy.** `as-needed` — `id` served at `/` (no prefix),
  `en` at `/en/*`. Keeps Indonesian SEO clean and lets us add a language
  switcher later without breaking links.
- **Key naming.** Dot-scoped, semantic: `discover.greeting.evening`,
  `chat.composer.send`, `settings.appearance.reducedMotion.label`.
- **Migration plan.** One PR extracts every hardcoded string currently in
  `packages/web/src/**/*.tsx` into `id.json`; `en.json` starts as copy of
  `id.json`, translated after copy lands in prod.

### Q2 — Sheet library: **Radix Dialog + `vaul`**

- **Verdict.** `@radix-ui/react-dialog` for a11y + focus trap; `vaul`
  (`@emilkowalski/vaul`) for the drag-to-dismiss mobile sheet skin.
- **Rationale.** Radix solves focus management, ESC close, portal, overlay
  click, `aria-*` wiring — all the stuff we'd get wrong by hand. Vaul is
  ~6 KB gzipped and gives the exact iOS/WA sheet physics users expect. A
  bespoke Framer implementation would cost two weeks and land buggier.
- **Concrete component.** `packages/web/src/components/ui/Sheet.tsx`:

  ```tsx
  <Sheet.Root>                 // wraps Dialog.Root + Vaul.Root
    <Sheet.Trigger asChild>…</Sheet.Trigger>
    <Sheet.Content side="bottom" snapPoints={[0.4, 0.9]}>
      <Sheet.Handle />
      <Sheet.Title>…</Sheet.Title>
      <Sheet.Body>…</Sheet.Body>
    </Sheet.Content>
  </Sheet.Root>
  ```

- **Back-button behavior.** On open, push a sentinel `history.state`; on
  browser-back pop, intercept and close sheet instead of navigating. Android
  users expect this.
- **Reduced-motion.** Drag physics disabled, fades only (≤ 120ms).

### Q3 — Toast library: **Sonner**

- **Verdict.** `sonner` — single `<Toaster />` mounted once in `layout.tsx`.
- **Rationale.** 4 KB gzipped, RSC-friendly, stack management solved,
  Indonesia-realistic default: bottom-center above `BottomBar`. Bespoke
  toast always dies to race conditions (two toasts stacking during streaming
  errors).
- **Position.** `position="bottom-center"`, `offset={88}` to clear BottomBar.
- **Variants.** `success`, `error`, `warning`, `loading`, `promise` — wrap
  in our own `toast.id('…')` helper that enforces Indonesian copy keys
  through `t()`, no raw strings at call sites.
- **Screen reader.** Sonner uses `aria-live=polite` by default; we override
  errors to `assertive`.

### Q4 — `maximumScale`: **unlock + own double-tap capture**

- **Verdict.** Remove `maximumScale: 1` + `userScalable: false` from
  `layout.tsx` viewport. **Required** for WCAG 2.2 SC 1.4.4 (text resize up
  to 200%). Keep cinematic feel by capturing double-tap on the sprite stage
  to toggle "big mode" (sprite full-screen), preventing accidental browser
  zoom there only.
- **Rationale.** Locking zoom is an a11y violation in most EU and recent
  ID-gov guidelines. Low-vision users get locked out. The *perceived*
  cinematic problem is that pinch-zoom during typing feels janky — almost
  no one pinch-zooms during chat. Double-tap on a sprite is the real issue;
  we solve that with a targeted pointer handler.
- **Patch.**

  ```ts
  export const viewport: Viewport = {
    themeColor: '#07080f',
    width: 'device-width',
    initialScale: 1,
    // maximumScale / userScalable removed — a11y first
  };
  ```

  Plus `WaifuStage` gets `onPointerDown` with 300ms gap detection that
  `preventDefault()` on the 2nd tap.

### Q5 — Widescreen breakpoint: **`lg:` (1024px)**, no tablet-specific tier

- **Verdict.** Below `lg` = 1-column mobile shell. At `lg` and above = 2-col
  (drawer persistent + chat center). Never ship a 3rd column.
- **Rationale.** Indonesia reality: tablet usage share is < 3% (StatCounter
  ID 2025). iPad users are effectively "light desktop". Dropping the 768–1023
  tier saves ~1 week of QA and removes the worst a11y bucket (awkward hit
  targets that are neither phone nor desktop). Our widescreen users are also
  the FOUNDER/PAID cohort — they deserve a calmer 2-col, not a tablet hack.
- **Breakpoints file.** Document in `tokens.css`:

  ```
  --bp-sm: 640px    /* large phone */
  --bp-lg: 1024px   /* 1-col → 2-col pivot */
  --bp-2xl: 1536px  /* optional center-column max-width cap */
  ```

  No `md:` usage in product code; reserve for libraries only.
- **2-col layout.** 280px persistent drawer + fluid chat. Right side stays
  empty — if we ever add a right panel, it's a `<Sheet side="right">` not
  a permanent column.

### Q6 — Aurora implementation: **pure CSS gradient + conic blend**

- **Verdict.** Stay CSS. Use `background: conic-gradient(…)` layered over
  two `radial-gradient` blobs animated via `@keyframes` translating their
  positions. No Canvas, no WebGL.
- **Rationale.** Canvas aurora on Redmi 9 class eats 4–7% CPU continuously,
  draining battery in a 30-min session. CSS gradients are GPU-composited
  with `will-change: transform` and cost ~0.5%. The visual delta is
  imperceptible on a 60 Hz phone screen at 6" viewing distance. Global
  scale-up stays identical — no device lottery.
- **Fallback tiers.**
  1. Default — 3-blob animated gradient (current).
  2. `prefers-reduced-motion` — static gradient snapshot.
  3. Battery < 15% or data-saver on — single flat `--ink-950` + subtle
     vignette, no animation.
- **Consistency rule.** Aurora palette is the *single source of truth* for
  the app mood — never swap per-route. Route-specific tint is additive via
  a translucent overlay only.

### Q7 — Offline scope: **read-only last N + composer queue with explicit retry**

- **Verdict.** Hybrid. When offline:
  1. Show last 80 messages (already cached by TanStack Query persister).
  2. Composer stays **enabled**; submitted messages go to an IndexedDB
     `outbox` queue.
  3. A persistent `<Banner>` says *"Mode offline — pesan akan dikirim saat
     online"*.
  4. On reconnect: attempt drain in order; on first failure, pause queue
     and surface a retry toast instead of auto-retrying forever (avoids
     stale-context replies).
- **Rationale.** Full-auto send on reconnect is dangerous for RP — a 2-hour-
  old message shipping into a different scene is worse than a failed send.
  Read-only-only is too passive; Ayu wants to *jot* during MRT dead zones.
- **Conflict resolution.** If session state advanced server-side between
  queue-time and drain-time (turnCount mismatch), show a sheet: *"Scene-nya
  udah lanjut. Kirim ulang atau buang?"* with 2 buttons.
- **Implementation.** New `packages/web/src/lib/outbox.ts`, idb-keyval
  backed, max 20 queued messages per session, FIFO.

### Q8 — Discover editorial: **owner-authored JSON + server endpoint wrapper**

- **Verdict.** Ship `packages/server/src/db/discover-rails.ts` — a typed
  editorial source of truth, exposed at `GET /api/discover/rails`. Until
  wk13, the rails are **static** (owner edits the TS file, redeploys).
  Wk13 swaps in the recommendation algorithm behind the same endpoint.
- **Rationale.** A JSON file in `packages/web/public/` would bypass auth
  and cache-bust badly; a DB table is overkill for weekly edits. A typed
  TS constant commits into git history (good for audit), survives migration
  to real recs, and the client never knows the diff.
- **Shape.**

  ```ts
  export const DISCOVER_RAILS: Rail[] = [
    { id: 'for-you',          title: 'Untuk kamu',          characterIds: [...] },
    { id: 'new',              title: 'Baru di Project Neigo',   characterIds: [...] },
    { id: 'indonesia-original', title: 'Indonesia original', characterIds: [...] },
  ];
  ```

- **Cadence.** Owner updates weekly until wk13. Review process: one commit
  per rail change, PR description lists *why* (retention data from ops).

### Q9 — Viral share: **URL-only in v1 (+ OG image)**

- **Verdict.** Share = `https://neigo.app/c/<slug>` with Open Graph
  image rendered via `/api/og/c/:slug` (Next.js OG image API).
  **No PNG-card-with-embedded-JSON export** in v1.
- **Rationale.** The Character Card V2 PNG-metadata format is a community
  standard for *portability across tools* (SillyTavern ↔ Risu ↔ Chub). We
  explicitly **don't** want that portability — our brand promise is
  curation + safety, and shipping a portable export means our characters
  end up on Chub within a week with no moderation. URL-only keeps traffic
  on our domain where tier gating, moderation, and analytics all apply.
- **OG image spec.** 1200×630 PNG, character portrait + name + Project Neigo
  wordmark + one-line tagline. Share targets: WA (primary — renders OG),
  IG Story (as link sticker), Twitter/X, TikTok bio.
- **Deep link.** Short path `/c/<slug>` redirects to `/characters/<id>`
  for SEO; the share URL is the short one for tap-count + screenshot-
  friendliness.
- **Revisit trigger.** If we hit > 50 K DAU and community demands export,
  ship a **watermarked PNG preview** (not a re-importable card) with a
  server-signed `neigo://` deep link embedded as metadata, which only
  Project Neigo resolves. Still no JSON payload.

### Q10 — Onboarding: **3 screens, all skippable**

- **Verdict.** Max 3 screens, each with a "Lewati" link top-right. Default
  path: `signup → name → taste → first chat`. Time to first AI response ≤ 60s.
- **Rationale.** Industry median for companion apps is ~45s to first reply
  (Talkie, Character.ai data via SimilarWeb). Every screen > 3 loses ~15%
  cumulatively. 1 screen is tempting but starves the recommendation engine
  (wk13) of the one signal it actually needs — a taste vector.
- **Screens.**

  | # | Route | Goal | Fields |
  |---|---|---|---|
  | 1 | `/onboarding/name` | Persona anchor | display name (prefilled from auth provider); "Panggil aku…" |
  | 2 | `/onboarding/taste` | Bootstrap recs | 6 mood chips (`cozy`, `tsundere`, `cold-stoic`, `himbo`, `villain`, `mentor`); pick 2–3 |
  | 3 | `/onboarding/first-chat` | Immediate magic | auto-matched character with 1-tap "Mulai →"; skippable |

- **In-chat tutorial.** One subtle `<Banner>` in the first session
  explaining long-press for message actions. Auto-dismiss after first
  long-press event, or after 3 sent messages. Never modal-blocks the chat.
- **Skip budget.** User skipping all 3 still gets the service — we fall
  back to `user.displayName` and a default taste vector `['cozy','cold-stoic']`
  so Discover has something to rank against.

### Summary table (decisions lock)

| Q | Decision | First artifact |
|---|---|---|
| 1 | `next-intl`, `id` default, `en` prefix as-needed | `src/i18n/{config,request}.ts` + `messages/id.json` |
| 2 | Radix Dialog + `vaul` | `components/ui/Sheet.tsx` |
| 3 | Sonner, bottom-center, offset 88 | `components/ui/Toaster.tsx` |
| 4 | Unlock zoom; double-tap capture on stage | `app/layout.tsx` viewport patch + `WaifuStage` handler |
| 5 | `lg:` (1024px) pivot; no tablet tier | `styles/tokens.css` bp vars |
| 6 | CSS conic + radial gradients; 3 fallback tiers | `components/AuroraBackdrop.tsx` refactor |
| 7 | Read-only + composer queue + banner + conflict sheet | `lib/outbox.ts` |
| 8 | `GET /api/discover/rails` + static TS source | `server/src/db/discover-rails.ts` |
| 9 | URL-only share + OG image; no PNG export | `app/c/[slug]/page.tsx` + `api/og/c/[slug]/route.ts` |
| 10 | 3 screens: name → taste → first chat, all skip | `app/onboarding/{name,taste,first-chat}/page.tsx` |

**Unblocked for wk4 kickoff.** Next commit: wk4 prep (primitives + i18n +
design tokens) per §16 checklist.

---

## 18. Appendix — Marinara spec anchors (metadata only)

> Clean-room reference. Paths below are **names only** from GitHub Trees API.
> No source opened. Used only to cross-reference feature scope in §14.

- Layout: `components/AppShell.tsx`, `components/panels/RightPanel.tsx`,
  `components/TopBar.tsx`, `components/ChatSidebar.tsx`
- Chat surfaces: `ChatConversationSurface.tsx`, `ChatRoleplaySurface.tsx`,
  `ChatArea.tsx`, `ChatMessage.tsx`, `ChatInput.tsx`
- Editors: `characters/CharacterEditor.tsx`, `lorebooks/LorebookEditor.tsx`,
  `presets/PresetEditor.tsx`, `connections/ConnectionEditor.tsx`,
  `agents/AgentEditor.tsx`, `personas/PersonaEditor.tsx`
- Modals: `CreateCharacterModal`, `CharacterMakerModal`,
  `ImportCharacterModal`, `LorebookMakerModal`, `PersonaMakerModal`,
  `STBulkImportModal`, etc.
- Stores: `ui.store.ts`, `chat.store.ts`, `agent.store.ts`,
  `game-state.store.ts`, `encounter.store.ts`, `gallery.store.ts`
- Shared utils: `shared/utils/macro-engine.ts`, `shared/utils/xml-wrapper.ts`
- Agent system: 24 built-ins, 3 phases — names only; impl not adopted.
- Integrations: `api/bot-browser/*`, `api/haptic/*`, `api/spotify/*`,
  `api/knowledge-sources` — all rejected in §14.

Clean-room posture unchanged: no `packages/**` blob opened to produce this doc.

---

*FRONTEND.md · Project Neigo brainstorm v1 · 2026-04-21 · supersedes prior
