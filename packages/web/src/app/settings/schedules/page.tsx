'use client';

/**
 * Wk14 H7 — Schedules settings page (overview).
 *
 * Lists all autonomous nudge schedules across sessions. Per-session
 * editing lives in the chat toolbar; this page is a read-only overview
 * with quick delete so users can clean up stale schedules.
 */

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';

interface Schedule {
  id: string;
  sessionId: string;
  cadence: 'once' | 'daily' | 'weekly';
  fireAt: string;
  note: string;
  tz: string;
  hour: number | null;
  minute: number | null;
  enabled: boolean;
}

interface ListResponse {
  schedules: Schedule[];
}

export default function SchedulesSettingsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['schedules'],
    queryFn: () => api.get<ListResponse>('/api/schedules'),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/api/schedules/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.del(`/api/schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
    onError: (err) => alert(userFacingApiMessage(err, 'Failed to delete schedule.')),
  });

  const schedules = list.data?.schedules ?? [];

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 text-sm text-ink-400 hover:text-ink-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">Jadwal otomatis</h1>
      <p className="mt-1 text-sm text-ink-400">
        Pesan penyapa yang akan dikirim karakter secara otomatis. Buat jadwal baru dari
        toolbar chat di sesi yang bersangkutan.
      </p>

      {list.isLoading && (
        <div className="mt-6 flex items-center gap-2 text-sm text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memuat…
        </div>
      )}

      {schedules.length === 0 && !list.isLoading && (
        <div className="mt-8 rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center text-sm text-ink-400">
          No schedules yet.
        </div>
      )}

      <ul className="mt-6 space-y-2">
        {schedules.map((s) => {
          const clock =
            s.hour != null && s.minute != null
              ? `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
              : null;
          return (
            <li
              key={s.id}
              className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
            >
              <label className="mt-0.5 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={(e) => toggleMut.mutate({ id: s.id, enabled: e.target.checked })}
                  className="h-4 w-4 accent-accent"
                />
              </label>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-ink-100">
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-300">
                    {s.cadence}
                  </span>
                  {clock ? `${clock} ${s.tz}` : new Date(s.fireAt).toLocaleString()}
                </p>
                {s.note && (
                  <p className="mt-1 line-clamp-2 text-xs text-ink-400">{s.note}</p>
                )}
                <Link
                  href={`/chat/${s.sessionId}`}
                  className="mt-1 block truncate text-[11px] text-accent hover:underline"
                >
                  Sesi: {s.sessionId}
                </Link>
              </div>
              <button
                onClick={() => {
                  if (confirm('Hapus jadwal ini?')) deleteMut.mutate(s.id);
                }}
                className="text-ink-400 hover:text-rose-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
