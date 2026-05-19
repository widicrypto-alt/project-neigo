> 🟡 **STATUS (apr 2026): MIXED.** Track A D1/D3/D4/D5 ✅ · 🔴 Track A D2 fusion home — obsolete, superseded by PLANBv7. Track B X4.1/X4.2/X4.4/X4.5 all ✅. ❌ Track C H2 (World Info Inspector UI), H6 ([TRACK:] parser), H11 (light mode) → [BACKLOG.md](BACKLOG.md) B2.10–B2.12. ❌ X7 stretch (echo chamber, avatar crop, A/B persona preview) → [BACKLOG.md](BACKLOG.md) P3.

---

# PLAN_IMPLEMENTS v5 — Post-batch (REDESIGNv2 D1–D6 + LCM Phase 2–4 + MARINARA Phase H + stretch)

> Lanjutan dari [PLAN_IMPLEMENTSv4.md](PLAN_IMPLEMENTSv4.md). Baca pre-flight §0 di [PLAN_IMPLEMENTSv1.md](PLAN_IMPLEMENTSv1.md).
>
> **Scope:** eksekusi setelah 14-day advanced batch selesai. Dipecah ke 3 track paralel (A/B/C) + final polish.
>
> **Track A (FE product):** REDESIGNv2 D1–D6 verifikasi + gap fill.
>
> **Track B (backend):** LCM Phase 2–4 sisa (X4.1 context_blobs, X4.2 lineage, X4.4 retrieval primitives, X4.5 memory graph).
>
> **Track C (quality+stretch):** MARINARA Phase H sisa (H2 World Info Inspector UI, H3 backgrounds/weather, H4 galleries, H6 trackers, H8 illustrator prompt, H10 Discord mirror, H11 light mode) + X7 stretch (echo chamber, avatar crop, A/B persona preview, public lorebook library).

---

## Track A — REDESIGNv2 D1-D6 (wk 1-2 post-batch)

### A.1 Audit dulu yang sudah shipped

Migrasi sudah ada: `0024_character_language_retire.sql`, `0025_creator_profiles.sql`, `0026_vn_tables.sql`, `0027_letters.sql`. Services: `letter-reply.ts`, `story-runner.ts`, `routes/creators.ts`, `routes/stories.ts`, `routes/letters.ts`. FE: `/stories`, `/letters` eksis.

**Audit checklist (run di awal wk 1):**

```bash
# Schema-level shipped
grep -l "is_retired\|allow_in_stories\|language" packages/server/src/db/schema.ts
grep -l "creators\|profileIsPublic\|handle" packages/server/src/db/schema.ts
ls packages/server/src/routes/ | grep -E "creators|stories|letters"

# FE coverage
ls packages/web/src/app/ | grep -E "stories|letters|creators"
find packages/web/src/components -name "PosterCard*" -o -name "DiscoverRail*" -o -name "GenreChip*" -o -name "VNScene*" -o -name "CreatorBadge*"
```

Berdasarkan audit, kerjakan HANYA item yang masih gap.

### A.2 D1 — Character purge + language/retire flags

Backend migrasi 0024 sudah ada. Verify:

- Kolom `characters.language text`, `characters.is_retired bool`, `characters.allow_in_stories bool` aktif.
- Filter di `GET /api/characters` default exclude `is_retired = true` kecuali query param `includeRetired=1`.
- FE `/discover` + rail di `/` menggunakan filter ini.
- Seed beta-3 Rei/Lysandra/Kaia sudah tanda `is_retired=false`; karakter lama legacy `is_retired=true`.

**Gap kemungkinan:** FE language chip selector. Kalau belum ada:

**File:** `packages/web/src/components/discover/LanguageChip.tsx`

```tsx
export function LanguageChip({ active, lang, onClick }) {
  const labels = { id: 'Indonesia', ja: '日本語', en: 'English' };
  return <button data-active={active} onClick={() => onClick(lang)}>{labels[lang] ?? lang}</button>;
}
```

Wire di discover + home filter state.

### A.3 D2 — Fusion home `/`

Re-work homepage jadi **rail-driven discovery**. Menggantikan layout minimalis kemarin (bisa reuse komponen existing sebagai salah satu rail).

