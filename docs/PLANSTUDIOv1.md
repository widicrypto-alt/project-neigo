# PLANSTUDIOv1 — Studio Remediation Plan

> **Status:** ✅ ALL SHIPPED (2026-04-25) — S1/S2/S3/S4/S5 complete; ImagePicker + /api/uploads wired across all studio surfaces
> **Scope:** `/studio/*` pages (stories + characters), story/character backend routes, related Discover/Stories list bugs.  
> **Author date:** apr 24 2026  
> **Supersedes touchpoints in:** [PLANIMPv4.md](PLANIMPv4.md) (story studio), [PLANIMPv5.md](PLANIMPv5.md) (character studio parity), [PLANIMPv7.md](PLANIMPv7.md) (default-public + moderation)  
> **Related contracts:** [PLANDESIGNv1.md](PLANDESIGNv1.md) §3.A (Discover card), [PLANVNv1.md](PLANVNv1.md) + [PLANVNv2.md](PLANVNv2.md) (VN scope-lock), [BETA_FOCUS_CONTRACT_v1.md](BETA_FOCUS_CONTRACT_v1.md), [FRONTEND.md](FRONTEND.md) (ID-first mobile).  
> **Backlog sync:** every shipped item should be deleted from [BACKLOG.md](BACKLOG.md) simultaneously.

---

## 0. TL;DR

Studio is half-wired. The **wizards create rows**, but field-by-field the backend silently drops most of what the user typed, there's no edit surface for title/cover/synopsis/cast, character creation under `/studio` points at a broken payload shape, images are all URL-only, and the "contains minors" ↔ "18+" flags have no mutual-exclusion guard. Two bugs also leak into Discover/Stories cards. This plan:

1. Unblocks the current Studio flows (create → edit → publish) with **no new DB migration**.
2. Adds the missing **image upload pipeline for stories** (mirrors the existing character-gallery R2 flow).
3. Closes frontend↔DB parity gaps for both `stories` and `characters`.
4. Fixes the two collateral bugs on `/stories` and `/` (Discover).
5. Hardens moderation (minors vs mature).

All work ships in **five phases (S1–S5)**. Phases are independently landable; each ends with `pnpm -r typecheck` green and a manual smoke-test checklist.

---

## 1. Brainstorm — what Studio **should** be

Studio is the author surface. The public surface (`/stories/:id`, `/characters/:id`) is read-only and shared. Studio must:

- **Create** stories & characters in one pass with **all fields the public surface renders**. Anything the reader can see, the author must be able to set in Studio.
- **Re-edit** everything after creation. Wizards are not contracts — they set defaults; the editor is the contract.
- **Upload** images natively from the device and **reuse** previously uploaded images (gallery). URL-only fields are allowed **only** as a fallback for advanced users.
- **Gate** moderation-sensitive flags (minors / 18+) behind mutual exclusion. The UI must make illegal combinations unreachable; the server must reject them defensively.
- **Feed Discover.** Every field the Discover rails sort/filter/show by must be authored and persisted. Today `tagline` and top-level `tags[]` are read-but-never-written.

Non-goals for v1 (deferred to BACKLOG):
- Rich in-editor previewers (WYSIWYG markdown preview beyond what `MarkdownEditor` already offers).
- Collaborative editing.
- Revision diff UI (revisions are already written to DB; viewer stays TBD).
- Scenario branching UI (choices/nextScene graph canvas) — current linear `nextSceneId` dropdown stays.

---

## 2. Audit — bugs & gaps (ground truth)

Audit captured apr 24 2026 across `packages/web/src/app/studio/**`, `packages/web/src/app/stories/**`, `packages/web/src/app/page.tsx`, `packages/server/src/routes/stories.ts`, `packages/server/src/routes/characters.ts`, `packages/server/src/routes/character-gallery.ts`, `packages/shared/src/schemas/index.ts`, `packages/server/src/db/schema.ts`.

Each finding gets a stable ID `Bnn` referenced by the phases below.

### 2.1 Critical (blocks user flow)

