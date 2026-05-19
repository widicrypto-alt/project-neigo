> 🟡 **STATUS (apr 2026): D1–D5 SHIPPED, D6 PARTIAL.** D1 purge A+B ✅ · D1 Tahap C (hard-delete via `PURGE` token) intentionally pending · D2 home fusion ✅ · D3 creator profile ✅ · D4a/b VN schema + FE ✅ · D5 letters ✅ · D6 polish 🟡 (motion+palette shipped, Noto Serif JP not verified). §7 parked ideas still parked → [BACKLOG.md](BACKLOG.md) P3.

---

# REDESIGNv2 — Project Neigo × IsekaiZero Fusion

> Dokumen ini membekukan keputusan redesign setelah brainstorm besar April 2026.
> Implementasi batch D1 → D5 dijalankan berurutan dengan typecheck + test hijau
> per commit. Clean-room: `clean-room-study <agent@neigo.local>`, no push.

---

## 0. Empat keputusan kunci user (21 April 2026)

1. **Character purge Tahap C (hard delete data user)** — **tunggu konfirmasi terpisah**.
   D1 hanya menjalankan Tahap A (hide via `is_retired`) + Tahap B (cleanup seed file).
   Hard delete data user ke 27 karakter lama ditunda sampai user mengirim token `PURGE`.
2. **VN engine scope** — **MVP kinetic dulu** (linear + ending sederhana). Branching
   dan open-ended transition menyusul di iterasi berikutnya. Quality > breadth.
3. **Anti-mainstream prioritas pertama** — **Letters (§5.2)**. Paling retention-positive
   dan paling sederhana dari sisi engineering. Ship setelah D1–D2 stabil.
4. **Setiap cerita dedicated**: story berdiri sendiri, tidak terkait `chat_sessions`
   reguler. Tidak ada "transition to open-chat" otomatis dari VN — VN adalah lingkungan
   terpisah dengan progresnya sendiri (`story_runs`). Chat reguler dan VN tidak bercampur
   memory-nya kecuali user eksplisit "impor momen ini ke chat".
5. **VN cast dari karakter user + karakter publik** — di Studio, saat membuat story,
   creator bisa pilih karakter dari:
   - karakter miliknya sendiri
   - karakter publik lain yang bertanda `allow_in_stories=true`
   - karakter built-in beta (Rei/Lysandra/Kaia)

---

## 1. Home+Discover fusion — "Perpustakaan Malam"

Metafora: **perpustakaan buka 24 jam di tengah Tokyo**, bukan mall anime.

### 1.1 Layout `/` baru

```
TopBar · ☰ · 🔍 cari · 🌐 ID ▾ · 🔔 · 👤

HERO adaptif (guest / user with session / user tanpa session)

Chip sticky: Semua · Romance · Fantasy · Slice · Sci-Fi · Mystery ·
             🇮🇩 ID · 🇯🇵 JP · 🇺🇸 EN

📖 Lanjutkan cerita          [session card]...
⏰ Mereka akan menghubungi    [schedule card]...
🌙 Chapter One              [3 poster beta]
🔥 Pilihan malam ini         [curated rail]
✨ Cerita baru (Visual Novel)  [story card]...
💎 Dibuat komunitas          [community rail]
📚 Rak kamu                  [library shelf]

Footer feed: "semalam 4 karakter menulis diary, 2 cerita baru..."
```

### 1.2 Hero adaptif — 3 mode

| Mode | Konten | Sumber data |
|---|---|---|
| **Guest** | Chapter One teaser, CTA "Mulai baca" | static CHAPTERS |
| **User with session** | Karakter terakhir + kutipan dari `character_diary` / `session_schedule` | `getLatestActiveSession` + `recentDiaryEntries` |
| **User tanpa session** | Featured story minggu ini + CTA "Mulai cerita baru" | `stories.status='featured'` |

Satu hook: `useAdaptiveHero()` → `{mode, payload}`.

### 1.3 Density & polish