**File:** `packages/web/src/app/page.tsx`

Struktur:

```tsx
<HeroAdaptive />           {/* useAdaptiveHero: time-of-day-tinted video bg */}
<LanguageChipRow />         {/* D1 */}
<GenreChipRow />            {/* comedy, slice, romance, thriller */}
<DiscoverRail title="Kreator bintang" items={creators} renderer={CreatorBadge} />
<DiscoverRail title="Karakter pilihan" items={characters} renderer={PosterCard} />
<DiscoverRail title="Cerita pilihan minggu ini" items={stories} renderer={PosterCard} />
<IZStoryShelf />            {/* reuse from previous minimal redesign */}
<FooterFeed />              {/* "semalam N karakter menulis diary…" */}
```

**Komponen baru:**

- `PosterCard.tsx` — 2:3 aspect, tap → link.
- `DiscoverRail.tsx` — horizontal snap scroll, arrow buttons on desktop.
- `GenreChip.tsx` + `LanguageChip.tsx` — filter state lift ke page.
- `HeroAdaptive.tsx` + `useAdaptiveHero` — pilih video/still berdasarkan `time-of-day` + `prefers-reduced-motion`.

### A.4 D3 — Creator profile publik

Backend `creators.ts` + migrasi `0025_creator_profiles.sql` ada. Verify endpoint:

- `GET /api/creators/:handle` → public bio + list karakter public owned.
- `GET /api/me/creator` → owner editor payload.
- `PATCH /api/me/creator` → handle/bio/profileIsPublic.

Gap FE:

**File baru:** `packages/web/src/app/creators/[handle]/page.tsx`

```tsx
export default async function CreatorPage({ params }) {
  const creator = await fetchCreatorByHandle(params.handle);
  if (!creator) notFound();
  return (
    <>
      <CreatorHeader creator={creator} />
      <section>
        <h2>Karakter publik</h2>
        <div className="grid">
          {creator.characters.map(c => <PosterCard key={c.id} character={c} />)}
        </div>
      </section>
      {creator.stories?.length > 0 && (
        <section><h2>Cerita</h2>{/* ... */}</section>
      )}
    </>
  );
}
```

`CreatorBadge` compact component untuk rail discovery.

### A.5 D4a+D4b — VN stories

Schema + engine sudah ada (migrasi 0026 + `story-runner.ts`). FE dari REDESIGNv2 D4b:

- `/stories` list page — sudah ada (verify).
- `/stories/[id]` detail — verify.
- `/stories/[id]/play` — **kemungkinan gap**. VN player page:

**File:** `packages/web/src/app/stories/[id]/play/page.tsx`

```tsx
'use client';
export default function PlayPage({ params }) {
  const { data: run, mutate: advance } = useStoryRun(params.id);
  return (
    <VNStage scene={run.currentScene}>
      <VNScene content={run.currentScene.content} characters={run.cast} />
      <VNChoices choices={run.currentScene.choices} onPick={advance} />
    </VNStage>
  );
}
```

- `/studio/stories` creator editor — verify.
- Seed "Three Are Waiting" — 3 scene × 3 karakter beta, kinetic linear, 1 ending. Script di `packages/server/src/db/seed-story-three-are-waiting.ts`.

### A.6 D5 — Letters FE

Backend `letters.ts` + migrasi 0027 + worker `letter-reply.ts` sudah ada.

FE:

- `/letters` inbox — verify.
- `/letters/[id]` detail — verify.
- CTA dari chat toolbar: kalau user idle > X menit, tampilkan button "Kirim surat ke {karakter}" → prefilled form. Implementation di `packages/web/src/components/chat/IdleLetterCTA.tsx`.

### A.7 D6 — Polish

- Framer Motion rail transitions (slide-in saat scroll).
- Aurora skeleton (gradient shimmer) untuk loading state.
- Footer feed: `GET /api/public/feed/recent-diaries` (respect privacy: only characters with `metadata.shareDiaryPublicly === true`).
- Font: Fraunces (display) + Noto Serif JP (heading JP fallback). Install via `@fontsource/fraunces` + `@fontsource/noto-serif-jp`.
- Dark palette refinement — audit Tailwind config untuk `slate-950` vs `zinc-900` consistency.

