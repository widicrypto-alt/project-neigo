> 🟡 **STATUS (apr 2026): MODERATION + FOLLOW SHIPPED.** ✅ 1.1/1.2 default public · 2.2 content reports auto-flag · 2.3 /ops/moderation · 4 follow + /feed · 5.3 sitemap · 5.4 robots. 🟡 1.4 queued_for_publish · 2.1 publicationState chip · 3.1/3.2 EntityCard unified + trending formula · 5.1 slug redirect · 7 soft-delete+DMCA+export · 6 analytics sink. ❌ 1.3 opt-in banner · 3.3 related_entities MV · 5.2 OG-image route. Remaining items → [BACKLOG.md](BACKLOG.md) B1.6–B1.8, B2.6–B2.9.

---

# PLANIMPv7 — Default-Public Migration, Moderation, Discovery Integration

**Depends on:** PLANIMPv1 primitives, PLANIMPv2/v3 detail pages live.

---

## 1. Default Public Policy

**Product direction:** new characters + new stories default to **public** upon creation.

### 1.1 Client default

- `/studio/characters/new`: `is_public` toggle default `true`.
- `/studio/stories/new`: `status='published'` default; wizard step 3 shows a visible "Ini akan terlihat publik saat kamu simpan" disclaimer.
- Advanced users can flip to `Privat` (or `Hanya Tautan` for stories) in the studio.

### 1.2 Server default

- `POST /api/characters` with no `isPublic` field → `true`.
- `POST /api/stories` with no `status` field → `'published'` and `publishedAt = NOW()`.

### 1.3 Migration for existing rows