- 1 hero + 4–6 rails + 1 footer shelf = always feels alive.
- Rail minimum 3 item; kalau kurang → placeholder CTA card.
- Skeleton shimmer aurora (reuse `AuroraBackdrop` tokens).
- Footer feed 3 baris update tiap load — bikin perpustakaan terasa hidup.

---

## 2. Multi-bahasa chip — first-class

### 2.1 Schema (migrasi `0024_character_language_retire.sql`)

```sql
ALTER TABLE characters ADD COLUMN language varchar(8) NOT NULL DEFAULT 'id';
ALTER TABLE characters ADD COLUMN languages_spoken jsonb NOT NULL DEFAULT '["id"]'::jsonb;
ALTER TABLE characters ADD COLUMN is_retired boolean NOT NULL DEFAULT false;
ALTER TABLE characters ADD COLUMN allow_in_stories boolean NOT NULL DEFAULT true;
CREATE INDEX characters_language_idx ON characters(language);
CREATE INDEX characters_is_retired_idx ON characters(is_retired);
```

### 2.2 Nilai 3 karakter beta

| Karakter | `language` | `languages_spoken` |
|---|---|---|
| Rei Aizawa | `ja` | `["ja", "id"]` |
| Lysandra Virelle | `en` | `["en", "id"]` |
| Kaia Schneider | `id` | `["id", "en"]` |

### 2.3 UI

- Chip row di atas grid: `🌐 ID · JP · EN` multi-select, state di `?lang=id,ja`.
- Auto-default dari `navigator.language` hanya first visit (localStorage flag).
- Badge bendera kecil di `CharacterPosterCard`.

---

## 3. Character purge — rencana 3 tahap

**Peringatan irreversible**: delete character cascade ke chat_sessions, chat_messages,
character_diary, character_facts, memories, character_dynamic_states, session_events,
session_schedules, chat_folders.sessionId→null.

### 3.1 Tahap A — hide (reversible, **D1**)

- Set `is_retired=true` pada semua kecuali Rei/Lysandra/Kaia.
- Filter query built-in/public untuk `NOT is_retired`.
- Session lama tetap bisa dilanjutkan (owner-check, bukan catalog query).

### 3.2 Tahap B — cleanup seed (**D1**)

Hapus:
- `seed-characters.ts`
- `seed-chapter{1..5}.ts`
- `migrate-builtin-changli.ts`
- `migrate-builtin-vivian.ts`
- `seed-builtins.ts` (digabung ke file baru)

Ganti dengan `seed-beta-3.ts` yang hanya menyeed Rei/Lysandra/Kaia lengkap dengan
`backstoryTiers`, `language`, `languages_spoken`, `allow_in_stories=true`.

Update `packages/web/src/app/page.tsx` CHAPTERS → `[{n:1, characters:['rei-aizawa','lysandra-virelle','kaia-schneider']}]`.

Audit `data/characters/` — pertahankan Lysandra + Kaia + Rei template.

### 3.3 Tahap C — hard delete (**menunggu `PURGE`**)

Skrip `scripts/purge-retired-characters.ts`:
1. Konfirmasi interaktif (ketik `PURGE`).
2. `DELETE FROM characters WHERE is_retired=true` dengan cascade.
3. Log jumlah baris kena ke tiap tabel child.

---

## 4. Visual Novel feature — dedicated

Setiap story **berdiri sendiri**. Tidak ada chat_sessions/chat_messages terlibat.
Progress user di VN disimpan hanya di `story_runs`.

### 4.1 Domain model