| ID | File | Finding |
|---|---|---|
| **B1** | [studio/characters/new/page.tsx](../packages/web/src/app/studio/characters/new/page.tsx) | Submit builds `{persona:{personality,speechStyle}, language, descriptionMd, tagline}`. Server `zCreateCharacter` expects **flat** with required `personality ≥10` top-level. → always 400. Nav from `/studio` goes to `/characters/new` (legacy) instead — studio wizard is orphaned & broken. |
| **B2** | [studio/stories/[id]/edit/page.tsx](../packages/web/src/app/studio/stories/%5Bid%5D/edit/page.tsx), [studio/stories/[id]/page.tsx](../packages/web/src/app/studio/stories/%5Bid%5D/page.tsx) | Story-level fields (`title`, `synopsis`, `coverImageUrl`, `language`, `requiredTier`, `metadata.tags`, `metadata.estimatedMinutes`, `tagline`) are **not editable** anywhere after creation. Detail page only PATCHes `/detail` which accepts none of these. |
| **B3** | stories route + studio UI | Backend has `GET /cast/candidates`, `POST /cast`, `DELETE /cast/:id`. **No frontend surface** — cast manager is missing. `CharacterLinker` only edits scene-level `castSubset`, not story cast. |
| **B10** | [studio/stories/new/page.tsx](../packages/web/src/app/studio/stories/new/page.tsx) | Wizard sends `status, isAdult18plus, openingQuote, plotMd, coverImageUrl` — server `zCreateStory` ignores all of them. All dropped on create; no auto-PATCH follows. |
| **B11** | studio/stories/new + studio/characters/new | `router.push('/studio/stories/' + r.id)` but server returns `{story:{id}}` / `{character:{id}}`. Redirect lands on `/studio/stories/undefined`. |
| **B13** | [page.tsx](../packages/web/src/app/page.tsx) | `storyToCard` does `s.cast.slice(0,3)` without null-guard → crashes on rows where `cast` is null/undefined. Matches the user-reported `Cannot read properties of undefined (reading 'slice')`. |

### 2.2 High (feature incomplete)

| ID | Finding |
|---|---|
| **B4** | No mutual exclusion between `containsMinors` and `isAdult18plus` (UI + server). |
| **B5** | Only character gallery has an R2 upload pipeline. Story cover / hero carousel / scene tile / scene bg / bgm / character avatar (in studio) are all URL-only. |
| **B6** | `POST /api/stories` hard-codes `status:'published'`. Auto-publishes drafts with zero scenes. |
| **B7** | Duplicate `POST /api/stories/:id/publish` handler — the second one (without opening-scene guard) wins. |
| **B8** | `GET /api/stories` has no `mine` filter; Studio list calls it anyway → author drafts invisible in Studio. |
| **B12** | Discover: `listStories/mapStory` omits `tagline` and top-level `tags[]`. Hero cards use synopsis preview; tone rail matches nothing. Cast avatars always null because `cast` jsonb never carries `avatarUrl`. |
| **B15** | `containsMinors` not in the create wizard. |
| **B18** | Studio character wizard tone-preset enum (`WARM`, `GENTLE`, …) diverges from shared `zTonePreset`. |
| **B19** | Even with B1 fixed, `language`/`tagline`/`descriptionMd` are not accepted by `zCreateCharacter`. |

### 2.3 Medium

| ID | Finding |
|---|---|
| **B9** | Scenario editor calls `setDraft` during render — React warning + unsaved edits lost on refetch. |
| **B14** | `heroCarousel` column has no UI. |
| **B16** | `playAsCharacterId` accepted by `/detail` PATCH but no picker UI. |
| **B17** | `LoreSection` frontend type drops `bodyHtml` (server always re-derives, but type inconsistency is bug-prone). |

See "Frontend ↔ DB parity matrix" in §5 for the complete field-by-field view.

---

## 3. Design decisions

### 3.1 No new migration (v1)
Everything needed already exists in schema. `character_images` (R2-backed) is reused for **character galleries**; story images get a **new R2 prefix under the same bucket** + a lightweight `story_images` table **only if needed** (deferred — for v1 we write directly to the story column after upload, without a separate index row). This matches the "no new migration" discipline used in [PLANVNv2.md](PLANVNv2.md).

**Reconsider next iteration:** if we want quota tracking / moderation queue / gallery reuse across stories, we'll need `story_images` (id, ownerId, storyId?, r2Key, url, moderation, kind: cover|hero|scene-bg|scene-tile|bgm). Flagged in [BACKLOG.md](BACKLOG.md).

