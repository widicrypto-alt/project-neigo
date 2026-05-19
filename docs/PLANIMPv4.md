> 🟡 **STATUS (apr 2026): STUDIO SHIPPED, COMPONENT EXTRACTIONS DEFERRED.** ✅ 3-step wizard · persistent editor · CRUD · MarkdownEditor. ❌ 4.6 `vn-readiness/recompute` → [BACKLOG.md](BACKLOG.md) B1.3. 🟡 5.2 ScenarioTabs / 5.3 CharacterLinker / 5.4 VnReadinessMeter / 5.5 TokenSummaryPanel inlined in studio pages; extract only when a second consumer appears → [BACKLOG.md](BACKLOG.md) B2.4.

---

# PLANIMPv4 — Story Studio (Create + Edit)

**Depends on:** PLANIMPv1 primitives + PLANIMPv3 story schema.
**Surface:** `/studio/stories/new` (wizard) and `/studio/stories/[id]` (persistent editor). Replaces any inline story edit.

Screenshots 4–6 are the UX spec. Every field shown is persisted.

---

## 1. Field Map (DB ↔ UI ↔ gate)

| UI Label (id) | DB Column | Type | Visibility Gate | Notes |
|---|---|---|---|---|
| Gambar Sampul / Cover | `stories.cover_image_url` | R2 upload | always | Same pipeline as character gallery (variants, EXIF strip, moderation). |
| Foto / Video (hero carousel) | `stories.hero_carousel` jsonb | R2 | always | Allow images now; video later. |
| Bahasa | `stories.language` | varchar | always | Dropdown: id, en, ja. |
| Judul (Title) | `stories.title` | varchar(200) | always | Required. |
| Karakter (linked) | `stories.cast` | jsonb | always | Character linker picks from viewer's library + public. |
| Ringkasan Plot | `stories.synopsis` | text | always | Required, ≤ 20 kata hint, counted client-side. Not used by AI. |
| Plot | `stories.plot_md` → `plot_html` | MD | always | Required. Rendered on detail page. |
| Mode Lanjutan (toggle) | `stories.is_advanced_mode` | boolean | always | Enables sub-fields below. |
| Mode Rahasia (toggle) | `stories.is_secret_mode` | boolean | within advanced panel | Hides all AI fields from viewers. |
| Plot Prompt (AI) | `stories.ai_plot_md` → `ai_plot_html` | MD | advanced only | Actual prompt sent to AI. |
| Pedoman Prompt | `stories.ai_guidelines_md` | MD | advanced only | Behavioral guidance. |
| Pengingat AI | `stories.ai_reminder_md` | MD | advanced only | Mid-context reminder. |
| Pengingat Output AI | `stories.output_reminder_md` | MD (≤ 100 tokens) | advanced only | Trailing enforcement. |
| Pesan Pertama (Skenario) #N | `story_scenes.opening_md` → `opening_html` | MD | always | Each row is one scenario. |
| Tambah Tag Alur Cerita | `stories.tags` | text[] | always | Chip input w/ autocomplete. |
| Persona Pemain | `stories.play_as_character_id` | fk | always | Optional linker. |
| Dungeon Mind (DM) | `stories.dungeon_mind_enabled` | boolean | always (marked ALPHA) | Future runtime flag. |
| Visibilitas | `stories.status` | enum | always | Privat / Publik / Hanya Tautan (`'draft'|'published'|'unlisted'`). |
| Berperingkat 18+ | `stories.is_adult_18plus` | boolean | always | |
| Mengandung karakter di bawah umur | `stories.contains_minors` | boolean | always | Forces SFW chain. |
| Ringkasan Token (Plot) | computed | — | always | `estimateTokensFast(plotOrAiPlot)` live. |
| Perkiraan Total Token | computed | — | always | plot + cast + scenarios total. |
| Perkiraan Token Skenario #N | `story_scenes.token_count` | int | always | Live per scenario. |
| Kesiapan Visual Novel | `stories.vn_fg_count` / `vn_bg_count` / `vn_readiness_pct` | computed | always | See §4.6. |

---

## 2. Wizard (for `/studio/stories/new`)

Three-step linear wizard to lower blank-canvas anxiety:

