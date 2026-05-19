'use client';

/**
 * Post-wk14 — Device handoff (sender side).
 *
 * Mints a single-use 60s token bound to the current user (optionally to
 * a specific session) and displays the claim URL. The second device
 * visits the URL to claim the session. QR rendering is deferred until
 * a proper qrcode lib lands; the URL is short enough to read manually
 * or paste via AirDrop/Nearby.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, RefreshCcw } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';

interface CreateResponse {
  token: string;
  expiresAt: string;
  ttlMs: number;
  path: string;
}

export default function HandoffPage() {
  const [copied, setCopied] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => api.post<CreateResponse>('/api/handoff', {}),
    onError: (err) => setErrMsg(userFacingApiMessage(err, 'Failed to create link.')),
    onSuccess: () => setErrMsg(null),
  });

  const claimUrl =
    typeof window !== 'undefined' && mut.data ? `${window.location.origin}${mut.data.path}` : '';

  const ttlSeconds = mut.data ? Math.round(mut.data.ttlMs / 1000) : 0;

  return (
    <div className="mx-auto max-w-lg px-5 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-ink-400 hover:text-ink-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">Lanjutkan di perangkat lain</h1>
      <p className="mt-1 text-sm text-ink-400">
        Buat link sekali-pakai (berlaku {ttlSeconds || 60} detik), buka di perangkat tujuan
        untuk masuk dan melanjutkan sesi terakhir.
      </p>

      {!mut.data && (
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="mt-6 rounded-xl bg-accent px-5 py-2.5 font-medium text-ink-950 hover:bg-accent/90 disabled:opacity-50"
        >
          {mut.isPending ? 'Membuat…' : 'Buat link'}
        </button>
      )}

      {errMsg && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {errMsg}
        </div>
      )}

      {mut.data && (
        <div className="mt-6 space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-500">Buka URL ini</p>
            <p className="mt-1 break-all font-mono text-sm text-ink-100">{claimUrl}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(claimUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm text-ink-200 hover:bg-white/[0.06]"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Tersalin' : 'Salin link'}
            </button>
            <button
              onClick={() => mut.mutate()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm text-ink-200 hover:bg-white/[0.06]"
            >
              <RefreshCcw className="h-4 w-4" />
              Buat ulang
            </button>
          </div>
          <p className="text-[11px] text-ink-500">
            Kedaluwarsa: {new Date(mut.data.expiresAt).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}
