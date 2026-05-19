> 🟡 **STATUS (apr 2026): STUDIO PARITY SHIPPED.** ✅ field map · long-form layout · PATCH persistence · read-side LoreAccordion · gallery integration (via PLANBv3) · advanced/secret toggles · zod validation. 🟡 clone / preview-prompt / publish endpoints · lore DnD edit · gallery reorder+flags UI — partial.

---

# PLANIMPv5 — Character Studio Parity

**Depends on:** PLANIMPv1 primitives + PLANIMPv2 character schema.
**Surface:** `/studio/characters/new` (wizard), `/studio/characters/[id]` (persistent editor). Existing inline editor at `/characters/[id]` moves to `/characters/[id]/edit` or is retired in favor of studio.

Goal: match story studio quality so authors have a single paradigm.

---

## 1. Field Map

| UI Section | Fields | DB |
|---|---|---|
| Identitas | Nama, Tagline, Bahasa, Gender, Usia | `characters.name/tagline/language/gender/age` |
| Sampul & Galeri | Avatar primer, galeri | `character_images` |
| Deskripsi Publik | Deskripsi (MD), Lore sections (accordion) | `characters.description_md/_html`, `characters.lore_sections_md` |
| Persona Inti | physical, coreIdentity, mannerisms, history, values, fears, etc. | `characters.persona` (existing 30+ fields) |
| Contoh Dialog | structured list + MD body | `characters.persona.exampleDialog` + `characters.example_dialog_md` |
| Mode Lanjutan | System prompt override, voice tokens, hidden notes | `characters.persona.systemPromptOverride`, `characters.persona.voiceMarkers` |
| Mode Rahasia | Hide system prompt from viewers | `characters.is_secret_prompt_hidden` |
| Tags | chip input | `characters.tags` (jsonb array) |
| Visibilitas | Privat / Publik / Hanya Tautan | `characters.is_public` + (new) `characters.visibility` (v2 tri-state) |
| NSFW | Flag | `characters.persona.nsfw` |
| Allow in stories | toggle | `characters.allow_in_stories` |
| Token Summary | computed | — |

Add `characters.visibility` enum migration if we want tri-state; otherwise continue with `is_public` + author-unlisted links via signed URL (future).

---

## 2. Layout

Same long-form + sticky side panel pattern as PLANIMPv4. Sections in order:
1. Sampul (avatar + gallery uploader, reuse `<GallerySection />`).
2. Identitas.
3. Deskripsi Publik (MD editor + token counter).
4. Persona Inti (structured form — existing Persona form componentized).
5. Contoh Dialog (list + MD).
6. Mode Lanjutan panel (gated).
7. Lore Sections accordion (add/remove/reorder MD blocks).
8. Tags.
9. Visibilitas + Allow in stories + NSFW.

Side panel:
- Token summary (`character total = persona + description + example dialog`).
- Gallery health (count approved / pending / rejected).
- Preview as Visitor link.

---

## 3. API (extensions)

Most exist already (`PATCH /api/characters/:id`). Required additions:

- Persist new public fields (description_md, lore_sections_md, example_dialog_md, tagline) — write `content_revisions` per field.
- `POST /api/characters/:id/clone` — forks to private copy.
- `POST /api/characters/:id/preview-prompt` — returns the rendered system_prompt + token count so authors can verify.
- `POST /api/characters/:id/publish` — gates on `moderation_status` of primary avatar.

---

## 4. Lore Sections Editor

`<LoreAccordion editable />`:
- Reorder via DnD.
- Each section: title (varchar 120), MD body (≤ 8k chars), optional icon slug.
- Max 6 sections.

Rendering on detail page: sections expand/collapse; first section auto-expanded.

---

## 5. Gallery Integration

Current: `packages/web/src/components/characters/GallerySection.tsx` (upload with client compression per PLANBv7 W-J).
Additions:
- Reorder via DnD (persists `orderIndex`).
- "Set as cover" → `isPrimary`.
- "NSFW" per-image toggle.
- Alt/caption editor inline.
- Moderation status badge (pending/approved/rejected) surfaced with tooltip reason.
- "Send for re-review" button when rejected (opens modal explaining appeal path).

---

## 6. Advanced Mode (Studio side)

Symmetrical with Story Studio:
- **Mode Lanjutan toggle** → reveals `systemPromptOverride` and `voiceMarkers`.
- **Mode Rahasia toggle** → sets `is_secret_prompt_hidden=true`, hiding the prompt tab from detail-page viewers.
- "Preview prompt" shows the fully composed system prompt that the orchestrator will ship.

---

## 7. Validation

| Field | Rule |
|---|---|
| name | 1–200 |
| tagline | ≤ 200 |
| description_md | ≤ 10_000 chars |
| lore sections | ≤ 6, each ≤ 8_000 chars |
| tags | ≤ 10 |
| avatar | must be approved image |
| NSFW off if contains_minors (enforced by moderation pipeline) | |

---

## 8. Acceptance Criteria

1. `/studio/characters/new` wizard + `/studio/characters/[id]` persistent editor render all fields.
2. Token summary live.
3. Gallery upload uses client-side compression then server variants (PLANBv7 pipeline).
4. Lore sections reorder survives refresh.
5. Secret prompt toggle hides prompt tab for non-owners on detail page (PLANIMPv2 gating verified).
6. Clone creates private copy with fresh id and `ownerId` = caller.
7. Publish blocked when primary avatar is not approved.
8. Edits produce revisions in `content_revisions` visible in detail page's Log Perubahan tab.
