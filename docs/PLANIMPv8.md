> 🟡 **STATUS (apr 2026): PHASES A–G DONE.** Migrations, routes, components, moderation, follow, discover — all shipped. ❌ Phase H hardening (k6 load, axe-core, Lighthouse ≥85, p95 <250ms) → [BACKLOG.md](BACKLOG.md) B2.16. §2 acceptance matrix: A3 rate-limit test, B3 revision diff UI, D2 100-token output reminder hard-gate, G3 trending 15min refresh, H1/H2 perf — all unverified.

---

# PLANIMPv8 — Phased Rollout, Acceptance Matrix, Risks

**Depends on:** PLANIMPv1..v7.
**Purpose:** implementation roadmap, test matrix, risk register.

---

## 1. Phase Plan

### Phase A — Foundation (PLANIMPv1 primitives)
1. Migrations:
   - `0042_content_revisions.sql`
   - `0043_comments.sql`
   - `0044_ratings.sql` + `rating_aggregates` materialized view
   - `0045_content_translations.sql`
   - `0046_reactions.sql`
2. Shared package:
   - `packages/shared/src/rich-content.ts` (micromark + sanitize-html profiles).
   - Add deps: `micromark`, `micromark-extension-gfm`, `sanitize-html`, `turndown` (web-only).
3. Server routes:
   - `comments.ts`, `ratings.ts`, `reactions.ts` (generic polymorphic handlers).
   - `POST /api/preview/render` (rate-limited MD → HTML sanitizer preview).
4. Cron:
   - `refreshRatingAggregates()` every 5 min.
   - `reconcileEntityCounters()` every hour.
5. Web primitives:
   - `<CommentThread />`, `<RatingStars />`, `<ReactionBar />`, `<RichContent />`, `<TranslateToggle />`, `<AdvancedModeToggle />`, `<RevisionLog />`.
6. Tests:
   - Server unit tests for each route (auth, rate limit, validation).
   - `rich-content.test.ts` for sanitize allowlist (script injection, iframe filtering, GFM features).

**Exit criteria:** primitives usable from a stub page; RLS verified via SQL with cross-user `app.user_id`.

### Phase B — Character Detail Page (PLANIMPv2)
1. Migration `0047_character_details.sql`.
2. Extend `schema.ts`.
3. Extend `characters.ts` route with GET detail + PATCH handling revisions.
4. Build `/characters/[id]/page.tsx` detail view; relocate existing editor to `/characters/[id]/edit` (temporary shim — final home in PLANIMPv5).
5. Wire comments/ratings/reactions.
6. SEO metadata + OG image.
7. Tests: response projection (secret vs advanced), rating upsert, revision creation.

**Exit criteria:** /characters/[id] renders for 5 beta characters without layout bugs.

### Phase C — Story Detail Page (PLANIMPv3)
1. Migration `0048_story_details.sql`.
2. Extend `stories` schema + route.
3. Build `/stories/[id]/page.tsx` detail view; move scenario picker to `/stories/[id]/scenarios`.
4. Token summary end-to-end: server precomputes per-scenario on write; detail page reads.
5. Tests: public/secret projection; token summary matches; revision log.

**Exit criteria:** detail pages pass visual-regression snapshots on 1366×768 + 390×844.

### Phase D — Story Studio (PLANIMPv4)
1. `/studio/stories/new` wizard.
2. `/studio/stories/[id]` persistent editor.
3. `<MarkdownEditor />`, `<ScenarioTabs />`, `<CharacterLinker />`, `<VnReadinessMeter />`, `<TokenSummaryPanel />`.
4. Autosave + local draft.
5. VN readiness background job.
6. Tests: publish gate, advanced/secret toggle, revision on every saved field.

**Exit criteria:** author can create + publish a full story (≥ 3 scenarios) end-to-end, appearing on detail page immediately.

### Phase E — Character Studio Parity (PLANIMPv5)
1. `/studio/characters/new` + `/studio/characters/[id]`.
2. Lore accordion editor.
3. Reuse gallery component with DnD.
4. Clone + publish endpoints.

**Exit criteria:** characters editable exclusively through studio; `/characters/[id]/edit` shim retired.

### Phase F — Rich Content Plumbing (PLANIMPv6)
1. Swap all plain-text fields at render-time to sanitized HTML.
2. Wire translation endpoint + cache invalidation on source change.
3. Shiki code highlighting in default profile.
4. Tests: XSS payload matrix, translation cache hit/miss.

**Exit criteria:** arbitrary MD from a test fixture renders safely; translated detail page matches source layout.

### Phase G — Defaults + Moderation + Discovery (PLANIMPv7)
1. Flip new-entity defaults.
2. Migration `0049_content_reports.sql` + report endpoint.
3. Auto-flag threshold cron.
4. Discovery/explore refactor (new sorts, cards, trending cron).
5. Slug generation for stories + redirects.
6. `sitemap.ts` + `robots.ts` + OG image route.
7. Dashboard opt-in banner for mass-publish.
8. Tests: trending ranking stability, report auto-flag, sitemap contents.

**Exit criteria:** site-wide public-by-default live; moderation loop closes within 15 min for auto-flag.

### Phase H — Hardening
1. Load test detail pages at 200 rps (k6 script); ensure p95 < 400 ms warm.
2. Accessibility audit (axe-core): target 0 serious/critical issues.
3. Lighthouse on detail pages ≥ 85 mobile.
4. Cross-browser smoke (Safari 17, Firefox 126, Chrome stable).
5. Penetration test the sanitizer with a curated XSS corpus.
6. Final beta launch note in `BETA_LAUNCH.md`.

---

## 2. Acceptance Matrix (consolidated)

