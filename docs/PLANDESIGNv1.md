# PLANDESIGN v1 — Project Neigo Redesign Brief (locked)

> **Status:** locked design contract. All UI work after Apr 23 2026 should be checked against this doc. Increment to v2 only when the *contract* changes — not when implementation progresses (use BACKLOG B-DESIGN.* for progress tracking).
>
> **Inputs:** screenshot audit of live `roleplay.neigo.my.id`, two prior brainstorm rounds, product decisions from owner (Apr 23 2026).
>
> **Identity (non-negotiable):** Project Neigo is a **Roleplay + Visual Novel** platform — NOT a companion app. References: IsekaiZero, JanitorAI, Letterboxd, Ren'Py.
>
> **Anchor sentence:** *Stories are the product. Characters are actors inside them. Scenes are how you enter.*

---

## 0. Locked product decisions (owner, Apr 23 2026)

| # | Decision | Implication |
|---|---|---|
| 1 | **Continue strip: unified.** RP threads + VN saves in one strip, sorted by `last_opened_at`, format badge required. | One query, mixed model, `format` field on every item. |
| 2 | **Authorship: story-first.** Stories are the primary entity; characters/scenarios attach to a story. | Aligns with `0026_vn_tables.sql` — stories already first-class. Studio's `+ New story` is the default flow. |
| 3 | **VN at launch: linear (kinetic) only.** No branching graph editor. Choices may land in v2. | Studio Scenes step is an ordered list, not a graph. |
| 4 | **VN assets: shipped starter library.** Bundled backgrounds/motifs + generated default cover. User uploads come later. | Studio never feels empty; Discover/Stories never show placeholder book glyphs. |
| 5 | **Letters delay: real wall-clock in production (6–24h).** Dev/founder/preview short-circuit only. No per-thread "Instant replies" for general users. | Aligns with `0027_letters.sql` + `letters.ts`. Delay is the product. |
| 6 | **Letters recipient picker: met-first, browse-all second.** Default tab = characters the user has met; Browse-all is a fallback tab. | Keeps framing intimate without cold-start dead end. |
| 7 | **VN saves do NOT enter Threads.** VN progress lives only in Continue + Stories. | Aligns with `story_runs` vs `chat_sessions` separation in `0026_vn_tables.sql`. Threads stays clean as RP/chat surface. |
| 8 | **Persona language override: output-only.** Affects AI/story text. UI is locked English-first for now. | If multi-lang UI ever ships, it's a separate setting. |
| 9 | ~~**Explicit content toggle: default off, fail-closed.**~~ **Superseded by BETA_FOCUS_CONTRACT §C.** NSFW toggle removed from all surfaces. Model always runs fully uncensored server-side. `PATCH /api/auth/nsfw` returns `not_available_in_beta`. Hard limits enforced at prompt level regardless. | No toggle UI shipped; orchestrator always passes `nsfwEnabled: true`. |
| 10 | **Studio on mobile: read-only library.** No Forge on mobile. Library + preview view yes; editing desktop-only. | Mobile shows shelf and read-mode of drafts; Forge route renders a friendly "open on a laptop" block under 1024px. |

---

## 1. Cross-surface rules (apply to every page)

