# The Project Neigo Nav: Implementation Plan

## Background & Motivation
Panel navigasi Project Neigo saat ini menggunakan pendekatan tradisional (*Sidebar* statis di Desktop dan *Bottom Tab Bar* di Mobile dengan *drawer* geser dari kiri untuk riwayat percakapan). Meskipun navigasi lama sudah terintegrasi secara fungsional, antarmuka ini kurang mendukung pengalaman imersif bagi aplikasi bertema Roleplay/Visual Novel. Oleh karena itu, kita merombak UI menjadi "The Project Neigo Nav"—yang mengandalkan *Floating Dock*, *Bottom Sheets* berbasis geser (swipeable), animasi View Transitions, serta notifikasi riwayat percakapan yang instan (real-time) melalui pemisahan endpoint *quick-nav* dan SSE.

## Scope & Impact
1.  **Database:** Menambahkan skema agar pengguna dapat menyematkan (pin) sesi chat (`is_pinned`) dan menyimpan preferensi navigasi (`nav_layout`, `haptic_enabled`).
2.  **Backend (API & Real-time):** Pembuatan endpoint ringan untuk navigasi (`/api/sessions/quick-nav`) dan implementasi sistem Server-Sent Events (SSE) untuk mendorong notifikasi angka *unread letters* dari server ke *client*.
3.  **Frontend (UI/UX):** Perombakan total dari komponen `Sidebar.tsx` lama menjadi versi modular (`FloatingDock.tsx`, `MobileBottomSheet.tsx`, `QuickSwitcher.tsx`).
4.  **UX Immersive:** Mode "Zen" saat membuka layar chat (navigasi menghilang/mengecil otomatis), navigasi *thumb-friendly*, dan *Haptic feedback*.

## Proposed Solution
Kita akan merombak arsitektur dengan pendekatan secara **bertahap (Phased Rollout)**. Dengan cara ini, UI *Sidebar* yang lama tetap bisa digunakan oleh para pengguna secara stabil (tersedia opsi Fallback), sementara kita menyempurnakan skema DB dan membangun *Floating Dock* yang diaktivasi lewat *Feature Flag*. Notifikasi akan didukung oleh teknologi **Server-Sent Events (SSE)** karena sangat optimal dan efisien untuk jalur *server-to-client* (one-way data flow) pada kasus *badge* notifikasi.

## Alternatives Considered
-   **Big Bang Overhaul:** Langsung menimpa `Sidebar.tsx` dan semua struktur datanya di satu waktu. *Ditolak* karena berpotensi merusak stabilitas jika *bug* ditemukan di mode produksi.
-   **WebSocket untuk Real-time:** Memungkinkan komunikasi dua arah (dua kali lipat lebih kuat). *Ditolak* karena berlebihan (*over-engineering*) jika saat ini hanya dimanfaatkan untuk *badge notification* di *navigation dock*.

## Phased Implementation Plan

### Phase 1: Data Model & Light APIs (Backend Foundation)
1.  **Skema Drizzle ORM (`src/db/schema.ts`):**
    - Tambahkan kolom `isPinned: boolean('is_pinned').notNull().default(false)` ke tabel `chatSessions`.
    - Tambahkan kolom preferensi `uiPreferences: jsonb('ui_preferences').notNull().default(sql`'{}'::jsonb`)` ke tabel `users`.
2.  **Endpoint Ringan (`src/routes/sessions.ts`):**
    - Buat `GET /api/sessions/quick-nav` yang me-return *limit* 10 sesi terakhir, digabung dengan sesi berstatus `isPinned = true`.
3.  **Infrastruktur SSE (`src/routes/letters.ts`):**
    - Bangun endpoint baru `GET /api/letters/stream` yang me-*maintain* koneksi *Server-Sent Events* ke *client*, sehingga *badge* notifikasi dapat dikirim otomatis secara asinkron tanpa *polling* dari *React Query*.

### Phase 2: Frontend UI - Component Building (Feature Flagged)
1.  **Penyusunan Komponen Baru (berjalan paralel tanpa merusak `Sidebar.tsx` lama):**
    - Buat `packages/web/src/components/nav/FloatingDock.tsx` untuk layar Desktop (mode Zen otomatis saat URL mendeteksi `/chat`).
    - Buat `packages/web/src/components/nav/MobileBottomSheet.tsx` untuk menggantikan Drawer statis di Mobile. Pastikan interaksi ini mendukung fungsi *swipe-up* (bisa menggunakan *Framer Motion* atau pustaka sejenis).
2.  **Integrasi Quick Switcher:**
    - Buat `CommandPalette.tsx` yang aktif saat pengguna menekan `Cmd+K` atau menekan tombol cari di *dock*.

### Phase 3: Wiring, Transitions & SSE (Integration)
1.  **Integrasi State Management & Caching:**
    - Hubungkan `FloatingDock` dan `MobileBottomSheet` dengan React Query (mengonsumsi `quick-nav`) dan hubungkan konektor SSE ke komponen *badge* notifikasi surat (Letters).
2.  **Polishing:**
    - Integrasikan *Haptic Feedback* via Web API `navigator.vibrate()`.
    - Tambahkan konfigurasi *View Transitions API* (jika *browser* mendukung) agar perpindahan halaman utama dengan navigasi terasa seperti aplikasi *native*.
3.  **Peluncuran via AppShell:**
    - Integrasikan *dock* baru ke dalam tata letak (layout) `AppShell.tsx` melalui pengecekan kondisi *Feature Flag* di profil `uiPreferences` *user*.

## Verification & Testing
1.  **Database Migration:** Eksekusi `drizzle-kit generate` dan periksa apakah migrasi `is_pinned` berjalan mulus tanpa mengorbankan data lama.
2.  **Performance:** Pastikan endpoint `/quick-nav` membalas respons dalam < 50ms, bandingkan dengan pemuatan `/api/sessions` lama.
3.  **SSE Stability:** Verifikasi bahwa saat koneksi SSE terputus, komponen navigasi secara anggun melakukan mode *polling* biasa sebagai cadangan (*fallback*).
4.  **UX Testing (Mobile):** Uji *swipe gesture* pada *Bottom Sheet* di perangkat fisik nyata untuk menjamin kehalusan 60fps tanpa jeda.

## Migration & Rollback Strategy
-   **Fallback UI:** UI lama `Sidebar.tsx` tetap terpasang utuh. Jika terjadi isu memori/bug performa pada *Floating Dock* atau antarmuka yang baru, kita cukup membalikkan bendera (*Feature Flag*) untuk mengembalikan tampilan ke *Sidebar* klasiknya.
-   **Database Rollback:** Kolom baru memiliki *default value* yang sangat aman (misal `false` untuk `is_pinned`), sehingga skema basis data lama tidak akan terpengaruh atau pecah walau kita harus mundur di fase aplikasi.
