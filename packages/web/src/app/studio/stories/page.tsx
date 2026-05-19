'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Check,
  Clock,
  Globe,
  Lock,
  PenSquare,
  Plus,
  Trash2,
  Users,
  Sparkles,
} from 'lucide-react';
import { api, ApiError, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useState } from 'react';

interface StoryListItem {
  id: string;
  title: string;
  tagline: string | null;
  synopsis: string | null;
  coverImageUrl: string | null;
  language: string;
  status: string;
  requiredTier: string;
  tags: string[];
  metadata: { tags?: string[]; estimatedMinutes?: number };
  updatedAt: string;
}

interface MeResponse {
  user: { id: string; tier: string; isFoundingReader?: boolean };
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'border-night-line text-ink-400' },
  published: { label: 'Published', cls: 'border-emerald-500/40 text-emerald-400' },
  featured: { label: 'Featured', cls: 'border-violet-accent/50 text-violet-hot' },
  archived: { label: 'Archived', cls: 'border-ink-700 text-ink-600' },
};

const LANG_FLAG: Record<string, string> = { id: '🇮🇩', en: '🇺🇸', ja: '🇯🇵' };

function isPaid(tier: string) {
  const t = tier.toUpperCase();
  return t === 'PAID' || t === 'FOUNDER' || t === 'ENTERPRISE';
}