**Step 1 — Premise.** Judul, Bahasa, Ringkasan Plot, Tags. CTA: "Lanjut".
**Step 2 — Plot & Skenario.** Plot (MD editor), scenario list (min 1). CTA: "Lanjut".
**Step 3 — Setelan.** Persona Pemain, Visibilitas, 18+/minors flags, cover upload. CTA: "Simpan Alur Cerita" → `POST /api/stories`.

After save, route to `/studio/stories/<id>` (persistent editor). Draft autosaves every 15 s to `localStorage['neigo.story-draft.<tmpId>']`; cleared on successful POST.

---

## 3. Persistent Editor Layout

Single long-form page (like screenshots 4–6) with collapsible sections:

```
┌ Topbar: [Batal] Buat/Edit Alur Cerita   [?] [Save]
│
│ Cover upload    [ Foto/Video card ]
│ ┌─ Lihat panduan dari kreator kami ─┐
│ Bahasa [id ▾]
│ Judul *          [_________________]
│ Karakter *       [CharacterLinker]
│ Ringkasan Plot * [textarea]
│ Plot *           [MD editor w/ preview tab]
│ Mode Lanjutan  [toggle]
│ ── when on ──
│   Mode Rahasia [toggle]
│   Plot Prompt (AI) * [MD editor]
│   Pedoman Prompt     [MD editor]
│   Pengingat AI       [MD editor]
│   Pengingat Output AI [MD editor + token counter ≤100]
│ Pesan Pertama (Skenario) *
│   [Scenario list: tabs 1,2,3,...,+]
│   [MD editor per scenario + token counter]
│ Tambah Tag Alur Cerita [chip input]
│ Persona Pemain  [CharacterLinker, optional]
│ Dungeon Mind (DM)  [toggle — ALPHA]
│ Visibilitas [ Privat ▾ ]
│ Berperingkat 18+ [toggle]
│ Mengandung karakter di bawah umur [toggle]
│
│ ── Side panel (sticky on desktop) ──
│ Ringkasan Token
│   Plot             {n}
│   Perkiraan Total  {n}
│   Pesan Pertama #N {n}
│   Tips: di bawah 10k.
│ Kesiapan Visual Novel [progress bar]
│   Latar Depan {x}/10 · Latar Belakang {y}/10
│
│ [Simpan Alur Cerita]
```

Mobile: side panel collapses into an accordion at the bottom above the CTA.

---

## 4. API

### 4.1 `POST /api/stories`

Body matches field-map above (subset allowed on create). Creates:
1. `stories` row (draft/unpublished by default if user left it Privat).
2. One `story_scenes` row per scenario.
3. Initial `content_revisions` for monitored fields.
4. Token counts precomputed and persisted.

### 4.2 `PATCH /api/stories/:id`

Partial update. Server:
1. Sanitizes MD → HTML for any `*_md` field.
2. Re-estimates tokens for changed fields.
3. Writes `content_revisions` rows.
4. Updates denormalized `characters.total_stories` counters for any added/removed cast.
5. Bumps `updated_public_at` if story is public.

### 4.3 `POST /api/stories/:id/scenarios`

Append a scenario (creates a `story_scenes` row). Body: `{ title, openingMd, castSubset?, personaPrompt? }`.

### 4.4 `PATCH /api/stories/:id/scenarios/:sceneId`

Update scenario. Re-renders, re-tokenizes, revision-logs.

### 4.5 `DELETE /api/stories/:id/scenarios/:sceneId`

Soft delete via `scene_type='archived'` or hard delete when scenario not referenced by any active `story_runs`. Prevents FK violations.

### 4.6 `POST /api/stories/:id/vn-readiness/recompute`

Scans linked characters' gallery images + story-level background images to compute:
```
vn_fg_count = Σ unique character sprite images (moderation=approved) capped at 10
vn_bg_count = Σ scene.backgroundImageUrl non-null unique, capped at 10
vn_readiness_pct = clamp((vn_fg_count / 10) * 0.5 + (vn_bg_count / 10) * 0.5, 0, 1) * 100
```
Also runs post-gallery-approval via BullMQ.

### 4.7 `POST /api/stories/:id/publish` / `unpublish`