### 3.2 Mutual exclusion: `containsMinors` XOR `isAdult18plus`
**Business rule:** when a story contains minor characters, 18+ content is prohibited. The UI must surface this clearly, the server must enforce it defensively.

- **Client:** when `containsMinors === true`, `isAdult18plus` toggle is **forced to `false` and disabled**, with a tooltip/help text. Setting `isAdult18plus = true` is only allowed when `containsMinors === false`. Applies to both the wizard (after B15) and the detail page.
- **Server:** `zUpdateStoryDetail` + `zCreateStory` cross-field refinement — reject `containsMinors && isAdult18plus` with 422 `minors_mature_conflict`.
- **DB invariant:** optional `CHECK (NOT (contains_minors AND is_adult_18plus))` is deferred (no migration in v1); server validator is enough.

### 3.3 Image upload UX
One reusable widget, `<ImagePicker />`, with three tabs:
1. **Upload** — drag/drop or file picker. PNG/JPG/WebP ≤ 5 MB. Presigned R2 PUT, client-side downscale to max 2048px longest edge via `createImageBitmap` + `OffscreenCanvas`.
2. **Gallery** — the user's own previously uploaded images (character gallery + story covers they've authored). Paginated `GET /api/uploads/mine?kind=…`.
3. **URL** — paste a direct URL (existing fallback, whitelisted hosts only — matches current `normalizeImageUrl` if present; else deferred to backlog).

Server endpoints (reuse character-gallery machinery):
- `POST /api/uploads/intent` body `{kind: 'story_cover'|'story_hero'|'scene_bg'|'scene_tile'|'bgm'|'character_avatar', mime, size}` → `{uploadUrl, r2Key, publicUrl, uploadId}`.
- `POST /api/uploads/commit` body `{uploadId}` → moderation stub + returns `{publicUrl}`.
- `GET /api/uploads/mine?kind=…&limit=50` → flat list from character_images union new row (v1 returns character images + NOOP for story kinds until backlog `story_images` lands).

**Alternative rejected:** reuse `/api/characters/:id/gallery` as a generic surface. Rejected because the route is scoped to a character ID (`characterId` NOT NULL in `character_images`).

### 3.4 Cast manager UI
Lives on **studio story detail** (tabs: `Plot & world | AI guide | Cast | Settings`). Component `<CastManager storyId=… ownerId=… />`:
- Renders existing `story.cast[]` (from `stories.cast` jsonb).
- "Add" opens a picker backed by `GET /cast/candidates` (owned / public / builtin tabs).
- "Remove" calls `DELETE /cast/:characterId`.
- "Set role" inline input (free text, 0–40 chars) — POST `/cast` upsert.
- Optimistic updates with React Query invalidation of `['story', id]`.

### 3.5 Studio story edit form
Split into two mutations:
1. **Basics** PATCH `/api/stories/:id` → `title, synopsis, coverImageUrl, language, requiredTier, metadata`.
2. **Detail** PATCH `/api/stories/:id/detail` (existing) → plot/AI/mod flags.

Both are wired to the same detail page via separate "Save basics" / "Save advanced" buttons **or** a single debounced dirty-tracked auto-save. v1 ships explicit Save buttons.

### 3.6 Character wizard
Delete the broken `/studio/characters/new` wizard and **redirect** to `/characters/new` (legacy flow works). Then retrofit the legacy wizard location-wise into `/studio/characters/new` as a thin re-export OR move the legacy code there permanently. Preferred: **move the legacy implementation to `/studio/characters/new`** (keeps all "new" UX under `/studio/*`) and redirect `/characters/new` → `/studio/characters/new` for backward compat.

### 3.7 Stories create endpoint — field parity
`zCreateStory` must accept: `title, synopsis?, coverImageUrl?, language?, isAdult18plus?, containsMinors?, plotMd?, openingQuote?, openingQuoteBy?, status?('draft'|'published'), tagline?, tags?: string[], metadata?: {tags?, contentWarnings?, estimatedMinutes?}`. Default `status: 'draft'`.

