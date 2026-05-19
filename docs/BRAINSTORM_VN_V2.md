# Brainstorming: Iterasi Visual Novel V2 (Opsi, Emosi, Kehadiran)

Dokumen ini memetakan rencana integrasi fitur-fitur lanjutan yang sempat tertunda pada rilis *kinetic* (V1) Project Neigo Visual Novel. Fitur ini dirancang agar tidak merusak imersi membaca dan mengetik bebas.

---

## 1. Opsi Pilihan Ganda (CYOA / Choose Your Own Adventure)

Pada mode obrolan klasik, CYOA muncul sebagai *chips* kecil. Untuk pengalaman Visual Novel yang mendalam (immersive), pilihan cerita harus menjadi momen pengambilalihan fokus layar (seperti *Detroit: Become Human* atau *Fate/Stay Night*).

### Rencana Implementasi (Full-Screen Overlay):
- **Trigger**: Mendengarkan aliran `postSse` untuk `evt.type === 'cyoa_choices'`.
- **State**: Simpan pilihan ke dalam state lokal `const [choices, setChoices] = useState([])`.
- **Visual**: Jika `choices.length > 0`, komponen `<InputBar />` (area mengetik) akan disembunyikan. Layar akan sedikit diredupkan (*backdrop-blur*), dan pilihan muncul di tengah layar sebagai deretan tombol vertikal yang elegan.
- **Hybrid Mode**: Untuk mempertahankan kebebasan pemain, sertakan tombol kecil "Tulis Sendiri..." di bawah daftar pilihan. Jika ditekan, daftar pilihan menghilang dan kotak ketik kembali muncul.
- **Aksi**: Saat pengguna mengklik pilihan, panggil fungsi pengiriman `send({ overrideText: choice.sendText })` lalu kosongkan state `choices`.

---

## 2. Deteksi Emosi Real-Time (Sinkronisasi Wajah / Sprite)

Saat ini, `<CharacterPanel />` merender emosi secara statis (atau diubah manual via `TweaksPanel`). Kita perlu menghubungkannya kembali dengan deteksi kata kunci atau tag khusus dari LLM agar wajah karakter (tersenyum, marah, tersipu) berubah otomatis sesuai dialog.

### Pipeline Data (Backend ke Frontend):
1. **Tag Eksplisit (Akurat)**: Prompt LLM diinstruksikan untuk menyisipkan tag `[EMOTION: blush]` di akhir gilirannya. *Backend* mem-parsing tag ini dan mengirimkannya sebagai event SSE khusus (`evt.type === 'emotion'`).
2. **Fallback Analisis Teks**: Jika LLM lupa memberikan tag, saat sinyal `[DONE]` diterima, fungsi klien `detectEmotion(finalText)` (dari `lib/content-detect.ts`) akan membaca teks cerita dan menebak emosi (misal kalimat mengandung kata "menangis" -> 'sad').
3. **Transisi Visual (Crossfade)**: State `activeEmotion` di `page.tsx` akan diperbarui secara reaktif. Nilai ini diteruskan ke `<CharacterPanel />` yang memegang data `spriteManifest`. Saat URL gambar wajah berubah, komponen harus melakukan *CSS opacity crossfade* (transisi pudar sekitar 300ms) agar perubahan ekspresi mulus dan tidak berkedip (*flicker*).

---

## 3. Sinyal Kehadiran (Presence / Typing Indicator)

Sistem `usePresenceOrchestrator` yang rumit sebelumnya dihapus untuk menyederhanakan arsitektur. Namun, umpan balik visual dan ping ke server tetap penting.

### Rencana Implementasi:
- **Indikator AI Berpikir (Visual Sederhana)**: Daripada teks "AI is typing...", gunakan komponen `<StreamIndicator />` yang menyatu dengan tema. Jika adegan melibatkan banyak karakter, tambahkan nama karakter (Misal: lencana kecil *"Rei sedang membalas..."* muncul di ujung layar saat `sending === true`).
- **Sinyal Pengguna Mengetik (Ping ke Server)**: Berguna untuk analitik atau mencegah sesi di-*hibernate* oleh BullMQ. 
  - *Cara Kerja*: Pasang *throttle event* di kotak `<textarea>` pada `<InputBar />`. Gunakan `lodash/throttle` (maksimal 1 ping setiap 3 detik) yang menembak endpoint ringan `/api/sessions/:id/typing` saat `onChange` terpicu. Ini tidak akan membebani klien secara visual, tetapi membuat infrastruktur tetap 'sadar' (*aware*) akan kehadiran pengguna.
