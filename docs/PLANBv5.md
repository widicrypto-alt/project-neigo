> 🟡 **STATUS (apr 2026): MOSTLY SHIPPED.** ✅ 3.1 design tokens · 3.2 Rail component · 3.3 HeroAdaptive + ChipRow · 3.7 continue heat badge. ❌ 3.5 `/api/discover/picks` → [BACKLOG.md](BACKLOG.md) B1.6. ❌ §8 first-time 3-card hero. 🟡 §7.6 legacy DiscoverRail deletion verification.

---

# PLANBv5 — D2 Home Rail Redesign

> Scope: replace the current 600-line `page.tsx` ad-hoc rails with a single
> tokenized rail system, wired to a unified discovery feed, with a hero that
> earns its vertical space.

---

## 1. Current state (workspace-grounded)

### Surfaces
- `[packages/web/src/app/page.tsx](packages/web/src/app/page.tsx)` — `DiscoverHome`, ~600 LOC. Contains inline `SpotlightPoster` ([L20](packages/web/src/app/page.tsx#L20)) and `StoryShelfCard` ([L170](packages/web/src/app/page.tsx#L170)).

### Sections top→bottom
1. Header title/subtitle
2. Spotlight carousel (custom, non-rail)
3. Active character pane + 2 CTAs
4. 🔥 Pilihan (bespoke horiz scroller)
5. Lanjutkan cerita (`DiscoverRail`, 2:3 cards)
6. Surat masuk (`DiscoverRail`, conditional)
7. Karakter baru (`DiscoverRail`)
8. Bottom CTA

### Primitives (in [packages/web/src/components/discover/](packages/web/src/components/discover))
- `DiscoverRail` — the one good abstraction.
- Posters: `CharacterPosterCard`, `CharacterStrip`, `PosterCard`, `StoryCoverCard`, `StoryCtaCard`.
- Filters (**unused on home**): `GenreChip`, `LanguageChip`, `ChipRow`.
- Hero (**unused on home**): `HeroAdaptive`, `AdaptiveHero`.
- Meta: `CreatorBadge`, `FooterFeed`.

### Data
- `GET /api/featured-characters`
- `GET /api/auth/me`
- `GET /api/sessions`
- `GET /api/letters`
- `GET /api/stories?limit=12`

### Pain points
1. **Two rail systems** (`DiscoverRail` + bespoke scrollers) — inconsistent snap/spacing/overflow.
2. **Arbitrary sizes** (`h-[234px] w-[152px]`, multiple `aspect-[2/3]` literals) — no token.
3. **Filter primitives exist but are unused** — discoverability is zero.
4. **Hero primitives exist but are unused** — top-of-fold is a generic header.
5. **No personalization signal** beyond `featuredCharacters` sort.
6. **Spotlight + "Karakter baru"** overlap without dedupe logic.
7. **"Continue" rail** treats all recent sessions equally — no "active now" vs "stalled" differentiation.

---

## 2. Reference canon — character/story discovery UX

| Surface | What it does well | Borrow |
|---|---|---|
| **Netflix web** | Single tokenized rail (`.row`), keyboard-driven, snap scroll, lazy hero video on focus | Tokenized card sizes; snap behavior |
| **Crunchyroll home** | Genre chip filter row above rails; "Continue Watching" pinned at top with progress bars | Chip-row pattern; progress chip on Continue |
| **Character.AI `/discover`** | Category tabs (Romance / Helpers / Anime / …); per-category grid; search bar top | Category tabs map cleanly to character genres |
| **Janitor.AI home** | Tag cloud + search; horizontal rails; NSFW blur toggle in header | NSFW toggle affordance; tag chips |
| **Chub.ai** | Advanced filter sidebar; sorts by "most chatted" | Filter sidebar (power users) |
| **AniList** | Vertical sections with "View all" link; sticky hero with video bg | Sticky hero + "View all" per rail |
| **Apple TV+** | Cinematic hero with dynamic gradient + light-adaptive text | `HeroAdaptive` gradient direction — already in codebase |

### UX invariants
1. **Above-the-fold must answer "what do I do next?"** — for returning users that's "continue Rei" or "new letter"; for first-timers it's "pick a character".
2. **Rails are scannable at a glance** — poster art does the selling, text is secondary.
3. **Chips filter the visible rails** (like Netflix's genre pills), not navigate away.
4. **Empty states** are part of the rail component, not conditional renders.

---

## 3. Proposed architecture

### 3.1 Design tokens — `packages/web/src/lib/design-tokens.ts`

```ts
export const posterSize = {
  sm: { w: 120, h: 180 },   // 2:3, chip rails
  md: { w: 152, h: 228 },   // 2:3, default rail
  lg: { w: 200, h: 300 },   // 2:3, featured
  xl: { w: 280, h: 420 },   // 2:3, spotlight
} as const;

export const railGap = { tight: 8, normal: 12, loose: 16 } as const;
export const railSnap = { type: 'x mandatory', padding: 20 } as const;
```

All poster components consume tokens; zero arbitrary `w-[…]` / `h-[…]` on pages.

### 3.2 Single rail component contract

```tsx
<Rail
  id="continue"               // analytics + deep-link anchor
  title="Lanjutkan"
  subtitle="3 sesi terakhir"
  icon={<Bookmark />}
  viewAllHref="/sessions"
  itemSize="md"
  items={items}
  renderItem={(it) => <ContinueCard item={it} />}
  emptyState={<EmptyContinueCta />}
  loading={q.isLoading}
/>
```

Replaces:
- `DiscoverRail` (keep, evolve — don't break callers).
- Inline scrollers on home.

### 3.3 Page structure (post-redesign)

```
<HomePage>
  <HeroAdaptive>                          // already built, finally used
    {mode === 'returning-active-session'
      ? <ContinueHero session={active} character={…} />
      : mode === 'returning-idle'
      ? <LetterOrIdleHero />
      : <FirstTimeHero />}                // 3-card "pick your starter" for day-0 users
  </HeroAdaptive>

  <ChipRow sticky>                         // on scroll, compresses to filter bar
    <LanguageChip id /><LanguageChip ja /><LanguageChip en />
    <Divider />
    <GenreChip romance /><GenreChip slice_of_life />
    <GenreChip mystery /><GenreChip drama />
  </ChipRow>

  {/* Rails — reduce to MAX 5. Any extra lives on /discover */}
  <Rail id="continue"  title="Lanjutkan" items={activeSessions} />
  <Rail id="letters"   title="Surat masuk" items={unread} emptyState={null}
                       renderWhen={unread.length > 0} />
  <Rail id="picks"     title="Pilihan untukmu" items={personalized} />
  <Rail id="new"       title="Karakter baru" items={newCharacters} />
  <Rail id="stories"   title="Cerita pendek" items={stories} />

  <FooterFeed />                           // existing component, unchanged
</HomePage>
```

### 3.4 Hero — mode selection

```ts
type HeroMode =
  | 'first-time'                    // !me || me.sessionsCount === 0
  | 'active-session'                // lastSession.updatedAt within 24h
  | 'idle-with-letters'             // !activeSession && unreadLetters > 0
  | 'idle-no-letters';              // else

function selectHero(me, sessions, letters): HeroMode { … }
```

`HeroAdaptive` component already resolves time-of-day palette; extend it to
receive `mode` and swap inner content.

### 3.5 Personalized `picks` rail — data

Cheap v1 (no ML):
```sql
-- served by new GET /api/discover/picks
SELECT c.* FROM characters c
LEFT JOIN chat_sessions s ON s.character_id = c.id AND s.user_id = :userId
WHERE c.is_public = true
  AND c.id NOT IN (SELECT character_id FROM chat_sessions WHERE user_id = :userId)
  AND (
    c.language = :user_primary_language
    OR :user_has_no_sessions_yet
  )
ORDER BY c.created_at DESC
LIMIT 12;
```

Blend with featured: 6 by recency + 6 by featured weight.

Upgrade path: add `character_interactions` table (clicks, opens, dwell) and
use collaborative filter — not v1.

### 3.6 Chip filter behavior

- Chip click toggles active state (zustand store or URL query param).
- Active chips filter **all visible rails client-side** (no new queries).
- Empty after filter → rail shows "tidak ada karakter <lang>/<genre>" + CTA "lihat semua".
- URL: `/?lang=id&genre=romance`. Deep-linkable. Shareable.

### 3.7 Continue rail — differentiation

```tsx
interface ContinueItem {
  sessionId: string;
  character: {...};
  lastMessageAt: Date;
  turnCount: number;
  status: 'hot' | 'warm' | 'stalled';    // computed client-side
  unreadResponses: boolean;
}

function classify(lastAt: Date): 'hot'|'warm'|'stalled' {
  const h = (Date.now() - lastAt.getTime()) / 3600e3;
  if (h < 24)  return 'hot';
  if (h < 72)  return 'warm';
  return 'stalled';
}
```

Badge on card: hot → green pulse; warm → amber dot; stalled → muted.

---

## 4. Data layer changes

### 4.1 New endpoint
```
GET /api/discover/picks?lang=id&limit=12
  → { characters: CharacterPoster[] }
```

Keeps client data fetches:
- `me` — auth context
- `sessions` — continue rail
- `letters` — letters rail (unchanged)
- `picks` — replaces `featured-characters` on home; `featured` stays for `/discover`
- `stories` — unchanged

### 4.2 Cache strategy
- `me`: 60 s stale.
- `picks`: 5 min stale, revalidate on focus.
- `sessions`: 30 s stale.
- `letters`: 60 s stale + invalidate on push event.

All via tanstack-query `staleTime`.

---

## 5. Visual direction

### 5.1 Atmosphere
Project Neigo brand = low-sat night, amber/pink accents. Home should feel like
"opening a book at night" — not a Netflix grid.

- Background: deep navy with subtle star/noise overlay (`HeroAdaptive` handles phase).
- Type: serif for hero title (already in Tailwind config?), sans for body.
- Poster cards: 4px radius, 1px inner stroke at `rgba(255,255,255,0.08)`, subtle bottom-to-top gradient overlay for text legibility.
- Motion: rails snap-scroll; spotlight hero crossfades every 8 s; `prefers-reduced-motion` kills all timed animation.

### 5.2 Hero layout (returning-active-session mode)

```
┌───────────────────────────────────────────────────────┐
│  [adaptive gradient: amber dusk, left-to-right]       │
│                                                       │
│    Lanjutkan dengan Rei                               │
│    "katanya dia nunggu di stasiun… tapi udah 3 jam." │
│                                                       │
│    [Lanjutkan →]   [Kirim surat]                      │
│                                                       │
│                                        [RPortrait lg]│
└───────────────────────────────────────────────────────┘
```

Copy source: `session.metadata.latentQuestion` or `callbackCandidate` — already
populated by session-meta-extractor. If missing, generic template.

### 5.3 Card anatomy (standardized)

```
┌────────┐
│        │
│ poster │  ← 2:3, ken burns on hover (desktop)
│        │
│        │
├────────┤
│ Name   │  ← 14px semibold
│ tag    │  ← 11px muted (genre · language · creator)
└────────┘
```

NSFW-flagged characters blur poster until user taps "reveal" (if nsfw_enabled).

---

## 6. Performance

- Posters lazy-load via Next/Image with `sizes="(max-width:640px) 45vw, 200px"`.
- Spotlight uses priority hint only for first item; rest lazy.
- Rail scroll is native (no virtualization unless item count > 30).
- No inline client-side sorts beyond 50 items.

---

## 7. Rollout plan

1. **Tokens first** — ship `design-tokens.ts`, refactor existing `DiscoverRail` + `PosterCard` to consume. No visual change yet.
2. **Hero v2** — ship `HeroAdaptive` on home behind flag `HOME_HERO_V2_ENABLED`.
3. **Picks endpoint + rail** — add `/api/discover/picks`, swap `featuredCharacters` on home.
4. **Chip filters** — client-side filter on rails; URL sync.
5. **Continue differentiation** — classify + badge.
6. **Delete dead code** — remove inline `SpotlightPoster`, `StoryShelfCard` after two weeks in prod.

---

## 8. Acceptance criteria

- [ ] No arbitrary `w-[…] h-[…]` Tailwind in home tree.
- [ ] Single `Rail` component used everywhere on home.
- [ ] `HeroAdaptive` renders on home; mode selection documented.
- [ ] Chip filters toggle rail visibility client-side; URL query syncs.
- [ ] `/api/discover/picks` returns 12 items deterministically given a user.
- [ ] Hot/warm/stalled badges correct for synthetic test dataset.
- [ ] Lighthouse budget unchanged (budget config at [packages/web/lighthouse.budgets.json](packages/web/lighthouse.budgets.json)).
- [ ] First-time hero shows 3 starter characters with big CTAs.

---

## 9. References

- Netflix row pattern (2023 eng blog): <https://netflixtechblog.com/making-netflix-app-lightning-fast-4f7af0b78d8b>
- Crunchyroll redesign 2023 post-mortem: <https://blog.crunchyroll.com/en/2023/04/12/introducing-the-new-crunchyroll-home/>
- Character.AI discover surfaces (public): <https://character.ai/>
- Apple TV+ dynamic hero: HIG Human Interface Guidelines "Feature Presentation" <https://developer.apple.com/design/human-interface-guidelines/>
- Netflix genre chips UX, Nielsen Norman: <https://www.nngroup.com/articles/filter-categories/>
- Tailwind design tokens approach, Refactoring UI: <https://www.refactoringui.com/>
- Snap-scroll CSS: <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll_snap>

---

## 10. Deferred

- ML-based personalization (needs behavior log first).
- Video backgrounds on hero (bandwidth concern).
- Per-character "trailer" cards.
- Dark/light theme toggle on home (brand is dark-only v1).
- Infinite scroll on rails (not needed at current catalog size).
