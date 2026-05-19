> ✅ **STATUS (apr 2026): W-A..W-J ALL SHIPPED EXCEPT W-E.** ✅ W-A RLS · W-B hard-block moderation · W-C EXIF+variants · W-D R2 adapter · W-F scenario auto-advance · W-G continue heat · W-H legacy Rail cleanup · W-I memory-graph token cap · W-J browser-image-compression. ❌ W-E `/stories/[id]/play/[sessionId]` real frame → [BACKLOG.md](BACKLOG.md) B1.1.

---

# PLANBv7 — Hardening & Story Cinema Revival

Target: close all P0/P1/P2 gaps surfaced by the PLANBv1–v6 audit (April 22, 2026).
Status legend: ✗ missing, ⚠ partial, ✓ done. Sections below map 1:1 to work orders.

---

## 1. Scope Summary (from audit)

### P0 — silent feature drop (product regression)
1. `/stories/[id]/play` adalah redirect stub. `StoryChatFrame`, `VNProjection`,
   `StoryActionBar`, `ScenarioPaginationChip`, `CostEstimateChip` tidak ada.
2. `scenario_complete=true` orchestrator auto-advance tidak ada — user harus
   hit endpoint manual, multi-scenario flow putus.

### P1 — silent insecurity
3. `character_images` (migration 0040) tidak `ENABLE ROW LEVEL SECURITY`.
4. `moderateImage` trust `reportedNsfw` flag uploader; hard-block
   (minors / real-face / gore) tidak ada.
5. EXIF GPS tidak di-strip server-side → lokasi rumah leaking.
6. `context-blobs` masih `InMemoryStorageProvider` di boot; R2 adapter tidak
   ter-register via `setDefaultStorageProvider`.

### P2 — dead code / polish
7. Variant pipeline (thumb/md/lg) nol; `sharp` terinstall, tidak dipakai.
8. `classifyHeat` dead code — badge tidak dirender di Continue card.
9. Legacy `DiscoverRail.tsx` masih memakai `w-[150px]`; v5 §7.6 due.
10. `appendMemoryGraph` slot cap pakai line count, bukan token budget.
11. Client-side `browser-image-compression` / `nsfwjs` belum dipasang.

---

## 2. Work Orders

### W-A · RLS gallery (P1-3)
Migration `0041_character_images_rls.sql`:

```sql
ALTER TABLE character_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_image_quota ENABLE ROW LEVEL SECURITY;

-- Owner full CRUD.
CREATE POLICY character_images_owner_all ON character_images
  FOR ALL USING (user_id = current_setting('app.user_id', true)::varchar)
  WITH CHECK (user_id = current_setting('app.user_id', true)::varchar);

-- Public read when approved + not NSFW (or user has NSFW toggle on).
CREATE POLICY character_images_public_read ON character_images
  FOR SELECT USING (moderation_status = 'approved' AND nsfw = false);

-- Quota is private per-user.
CREATE POLICY character_image_quota_owner_all ON character_image_quota
  FOR ALL USING (user_id = current_setting('app.user_id', true)::varchar)
  WITH CHECK (user_id = current_setting('app.user_id', true)::varchar);
```

The server already uses service-role PG connection (no `app.user_id` setting),
so RLS is defense-in-depth: if we ever wire Supabase JWT passthrough, policies
become effective immediately.

### W-B · Hard-block moderation (P1-4)
`services/image-moderation.ts` changes:
- Introduce `HARD_BLOCK_CATEGORIES = ['minors','real_face_verified','gore']`
  with configurable thresholds.
- When CF classifier returns any hard-block score ≥ 0.75 → return
  `status:'rejected', nsfw: true, reason: 'hard_block:<cat>'`. Ignore
  `reportedNsfw`.
- Default `MODE` still `beta` (best-effort), tapi hard-block list berlaku di
  semua mode. Gate via env `IMAGE_MODERATION_HARDBLOCK_ENABLED=true` default.

### W-C · EXIF strip + variants (P1-5, P2-7)
New `services/image-variants.ts`:

```ts
export interface VariantSet {
  thumb: { key: string; url: string; w: number; h: number; bytes: number };
  md:    { key: string; url: string; w: number; h: number; bytes: number };
  lg:    { key: string; url: string; w: number; h: number; bytes: number };
}
export async function generateVariants(args: {
  sourceKey: string; userId: string; characterId: string; imageId: string;
}): Promise<VariantSet | null>;
```

Pipeline:
1. Download original from R2 (`GetObject` via `r2-storage.ts` helper).
2. `sharp(buffer).rotate()` (auto-orient from EXIF) then re-encode with
   `.withMetadata({ exif: {}, icc: undefined })` — this strips all EXIF
   including GPS while keeping orientation applied.