Publishes when `title`, `plotMd`, `synopsis`, at least one scenario with non-empty `openingMd` exist, and no pending moderation. Sets `status='published'`, `publishedAt=NOW()`. Triggers fan-out for follower notifications.

### 4.8 `POST /api/stories/:id/clone`

Creates a private copy for the caller. Revision v1 records the clone source.

---

## 5. Frontend Components

### 5.1 `<MarkdownEditor />`

`packages/web/src/components/editors/MarkdownEditor.tsx` — thin wrapper over `@uiw/react-md-editor` (or `@tiptap/starter-kit` if we want WYSIWYG). Features:

- Tabs: `Write` | `Preview`.
- Toolbar: bold, italic, link, code, list, quote, insert `{{user}}`, insert `{{char}}`.
- Token counter (uses `estimateTokensFast` from @neigo/shared).
- Paste sanitizer: strips Word/Google-Docs junk HTML; keeps plain MD.
- `maxTokens` prop enforces red state + block save when exceeded (for output reminder ≤100).

### 5.2 `<ScenarioTabs />`

- Horizontal scrolling numbered tabs (1, 2, …, +).
- DnD reorder (persist via PATCH scenarios batch).
- Delete guard: confirm modal if scenario has any `story_runs`.

### 5.3 `<CharacterLinker />`

Search over owned + public characters. Limits: cast max 12, play-as single character.

### 5.4 `<VnReadinessMeter />`

Reads `story.vn` aggregate. Shows FG / BG counts, live progress bar. Lint hints: "Tambahkan 3 latar belakang untuk membuka rekomendasi VN".

### 5.5 `<TokenSummaryPanel />`

Live token breakdown keyed to form state:
- Plot (or AI Plot if advanced-secret → prefer AI Plot for the AI token count).
- Character bundle (sum estimate = sum of linked `characters.tokenInfo.total`; fetched lazily per cast id).
- Scenario tokens (each scene's `token_count`).
- Grand total with a colour-coded badge: `< 5k green · 5–10k yellow · > 10k amber tip`.

### 5.6 `<VisibilitySelect />`

Option pills: Privat / Publik / Hanya Tautan. Default on new = Publik (per product direction — PLANIMPv7). Advanced: slug edit when publik or hanya tautan.

### 5.7 Age/Minors toggles

Toggles are both **hard-gated**:
- If `containsMinors === true`: forces the chat runtime into SFW mode (already supported by existing safety chain); disables `isAdult18Plus` toggle (mutually exclusive).
- UI legend text matches spec quotes verbatim.

---

## 6. Persistence / Autosave

- On form mount, load any local draft for new stories.
- Debounced PATCH every 3 s when editing existing story (skip if no diff).
- "Save failed" banner with retry on non-abort errors.
- Undo/Redo: form-level via `useReducer` history snapshots (max 20 steps).

---

## 7. Validation Matrix

| Field | Rule |
|---|---|
| title | 1–200 chars |
| synopsis | 1–300 chars, ≤ 20 words warning (non-blocking) |
| plot_md | 1–20_000 chars |
| ai_plot_md | ≤ 20_000 chars |
| output_reminder_md | ≤ 600 chars AND ≤ 100 tokens |
| tags | ≤ 10, each 1–24 chars, kebab-case normalized |
| scenarios | ≥ 1 required to publish; each opening_md 1–10_000 chars |
| cast | ≤ 12 |
| cover | must be approved image |
| contains_minors + is_adult_18plus | mutually exclusive |

---

## 8. Acceptance Criteria

1. `/studio/stories/new` wizard creates a story in ≤ 5 s.
2. Persistent editor autosaves within 3 s of last keystroke; offline edits recover from localStorage.
3. Advanced panel reveals ai/guidelines/reminders only when toggle is on.
4. Secret toggle hides those same fields from `/stories/:id` detail page for non-owners.
5. Token summary updates within 200 ms of edits (debounced).
6. Publish blocked when validation fails; toast explains missing fields.
7. Cloning preserves all scenarios with unique ids.
8. Adding/removing cast updates the detail page within 1 s (invalidates the cache).
9. VN readiness computes correctly after uploading new sprites/backgrounds.
10. RLS: non-owner `PATCH` → 403; owner can only mutate own story.
