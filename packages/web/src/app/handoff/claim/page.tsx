'use client';

/**
 * Post-wk14 — Device handoff (claim side).
 *
 * Reads ?t=<token> from the URL, POSTs to /api/handoff/claim which sets
 * the session cookie on success, then redirects:
 *   • to /chat/<sessionId> if the token was bound to a session, or
 *   • to / otherwise.
 * Token is single-use and expires after 60s — failed claims route the
 * user to the normal login.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';

interface ClaimResponse {
  userId: string;
  sessionId: string | null;
}

export default function HandoffClaimPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('t') ?? '';
  const [status, setStatus] = useState<'pending' | 'error'>('pending');
  const [errMsg, setErrMsg] = useState<string>('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setStatus('error');
      setErrMsg('Token tidak ditemukan di URL.');
      return;
    }

    api
      .post<ClaimResponse>('/api/handoff/claim', { token })
      .then((res) => {
        if (res.sessionId) router.replace(`/chat/${res.sessionId}`);
        else router.replace('/');
      })
      .catch((err) => {
        setStatus('error');
        setErrMsg(userFacingApiMessage(err, 'Link tidak valid atau sudah kedaluwarsa.'));
      });
  }, [token, router]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      {status === 'pending' && (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-ink-300" />
          <p className="mt-4 text-sm text-ink-400">Menghubungkan ke perangkat asal…</p>
        </>
      )}
      {status === 'error' && (
        <>
          <h1 className="text-xl font-semibold text-ink-100">Tidak bisa masuk</h1>
          <p className="mt-2 text-sm text-ink-400">{errMsg}</p>
          <Link
            href="/login"
            className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-medium text-ink-950"
          >
            Masuk secara normal
          </Link>
        </>
      )}
    </div>
  );
}
