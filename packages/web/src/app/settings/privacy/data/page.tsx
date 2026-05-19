'use client';
import { useState } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export default function PrivacyAndDataPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/export`, { credentials: 'include' });
      if (!res.ok) {
        setMsg(`Export failed (HTTP ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `neigo-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('Export selesai — unduhan akan dimulai.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    const confirm1 = prompt('Untuk mengonfirmasi penghapusan, ketik: HAPUS AKUN');
    if (confirm1 !== 'HAPUS AKUN') return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/delete-account`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setMsg(`Failed (HTTP ${res.status}).`);
        return;
      }
      setMsg('Akun dijadwalkan untuk dihapus dalam 14 hari.');
      setTimeout(() => { window.location.href = '/'; }, 2000);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-8">
      <div>
        <Link href="/settings" className="text-sm text-rose-300 hover:underline">← Kembali</Link>
        <h1 className="text-2xl font-semibold text-rose-50 mt-2">Privasi &amp; Data</h1>
      </div>

      <section className="rounded-lg border border-rose-900/40 bg-rose-950/20 p-5 space-y-3">
        <h2 className="font-medium text-rose-100">Ekspor data (GDPR)</h2>
        <p className="text-sm text-rose-300/80">
          Unduh semua data yang kamu buat: karakter, cerita, komentar, rating, reaksi, revisi, dan daftar follow.
          Format JSON.
        </p>
        <button
          onClick={download}
          disabled={busy}
          className="px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-60"
        >
          {busy ? 'Memproses…' : 'Unduh Data Saya'}
        </button>
      </section>

      <section className="rounded-lg border border-red-900/50 bg-red-950/20 p-5 space-y-3">
        <h2 className="font-medium text-red-200">Hapus akun</h2>
        <p className="text-sm text-red-300/80">
          Menghapus akun akan menyembunyikan semua konten kamu dan menjadwalkan penghapusan permanen dalam 14 hari.
          Kamu bisa membatalkan dengan menghubungi support sebelum periode berakhir.
        </p>
        <button
          onClick={deleteAccount}
          disabled={busy}
          className="px-4 py-2 rounded-md bg-red-700 hover:bg-red-600 text-white disabled:opacity-60"
        >
          Hapus Akun Saya
        </button>
      </section>

      {msg && <div className="text-sm text-rose-200">{msg}</div>}
    </div>
  );
}