### 3.8 Discover/stories card hardening
- `mapStory` in [services/story-runner.ts](../packages/server/src/services/story-runner.ts) — add `tagline`, top-level `tags`.
- `storyToCard` in [app/page.tsx](../packages/web/src/app/page.tsx) — `(s.cast ?? []).slice(0,3)` everywhere.
- `/stories/page.tsx` — already uses `normalizeCast`; also null-guard `metadata?.tags ?? []`.

### 3.9 Non-functional
- **i18n:** ID-first copy per [FRONTEND.md](FRONTEND.md). All new strings go through the existing `next-intl` dictionaries (`messages/id.json`, `messages/en.json`).
- **A11y:** all new form controls get labeled `<label htmlFor>`; the ImagePicker dialog gets `role="dialog"` + focus trap (reuse `<Modal>` primitive if present).
- **Beta posture:** no TTS, no new audio features beyond `bgmUrl` passthrough ([BETA_FOCUS_CONTRACT_v1.md](BETA_FOCUS_CONTRACT_v1.md)).
- **RLS:** upload commit must verify `uploadIntent.ownerId === session.userId`; existing character-gallery row-level-security patterns apply.
- **OWASP:** uploads are MIME-sniffed server-side (existing `character-gallery` uses `file-type`), max-size enforced both at intent + commit, content-type whitelist.

---

## 4. Phases (execution plan)

Each phase lists: files touched, tests, acceptance. Phases are independent unless noted.

### Phase S1 — Unblock create (B1, B6, B10, B11, B18, B19) ✅ SHIPPED (2026-04-25)
**Goal:** after S1, a user can create a story OR character via Studio and land on a usable editor.

1. **Server `zCreateStory`** ([routes/stories.ts](../packages/server/src/routes/stories.ts)): accept the full field set (§3.7). Default `status: 'draft'`. Cross-field check `!(containsMinors && isAdult18plus)`.
2. **Server `zCreateCharacter`** ([shared/src/schemas/index.ts](../packages/shared/src/schemas/index.ts)): accept `language?, tagline?, descriptionMd?` passthrough (server writes them directly on the inserted row; PATCH-detail path already exists and remains valid too).
3. **Redirect fix** (B11): both wizards — read `r.story?.id ?? r.id` / `r.character?.id ?? r.id`. Keep defensive fallback.
4. **Tone preset** (B18): replace the studio wizard enum with the shared `TonePresetEnum` values (or delete the studio wizard per S1.5).
5. **S1.5 (pick one):**
   - (a) Fix the studio wizard payload + tone enum in place, OR
   - (b) Move the legacy `/characters/new` implementation into `/studio/characters/new` and replace `/characters/new` with a redirect. **Preferred (b).**
6. **Tests:** add server unit tests for `zCreateStory` cross-field refinement + `POST /api/stories` field persistence (title / cover / plotMd / openingQuote / status=draft default).

**Acceptance:** creating a story through the wizard persists plot + cover + mature flag; redirect lands on `/studio/stories/<uuid>`; creating a character lands on `/studio/characters/<uuid>` and the typed persona fields are visible.

### Phase S2 — Story edit parity + cast manager (B2, B3, B8, B14) ✅ SHIPPED (2026-04-25)
1. **Studio story detail**: add a **Basics** form section (title, synopsis, cover picker, language, requiredTier, tagline, tags chips, estimatedMinutes) hitting PATCH `/api/stories/:id`.
2. **Cast tab**: new `<CastManager>` component under `packages/web/src/components/studio/CastManager.tsx`, wired to existing cast endpoints. Tabs for owned / public / builtin. Empty-state copy in ID.
3. **`GET /api/stories` mine filter** (B8): add `?mine=1` → filter by `authorId = session.userId`, include drafts. Studio list pages switch to this.
4. **`heroCarousel`** (B14): `HeroCarouselEditor` component — list of `{url, caption}` rows with add/remove/reorder. (Uses the ImagePicker from S3 if S3 shipped; otherwise URL-only for now.)
5. **Scenario editor in-render setState fix** (B9): wrap `setDraft` in `useEffect([active?.id])`.

**Acceptance:** author can rename a story, change its cover, add/remove cast members, and the changes survive a refresh.