3. Three sizes: `thumb` 128px, `md` 480px, `lg` 1024px (width, aspect-
   preserved, `withoutEnlargement: true`), all `.webp({ quality: 82 })`.
4. Put to R2 under `<orig-key>.v/{thumb|md|lg}.webp`.
5. Return `VariantSet`.

Called from `character-gallery.ts` commit handler, fire-and-forget if
`R2_ENABLED`; on success, PATCH `character_images.metadata` with
`{ variants: <VariantSet> }` + flip moderation to approved if pending.

### W-D · R2 blob provider at boot (P1-6)
`context-blobs.ts`: add `class R2StorageProvider implements BlobStorageProvider`
that uses the existing `presignPut`/S3 client pattern. `index.ts` boot:

```ts
import { setDefaultStorageProvider, R2StorageProvider } from './services/context-blobs.js';
import { isR2Configured } from './services/r2-storage.js';
if (isR2Configured()) setDefaultStorageProvider(new R2StorageProvider());
```

### W-E · Play cinema chrome (P0-1)
Revive `/stories/[id]/play/[sessionId]` as real route (not stub).
- Keep current stub file as `page.tsx` but move its logic to child route
  `[sessionId]/page.tsx` → actual play UI.
- New components under `components/stories/`:
  - `StoryChatFrame.tsx`: portrait-left layout (sprite 420×auto on LG,
    stacked on mobile), right pane = chat transcript + composer.
  - `StoryActionBar.tsx`: LANJUT · ULANGI · HAPUS buttons that map to
    the existing regenerate/undo endpoints.
  - `ScenarioPaginationChip.tsx`: reads `session.metadata.scenarioIndex`
    + total from the story detail query.
  - `CostEstimateChip.tsx`: reads `session.metadata.costLastTurnUsd` or
    cumulative `metadata.costCumulativeTokens`.
  - `VNProjectionToggle.tsx` + CSS-only projection mode (adds
    `data-vn="true"` root attr; CSS does the layout flip).

### W-F · Scenario auto-advance (P0-2)
Hook inside `runSinglePass` right after the scene-state merge at
orchestrator.ts:1354. Fire-and-forget:

```ts
if (merged.scenario_complete === 'true' && args.session.metadata?.storyRunId) {
  void advanceScenarioFromOrchestrator(args.session.id, args.session.metadata.storyRunId)
    .catch((e) => console.warn('[orchestrator] advance-scenario failed', e));
}
```

Where `advanceScenarioFromOrchestrator` is a thin wrapper in
`services/story-session-seeder.ts` that reuses `completeScenario` internals
and emits a `session_events` row `kind:'scenario.advanced'`.

Also clear `scene_state.scenario_complete` after dispatch so it doesn't
re-fire on subsequent turns.

### W-G · Continue heat badge (P2-8)
Audit already confirmed the badge IS rendered in `ContinueCard` (page.tsx
L608–620). Mark this as ✓ — no change needed. See audit notes.

### W-H · Delete legacy DiscoverRail (P2-9)
- Delete `components/discover/DiscoverRail.tsx`.
- Remove stale comment references in sibling discover components.
- `pnpm --filter @neigo/web typecheck`.

### W-I · Token-budget cap for memory graph slot (P2-10)
`builder.ts:appendMemoryGraph`: use `countTokensBatch` / `countTokens`
to accumulate until 200 tokens, then stop. Keep 8-line soft cap as
secondary bound.

### W-J · Client image compression (P2-11)
Web:
- Add `browser-image-compression` dep.
- In `GallerySection.tsx:onPick`, before calling `uploadOne`, compress
  every file > 2 MB down to 2048px long side, quality 0.85. Fallback:
  original file on library failure.
- (NSFW.js deferred — large payload, server-authoritative anyway.)

---

## 3. Acceptance Criteria

1. `pnpm -r typecheck` clean.
2. Server tests ≥ 111/111 pass.
3. Web presence replay 4/4 pass.
4. New tests:
   - `image-variants.test.ts` (EXIF strip unit test using a fixture with
     known GPS) + variant sizing assertions.
   - `story-scenario-advance.test.ts` (compaction / seeder unit tests for
     `completeScenario` returning correct advancedTo).
5. Migration 0041 applies cleanly on prod DB.
6. `/stories/[id]/play/[sessionId]` loads real play UI; all four chrome
   components render; LANJUT/ULANGI/HAPUS hit correct endpoints.
7. Scenario complete marker from model triggers auto-advance without
   client call (verified via integration smoke).
8. `context-blobs.storeAsBlob` in prod uploads to R2 when configured
   (verified via single staging roundtrip).
9. Deploy to production via `ops/scripts/deploy-prod.sh`, services
   active.