| # | Area | Criterion |
|---|---|---|
| A1 | Primitives | Cross-user SQL with foreign `app.user_id` cannot read/mutate another user's comments/ratings/revisions. |
| A2 | Primitives | `renderAndSanitize` drops `<script>`, keeps GFM tables, allows whitelisted iframes only. |
| A3 | Primitives | Comment rate limit returns 429 on 6th comment in 60s. |
| B1 | Char detail | Public character renders all tabs except prompt tab for non-advanced user. |
| B2 | Char detail | Owner sees prompt tab even when secret. |
| B3 | Char detail | Editing description produces revision row v2; log tab shows diff. |
| C1 | Story detail | "Mulai Sekarang" CTA opens VN chat within 2 s p95. |
| C2 | Story detail | Token Info numbers match server truth within ±1 token. |
| C3 | Story detail | Secret mode hides advanced callouts entirely for non-owner. |
| D1 | Story studio | Autosave flushes within 3 s of last keystroke. |
| D2 | Story studio | Output Reminder enforced at 100 tokens; save blocked otherwise. |
| D3 | Story studio | Publishing with 0 scenarios blocked with toast. |
| E1 | Char studio | Clone produces independent row, primary avatar copied. |
| E2 | Char studio | Lore sections reorder survives reload. |
| F1 | Rich content | XSS corpus (OWASP list) fully neutralized. |
| F2 | Rich content | Translation caches; second call free. |
| G1 | Defaults | New character created via wizard without touching visibility toggle ends up public. |
| G2 | Moderation | 3 distinct reports in 24h auto-hide the entity. |
| G3 | Discovery | Trending endpoint reflects new signals within 15 min. |
| G4 | SEO | Sitemap lists all public entities. |
| H1 | Hardening | Detail pages: Lighthouse mobile ≥ 85. |
| H2 | Hardening | p95 GET /api/stories/:id warm < 250 ms. |

---

## 3. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Sanitizer allowlist too strict, breaks legitimate content | authors frustrated | Per-profile exceptions, ship an explicit allowlist test file, monitor support inbox. |
| Sanitizer bypass via new HTML quirk | XSS | Server-only sanitization; browser preview via API; quarterly review with OWASP cheat sheet. |
| Default public surprises users with old private drafts | trust incident | **Never auto-flip existing rows.** Opt-in banner only. |
| Moderation auto-flag weaponized | griefing | Require 3 **distinct** reporters; exponential cooldown; admin override visible. |
| Materialized view refresh slows DB | p95 regressions | `REFRESH … CONCURRENTLY`, monitor refresh ms, fall back to non-concurrent off-peak. |
| Translation cost runaway | bill shock | Hard per-user budget, admin kill switch env flag `TRANSLATIONS_DISABLED=1`. |
| Heavy scene graphs + token recompute on save | slow saves | Incremental token recompute only for dirty scenes; BullMQ queue for story-wide VN readiness. |
| Comments spam | abuse | Rate limit + mention-only notifications + report pipeline. |
| Advanced mode leak of secret story prompt | author trust | Server-side projection in response; unit test with secret story + non-owner. |
| Migration 0042–0049 sequence conflicts with prod | deploy risk | Each migration idempotent (`IF NOT EXISTS`); deploy one phase at a time; test on staging DB clone. |

---

## 4. Operational Checklist per Phase

For each phase deploy:

1. `pnpm -r typecheck` ✓
2. `pnpm --filter @neigo/server test` ✓ (new tests added for the phase)
3. `pnpm --filter @neigo/web presence:replay` ✓ (should still pass even when unrelated)
4. Visual-regression check on staging (`/characters/<beta-char>`, `/stories/<beta-story>`, `/studio/stories/new`).
5. DB migration dry-run on staging clone.
6. Feature flag gate:
   - `FEATURE_DETAIL_PAGES` (Phase B–C).
   - `FEATURE_STUDIO` (Phase D–E).
   - `FEATURE_DEFAULT_PUBLIC` (Phase G).
   - Flags read from env OR `user.metadata.featureFlags`.
7. Commit with clear `PLANIMPv{N}: <phase>` prefix.
8. `git push` + deploy via `ops/scripts/deploy-prod.sh`.
9. `pnpm --filter @neigo/server db:migrate` to apply new migrations.
10. Post-deploy smoke tests: curl detail endpoint, studio endpoint, comments endpoint.

---

## 5. Dependencies & New Packages

| Package | Where | Why |
|---|---|---|
| `micromark` + `micromark-extension-gfm` | shared | MD → HTML parse. |
| `sanitize-html` | server | Strict HTML allowlist. |
| `turndown` | web | HTML paste → clean MD. |
| `@uiw/react-md-editor` OR `@tiptap/starter-kit` | web | MD editor. Prefer `@uiw/react-md-editor` (smaller bundle). |
| `shiki` | server | Syntax highlighting for code blocks in rich content. |
| `diff` | web | Line diff rendering for `<RevisionLog />`. |
| `k6` (CLI) | dev | Load tests in Phase H. |
| `axe-core` | dev | A11y audit. |

Budget impact: ~120 KB gzipped added to web bundle (mostly the editor). Mitigate with `next/dynamic` lazy loads on studio routes only.

---

## 6. Done Definition for the Series

1. Every field shown in screenshots 1–6 is wired DB ↔ API ↔ FE.
2. Logged-out visitors can browse any public character/story with full chrome.
3. Authors can create a story end-to-end through `/studio/stories/new` in a single session.
4. Comments, ratings, reactions, update log, translations all functional.
5. Default public for new content; opt-in for old.
6. Moderation, reports, auto-flag live.
7. Monitoring shows sub-400 ms p95 on detail page GETs.
8. No `TODO` / `FIXME` introduced by this series remains in shipped code.

When all 8 boxes tick, the detail-page + studio delivery is production-ready for general users.