### Phase S3 — Image upload pipeline (B5) ❌ PENDING
1. **Server**: new [routes/uploads.ts](../packages/server/src/routes/uploads.ts) exposing `/api/uploads/intent`, `/api/uploads/commit`, `/api/uploads/mine`. Reuses `character-gallery`'s R2 + moderation helpers (extract shared `r2Client.ts` if not already shared).
2. **Client**: new [components/uploads/ImagePicker.tsx](../packages/web/src/components/uploads/ImagePicker.tsx) — three-tab modal (Upload | Gallery | URL). Returns `string` (public URL) via callback.
3. **Wire ImagePicker into**:
   - Story wizard cover field.
   - Studio story detail: cover, hero carousel rows.
   - Scenario editor: `backgroundImageUrl`, `tileImageUrl`.
   - Character wizard + studio detail: `avatarUrl`.
4. **`bgmUrl`** stays URL-only in v1 (audio upload quarantined to backlog).
5. **Tests:** unit test for `ImagePicker` URL/upload path (mock R2); server test for intent→commit ownership check.

**Acceptance:** a user can upload a PNG from their device, see it appear in the cover preview, save the story, and the public story page renders it.

### Phase S4 — Moderation mutual exclusion + publish flow (B4, B7, B15, B16) ✅ SHIPPED (2026-04-25)
1. **Wizard**: add `containsMinors` checkbox in the moderation step. Wire mutual exclusion (both UI states + server cross-field).
2. **Studio detail**: change the flag row from a naive `.map()` to explicit toggles with mutual-exclusion logic + helper copy ("Cerita dengan karakter minor tidak boleh menandai konten 18+").
3. **Delete the duplicate publish handler** (B7): keep the opening-scene-guarded version. Add a unit test asserting 422 on missing opening scene.
4. **`playAsCharacterId` picker** (B16): small dropdown pulling from `story.cast` on the studio detail page.
5. **Server cross-field refinement** in both `zCreateStory` and `zUpdateStoryDetail`.

**Acceptance:** ticking "Contains minor characters" visibly disables 18+; trying to force it via API returns 422; publishing a story with no scenes returns 422.

### Phase S5 — Discover & Stories list fixes (B12, B13) ✅ SHIPPED (2026-04-25)
1. **`mapStory`** (server): include `tagline` + top-level `tags`.
2. **`storyToCard`**: null-guard `cast`. Update the TS type to `cast?: CastMember[]`.
3. **Stories list**: defensive `metadata?.tags ?? []` (already present, audit any remaining unguarded `.slice` / `.map` of nullable fields).
4. **Discover tone rail**: switch match source to `story.tags ?? story.metadata?.tags ?? []`.

**Acceptance:** `/` no longer crashes with `Cannot read properties of undefined (reading 'slice')`; tone filter chips filter results; hero cards show author-written taglines.

---

## 5. Frontend ↔ DB parity matrix (target)

After all phases ship. **✅ = editable in Studio. R = read-only (server-set).**

### Stories
| Column | Wizard | Studio Detail | Scene Editor |
|---|---|---|---|
| title | ✅ | ✅ | — |
| synopsis | ✅ | ✅ | — |
| tagline | ✅ | ✅ | — |
| coverImageUrl | ✅ (ImagePicker) | ✅ | — |
| language | ✅ | ✅ | — |
| requiredTier | ✅ | ✅ | — |
| metadata.tags / tags[] | ✅ | ✅ | — |
| metadata.contentWarnings | ✅ | ✅ | — |
| metadata.estimatedMinutes | ✅ | ✅ | — |
| heroCarousel | — | ✅ | — |
| slug | — | ✅ | — |
| plotMd / plotHtml | ✅ | ✅ | — |
| aiPlotMd/Html, aiGuidelinesMd, aiReminderMd, outputReminderMd | — | ✅ | — |
| isAdvancedMode, isSecretMode, dungeonMindEnabled | — | ✅ | — |
| isAdult18plus, containsMinors | ✅ (XOR) | ✅ (XOR) | — |
| playAsCharacterId | — | ✅ | — |
| openingQuote / openingQuoteBy | ✅ | ✅ | — |
| status | ✅ (draft default) | ✅ (publish/unpublish buttons) | — |
| cast (jsonb) | — | ✅ (CastManager) | — |
| openingSceneId | R (auto) | ✅ (picker) | — |
| storyScenes.* (all editable columns) | — | — | ✅ all, with ImagePicker for image/bg fields |

