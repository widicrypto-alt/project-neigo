# Brainstorming: Integrasi Backend ke Chat Page VN Mode Baru

Dokumen ini berisi pemetaan mendalam (deep dive) tentang bagaimana kita akan menyambungkan komponen antarmuka Visual Novel (VN) yang baru dibuat (`CharacterPanel`, `ChatPanel`, `InputBar`, `RightPanel`) dengan arsitektur *backend* Project Neigo (SSE streaming, React Query, State Management, dan Database).

---

## 1. Arsitektur Data & Pengambilan Status (State Fetching)

Pada desain lama, kita sangat bergantung pada `@tanstack/react-query` untuk menyinkronkan status dari *database* via REST API. Kita harus mengembalikan *hooks* ini ke halaman chat utama.

**Queries yang harus dipulihkan:**
- **`['session', sessionId]`**: Membaca metadata sesi (apakah ini *story mode*, siapa ID karakter utama).
- **`['session-state', sessionId]`**: Membaca data dinamis yang terus diperbarui oleh *backend* setelah setiap *turn* (seperti `trustScore`, `relationshipStage`, `pinnedMoments`, `mood`, `characterName`).
- **`['character', characterId]`**: Membaca profil statis karakter (termasuk *avatarUrl* dan *spriteSheetUrl* default).
- **`['sprite-manifest', characterId]`**: Membaca pemetaan URL ekspresi karakter (misal: `blush` -> URL CDN).
- **`['cast-tracker', sessionId]`** (Baru): Melacak *progress* seberapa banyak *cast* yang sudah ditemui di cerita.

**Integrasi UI:**
- Jika `session` adalah sesi cerita dan `mcType` belum diatur, komponen `<McProfileGate />` (yang sempat kita buat sebelumnya) harus kembali dirender di atas lapisan UI untuk memblokir chat hingga user memilih MC.

---

## 2. Pemetaan Komponen UI Baru ke Data Backend

Kita perlu menerjemahkan (mapping) properti statis pada prototipe menjadi variabel state yang reaktif.

### A. `<CharacterPanel />`
- **`emotion`**: Alih-alih statis, ini harus diambil dari hasil klasifikasi teks terakhir yang dikirim karakter. Kita akan menggunakan fungsi `detectEmotion(lastMessage.content)` dan mencocokkannya dengan `spriteManifest`.
- **`mood`**: Diambil langsung dari `sessionState.data.mood`. Jika *backend* mengatakan "moonlight", panel otomatis akan merender efek gelap/biru.
- **`parallax`**: Bisa dikendalikan dari *user preferences* di lokal atau `TweaksPanel`.

### B. `<ChatPanel />`
- **Data `story`**: Saat ini menggunakan *array* statis. Kita harus menggantinya dengan state `bubbles` yang dihasilkan oleh rutin `chatStreamingBuffer()`.
- **Rendering Paragraf**: Fungsi `<Paragraph />` baru perlu diperbarui agar memiliki kapabilitas *parser* Markdown mirip seperti komponen `BubbleView` lama.
  - Perlu memilah teks menggunakan *regex* (contoh: teks di dalam tanda bintang `*...*` dirender sebagai **action**, teks di dalam garis bawah `_..._` dirender sebagai **thought**, teks dengan tanda kutip ganda `"..."` dirender sebagai **dialogue**).
- **Streaming Indicator**: Komponen `<StreamIndicator />` akan dirender hanya ketika state `sending === true`.
- **Header**: Nama karakter dan status *Arc* akan diambil dari `sessionState.data.characterName` dan query `arcs`.

### C. `<InputBar />`
- **Mode Selector (Dialog/Aksi/Pikiran)**: *Backend* saat ini hanya menerima string `content` polos. Agar model AI bisa membedakan *intent* user tanpa mengubah skema *backend*, kita terapkan strategi *Sigil Wrapping* di klien:
  - Jika user memilih mode **Aksi** dan mengetik "membuka pintu", sebelum dikirim via `postSse()`, string diubah menjadi `*membuka pintu*`.
  - Jika **Pikiran**: `_membuka pintu_`
  - Jika **Dialog**: `"membuka pintu"`