```
stories
  id, title, synopsis, cover_image_url, language
  author_id  (users.id)
  status           'draft' | 'published' | 'featured'
  mode             'kinetic'   (MVP: hanya ini)
                   'branching' (future)
                   'open_ended' (future)
  required_tier    'FREE' | 'PAID' | 'FOUNDER'
  cast jsonb       -- [{characterId, displayName, role}]
  opening_scene_id
  metadata jsonb   -- {tags[], contentWarnings[], estimatedMinutes}
  created_at, updated_at, published_at

story_scenes
  id, story_id, order_index
  title
  background_image_url
  bgm_url (optional, future)
  opening_narration text       -- paragraph sebelum dialog
  character_cues jsonb         -- [{characterId, position, expression}]
  dialogue_lines jsonb         -- [{speakerCharacterId, text}]
  scene_type                   'narration' | 'dialogue' | 'choice' | 'ending'
  next_scene_id                (kinetic: linear pointer)
  choices jsonb                (future branching)
  ending_slug varchar(40)      (when scene_type='ending')

story_runs  (per user per story, dedicated)
  id, user_id, story_id
  current_scene_id
  started_at, last_read_at, completed_at
  ending_reached varchar(40)
  reading_seconds int

story_character_refs  (link tabel untuk "cast" yang butuh kekuatan relasional)
  story_id, character_id
  source 'owned' | 'public' | 'builtin'
  PRIMARY KEY (story_id, character_id)
```

### 4.2 Cast picker (direktif #5)

Saat creator membuat story di `/studio/stories/[id]`:
- Tab "Cast" → search bar + filter.
- Sumber:
  - **Milik saya** (`characters.owner_id = currentUser`)
  - **Karakter publik** (`visibility='public' AND allow_in_stories=true AND is_retired=false`)
  - **Beta built-in** (Rei/Lysandra/Kaia, selalu ada)
- Tambah ke cast → entry di `story_character_refs` + cache display name ke `stories.cast`.
- Creator lain tidak bisa ubah karakter yang bukan miliknya, hanya **mereferensikan**.
- Atribusi otomatis di story detail page: "Cast: Rei (@neigo/beta), Aria (@user123)".
- Karakter yang di-opt-out (`allow_in_stories=false`) tidak muncul di picker publik.

### 4.3 Engine — VN runner (MVP kinetic)

```
packages/server/src/services/story-runner.ts
  getStory(storyId, userId)              -- metadata + cast
  getScene(storyId, sceneId, userId)     -- validate access, log view
  advanceRun(runId, fromSceneId)         -- move currentSceneId, check ending
  startRun(storyId, userId)              -- create story_runs, return opening_scene
  getRun(runId, userId)                  -- resume
```

Tier gate:
- `required_tier='FREE'` — semua user.
- `required_tier='PAID'` — user.tier ∈ {PAID, FOUNDER}.
- `required_tier='FOUNDER'` — user.isFoundingReader=true atau user.tier='FOUNDER'.

### 4.4 Routes (`packages/server/src/routes/stories.ts`)

```
GET    /api/stories                    list published, filter lang/tag
GET    /api/stories/:id                detail + cast
POST   /api/stories                    create draft (PAID+)
PATCH  /api/stories/:id                update (owner)
POST   /api/stories/:id/publish        publish (owner, moderation)
DELETE /api/stories/:id                soft delete (owner)

GET    /api/stories/:id/scenes/:sceneId     scene payload
POST   /api/stories/:id/runs                start run
GET    /api/runs/:runId                     resume
POST   /api/runs/:runId/advance             {fromSceneId} → next scene or ending

GET    /api/stories/:id/cast/candidates     cast picker (own + public + builtin)
POST   /api/stories/:id/cast                add character ref
DELETE /api/stories/:id/cast/:characterId
```

### 4.5 FE pages

```
/stories                    discover stories (selain rail di /)
/stories/[id]               detail page (cover hero, synopsis, cast, Mulai CTA)
/stories/[id]/play          scene runner full-bleed (VNScene component)
/studio/stories             list my stories
/studio/stories/[id]/edit   outline + scene editor + cast picker + preview
```

### 4.6 VN presentasi

- Full-bleed background + `backdrop-blur-sm` + gradient bawah.
- Sprite: `next/image priority`, fade + slide 12px enter.
- Dialog box: `bg-slate-950/80 backdrop-blur-md border-t border-violet-500/30`.
- Typewriter 30ms/char, skip-able tap.
- Auto-advance toggle (off default).
- Tap = next, long-press = history panel.

### 4.7 Monetization (tanpa mana)