### A.8 Track A exit

- [ ] `/` rail-driven, 3+ rail visible pada first viewport.
- [ ] Creator handle page live (`/creators/@rei`).
- [ ] VN play mode end-to-end dengan seed story.
- [ ] Letter inbox + CTA flow usable.
- [ ] Lighthouse score `/`: Perf ≥ 85 mobile, CLS < 0.1.

---

## Track B — LCM Phase 2-4 sisa (X4.1/4.2/4.4/4.5)

Paralel-able dengan Track A (beda area code).

### B.1 X4.1 `context_blobs` externalization

**Migrasi:** `0030_context_blobs.sql`

```sql
CREATE TABLE context_blobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  content_ref text NOT NULL,                     -- R2 key
  digest text NOT NULL,                          -- 300-token summary
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_context_blobs_session ON context_blobs (session_id, created_at DESC);

ALTER TABLE context_nodes
  ADD COLUMN IF NOT EXISTS blob_ref uuid REFERENCES context_blobs(id) ON DELETE SET NULL;
```

**Service:** `packages/server/src/services/context-blobs.ts`

```ts
export async function storeAsBlob(sessionId: string, content: string, mimeType: string): Promise<{ blobId: string; digest: string }> {
  if (Buffer.byteLength(content, 'utf8') <= 8192) throw new Error('too_small_for_blob');
  const digest = await summarize(content, 300); // reuse summarizer with 300-tok cap
  const key = `blob/${sessionId}/${crypto.randomUUID()}`;
  await r2Put(key, content, { contentType: mimeType });
  const [row] = await db.insert(contextBlobs).values({
    sessionId, mimeType, sizeBytes: Buffer.byteLength(content, 'utf8'), contentRef: key, digest,
  }).returning();
  return { blobId: row.id, digest };
}

export async function expandBlob(blobId: string): Promise<string> {
  const blob = await db.query.contextBlobs.findFirst({ where: eq(contextBlobs.id, blobId) });
  if (!blob) throw new Error('not_found');
  return r2Get(blob.contentRef);
}
```

Wire di `context-compaction.ts`: saat compact tool-output/scene-artifact > 8KB, `storeAsBlob` dan simpan digest ke node `content` + `blobRef`.

Ops endpoint `POST /api/ops/context/blob/:id/expand` — admin-only reveal full content.

### B.2 X4.2 `context_node_sources` lineage

**Migrasi:** `0031_context_node_sources.sql`

```sql
CREATE TYPE context_source_type AS ENUM ('message','node','blob');

CREATE TABLE context_node_sources (
  context_node_id uuid NOT NULL REFERENCES context_nodes(id) ON DELETE CASCADE,
  source_type context_source_type NOT NULL,
  source_id uuid NOT NULL,
  range_start integer,
  range_end integer,
  PRIMARY KEY (context_node_id, source_type, source_id)
);
CREATE INDEX idx_cns_source ON context_node_sources (source_type, source_id);
```

Wire di `context-compaction.ts` — saat create/update node, bulk insert sources.

Ops UI: `/ops/sessions/:id/context/node/:nodeId` tambah section "Lineage" list klik-expand ke raw message.

### B.3 X4.4 Context retrieval primitives

**File baru:** `packages/server/src/services/context-retrieval.ts`

```ts
export async function search(sessionId: string, query: string, k: number): Promise<RetrievedItem[]> {
  // hybrid RRF over {messages FTS, node summaries FTS, vector}
}

export async function describe(nodeId: string): Promise<NodeDescription> {
  // include child summaries + lineage (not full content)
}

export async function expand(nodeId: string): Promise<NodeFull> {
  // full content + resolved blob digests
}

export async function expandQuery(sessionId: string, query: string, k: number = 3): Promise<RetrievedItem[]> {
  const hits = await search(sessionId, query, k);
  return Promise.all(hits.map(async h => ({
    ...h,
    expanded: h.kind === 'node' ? await expand(h.id) : null,
  })));
}
```

