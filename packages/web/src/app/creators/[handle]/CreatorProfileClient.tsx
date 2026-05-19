'use client';
import { useQuery } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Star } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { CharacterPosterCard } from '@/components/discover/CharacterPosterCard';
import { FollowButton } from '@/components/social/FollowButton';

interface CreatorResponse {
  creator: {
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    isFoundingReader: boolean;
    followerCount?: number;
    followingCount?: number;
    isFollowing?: boolean;
    joinedAt: string;
  };
  characters: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    tonePreset: string;
    tags: string[] | null;
    language: string | null;
    languagesSpoken: string[] | null;
  }>;
}

export default function CreatorProfileClient({ handle }: { handle: string }) {
  const normalized = handle.toLowerCase().replace(/^@/, '');

  const q = useQuery({
    queryKey: ['creator', normalized],
    queryFn: () => api.get<CreatorResponse>(`/api/creators/${normalized}`),
    retry: false,
  });

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 text-ink-400">Loading profile...</div>
    );
  }
  if (q.error instanceof ApiError && q.error.status === 404) {
    notFound();
  }
  if (!q.data) return null;
  const { creator, characters } = q.data;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-400 hover:text-ink-100"
      >
        <ArrowLeft size={14} /> Back
      </Link>

      <section className="flex flex-col gap-4 rounded-token-xl border border-night-line bg-night-surface p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-night-line bg-night-surface2 text-3xl">
          {creator.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creator.avatarUrl}
              alt={creator.displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            <span aria-hidden>{creator.displayName.slice(0, 1)}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl text-ink-50">{creator.displayName}</h1>
            {creator.isFoundingReader ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-accent/40 bg-violet-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-violet-hot">
                <Star size={10} /> Founding
              </span>
            ) : null}
          </div>
          <div className="text-sm text-ink-400">@{creator.handle}</div>
          {creator.bio ? (
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-200">{creator.bio}</p>
          ) : null}
          <div className="mt-1 inline-flex items-center gap-1 text-[12px] text-ink-500">
            <Calendar size={11} /> Joined {new Date(creator.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <FollowButton
              handle={creator.handle}
              initialFollowing={creator.isFollowing ?? false}
              initialCount={creator.followerCount ?? 0}
            />
            <div className="text-[12px] text-ink-400">
              {creator.followerCount ?? 0} followers · {creator.followingCount ?? 0} following
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-xl text-ink-50">Characters</h2>
        {characters.length === 0 ? (
          <div className="rounded-token-lg border border-dashed border-night-line bg-night-surface/40 px-4 py-8 text-center text-sm text-ink-400">
            @{creator.handle} hasn&apos;t published any characters yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {characters.map((c, i) => (
              <CharacterPosterCard
                key={c.id}
                index={i}
                character={{
                  id: c.id,
                  name: c.name,
                  avatarUrl: c.avatarUrl,
                  language: c.language ?? 'id',
                  tonePreset: c.tonePreset,
                  tags: c.tags ?? [],
                  creatorHandle: creator.handle,
                }}
                href={`/chat?cid=${c.id}`}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