export default function StudioStoriesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/api/auth/me'),
    staleTime: 60_000,
    retry: false,
  });
  const me = meQ.data?.user;
  const canCreate = me ? isPaid(me.tier) : false;

  // Fetch my stories — ?mine=1 returns all statuses (including drafts) for the author
  const storiesQ = useQuery({
    queryKey: ['my-stories'],
    queryFn: () => api.get<{ stories: StoryListItem[] }>('/api/stories?mine=1'),
    staleTime: 30_000,
    retry: false,
    enabled: !!me,
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.post<{ story: StoryListItem }>('/api/stories', { title: newTitle.trim() }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['my-stories'] });
      setCreating(false);
      setNewTitle('');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.del(`/api/stories/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['my-stories'] });
      setDeleteId(null);
    },
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/stories/${id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-stories'] }),
  });

  const stories = storiesQ.data?.stories ?? [];
  const draftCount = stories.filter((story) => story.status === 'draft').length;
  const liveCount = stories.filter((story) => story.status === 'published' || story.status === 'featured').length;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink-50">Studio — My Stories</h1>
          <p className="mt-1 text-sm text-ink-400">Manage the visual novels you write, link casts, and keep drafts moving.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/studio/characters/new"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-token-md border border-night-line px-3 py-1.5 text-sm text-ink-200 transition-fast hover:border-ink-500 hover:text-ink-50"
          >
            <Users size={15} /> New character
          </Link>
          {canCreate ? (
            <>
              <button
                onClick={() => setCreating((v) => !v)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-token-md border border-violet-accent/40 px-3 py-1.5 text-sm font-medium text-violet-300 transition-fast hover:bg-violet-accent/10"
              >
                <Sparkles size={15} /> Quick draft
              </button>
              <Link
                href="/studio/stories/new"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-token-md bg-gradient-to-r from-violet-accent to-iris-500 px-3 py-1.5 text-sm font-semibold text-white shadow-glow-soft transition-fast hover:opacity-90"
              >
                <Plus size={15} /> New story
              </Link>
            </>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-token-md border border-night-line px-3 py-1.5 text-xs text-ink-500">
              <Lock size={12} /> PAID to create
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-token-xl border border-night-line bg-night-surface/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-ink-500">All stories</div>
          <div className="mt-2 font-display text-3xl text-ink-50">{stories.length}</div>
          <div className="mt-1 text-xs text-ink-500">Everything authored by this account.</div>
        </div>
        <div className="rounded-token-xl border border-night-line bg-night-surface/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-ink-500">Drafts</div>
          <div className="mt-2 font-display text-3xl text-warmth-200">{draftCount}</div>
          <div className="mt-1 text-xs text-ink-500">Stories still private or incomplete.</div>
        </div>
        <div className="rounded-token-xl border border-night-line bg-night-surface/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-ink-500">Live</div>
          <div className="mt-2 font-display text-3xl text-emerald-300">{liveCount}</div>
          <div className="mt-1 text-xs text-ink-500">Published or featured stories.</div>
        </div>
        <Link
          href="/studio/characters"
          className="rounded-token-xl border border-violet-accent/25 bg-violet-accent/10 p-4 transition-fast hover:border-violet-accent/45"
        >
          <div className="text-[11px] uppercase tracking-[0.16em] text-violet-300">Cast library</div>
          <div className="mt-2 font-display text-2xl text-ink-50">Open Characters</div>
          <div className="mt-1 text-xs text-ink-400">Create or curate characters before linking them to stories.</div>
        </Link>
      </div>

      {/* Create form */}
      {creating && (
        <div className="mb-5 rounded-token-xl border border-violet-accent/30 bg-night-surface p-4">
          <p className="mb-3 text-sm font-medium text-ink-200">New story title</p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTitle.trim()) createMut.mutate();
                if (e.key === 'Escape') setCreating(false);
              }}
              placeholder="Story title…"
              className="flex-1 rounded-token-md border border-night-line bg-night-surface2 px-3 py-2 text-sm text-ink-50 outline-none placeholder:text-ink-500 focus:border-violet-accent/60"
            />
            <button
              onClick={() => createMut.mutate()}
              disabled={!newTitle.trim() || createMut.isPending}
              className="rounded-token-md bg-violet-accent/90 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-violet-accent transition-fast"
            >
              {createMut.isPending ? '…' : 'Create'}
            </button>
            <button
              onClick={() => setCreating(false)}
              className="rounded-token-md border border-night-line px-3 py-2 text-sm text-ink-400 hover:text-ink-100 transition-fast"
            >
              Cancel
            </button>
          </div>
          {createMut.isError && (
            <p className="mt-2 text-xs text-red-400">{userFacingApiMessage(createMut.error)}</p>
          )}
        </div>
      )}

      {/* Stories list */}
      {storiesQ.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-token-xl bg-night-surface" />
          ))}
        </div>
      ) : stories.length === 0 ? (
        <div className="rounded-token-xl border border-dashed border-night-line bg-night-surface/40 px-4 py-12 text-center">
          <BookOpen className="mx-auto mb-3 h-9 w-9 text-ink-600" />
          <p className="text-sm text-ink-300">No stories yet.</p>
          <p className="mx-auto mt-2 max-w-lg text-sm text-ink-500">
            Studio works best when the character library and story library grow together. Start a story from the wizard, or create a cast member first so linking feels immediate.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {canCreate ? (
              <Link
                href="/studio/stories/new"
                className="rounded-lg bg-violet-accent px-5 py-2.5 text-sm font-medium text-white transition-fast hover:bg-violet-accent/90"
              >
                Create your first story
              </Link>
            ) : (
              <p className="text-xs text-ink-600">Upgrade to PAID to create stories.</p>
            )}
            <Link
              href="/studio/characters/new"
              className="rounded-lg border border-night-line px-5 py-2.5 text-sm text-ink-300 transition-fast hover:border-ink-500 hover:text-ink-100"
            >
              Create a character first
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {stories.map((s) => {
            const badge = (STATUS_BADGE[s.status] ?? STATUS_BADGE['draft'])!;
            const mins = s.metadata?.estimatedMinutes;

            return (
              <div
                key={s.id}
                className="flex items-start gap-3 rounded-token-xl border border-night-line bg-night-surface p-4 transition-fast hover:border-night-line/80"
              >
                {/* Cover thumb */}
                <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-night-surface2 border border-night-line">
                  {s.coverImageUrl ? (
                    <Image
                      src={s.coverImageUrl}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <BookOpen size={14} className="text-ink-600" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="font-display text-sm font-semibold text-ink-50 truncate">
                      {s.title}
                    </span>
                    <span
                      className={cn(
                        'inline-block rounded-full border px-1.5 py-0 text-[10px] shrink-0',
                        badge.cls,
                      )}
                    >
                      {badge.label}
                    </span>
                  </div>
                  {(s.tagline || s.synopsis) && (
                    <p className="mt-1 line-clamp-2 text-xs text-ink-400">
                      {s.tagline || s.synopsis}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-500 mt-0.5">
                    <span>{LANG_FLAG[s.language] ?? '🌐'} {s.language.toUpperCase()}</span>
                    {mins ? (
                      <span className="flex items-center gap-0.5">
                        <Clock size={9} /> {mins} min
                      </span>
                    ) : null}
                    {s.requiredTier !== 'FREE' ? (
                      <span className="flex items-center gap-0.5">
                        <Lock size={9} /> {s.requiredTier}
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5">
                        <Globe size={9} /> FREE
                      </span>
                    )}
                  </div>
                  {(s.tags ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(s.tags ?? []).slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-night-line px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-ink-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* View public page */}
                  {(s.status === 'published' || s.status === 'featured') && (
                    <Link
                      href={`/stories/${s.id}`}
                      className="rounded-md border border-night-line p-1.5 text-ink-400 hover:text-ink-50 transition-fast"
                      title="View story"
                    >
                      <BookOpen size={14} />
                    </Link>
                  )}
                  {/* Publish button (draft only) */}
                  {s.status === 'draft' && (
                    <button
                      onClick={() => publishMut.mutate(s.id)}
                      disabled={publishMut.isPending}
                      title="Publish"
                      className="rounded-md border border-emerald-500/40 p-1.5 text-emerald-400 hover:bg-emerald-500/10 transition-fast disabled:opacity-40"
                    >
                      <Check size={14} />
                    </button>
                  )}
                  {/* Edit (placeholder — full editor is D4b+) */}
                  <Link
                    href={`/studio/stories/${s.id}`}
                    className="rounded-md border border-violet-700/50 p-1.5 text-violet-400 hover:bg-violet-900/20 transition-fast"
                    title="Detail & Plot"
                  >
                    <BookOpen size={14} />
                  </Link>
                  <Link
                    href={`/studio/stories/${s.id}/edit`}
                    className="rounded-md border border-night-line p-1.5 text-ink-400 hover:text-ink-50 transition-fast"
                    title="Edit Skenario"
                  >
                    <PenSquare size={14} />
                  </Link>
                  {/* Archive */}
                  {s.status !== 'archived' && (
                    <button
                      onClick={() => {
                        if (deleteId === s.id) {
                          deleteMut.mutate(s.id);
                        } else {
                          setDeleteId(s.id);
                        }
                      }}
                      title={deleteId === s.id ? 'Confirm delete?' : 'Archive'}
                      className={cn(
                        'rounded-md border p-1.5 transition-fast',
                        deleteId === s.id
                          ? 'border-red-500/50 text-red-400 hover:bg-red-500/10'
                          : 'border-night-line text-ink-500 hover:text-red-400',
                      )}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Link to public catalog */}
      <div className="mt-8 text-center">
        <Link href="/stories" className="text-sm text-ink-400 hover:text-ink-100 transition-fast">
          View all public stories →
        </Link>
      </div>
    </div>
  );
}
