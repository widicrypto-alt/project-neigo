import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * /legal/privacy — UU PDP 2022 privacy policy (stub).
 *
 * Legal team will replace content. This page must exist from wk4 onwards so
 * ConsentBanner's "Baca kebijakan" link never 404s.
 */

export const metadata: Metadata = {
  title: 'Kebijakan Privasi — Project Neigo',
  description: 'Kebijakan privasi Project Neigo sesuai UU No. 27/2022 tentang Perlindungan Data Pribadi.',
};

export default function PrivacyPolicyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-ink-100">
      <p className="text-xs uppercase tracking-widest text-ink-400">Legal</p>
      <h1 className="mt-2 text-2xl font-display font-semibold text-ink-50">
        Kebijakan Privasi
      </h1>
      <p className="mt-1 text-xs text-ink-400">Versi 1.0 — berlaku 21 April 2026</p>

      <article className="prose prose-invert mt-6 text-sm leading-relaxed space-y-4 text-ink-200">
        <p>
          Project Neigo (“kami”) menghormati hak-hak pengguna atas data pribadi
          sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Perlindungan Data
          Pribadi (UU PDP) dan peraturan pelaksanaannya.
        </p>

        <h2 className="text-lg font-semibold text-ink-50">1. Data yang Kami Proses</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Identitas akun: email, nama tampilan, avatar.</li>
          <li>Konten interaksi: pesan chat, persona, karakter buatan pengguna.</li>
          <li>
            Data teknis minimal: timestamp, IP address, user agent — hanya untuk
            keamanan dan pencegahan penyalahgunaan.
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-ink-50">2. Dasar Hukum</h2>
        <p>
          Pemrosesan didasarkan pada persetujuan (Pasal 20 UU PDP) untuk analitik
          dan personalisasi, serta pelaksanaan kontrak untuk layanan inti.
        </p>

        <h2 className="text-lg font-semibold text-ink-50">3. Hak-Hak Anda</h2>
        <p>
          Anda berhak mengakses, memperbaiki, menghapus, menarik persetujuan, dan
          meminta portabilitas data melalui halaman{' '}
          <Link href="/settings/privacy" className="text-accent-300 underline underline-offset-2">
            Pengaturan → Privasi
          </Link>
          . Permintaan diproses paling lambat 3 × 24 jam.
        </p>

        <h2 className="text-lg font-semibold text-ink-50">4. Penyimpanan</h2>
        <p>
          Data disimpan di pusat data yang patuh standar keamanan setara SOC 2.
          Retensi: 30 hari setelah penghapusan akun untuk backup, lalu permanen
          dihapus.
        </p>

        <h2 className="text-lg font-semibold text-ink-50">5. Kontak</h2>
        <p>
          Pertanyaan: <span className="text-accent-300">privacy{'\u0040'}neigo.local</span>.
          Pengaduan dapat ditujukan ke Kementerian Kominfo selaku otoritas PDP.
        </p>
      </article>
    </main>
  );
}
