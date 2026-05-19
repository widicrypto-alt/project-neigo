# Brainstorming: Pipeline Kreator Karakter & Manajemen Asset (Sprite)

Dokumen ini memetakan rancangan alur kerja pengguna (UX) dan infrastruktur teknis bagi pembuat konten (Creator) untuk mengunggah, memotong, dan mengelola *sprite* karakter Visual Novel mereka sendiri.

---

## 1. Audit Sistem Sprite & Standar Baru

*Project Neigo* sebelumnya memiliki dua generasi sistem *sprite*:
- **Gen 1 (Legacy FSM):** *Spritesheet* 4x3 (berkedip & mulut bergerak otomatis). Terlalu sulit dibuat oleh pengguna awam karena butuh penempatan piksel matriks absolut.
- **Gen 2 (VN Manifest):** Sistem modern berbasis *mapping* emosi ke URL gambar tunggal (misal: `blush` -> `cdn/img.webp`). Menggunakan *CSS Crossfade* saat transisi.

**Keputusan:** Semua fitur Creator untuk karakter baru akan menggunakan **Gen 2 (VN Manifest)** karena kemudahan pembuatan (1 ekspresi = 1 gambar transparan).

---

## 2. Alur Pengalaman Pengguna (Creator UX)

Agar pengguna awam dapat membuat karakter Visual Novel berkualitas tanpa pusing:

### A. Pengunggahan & Pemotongan (Cropping) di Frontend
- **Masalah:** Pengguna sering mengunggah gambar dengan proporsi acak (lanskap, terlalu dekat, tidak simetris).
- **Solusi UX:** Integrasikan komponen *UI Cropper* (seperti `react-easy-crop`) di halaman Studio.
- **Proses:** Pengguna mengunggah gambar -> Layar pemotongan muncul dengan *guideline* rasio tetap (disarankan **3:4** atau **9:16** potret) -> Pengguna menggeser/zoom gambar agar pas -> Frontend melakukan *canvas extract* -> Gambar dikirim ke backend.

### B. Jumlah Ekspresi & Kurva Pembelajaran (Onboarding)
- **Minimum Viable Character:** Jangan wajibkan mengunggah banyak gambar. **1 Gambar wajib** (label: `neutral`). Karakter sudah bisa dimainkan (statis).
- **Rekomendasi Bertahap:** Berikan slot UI "Tambahkan Ekspresi (Opsional)" dengan *dropdown* prasetel emosi dasar (seperti `happy`, `sad`, `angry`, `blush`).
- **Skema Data:** Hasil akhirnya adalah objek JSON *manifest* yang disimpan di database:
  ```json
  {
    "neutral": "https://cdn.../1.webp",
    "happy": "https://cdn.../2.webp",
    "blush": "https://cdn.../3.webp"
  }
  ```

---

## 3. Infrastruktur Backend & Keamanan

### A. Pipeline Kompresi Otomatis (Wajib WebP)
Berdasarkan `ops/scripts/sprite-budget.sh`, kita memiliki **batas ketat < 200 KB per gambar** agar performa seluler (4G) tetap instan. File PNG transparan dari pengguna bisa mencapai 2-5 MB.
- **Implementasi (Node/Bun):** Di *route* API `uploads.ts`, semua gambar PNG/JPG transparan yang masuk **wajib** dilewati melalui pustaka manipulasi gambar (seperti `sharp`).
- **Konversi:** `sharp(buffer).webp({ quality: 80, effort: 6 })`. Format WebP mendukung transparansi alfa dengan ukuran 80-90% lebih kecil dari PNG.
- **Penyimpanan:** Setelah dikompresi, unggah ke *Cloudflare R2* dan simpan URL CDN-nya ke *database*.

### B. Injeksi Prompt Dinamis (Mencegah Halusinasi LLM)
Bagaimana jika LLM mengembalikan `[EMOTION: crying]`, padahal pengguna tidak pernah mengunggah gambar ekspresi tersebut? (Hasilnya: gambar *blank/broken*).

- **Solusi Injeksi Kesadaran (Awareness):**
  Di `packages/server/src/prompts/builder.ts`, kita harus menyuntikkan daftar kunci emosi (*keys*) yang **benar-benar dimiliki** oleh karakter tersebut saat menyusun *system prompt* untuk LLM.
- **Draf Instruksi Prompt:**
  ```text
  ## Emotion Emission
  At the end of your response, ALWAYS emit an emotion tag formatted exactly as: [EMOTION: key]
  
  CRITICAL: You MUST ONLY choose a key from the following list of available expressions for this character:
  AVAILABLE_KEYS: [{{CHARACTER_AVAILABLE_EMOTION_KEYS}}]
  
  If the character's current feeling does not perfectly match any key, default to: [EMOTION: neutral].
  Do not invent new keys.
  ```
  *(Di mana `{{CHARACTER_AVAILABLE_EMOTION_KEYS}}` diganti secara dinamis dengan `Object.keys(spriteManifest).join(', ')`).*

Dengan cara ini, LLM akan "sadar" akan batasan pustaka gambar karakter dan tidak akan pernah memanggil emosi yang gambarnya tidak ada di CDN.