- FREE story: 1 ending, kinetic linear.
- PAID story: multi-ending, branching (future).
- FOUNDER story: full CYOA + open-ended transition + backstoryTier integration (future).
- Creator yang stories-nya sering selesai → badge `@verified_storyteller`.

### 4.8 Seed story pertama (showcase)

Pada batch D4b: seed story `"Three Are Waiting"` — 3 scene × 3 karakter beta, kinetic linear,
tanpa branching, 1 ending. Sebagai showcase + fixture untuk test runner.

---

## 5. Creator profile publik (ROLEPLAY beta)

### 5.1 Migrasi `0025_creator_profiles.sql`

```sql
ALTER TABLE users ADD COLUMN handle varchar(40) UNIQUE;
ALTER TABLE users ADD COLUMN bio varchar(280);
ALTER TABLE users ADD COLUMN profile_is_public boolean NOT NULL DEFAULT false;
CREATE INDEX users_handle_idx ON users(handle);
-- backfill handle dari email local-part untuk user existing
UPDATE users SET handle = lower(regexp_replace(split_part(email, '@', 1), '[^a-z0-9_]', '_', 'g'))
WHERE handle IS NULL;
```

### 5.2 Routes

```
GET /api/creators/:handle               public profile (characters + stories)
PATCH /api/me/profile                   update handle, bio, profileIsPublic
GET /api/creators/:handle/characters    public characters owned
GET /api/creators/:handle/stories       published stories
```

### 5.3 Pages

```
/creators/@handle           profile page
/settings/profile           edit handle, bio, visibility
```

### 5.4 CreatorBadge component

Kecil, muncul di `CharacterPosterCard` + story card. Klik → `/creators/@handle`.
Format: `@handle` dengan dot status bila creator "sedang menulis" (optional future).

### 5.5 Moderasi minimum

- Forbidden tags enforced server-side.
- Report button di profile + character + story.
- Shadow hide via `is_retired` / `stories.status='draft'` sebagai mod action.
- `moderation_events` audit log (future).

---

## 6. Anti-mainstream prioritas — Letters (§5.2 pertama)

MVP Letters:

### 6.1 Flow

User tulis surat (≤1000 char) ke karakter → queued → LLM generate balasan dengan
delay 6–24 jam (random dalam window, respect quiet hours) → push notification →
user buka di `/letters/[id]`.

### 6.2 Schema

```
letters
  id, user_id, character_id
  user_text text
  reply_text text             -- null until generated
  sent_at                     -- saat user kirim
  deliver_at                  -- scheduled reply arrival
  delivered_at                -- actual arrival
  status 'queued' | 'delivered' | 'read'
  created_at
```

### 6.3 Worker

BullMQ queue `letter-reply`, jobId `letter:${id}`, delay computed dari quiet hours.
Reuse orchestrator minus validation chain (surat = 1-shot, bukan streaming).

### 6.4 FE

```
/letters              inbox (queued + delivered + read)
/letters/[id]         read + reply
/chat → toolbar       "Kirim surat" CTA
```

### 6.5 Mengapa ini first

- Retention-positive: anticipation + push hook.
- Sederhana: 1 tabel, 1 queue, 1 worker, 2 FE page.
- Natural untuk Rei persona (cold/stoic tapi menulis surat malam).

---

## 7. Ide lain (parkir untuk iterasi berikutnya)

Urutan prioritas setelah Letters:

1. **Kismet** — "temui seseorang malam ini" random button di home.
2. **Memento** — shareable memory cards PNG export.
3. **Night hours theme** — 22:00–06:00 lokal user, UI gelap + animasi lambat.
4. **Recap animation** — weekly 10s slideshow dari diary + highlight.
5. **Diary subscription** — subscribe ke character_diary publik, push per entry.
6. **Midnight drop** — featured story release Kamis 23:00 user-tz.
7. **Ghostwriter mode** — creator tulis manual turn dengan badge 🖋️.
8. **Remix story** — fork + ubah ending + attribution ke original.
9. **Language-swap in-story** — toggle bahasa scene on-the-fly.

---

## 8. UI/UX polish — anti-kosong

### 8.1 Density formula