1. **Story-first, always.** Characters appear as actors inside stories — never the headline product on a reader surface.
2. **Format badge everywhere.** Every card that can be RP or VN shows `RP` / `VN` badge top-left, consistent component.
3. **Pull-quote as the hook.** Every story card surfaces one line from inside the story (dialogue/narration) — never a character description.
4. **No Indonesian in primary UI.** All primary copy in English. Indonesian becomes a locale string later.
5. **Empty states teach the format.** Every empty state shows what the surface looks like *when full*, not just an icon + line.
6. **Design tokens are locked:**
   - `bg/base #0B0B12` · `bg/surface #14141C` · `bg/sunken #08080E`
   - `accent/magenta #E85AA8` · `text/primary #F3F1EC`
   - Radii: `6` inputs · `12` cards · `20` hero · `9999` pills
   - Spacing: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64` only
   - Motion: `220ms` ease-out for transitions, `320ms` for routes

---

## 2. Final nav table

| Label | Subtitle | Route | Notes |
|---|---|---|---|
| **Discover** | *Stories to step into tonight.* | `/` | Was "Find a presence". |
| **Stories** | *Visual novels to read.* | `/stories` | Was "Visual novels". |
| **Threads** | *Your ongoing roleplays.* | `/chat` | Renamed from "Roleplay". |
| **Letters** | *Slow async roleplay.* | `/letters` | Renamed from "Surat". |
| **Studio** | *Create characters and stories.* | `/studio/stories` | Was "Write your story". |
| **Persona** | *Persona & API Key.* | `/settings` | Heading must equal label. |
| **Account** | *Usage and limits.* | `/account` | Unchanged. |

---

## 3. Surface specs (summary — see appendix for full details)

### A. Discover — `/`
- **Top:** 88px rail (title + segmented `All · Roleplay · Visual Novels`).
- **Continue strip** (112px, unified RP + VN by `last_opened_at`, format badge per item).
- **Tone rail** (sticky, 48px): `Tense · Tender · Dark · Playful · Mysterious · Slow-burn · Action`.
- **Featured tonight** (1 hero 2×2 + 2 tall 1×2).
- **More like what you've played** (single row, only when ≥2 completed sessions).
- **Editorial mosaic** (`grid-auto-flow: dense`, mixed sizes).
- **Killed:** 400px hero banner, "Karakter baru" section, creator CTAs in feed, language chip row.
- **Implementation rule:** Single `StoryCard` component with `format: 'rp' | 'vn'` prop. No `CharacterCard` on this page.

### B. Stories (Visual Novels) — `/stories`
- 4-col grid (3 at md, 2 at sm, 1 mobile), portrait 3:4 cards.
- Filters: sort + length + genre. Locale chips removed.
- Cards: cover art (real or generated), pull-quote, genre, runtime, completion.
- **Implementation rule:** `cover` prop required on Stories card; deterministic generated cover from story id is the fallback. Outline-book placeholder banned.

### C. Threads — `/chat`
- Two-pane preserved. Left pane: header "Your threads" + search + full-width `+ New thread` (labeled), then 72px rows with avatar + title + last-message preview + relative time.
- Right empty state: 3 pathway cards (`Start from a story` / `Start from a character` / `Start from scratch`) — functional, not decorative.
- New-thread modal: 3 steps max (origin → opening scene → confirm).
- VN saves do NOT appear here.
- **Implementation rule:** Right-pane empty state must render real, clickable pathway cards wired to the new-thread flow.

### D. Letters — `/letters`
- Header with **`+ New correspondence`** (opens met-first character picker, with a Browse-all secondary tab).
- Filter tabs: `All · Awaiting reply · Unread · Read · Archived`. Default = `Awaiting reply` if any active.
- Inbox: full-width 96px rows, sender avatar + serif name + correspondence title + serif-italic excerpt + state pill (`Awaiting reply · 4h` / `Arriving soon` / `New letter` / `Read`).
- Empty state: stylized sample letter behind scrim + 2-sentence explainer + CTA.
- Compose: full-screen serif paper-toned writing surface; commits show `Sent. Expect a reply in 6–24 hours.`
- Production = real wall-clock 6–24h. Dev/founder short-circuit allowed; no user-facing instant toggle.
- **Implementation rule:** Reply delay is rendered as a first-class visible element on every list row and detail view.

### E. Studio — `/studio/stories`
- **Library mode** (landing): header + 3-action dock `+ New story · + New character · Import`. Tabs: `Stories · Characters · Scenarios · Drafts` with count badges. Card-format rows (320×180) with cover art, format badge, status chip, readiness meter, hover-revealed actions.
- **Forge mode** (editor): 3-pane split (220 step rail / flex form / 360 live preview). Live preview uses the *same* `StoryCard` + bubble components as Discover/Threads.
- **New story flow:** opens with format chooser — `Roleplay Thread` vs `Visual Novel`. Choice locks the step rail.
- **VN authoring (launch):** linear (kinetic) only — Scenes is an ordered list. Starter library of backgrounds/motifs included.
- **Mobile:** Library is read-only (browse + preview drafts). Forge blocked under 1024px with friendly explainer.
- **Implementation rule:** Forge live preview uses production components verbatim — no preview-only variants.

### F. Persona — `/settings`
- Page heading **must** equal nav label = **Persona**. (Current "Settings" is a bug.)
- Hero header (180px): blurred gradient, 96px avatar w/ dashed-ring upload affordance, display name + auto-summary line (`Haru — she/her, 26, writes terse and warm.` re-derived on render, never cached).
- Sticky segmented nav: `You · Preferences · API & models`.
- Three grouped cards. Sticky save dock appears only when dirty.
- Explicit content toggle: default OFF; activation requires age confirmation modal; if `is_minor` flag, toggle is disabled and shows lock + reason.
- Language override: AI output only; UI stays English.
- **Implementation rule:** Page heading = nav label invariant; auto-summary re-derived per render.

---

## 4. Implementation priority (locked)

1. **A. Discover** — biggest identity payoff per release.
2. **C. Threads** — empty state + new-thread flow are blocking adoption today.
3. **E. Studio** — author enablement = content supply.
4. **B. Stories (VN)** — needs covers + metadata to ship VN as a real product line.
5. **F. Persona** — quality-of-life polish; non-blocking.
6. **D. Letters** — novel format, slower burn; ship after core RP/VN loops.

Cross-cutting "Phase 0" wins (do first, touch all surfaces):
- Sidebar nav re-label + subtitles (English-first).
- Persona page heading fix (`Settings` → `Persona`).
- Removing Indonesian copy strings from primary UI on each surface as we visit it.

---

## 5. Open questions (answered)

All 10 questions from the prior brief are answered in §0. No outstanding product decisions block implementation.

Next decisions only become relevant *after* launch:
- Choices/branching graph editor (post-VN-launch).
- User VN asset uploads (post-starter-library proven).
- Multi-language UI (separate from output-language setting).
- Letters per-thread cadence customization for paid tiers (not for free).

---

## Appendix A — Full surface briefs

The complete component-by-component briefs (before/after, copy tables, micro-interactions) live in the chat history of the design session that produced this plan. They are reproduced verbatim in implementation tickets under `B-DESIGN.*` in [BACKLOG.md](BACKLOG.md). When in doubt during implementation, follow this doc's invariants — the appendix elaborates, never contradicts.

## Appendix B — Schema citations

- `packages/server/drizzle/0026_vn_tables.sql` — stories, story_runs, scenarios.
- `packages/server/drizzle/0027_letters.sql` — letters delay model.
- `packages/server/src/routes/letters.ts` — letters delivery scheduler.

## Versioning

- **v1 (this doc, Apr 23 2026):** initial locked brief based on screenshot audit + 10 owner decisions.
- **Apr 23 2026 patch:** §0 row 9 updated — explicit content toggle superseded by BETA_FOCUS_CONTRACT_v1 §C. No toggle in any surface.
- Bump to v2 only when an invariant in §0/§1/§3 changes.