One-shot **opt-in banner**, not automatic flip:
- Dashboard banner: "Karakter & cerita baru sekarang otomatis publik. Mau buka koleksi lama juga?"
- Buttons: "Buka semua" (patches all user's private rows to public after confirm modal), "Pilih manual" (deep-link to `/studio` list with visibility chips), "Nanti saja" (stores `user.metadata.defaultPublicBannerDismissedAt`).
- Never auto-flip existing private content — this is consent-critical for NSFW / WIP content.

### 1.4 Moderation pre-flight

When a character/story first flips to public (or is created public):
- Primary avatar / cover must be `moderation_status='approved'`. If `pending`, publish enqueues the moderation job and sets `status='queued_for_publish'`; on approval, publishes automatically.
- Hard-block categories (per PLANBv7) → rejection notification.

---

## 2. Moderation Surfaces

### 2.1 User-visible states

Characters / stories carry a derived `publicationState`:
- `draft` — author private, never published.
- `queued_for_publish` — waiting on moderation.
- `live` — published, visible to all.
- `flagged` — temporarily hidden after report, author notified.
- `unpublished` — author-removed.

Shown as a chip on the author's studio list and on detail page when `viewer.isOwner`.

### 2.2 Reports

New table `content_reports`:

```sql
-- drizzle/0049_content_reports.sql
CREATE TABLE IF NOT EXISTS content_reports (
  id           VARCHAR(36) PRIMARY KEY,
  entity_type  VARCHAR(16) NOT NULL,
  entity_id    VARCHAR(36) NOT NULL,
  reporter_id  VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category     VARCHAR(32) NOT NULL,  -- 'minors','nonconsensual','real_person','spam','other'
  detail       VARCHAR(1000),
  status       VARCHAR(16) NOT NULL DEFAULT 'open',  -- 'open','reviewed','rejected','actioned'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  reviewer_id  VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX content_reports_entity_idx ON content_reports(entity_type, entity_id, status);
CREATE INDEX content_reports_status_idx ON content_reports(status, created_at);
ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_reports_own ON content_reports
  FOR ALL USING (reporter_id = current_setting('app.user_id', true)::varchar);
```

Endpoint: `POST /api/:entityType/:entityId/report { category, detail? }` (rate-limited 3/h/user/entity).

Auto-flag rule: 3+ distinct-reporter reports within 24h on same entity → `status='flagged'`, `hidden_count++`, 403 from public `GET`. Banner on detail page for viewer: "Konten ini sedang ditinjau." Author gets email + in-app notification.

### 2.3 Admin console (ops-only)

Minimal for v1: re-use `/ops` route (already present). Add:
- `/ops/moderation` table listing `content_reports` with filters.
- Actions: "Tutup laporan", "Sembunyikan entitas", "Pulihkan entitas", "Banned user".
- Audit trail via `admin_audit_logs` (existing or new).

---

## 3. Discovery Integration

Existing `/explore` + `/discover` surfaces need to surface new detail pages and new social metrics.

### 3.1 Card design

Unified card used across all listing pages (`<EntityCard />`):
- Cover / avatar (4:3 or square).
- Title + tagline (truncate 2 lines).
- Author handle.
- Social row: `⭐ avgStars · 💬 totalComments · ❤ totalLikes · 👁 totalViews`.
- Tag chips (max 3).
- Click → detail page (character or story).

### 3.2 Sort & filter

Explore backend (`/api/discover`) accepts:
- `sort=(trending|new|top-rated|most-chatted)`
- `lang=id|en|ja`
- `nsfw=include|exclude` (honors user setting).
- `mode=(character|story|all)`.
- `tag=<tag>` (multi).
- `rating_min=1..5`.

"Trending" score formula:
```
score = avgStars * 1.0 + log10(totalViews + 10) * 2.0
      + log10(totalLikes + 10) * 1.5 + log10(totalChats + 10) * 1.0
      − days_since(publishedAt) * 0.1
```
Computed in a 15-min cron into `discover_scores` cache table.

### 3.3 Related content

For a detail page's "Konten Terkait":
- Characters: `related = top 4 by cosine similarity of tags + same author` (cheap tag-Jaccard).
- Stories: `related = top 4 by tag overlap + shared cast`.

Implementation: a nightly `related_entities` materialized view keyed by `(entity_type, entity_id)`.

---

## 4. Followers / Feed

Existing `creators` table. Extend:
- `POST /api/creators/:handle/follow` / `unfollow`.
- Add `follower_count`, `following_count` columns.
- Detail pages show "Ikuti" button for the author chip.
- `/feed` new route shows the latest characters/stories from followed creators.

Out of scope (v1): notifications digest, DM.

---

## 5. SEO / Sharing

### 5.1 Slugs

Stories get `slug` column (PLANIMPv3 §2). Canonical URL becomes `/stories/<slug>` with fallback route `/stories/<id>` 301 → slug when slug exists.

Characters: keep `id` URLs in v1 (low SEO priority). Optional handle-based paths later.

### 5.2 Open Graph

Per-page metadata (already in PLANIMPv2 §4.4 and PLANIMPv3 §4.4). `/og-image/:entityType/:entityId` edge route generates a branded preview card on the fly (Next.js `og` library).

### 5.3 Sitemap

`app/sitemap.ts` returns:
- All `characters.is_public=true`.
- All `stories.status='published'`.
- All `creator_profiles.profile_is_public=true`.

Chunked into 10k entries per file per Google spec.

### 5.4 robots

`app/robots.ts` blocks `/ops`, `/account`, `/settings`, `/studio`, `/chat/*`, `/handoff/*`. Allows everything else by default.

---

## 6. Analytics & Rankings

New analytics pipe events:
- `detail:view` → detail page rendered.
- `detail:cta:click` → primary CTA.
- `detail:comment:submit`.
- `detail:rating:submit`.
- `detail:reaction:toggle`.
- `studio:save`.
- `studio:publish`.

Minimal sink for v1: append to a `analytics_events` table with a 30-day retention policy (daily `DELETE WHERE created_at < NOW() - interval '30 days'`).

---

## 7. Privacy & Takedowns

- Author hard-delete: `DELETE /api/characters/:id` / `DELETE /api/stories/:id` cascades to revisions, comments, reactions, ratings, scenes. Soft-delete option kept for 14 days via `deleted_at` before hard removal (ops-configurable).
- DMCA: ops route `/ops/takedown` accepts a URL + justification, sets `status='flagged'`, records `takedown_reason`.
- Data export: existing GDPR `/api/me/export` should pick up new tables (comments, ratings, reactions, revisions).

---

## 8. Acceptance Criteria

1. New character/story defaults to public; private toggle honored.
2. One-shot banner lets users mass-flip old content; dismissible with memory.
3. Publishing a fresh character with un-approved avatar → `queued_for_publish`; becomes `live` on approval within one cron tick.
4. 3 reports within 24h auto-hide entity and notify author.
5. Trending ranking reflects new engagement metrics within 15 min.
6. Sitemap contains all public entities.
7. Detail page OG image renders within 1 s p95.
8. Hard-delete cascades remove all derived rows (verified by integration test).