### Characters (Studio)
| Column | Wizard | Studio Detail |
|---|---|---|
| name | ✅ | ✅ |
| avatarUrl | ✅ (ImagePicker) | ✅ |
| tagline | ✅ | ✅ |
| descriptionMd/Html | ✅ | ✅ |
| loreSectionsMd | — | ✅ |
| exampleDialogMd/Html | — | ✅ |
| personaMd (semantic) | — | ✅ |
| persona.* (flat 30+ fields) | ✅ (legacy wizard moved in) | ✅ (existing Description tab) |
| tonePreset | ✅ | ✅ |
| language / languagesSpoken | ✅ | ✅ |
| isPublic / isSecretPromptHidden / slug / allowInStories | ✅ (subset) | ✅ |
| tags / folder / chapter / isRetired | — | ✅ |
| Gallery (characterImages) | — | ✅ (ImagePicker — surfaces gallery tab) |

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Moving legacy `/characters/new` breaks bookmarked URLs | Add a `next.config.ts` redirect `/characters/new → /studio/characters/new`. |
| R2 credentials / bucket policy differ between dev & prod | Reuse the character-gallery presign function verbatim; do not introduce a new SDK path. |
| Existing rows with `status='published'` + zero scenes (from the B6 bug) | One-time cleanup SQL (optional): `UPDATE stories SET status='draft' WHERE opening_scene_id IS NULL AND status='published' AND author_id IS NOT NULL;` — manual op, not part of migrations. |
| Client-side downscale fails on older browsers | Feature-detect `createImageBitmap`; fallback to raw upload (server already enforces size cap). |
| Mutual exclusion change might auto-fail existing rows | None — both flags are booleans defaulting false; server check only runs on new writes. |
| Adding `?mine=1` may leak drafts via misconfig | Server explicitly requires auth + filters on `authorId = session.userId`; add regression test. |

---

## 7. Verification checklist (run after each phase)

- [ ] `pnpm -r typecheck` — green across `shared`, `server`, `web`.
- [ ] `pnpm --filter @neigo/server test` — new validator tests pass.
- [ ] Manual: create story via wizard → land on detail → all typed fields visible.
- [ ] Manual: edit title+cover on detail → refresh → persists.
- [ ] Manual: add a built-in character to cast → picker shows; refresh → persists; scene editor's cast-subset now lists it.
- [ ] Manual: upload PNG as story cover → appears on `/stories/:id`.
- [ ] Manual: tick "Contains minors" → 18+ toggle disables; server rejects direct API attempt.
- [ ] Manual: `/` Discover shows full 30 rows, no console error, tone rail filters.
- [ ] Manual: `/stories` list loads without `slice` crash on rows with null cast/metadata.

---

## 8. Out of scope (→ BACKLOG)

- Dedicated `story_images` table + quota tracking.
- BGM upload (audio).
- WYSIWYG markdown preview pane.
- Revision-diff viewer UI.
- Scenario branching canvas (graph editor for `choices`/`nextSceneId`).
- Multi-language per-field content (one story → one language for v1).
- Moderation queue UI for uploaded images (current `character-gallery` async moderation reused as-is).

Add these to [BACKLOG.md](BACKLOG.md) under a new `Studio v2` section when S1–S5 ship.

---

## 9. Cross-doc links

- [PLANIMPv4.md](PLANIMPv4.md) — original story studio log; this plan repairs/extends it.
- [PLANIMPv5.md](PLANIMPv5.md) — character studio parity; this plan repairs the `/studio/characters/new` wizard it introduced.
- [PLANIMPv7.md](PLANIMPv7.md) — default-public + moderation context for the minors/mature rule.
- [PLANDESIGNv1.md](PLANDESIGNv1.md) §3.A — Discover card contract (tagline, tags, cast avatars).
- [PRESENCE_CONTRACT_v1.md](PRESENCE_CONTRACT_v1.md) — no changes (Studio is outside chat).
- [BETA_FOCUS_CONTRACT_v1.md](BETA_FOCUS_CONTRACT_v1.md) — no TTS, mobile-first; respected by all new UI.
- [FRONTEND.md](FRONTEND.md) — ID-first copy for all new strings.

---

*End of PLANSTUDIOv1.*