Wire di orchestrator recall path: jika user message match pattern `/ingat|apa yang kamu bilang|waktu kita|dulu/i`, gunakan `expandQuery` instead of stock RRF.

### B.4 X4.5 Typed memory graph

**Migrasi:** `0033_memory_graph.sql`

```sql
CREATE TYPE memory_node_kind AS ENUM ('user','character','location','item','event','promise','mistake');

CREATE TABLE memory_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind memory_node_kind NOT NULL,
  canonical_name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mgn_user_kind ON memory_graph_nodes (user_id, kind);
CREATE UNIQUE INDEX idx_mgn_user_kind_name ON memory_graph_nodes (user_id, kind, lower(canonical_name));

CREATE TABLE memory_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id uuid NOT NULL REFERENCES memory_graph_nodes(id) ON DELETE CASCADE,
  to_node_id uuid NOT NULL REFERENCES memory_graph_nodes(id) ON DELETE CASCADE,
  predicate text NOT NULL,
  valid_from timestamptz,
  valid_to timestamptz,
  confidence real NOT NULL DEFAULT 1.0,
  source_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mge_from ON memory_graph_edges (from_node_id, predicate);
CREATE INDEX idx_mge_to ON memory_graph_edges (to_node_id, predicate);
```

**Scope decision (per PLANv3 §X12 #2):** SESSION-SCOPED first. Graph nodes tagged dengan session juga via metadata.sessionId; expand ke user-level post-validation.

**Services:**

- `packages/server/src/services/memory-graph/upsert.ts` — helper upsert node+edge dari extractor (relationship-stage, character-facts, promise detection).
- `packages/server/src/services/memory-graph/query.ts` — `findPromises(userId, characterId, status)`, `relationshipTimeline(characterId)`, `mistakesGraphForSession(sessionId)`.

Ops UI: `/ops/users/:id/memory-graph` — visualizer pakai `cytoscape.js` atau `react-flow`. Lazy-load.

### B.5 Track B exit

- [ ] 4 migrasi baru applied (0030, 0031, 0032 -- wait, 0032 was day14; use 0033 here).
  - **Revisi nomor:** X4.1=0030, X4.2=0031, [Day14 X4.3=0032], X4.5=0033.
- [ ] Context blob externalization reduces avg prompt size >15% untuk session dengan tool-output besar.
- [ ] Retrieval primitives unit-tested; `expandQuery` fallback path untuk recall question.
- [ ] Memory graph visualizer render untuk session test dengan ≥ 10 node.

---

## Track C — MARINARA Phase H sisa + stretch

### C.1 H2 World Info Inspector UI

Backend data sudah tersedia dari F1 (migrasi lorebooks + active-lore endpoint shipped wk 5).

**File baru:** `packages/web/src/app/sessions/[id]/world-info/page.tsx`

```tsx
export default function WorldInfoPage({ params }) {
  const { data } = useQuery({
    queryKey: ['world-info', params.id],
    queryFn: () => api.get(`/api/sessions/${params.id}/active-lore`),
  });
  return (
    <div>
      <h1>World info aktif</h1>
      <ul>
        {data?.entries.map(e => (
          <li key={e.id}>
            <strong>{e.title}</strong>
            <Badge>{e.tokens}t</Badge>
            <span>{e.triggerSource === 'keyword' ? `matched: ${e.matchedKeyword}` : `similarity: ${e.vectorScore.toFixed(2)}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### C.2 H3 Per-scene backgrounds + weather overlays

**File:** `packages/server/src/lib/scene-backgrounds.ts`

```ts
const BG_MAP: Record<string, string> = {
  'bedroom': 'https://cdn.neigo/bg/bedroom.webp',
  'cafe': 'https://cdn.neigo/bg/cafe.webp',
  'park': 'https://cdn.neigo/bg/park.webp',
  // whitelist 30-50 locations
};
export function resolveBg(location: string): string | null {
  return BG_MAP[location.toLowerCase()] ?? null;
}
```

**CSS-only weather layer:** `packages/web/src/components/chat/WeatherOverlay.tsx`

```tsx
export function WeatherOverlay({ weather }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  if (reduced || !weather) return null;
  if (weather === 'rain') return <div className="pointer-events-none fixed inset-0 rain-layer" />;
  if (weather === 'snow') return <div className="pointer-events-none fixed inset-0 snow-layer" />;
  // ...
}
```

CSS `rain-layer` pakai repeating linear-gradient + animation.

Wire: chat page subscribe `session.metadata.sceneState.location` / `.weather` → set overlay.

### C.3 H4 Character galleries (R2)

**Migrasi:** `0034_character_galleries.sql`

```sql
CREATE TABLE character_galleries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  r2_key text NOT NULL,
  caption text,
  tags text[] NOT NULL DEFAULT '{}',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_char_galleries ON character_galleries (character_id, order_index);
```

FE: tab "Galeri" di `/characters/[id]/edit`. Upload via `POST /api/characters/:id/gallery`. Lightbox: klik avatar di chat header → modal gallery slideshow.

### C.4 H6 Custom trackers

Reuse `[STATE:]` parser dengan tag baru `[TRACK: key=value]`. Extend `scene-state-parser.ts`:

```ts
const TRACK_RE = /\[TRACK:\s*([^\]]+)\]/g;
const STATE_RE = /\[STATE:\s*([^\]]+)\]/g;
// parse both; track stored separately in session.metadata.trackers
```

Creator define schema di character editor: `character.metadata.trackerSchema = [{ key: 'hp', type: 'number', min: 0, max: 100, display: 'bar' }, ...]`.

FE chat side panel render live bars/counters/toggles per schema.

### C.5 H8 Illustrator prompt generator (text-only)

**Service:** `packages/server/src/services/illustrator.ts`

```ts
export async function generateIllustratorPrompt(session: Session, scene: SceneState): Promise<string> {
  const prompt = `Describe this RP scene as a Midjourney/SD-style prompt, 80 tokens max, comma-separated:
  Characters: ${scene.characters.join(', ')}
  Location: ${scene.location}
  Mood: ${scene.mood}
  Outfit/props: ${scene.outfit}`;
  const res = await AiProxy.complete({ messages: [{ role: 'user', content: prompt }], model: 'cheap-small', maxTokens: 100 });
  return res.text;
}
```

Hook: setelah major scene change (delta sceneState > threshold), async generate & store ke `chatMessages.metadata.illustratorPrompt`. Expose copy-button di bubble. User paste manual ke tool mereka (MJ/SD/NAI).

### C.6 H10 Discord mirror

**Config:** `sessions.metadata.discordWebhook: string | null` (opt-in per session).

**Service:** `packages/server/src/services/discord-mirror.ts`

```ts
export async function mirrorTurn(session: Session, userMsg: string, assistantMsg: string) {
  if (!session.metadata?.discordWebhook) return;
  const payload = {
    embeds: [
      { author: { name: 'You' }, description: userMsg },
      { author: { name: session.characterName }, description: session.isNsfw ? '[NSFW content hidden]' : assistantMsg },
    ],
  };
  await fetch(session.metadata.discordWebhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
}
```

Fire-and-forget after orchestrator completes. Strip NSFW content kalau user tidak set `allowNsfwInDiscord=true`.

FE toggle di `/sessions/[id]/settings`.

### C.7 H11 Light mode

Tailwind `darkMode: 'class'` sudah ada. Toggle via `next-themes`. Update `tailwind.config.ts` pastikan semua semantic token punya light variant. Selesaikan paralel dengan D6 polish.

### C.8 Stretch (X7)

- **Echo Chamber reactions** — Supabase Realtime channel `session:${id}:reactions`. Post-monetization feature.
- **Prompt-cache visibility** — sudah shipped Day 3 backend; sekarang surface di Prompt Info overlay (Day 12 shipped). Cukup verify dashboard show.
- **Avatar zoom/crop editor** — client-side canvas di `/characters/[id]/edit`; simpan cropped ke R2 variant `avatar_square_512.jpg`.
- **§4 #3 Persona vs character A/B preview** — tambah split panel di preset editor (Day 11). Left: `resolveMacros(presetText, { ...ctx, user: persona })`; right: `resolveMacros(presetText, { ...ctx, char: character })`. Diagnostic aid.
- **§4 #4 Public lorebook library** — kolom `lorebooks.visibility enum('private','unlisted','public')` + moderation queue + `/library/lorebooks` page. Post D3 creator-profile.

---

## Sequencing post-batch (8-week plan)

| Wk | Track A (FE) | Track B (backend) | Track C (polish) |
|---|---|---|---|
| 1 | D1 audit + D2 home rail | X4.1 context_blobs | H2 world-info UI |
| 2 | D2 home polish + D3 creator page | X4.2 lineage | H3 bg+weather |
| 3 | D4a/b VN play mode + seed | X4.4 retrieval primitives | H4 galleries |
| 4 | D5 letters CTA + inbox polish | X4.5 memory graph | H6 trackers |
| 5 | D6 motion + fonts + palette | B.5 ops UI memory graph | H8 illustrator |
| 6 | §4 #3 persona A/B preview | post-bench regression | H10 discord mirror |
| 7 | §4 #4 lorebook library FE | monitoring + cost dashboard | H11 light mode + avatar crop |
| 8 | final polish + bugs | migration audit + RLS review | Echo chamber (monetization) |

---

## Open questions — final resolution (merger dari PLANv3 §X12)

| # | Question | Default resolution |
|---|---|---|
| 1 | Agent pipeline migrasi serentak / bertahap? | **Bertahap** (2 validator/PR, shadow 3 hari). Sudah dipilih di Day 9-10. |
| 2 | Memory graph scope user-level / session-scoped? | **Session-scoped first** (B.4). Expand ke user-level kalau false-correlation rate acceptable. |
| 3 | VN public cast dari user lain? | **Built-in only MVP** "Three Are Waiting". Community cast post-MVP with moderation. |
| 4 | Tavern PNG import bundle heavy / parser sendiri? | **Parser sendiri** ≈ 200 LOC. Implement di X3.4 (scheduling: post-batch kapanpun, low-priority). |
| 5 | Smart-trigger heuristic / LLM classifier? | **Heuristic** (Day 14). Upgrade kalau false-negative > 20% after 2 minggu. |

---

## Rollback plans (kritis — dibaca saat incident)

**XML wrap (X2.1):** flag off → immediate revert behaviour.

**Agent pipeline (X2.7):** `AGENT_PIPELINE_ENABLED=false` → fallback legacy validator chain. `AGENT_PIPELINE_SHADOW=false` → hentikan shadow writes ke `agent_runs`.

**Marker preset (X2.4):** `PROMPT_PRESET_MARKER_MODE=false` → fallback hardcoded builder order.

**Regex scripts (X2.5):** `REGEX_SCRIPTS_ENABLED=false` → skip runner load; existing messages unaffected.

**Smart-trigger (X4.6):** `SMART_RECALL_POLICY_ENABLED=false` → resume full recall/save every turn.

**Context blobs (X4.1):** **tidak ada flag** (migrasi one-way). Rollback plan: cron job `rehydrate-blobs` yang read blob → inline kembali ke `context_nodes.content` → null out `blob_ref`. Maintain until confident.

**Memory graph (X4.5):** additive table; disable upsert service via flag `MEMORY_GRAPH_UPSERT_ENABLED`.

---

## Deployment checklist (final)

Sebelum push ke prod tiap phase:

1. `pnpm -r typecheck` hijau.
2. `pnpm --filter @neigo/server test` hijau.
3. `pnpm --filter @neigo/server test:replay` 9/9 hijau.
4. `pnpm --filter @neigo/server bench:memory` tidak regress > 5% dari `baseline.json`.
5. Staging deploy `bash ops/scripts/deploy-prod.sh --env staging` (kalau skrip support env arg; kalau tidak, manual).
6. Manual smoke: login demo user, chat 3 turn, buka Prompt Info overlay, verify data waras.
7. Flag rollout FOUNDER tier 24 jam sebelum PAID, 48 jam sebelum ALL.
8. Prod deploy `bash ops/scripts/deploy-prod.sh`.
9. Monitor error rate + cost dashboard 2 jam post-deploy.
10. Tag commit: `git tag -a planv3-batch-complete -m "..."`.

---

## Success metrics (3 bulan post-batch)

- Cost per turn: ↓ 30-40% (smart-trigger + prompt caching).
- Turn latency P50: ≤ 1.5s (streaming isolation + agent batching + wake-up packet).
- User-reported "karakter lupa" complaints: ↓ 50% (memory graph + X4.4 expandQuery).
- BYOK setup success rate: ≥ 90% (test-ping UX).
- Creator profile activation rate: ≥ 20% of founding readers fill handle+bio within wk 1 post-launch.

---

## Appendix — file index created during batch

| File | Day | Purpose |
|---|---|---|
| `PLAN_IMPLEMENTSv1.md` | pre | Day 1-3 + pre-flight audit |
| `PLAN_IMPLEMENTSv2.md` | pre | Day 4-8 macros+button+lorebook+regex |
| `PLAN_IMPLEMENTSv3.md` | pre | Day 9-11 agent pipeline + marker preset |
| `PLAN_IMPLEMENTSv4.md` | pre | Day 12-14 overlay + backfill + smart-trigger |
| `PLAN_IMPLEMENTSv5.md` | pre | Post-batch tracks A/B/C + rollout |
| `packages/server/drizzle/0028_agent_configs.sql` | 9 | Agent pipeline |
| `packages/server/drizzle/0029_regex_scripts.sql` | 7 | Regex 4-mode |
| `packages/server/drizzle/0030_prompt_presets_sections.sql` | 11 | Marker preset ALTER |
| `packages/server/drizzle/0030_context_blobs.sql` | post | **Nomor clash — shift ke 0031 kalau 0030 sudah dipakai preset** |
| `packages/server/drizzle/0031_context_node_sources.sql` | post | Lineage |
| `packages/server/drizzle/0032_session_context_state.sql` | 14 | Frontier |
| `packages/server/drizzle/0033_memory_graph.sql` | post | Typed graph |
| `packages/server/drizzle/0034_character_galleries.sql` | post-C | Galleries |
| `packages/shared/src/utils/macros.ts` | 4 | CBS rewrite |
| `packages/shared/src/utils/regex-runner.ts` | 7 | re2-wasm |
| `packages/shared/src/utils/tokenizer.ts` | 12 | Real tokenizer factory |
| `packages/shared/src/utils/completion-check.ts` | 12 | Auto-continue helper |
| `packages/server/src/services/agents/*` | 9-10 | Pipeline core |
| `packages/server/src/services/lorebook/decorator-parser.ts` | 6 | @@ directives |
| `packages/server/src/services/memory-policy.ts` | 14 | Smart recall/save |
| `packages/server/src/services/context-maintenance.ts` | 14 | BullMQ worker |
| `packages/server/src/services/context-blobs.ts` | post-B | Externalization |
| `packages/server/src/services/context-retrieval.ts` | post-B | 4 primitives |
| `packages/server/src/services/memory-graph/*` | post-B | Upsert+query |
| `packages/server/src/services/illustrator.ts` | post-C | Image prompt |
| `packages/server/src/services/discord-mirror.ts` | post-C | Webhook mirror |
| `packages/web/src/components/chat/StreamingBubble.tsx` | 1 | Isolated bubble |
| `packages/web/src/components/chat/PromptInfoModal.tsx` | 12 | Overlay |
| `packages/web/src/components/chat/bubble-format.tsx` | 4-5 | CBS+regex renderer |
| `packages/web/src/components/discover/{PosterCard,DiscoverRail,GenreChip,LanguageChip}.tsx` | D2 | Home rail |
| `packages/web/src/app/settings/{regex,agents,schedules}/page.tsx` | 7-13 | Config pages |
| `packages/web/src/app/{handoff,handoff/claim,creators/[handle]}/page.tsx` | 13-A | Missing pages |

---

*File revision: PLAN_IMPLEMENTSv5 · 2026-04-22 · Post-batch (REDESIGNv2 + LCM + MARINARA Phase H + stretch + rollout + success metrics + file index). Closing series.*