- **Lifecycle Buttons**: Tombol *Lanjut* (Continue) dan *Ulang* (Retry) harus disambungkan dengan pemanggilan `api.post('/api/chat/:sessionId/continue')` dan parameter `{ retry: true }` pada fungsi `send()`.
- **Presence**: Memulihkan hook `dispatchPresence` saat text area difokuskan atau saat user mengetik, agar *backend* (dan notifikasi SSE) mengetahui user sedang *typing*.

### D. `<RightPanel />` (Catatan Lakon)
- **Adegan & Waktu/Cuaca**: Diambil dari `sceneCard` pada metadata sesi, jika tersedia.
- **Statistik Hubungan**: 
  - `trustScore` dibagi 100 untuk meteran *Kepercayaan*.
  - `relationshipStage` (contoh: STRANGER, ACQUAINTANCE) ditampilkan sebagai teks.
- **Memori Tersemat**: Diambil dari list string di `sessionState.data.pinnedMoments`. Dirender menjadi `<Memory />` *snippets*.
- **Progress Busur Cerita (Arc)**: Menggabungkan `session.turnCount` untuk menghitung rasio *progress*.

---

## 3. Sistem Streaming SSE (Server-Sent Events)

Ini adalah jantung dari halaman chat. Komponen `page.tsx` akan menjadi "Penyiar" (Broadcaster) dari aliran *event* ini:
1. Saat user menekan **Kirim** di `<InputBar />`, fungsi `send()` dipicu.
2. Status berubah menjadi `setSending(true)`.
3. Memanggil `postSse('/api/chat/:sessionId/turn')`.
4. Aliran *event* (SseEvent) masuk, lalu ditangkap oleh `chatStreamingBuffer()`.
5. Buffer memecah struktur respons AI (teks, pembaruan status memori, pembaruan *mood*) secara bertahap dan melakukan *push* ke array `bubbles`.
6. Efek *scroll* otomatis di `ChatPanel` bekerja mengikuti penambahan karakter di `bubbles`.
7. Saat sinyal `[DONE]` diterima, `sending` diset `false`, dan UI akan memicu `queryClient.invalidateQueries` untuk me-*refresh* status *RightPanel* secara diam-diam.

---

## 4. Tantangan & Pertimbangan Desain (Untuk Dipecahkan Saat Implementasi)

- **Cast Roster (Multikarakter)**: 
  - Pada desain lama terdapat `<CastRoster />` yang mengizinkan user mengganti "Karakter Fokus" di layar jika ada 3+ karakter di ruangan yang sama. 
  - *Saran Resolusi*: Kita bisa menyelipkan daftar *Cast* ini ke dalam *header* `<ChatPanel />` atau menambahkannya sebagai deretan ikon kecil di atas `<InputBar />`.
- **Slash Commands**: 
  - Perintah teknis seperti `/mcp`, `/debug`, atau `/summarize` yang diketik di `<InputBar />` harus di-*intercept* sebelum dibungkus (*sigil wrap*) agar tidak dikirim ke AI sebagai teks cerita.
- **CYOA Choices (Pilihan Ganda)**:
  - Jika *backend* mengembalikan skenario di mana user harus memilih salah satu jalan cerita (seperti *Visual Novel* konvensional), kita butuh merender komponen `<CyoaChips />`. 
  - *Saran Resolusi*: Merender *chips* pilihan ini tepat di atas `<InputBar />`, melayang secara dinamis, sehingga user cukup mengkliknya untuk membalas secara instan.

---

**Langkah Selanjutnya yang Direkomendasikan:**
1. Menyisipkan fungsionalitas `postSse` dan `chatStreamingBuffer` ke dalam status `ChatSessionPage` yang baru.
2. Membuat fungsi `WRAP_BY_MODE` untuk Input Bar dan melengkapi fungsi *parsing* Markdown di `<Paragraph />`.
3. Memulihkan integrasi `RightPanel` sehingga nilainya akurat dan berasal dari *server*, bukan *hardcoded*.
4. Mengamankan alur pengiriman dan pembacaan respons.