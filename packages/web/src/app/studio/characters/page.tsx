'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Eye, Globe, Lock, ArrowLeft, Users, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Character } from '@neigo/shared';

interface MeResponse {
  user: { id: string } | null;
}

export default function StudioCharactersPage() {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/api/auth/me'),
    staleTime: 60_000,
    retry: false,
  });

  const charsQ = useQuery({
    queryKey: ['studio-characters'],
    queryFn: () => api.get<{ characters: Character[] }>('/api/characters'),
    staleTime: 30_000,
    retry: false,
    enabled: !!meQ.data?.user,
  });

  const loading = meQ.isLoading || charsQ.isLoading;
  const err = charsQ.error ? userFacingApiMessage(charsQ.error, 'Failed to load characters.') : null;
  const characters = (charsQ.data?.characters ?? []).filter((char) => char.ownerId === meQ.data?.user?.id);
  const publicCount = characters.filter((char) => char.isPublic).length;

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/characters/${id}`, { method: 'DELETE', credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error('delete_failed');
        return r.json();
      }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['studio-characters'] });
      const prev = queryClient.getQueryData<{ characters: Character[] }>(['studio-characters']);
      queryClient.setQueryData<{ characters: Character[] }>(['studio-characters'], (old) =>
        old ? { ...old, characters: old.characters.filter((c) => c.id !== id) } : old,
      );
      setDeleteId(null);
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev !== undefined) queryClient.setQueryData(['studio-characters'], context.prev);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['studio-characters'] });
      void queryClient.invalidateQueries({ queryKey: ['characters-home'] });
    },
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/studio" className="text-ink-400 hover:text-ink-200 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-ink-100">Character Studio</h1>
          <p className="mt-1 text-sm text-ink-500">Owner library only. Public characters from other creators are hidden here.</p>
        </div>
        <Link
          href="/studio/characters/new"
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-sm text-white transition-colors"
        >
          <Plus size={14} /> Create new
        </Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-500">Owned</div>
          <div className="mt-2 font-display text-3xl text-ink-100">{characters.length}</div>
          <div className="mt-1 text-xs text-ink-500">Characters linked to this account.</div>
        </div>
        <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-500">Public</div>
          <div className="mt-2 font-display text-3xl text-emerald-300">{publicCount}</div>
          <div className="mt-1 text-xs text-ink-500">Visible to readers and story pickers.</div>
        </div>
        <Link
          href="/studio/stories"
          className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4 transition-colors hover:border-violet-400/40"
        >
          <div className="text-[11px] uppercase tracking-[0.18em] text-violet-300">Cross-link</div>
          <div className="mt-2 font-display text-2xl text-ink-100">Open Story Studio</div>
          <div className="mt-1 text-xs text-ink-400">Manage casts, scenarios, and published worlds.</div>
        </Link>
      </div>

      {err && <p className="text-sm text-red-400 mb-4">{err}</p>}

      {characters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-800 bg-ink-900/40 p-10 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-ink-600" />
          <p className="text-ink-300 mb-2">No characters in your Studio yet.</p>
          <p className="mx-auto mb-5 max-w-md text-sm text-ink-500">
            Start with a protagonist, rival, or narrator. Story cast pickers only become useful once your owned library exists.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/studio/characters/new"
              className="rounded-lg bg-violet-600 hover:bg-violet-500 px-5 py-2.5 text-sm text-white transition-colors"
            >
              Create character
            </Link>
            <Link
              href="/studio/stories"
              className="rounded-lg border border-ink-700 px-5 py-2.5 text-sm text-ink-300 transition-colors hover:border-ink-500 hover:text-ink-100"
            >
              Open Story Studio
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((char) => (
            <div
              key={char.id}
              className="rounded-xl border border-ink-700 bg-ink-900 p-4 flex flex-col gap-3 hover:border-ink-600 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-ink-800 shrink-0">
                  {char.avatarUrl ? (
                    <Image src={char.avatarUrl} alt={char.name} fill sizes="48px" className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl">✨</div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-ink-100 truncate">{char.name}</p>
                  <p className="text-xs text-ink-500 flex items-center gap-1 mt-0.5">
                    {char.isPublic ? (
                      <><Globe size={10} className="text-emerald-400" /> Public</>
                    ) : (
                      <><Lock size={10} /> Private</>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 mt-auto">
                <Link
                  href={`/studio/characters/${char.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-violet-700 text-violet-300 hover:bg-violet-900/30 py-1.5 text-xs transition-colors"
                >
                  <Edit2 size={11} /> Studio
                </Link>
                <Link
                  href={`/characters/${char.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-ink-700 text-ink-400 hover:bg-ink-800 py-1.5 text-xs transition-colors"
                >
                  <Eye size={11} /> View
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (deleteId === char.id) deleteMut.mutate(char.id);
                    else setDeleteId(char.id);
                  }}
                  title={deleteId === char.id ? 'Confirm delete?' : 'Delete character'}
                  aria-label={deleteId === char.id ? 'Confirm delete' : 'Delete character'}
                  className={cn(
                    'rounded-lg border px-2 py-1.5 transition-colors',
                    deleteId === char.id
                      ? 'border-red-500/60 text-red-400 bg-red-500/10'
                      : 'border-ink-700 text-ink-500 hover:text-red-400 hover:border-red-500/40',
                  )}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
