'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Drama,
  PenSquare,
  Plus,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { gradientFor } from '@/components/discover/StoryCard';

interface MeResponse {
  user: { id: string; tier: string };
}
interface StoryListItem {
  id: string;
  title: string;
  synopsis: string | null;
  coverImageUrl: string | null;
  status: string;
  metadata: { tags?: string[]; estimatedMinutes?: number };
  updatedAt: string;
}
interface CharacterListItem {
  id: string;
  ownerId: string;
  name: string;
  shortBio?: string | null;
  avatarUrl?: string | null;
}

function isPaid(tier: string) {
  const t = tier.toUpperCase();
  return t === 'PAID' || t === 'FOUNDER' || t === 'ENTERPRISE';
}

export default function StudioIndexPage() {
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/api/auth/me'),
    staleTime: 60_000,
    retry: false,
  });
  const me = meQ.data?.user;
  const canCreateStory = me ? isPaid(me.tier) : false;

  const storiesQ = useQuery({
    queryKey: ['my-stories'],
    queryFn: () => api.get<{ stories: StoryListItem[] }>('/api/stories?mine=1'),
    staleTime: 30_000,
    retry: false,
    enabled: !!me,
  });
  const charsQ = useQuery({
    queryKey: ['my-characters'],
    queryFn: () => api.get<{ characters: CharacterListItem[] }>('/api/characters'),
    staleTime: 30_000,
    retry: false,
    enabled: !!me,
  });

  const allStories = storiesQ.data?.stories ?? [];
  const allChars = (charsQ.data?.characters ?? []).filter((c) => c.ownerId === me?.id);
  const myStories = allStories.slice(0, 6);
  const myChars = allChars.slice(0, 8);
  const draftCount = allStories.filter((story) => story.status === 'draft').length;
  const publishedCount = allStories.filter((story) => story.status === 'published' || story.status === 'featured').length;
  const hasContent = myStories.length > 0 || myChars.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* PLANDESIGNv1 §3.E — Studio index (maker entry). */}
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-token-lg bg-gradient-to-br from-accent-500 to-iris-500 shadow-glow-soft">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink-50">Studio</h1>
            <p className="text-sm text-ink-400 mt-0.5">
              Make a story or a character. The world is yours to draft.
            </p>
          </div>
        </div>
      </header>

      {me ? (
        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-night-line bg-night-surface/70 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-500">Stories</div>
            <div className="mt-2 font-display text-3xl text-ink-50">{allStories.length}</div>
            <div className="mt-1 text-xs text-ink-400">All authored stories in your library.</div>
          </div>
          <div className="rounded-2xl border border-night-line bg-night-surface/70 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-500">Drafts</div>
            <div className="mt-2 font-display text-3xl text-warmth-200">{draftCount}</div>
            <div className="mt-1 text-xs text-ink-400">Unpublished stories still in progress.</div>
          </div>
          <div className="rounded-2xl border border-night-line bg-night-surface/70 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-500">Characters</div>
            <div className="mt-2 font-display text-3xl text-accent-200">{allChars.length}</div>
            <div className="mt-1 text-xs text-ink-400">Cast members owned by this account.</div>
          </div>
        </section>
      ) : null}

      {/* Action dock — two primary maker CTAs (story/character) per §3.E. */}
      <div className="grid gap-4 sm:grid-cols-2 mb-10">
        {canCreateStory ? (
          <Link
            href="/studio/stories"
            className="group relative overflow-hidden rounded-2xl border border-iris-500/30 bg-gradient-to-br from-iris-500/15 to-iris-500/5 p-5 transition-fast hover:border-iris-400/50 hover:shadow-glow-soft"
          >
            <div className="relative flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-iris-500/25 text-iris-200">
                <BookOpen className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-ink-50">New visual novel</span>
                  <span className="text-[10px] uppercase tracking-[0.18em] rounded-md px-1.5 py-0.5 bg-iris-500/20 text-iris-200">VN</span>
                </div>
                <p className="mt-0.5 text-xs text-ink-400">
                  Outline scenes, set the cast, ship a story readers can step into.
                </p>
              </div>
              <Plus className="h-4 w-4 text-iris-300 opacity-60 group-hover:opacity-100 transition" strokeWidth={2} />
            </div>
          </Link>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-night-line bg-night-surface/60 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-night-surface2 text-ink-500">
                <BookOpen className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-ink-200">New visual novel</span>
                  <span className="text-[10px] uppercase tracking-[0.18em] rounded-md px-1.5 py-0.5 bg-warmth-500/15 text-warmth-300">Paid tier</span>
                </div>
                <p className="mt-0.5 text-xs text-ink-400">
                  Story authoring is part of the paid tier — upgrade to publish your own.
                </p>
                <Link href="/account" className="mt-2 inline-block text-xs font-medium text-accent-300 hover:text-accent-200">
                  Upgrade →
                </Link>
              </div>
            </div>
          </div>
        )}

        <Link
          href="/studio/characters/new"
          className="group relative overflow-hidden rounded-2xl border border-accent-500/30 bg-gradient-to-br from-accent-500/15 to-accent-500/5 p-5 transition-fast hover:border-accent-400/50 hover:shadow-glow-soft"
        >
          <div className="relative flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-500/25 text-accent-200">
              <UserPlus className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-ink-50">New character</span>
                <span className="text-[10px] uppercase tracking-[0.18em] rounded-md px-1.5 py-0.5 bg-accent-500/20 text-accent-200">Cast</span>
              </div>
              <p className="mt-0.5 text-xs text-ink-400">
                Voice, backstory, secrets. Someone worth meeting.
              </p>
            </div>
            <Plus className="h-4 w-4 text-accent-300 opacity-60 group-hover:opacity-100 transition" strokeWidth={2} />
          </div>
        </Link>
      </div>

      {/* Library — your stories + characters. */}
      {!hasContent && !storiesQ.isLoading && !charsQ.isLoading && (
        <section className="rounded-2xl border border-dashed border-night-line bg-night-surface/40 p-10 text-center">
          <Drama className="w-8 h-8 text-ink-700 mx-auto mb-3" strokeWidth={1.4} />
          <h3 className="display text-lg text-ink-100">Your library is empty.</h3>
          <p className="text-sm text-ink-400 mt-1.5 max-w-sm mx-auto">
            Begin with a single character — give them a name, a voice, a wound. Worlds grow from there.
          </p>
          <Link
            href="/studio/characters/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-400 transition-fast"
          >
            <Plus className="h-4 w-4" /> Make your first character
          </Link>
        </section>
      )}

      {myStories.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="font-display text-lg text-ink-50">Your stories</h2>
              <p className="text-xs text-ink-500 mt-0.5">Drafts and published worlds.</p>
            </div>
            <Link href="/studio/stories" className="text-xs text-accent-300 hover:text-accent-200">
              See all →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myStories.map((s) => (
              <Link
                key={s.id}
                href={`/studio/stories/${s.id}`}
                className="group relative overflow-hidden rounded-xl border border-night-line bg-night-surface transition-fast hover:border-ink-700"
              >
                <div className="relative aspect-[16/9] w-full overflow-hidden">
                  {s.coverImageUrl ? (
                    <Image src={s.coverImageUrl} alt="" fill className="object-cover" sizes="320px" />
                  ) : (
                    <div className="absolute inset-0" style={gradientFor(s.id)} />
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-iris-200 backdrop-blur">
                    <BookOpen className="h-3 w-3" /> VN
                  </span>
                  <span
                    className={
                      'absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] backdrop-blur ' +
                      (s.status === 'published' || s.status === 'featured'
                        ? 'bg-emerald-500/25 text-emerald-200'
                        : s.status === 'archived'
                          ? 'bg-ink-700/60 text-ink-400'
                          : 'bg-warmth-500/25 text-warmth-200')
                    }
                  >
                    {s.status === 'published'
                      ? 'Live'
                      : s.status === 'featured'
                        ? 'Featured'
                        : s.status === 'archived'
                          ? 'Archived'
                          : 'Draft'}
                  </span>
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink-50 truncate flex-1">{s.title}</h3>
                    <PenSquare className="h-3.5 w-3.5 text-ink-500 group-hover:text-ink-300 shrink-0" />
                  </div>
                  {s.synopsis && (
                    <p className="mt-1 text-xs text-ink-400 line-clamp-2">{s.synopsis}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {myChars.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="font-display text-lg text-ink-50">Your characters</h2>
              <p className="text-xs text-ink-500 mt-0.5">The cast you’ve built.</p>
            </div>
            <Link href="/studio/characters" className="text-xs text-accent-300 hover:text-accent-200">
              See all →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {myChars.map((c) => (
              <Link
                key={c.id}
                href={`/studio/characters/${c.id}`}
                className="group flex items-center gap-3 rounded-xl border border-night-line bg-night-surface p-3 transition-fast hover:border-ink-700"
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-night-line bg-night-surface2">
                  {c.avatarUrl ? (
                    <Image src={c.avatarUrl} alt="" fill className="object-cover" sizes="48px" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-ink-500">
                      <Users className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink-50 truncate">{c.name}</div>
                  {c.shortBio && (
                    <div className="text-[11px] text-ink-400 line-clamp-1">{c.shortBio}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