1 hero + 4–6 rails + 1 footer shelf. Rail minimum 3 card atau CTA placeholder.

### 8.2 Skeleton berkarakter

Shimmer gradient aurora, hero quote placeholder dari `character_diary` (pre-generated di build).

### 8.3 Empty state mengundang

"Belum ada. Mau kenalan dengan siapa dulu?" + 3 poster card beta.

### 8.4 Micro-interactions

- Hover card: ring neon violet fade-in 120ms.
- Tap card: `navigator.vibrate(10)` + scale 0.97 80ms.
- Schedule countdown: live ticker update per menit.
- Typewriter hero narration first load only.
- Rail overflow chevron berdenyut lembut.
- Prefers-reduced-motion guard wajib.

### 8.5 Progressive reveal nav

Sidebar: hidden default mobile, slim 56px desktop < 1280, full 240px ≥ 1280.

### 8.6 Breadcrumb kontekstual

Di chat page: `🏠 / 📚 Romance / Lysandra / Scene 7`.

### 8.7 Footer feed

3 baris live update: "semalam 4 karakter menulis diary, 2 cerita baru diterbitkan,
[nama] sedang menunggu balasan kamu".

### 8.8 Typography & tokens

- Display: **Fraunces** (italic cuts untuk quote).
- Body: **Inter** (keep).
- JP accent: **Noto Serif JP**.
- Load via `next/font` dengan `display=swap`.

Dark palette:
```
canvas     #0B0B14
surface    #14141E
surface-2  #1C1C2A
accent     #8B5CF6
accent-hot #A78BFA
accent-cool #60A5FA
text-1     #F5F5FA
text-2     #C4C4D4
text-3     #6B6B80
```

### 8.9 Motion stack

- **Framer Motion** (bukan GSAP).
- Stagger 40ms card enter.
- Spring sheet open (type: spring, stiffness 260, damping 26).
- Cross-fade route 200ms.
- `prefers-reduced-motion` guard di seluruh motion component.

---

## 9. Rencana implementasi — 5 batch

Setiap batch atomic, typecheck + bun test hijau sebelum commit. Clean-room authorship.

| Batch | Scope | Risiko | Status |
|---|---|---|---|
| **D1** | Character purge Tahap A + B, language + is_retired + allow_in_stories columns, seed-beta-3 | Sedang | ⏳ |
| **D2** | Fusion home `/`, PosterCard, DiscoverRail, GenreChip, LanguageChip, useAdaptiveHero | Rendah | ⏳ |
| **D3** | Creator profile publik — migrasi 0025, routes `/api/creators/:handle`, page `/creators/@handle`, CreatorBadge | Sedang | ⏳ |
| **D4a** | VN schema + engine — migrasi 0026_stories, `stories.ts` routes, `story-runner.ts`, cast picker | Tinggi | ⏳ |
| **D4b** | VN FE — `/stories` `/stories/[id]` `/stories/[id]/play` `/studio/stories`, VNScene, seed "Three Are Waiting" | Tinggi | ⏳ |
| **D5** | Letters — migrasi 0027, queue + worker, `/letters` FE | Sedang | ⏳ |
| **D6** | Polish — Framer Motion, aurora skeleton, footer feed, Fraunces/Noto Serif JP, dark palette refinement | Rendah | ⏳ |

Urutan eksekusi: **D1 → D2 → D3 → D4a → D4b → D5 → D6**.

Tahap C (hard delete user data) menunggu token `PURGE` dari user — tidak dijalankan
otomatis dalam batch manapun.

---

## 10. Catatan moderasi

- Creator profile publik = surface area untuk konten bermasalah.
- Forbidden tags: `minor`, `incest-minor`, `rape-fantasy-consensual-framing` → auto-reject.
- Content warning opsional tapi checklist default tersedia.
- Report button di character + story + creator profile.
- Shadow hide via `is_retired` / `stories.status='draft'`.
- Audit log `moderation_events` (future, bukan MVP).
- Creator tier: FREE chat-only, PAID publish character, FOUNDER publish story + verified badge.
