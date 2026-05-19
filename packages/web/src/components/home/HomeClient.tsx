'use client';

import { useEffect, useMemo } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { Character } from '@neigo/shared';
import { api } from '@/lib/api';
import { PageMotion } from '@/components/PageMotion';
import { MassPublishBanner } from '@/components/MassPublishBanner';
import { useToast } from '@/components/ui/Toast';
import { HeroCarousel, type HeroCharacter } from '@/components/home/HeroCarousel';
import { FeaturedRow } from '@/components/home/FeaturedRow';
import { GenrePills } from '@/components/home/GenrePills';
import { StoriesInfiniteGrid } from '@/components/home/StoriesInfiniteGrid';
import type { StoryItem } from '@/components/home/StoryPosterCard';

export function HomeSkeleton() {
  return (
    <div className="space-y-6 px-6 py-5 sm:px-8" aria-live="polite" role="status">
      <section className="rounded-2xl border border-white/10 bg-white/3 p-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto h-6 w-48 animate-pulse rounded-full bg-white/10" />
          <div className="mx-auto mt-3 h-9 w-80 animate-pulse rounded-lg bg-white/10" />
          <div className="mx-auto mt-2 h-4 w-64 animate-pulse rounded bg-white/8" />
        </div>
        <div className="mt-6 flex justify-center gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-56 w-28 animate-pulse rounded-xl bg-white/8" />
          ))}
        </div>
      </section>

      {Array.from({ length: 2 }).map((_, rowIndex) => (
        <section key={rowIndex} className="space-y-3">
          <div className="h-6 w-44 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-72 animate-pulse rounded bg-white/6" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-44 w-80 shrink-0 animate-pulse rounded-2xl bg-white/8" />
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-3">
        <div className="h-6 w-40 animate-pulse rounded bg-white/10" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-white/8" />
          ))}
        </div>
      </section>
    </div>
  );
}

export interface StoryApiRow {
  id: string;
  title: string;
  synopsis: string | null;
  tagline?: string | null;
  coverImageUrl: string | null;
  language: string;
  requiredTier: 'FREE' | 'PAID' | 'FOUNDER' | string;
  publishedAt: string | null;
  cast?: Array<{ characterId?: string; displayName?: string }>;
  metadata?: { tags?: string[]; genre?: string; estimatedMinutes?: number };
}

export interface CharactersResponse {
  characters: Character[];
  ownedCount: number;
  maxCharacters: number;
}

export interface RailsResponse {
  rails: {
    featured: StoryApiRow[];
    winners: StoryApiRow[];
    trending: StoryApiRow[];
  };
}

function toStoryItem(row: StoryApiRow): StoryItem {
  return {
    id: row.id,
    title: row.title,
    synopsis: row.synopsis,
    coverImageUrl: row.coverImageUrl,
    requiredTier: row.requiredTier,
    publishedAt: row.publishedAt,
    metadata: row.metadata ?? {},
    cast: row.cast,
  };
}

function deriveGenres(stories: StoryApiRow[]): string[] {
  const counts = new Map<string, number>();
  for (const s of stories) {
    const tags = s.metadata?.tags ?? (s.metadata?.genre ? [s.metadata.genre] : []);
    for (const tag of tags) {
      if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([tag]) => tag);
}

function toHeroCharacter(c: Character): HeroCharacter {
  return {
    id: c.id,
    name: c.name,
    avatarUrl: c.avatarUrl,
    tonePreset: c.tonePreset,
    personality: c.personality,
    tags: c.tags,
    language: c.language,
    isBuiltIn: c.isBuiltIn,
  };
}

export function HomeClient({
  initialRails,
  initialStories,
  initialCharacters,
}: {
  initialRails?: RailsResponse | null;
  initialStories?: { stories: StoryApiRow[] } | null;
  initialCharacters?: CharactersResponse | null;
}) {
  const railsQuery = useQuery({
    queryKey: ['stories-home-rails'],
    queryFn: () => api.get<RailsResponse>('/api/stories/home/rails'),
    initialData: initialRails ?? undefined,
    staleTime: 5 * 60_000,
  });

  const storiesQuery = useInfiniteQuery({
    queryKey: ['stories-home-infinite'],
    queryFn: async ({ pageParam }) => {
      const offset = pageParam === 0 ? 0 : pageParam;
      const limit = offset === 0 ? 24 : 12;
      const res = await api.get<{ stories: StoryApiRow[] }>(
        `/api/stories?limit=${limit}&offset=${offset}&sort=newest`
      );
      return res.stories;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length === 0) return undefined;
      const totalFetched = allPages.flat().length;
      return totalFetched;
    },
    initialData: initialStories
      ? {
          pages: [initialStories.stories],
          pageParams: [0],
        }
      : undefined,
    staleTime: 5 * 60_000,
  });

  const charactersQuery = useQuery({
    queryKey: ['characters-home'],
    queryFn: () => api.get<CharactersResponse>('/api/characters'),
    initialData: initialCharacters ?? undefined,
    staleTime: 5 * 60_000,
  });

  const featuredStories = useMemo(() => railsQuery.data?.rails.featured.map(toStoryItem) ?? [], [railsQuery.data?.rails.featured]);
  const trendingStories = useMemo(() => railsQuery.data?.rails.trending.map(toStoryItem) ?? [], [railsQuery.data?.rails.trending]);

  const stories = useMemo(() => storiesQuery.data?.pages.flat() ?? [], [storiesQuery.data?.pages]);
  const newArrivals = stories.slice(0, Math.min(8, stories.length)).map(toStoryItem);
  const infinitePool = stories.slice(Math.min(8, stories.length)).map(toStoryItem);

  const characters = useMemo(
    () =>
      (charactersQuery.data?.characters ?? [])
        .filter((c) => (c.isPublic || c.isBuiltIn) && !c.isRetired)
        .slice(0, 12)
        .map(toHeroCharacter),
    [charactersQuery.data],
  );

  const genres = useMemo(() => deriveGenres(stories), [stories]);
  const isInitialLoading = !railsQuery.data && !storiesQuery.data && !charactersQuery.data && (storiesQuery.isLoading || charactersQuery.isLoading || railsQuery.isLoading);

  // Show toast on critical query errors (not initial load)
  const { show } = useToast();
  // show is stable from ToastProvider context — intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (railsQuery.isError) {
      show({ variant: 'error', title: 'Failed to load stories', description: 'Pull to refresh.' });
    }
  }, [railsQuery.isError]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (charactersQuery.isError) {
      show({ variant: 'error', title: 'Failed to load characters', description: 'Pull to refresh.' });
    }
  }, [charactersQuery.isError]);

  return (
    <PageMotion>
      {/* Ambient page backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 neigo-backdrop"
      />

      <div className="relative z-10">
        <div className="mx-auto max-w-7xl">
          <MassPublishBanner />

          {isInitialLoading ? (
            <HomeSkeleton />
          ) : (
            <div className="space-y-10 sm:space-y-12 pb-10">

              {/* Hero Carousel */}
              {characters.length > 0 && <HeroCarousel characters={characters} />}

              {/* Featured Stories Rail */}
              {featuredStories.length > 0 && (
                <FeaturedRow
                  stories={featuredStories}
                  title="Featured Stories"
                  subtitle="Hand-picked worlds the community can't stop playing."
                  accentColor="amber"
                  viewAllHref="/discover"
                />
              )}

              {/* Trending Stories Rail */}
              {trendingStories.length > 0 && (
                <FeaturedRow
                  stories={trendingStories}
                  title="Trending Worlds"
                  subtitle="Most active adventures in the realm right now."
                  accentColor="violet"
                  viewAllHref="/discover?sort=popular"
                />
              )}

              {/* Genre pills */}
              {genres.length > 0 && <GenrePills genres={genres} />}

              {/* New Arrivals */}
              {newArrivals.length > 0 && (
                <FeaturedRow
                  stories={newArrivals}
                  title="New Arrivals"
                  subtitle="Fresh worlds just unlocked by creators across the realm."
                  accentColor="teal"
                  viewAllHref="/discover?sort=newest"
                />
              )}

              {/* Infinite discover grid */}
              {infinitePool.length > 0 && (
                <StoriesInfiniteGrid
                  items={infinitePool}
                  hasNextPage={storiesQuery.hasNextPage}
                  isFetchingNextPage={storiesQuery.isFetchingNextPage}
                  fetchNextPage={storiesQuery.fetchNextPage}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </PageMotion>
  );
}
