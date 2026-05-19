'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Compass, Hash } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { Character } from '@neigo/shared';
import { api } from '@/lib/api';
import { DiscoverSearchBar } from './SearchBar';
import { DiscoverTabBar, type DiscoverTab } from './TabBar';
import {
  DiscoverFilterPanel,
  type FilterState,
  SORT_OPTIONS,
  LANGUAGE_OPTIONS,
  TIME_RANGES,
  RATING_OPTIONS,
} from './FilterPanel';
import { DiscoverFilterChips, type ActiveChip } from './FilterChips';
import { DiscoverCard, DiscoverCardSkeleton, type DiscoverItem } from './DiscoverCard';

const PAGE_SIZE = 18;
const DISCOVER_STORY_BATCH = 100;

const DEFAULT_FILTERS: FilterState = {
  sort: 'trending',
  genres: [],
  rating: 'ANY',
  language: 'all',
  timeRange: 'all',
};

interface StoryApiRow {
  id: string;
  title: string;
  synopsis: string | null;
  coverImageUrl: string | null;
  requiredTier: string;
  publishedAt: string | null;
  metadata?: { tags?: string[]; genre?: string };
  language?: string;
  totalPlays?: number;
  totalChats?: number;
  totalLikes?: number;
}

interface CharactersResponse {
  characters: Character[];
}

async function fetchAllDiscoverStories(): Promise<{ stories: StoryApiRow[] }> {
  const stories: StoryApiRow[] = [];
  let offset = 0;

  while (true) {
    const page = await api.get<{ stories: StoryApiRow[] }>(
      `/api/stories?limit=${DISCOVER_STORY_BATCH}&offset=${offset}&sort=newest`,
    );
    const batch = page.stories ?? [];
    stories.push(...batch);
    if (batch.length < DISCOVER_STORY_BATCH) break;
    offset += batch.length;
  }

  return { stories };
}

function storyToItem(s: StoryApiRow): DiscoverItem {
  return {
    id: s.id,
    kind: 'story',
    title: s.title,
    excerpt: s.synopsis,
    coverUrl: s.coverImageUrl,
    href: `/stories/${s.id}`,
    genre: s.metadata?.genre ?? s.metadata?.tags?.[0] ?? null,
    tags: s.metadata?.tags ?? [],
    language: s.language ?? 'id',
    publishedAt: s.publishedAt,
    totalPlays: s.totalPlays ?? 0,
    totalChats: s.totalChats ?? 0,
    totalLikes: s.totalLikes ?? 0,
  };
}

function characterToItem(c: Character): DiscoverItem {
  return {
    id: c.id,
    kind: 'character',
    title: c.name,
    excerpt: c.personality?.split('.')[0] ?? null,
    coverUrl: c.avatarUrl,
    href: `/characters/${c.id}`,
    tags: c.tags,
    language: c.language,
  };
}

function deriveGenres(items: DiscoverItem[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags ?? []) {
      if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([tag]) => tag);
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Compass className="h-10 w-10 text-ink-700 mb-4" strokeWidth={1.3} />
      <p className="text-[0.95rem] font-medium text-ink-400">
        {query ? `No results for "${query}"` : 'Nothing found with these filters.'}
      </p>
      <p className="mt-1 text-[0.8rem] text-ink-600">Try adjusting your search or filters.</p>
    </div>
  );
}

export function DiscoverView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Sync genre from URL query (?genre=...)
  const urlGenre = searchParams.get('genre');
  const urlSort = searchParams.get('sort') as FilterState['sort'] | null;

  const urlTab = searchParams.get('tab') as DiscoverTab | null;
  const [tab, setTab] = useState<DiscoverTab>(urlTab === 'stories' || urlTab === 'characters' ? urlTab : 'all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...DEFAULT_FILTERS,
    genres: urlGenre ? [urlGenre] : [],
    sort: urlSort ?? 'trending',
  }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [fadeKey, setFadeKey] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Debounce query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch stories
  const storiesQuery = useQuery({
    queryKey: ['stories-discover'],
    queryFn: fetchAllDiscoverStories,
    staleTime: 3 * 60_000,
  });

  // Fetch characters
  const charactersQuery = useQuery({
    queryKey: ['characters-discover'],
    queryFn: () => api.get<CharactersResponse>('/api/characters'),
    staleTime: 3 * 60_000,
  });

  const allItems = useMemo<DiscoverItem[]>(() => {
    const stories = (storiesQuery.data?.stories ?? []).map(storyToItem);
    const characters = (charactersQuery.data?.characters ?? [])
      .filter((c) => c.isPublic || c.isBuiltIn)
      .map(characterToItem);
    // Interleave: 3 stories, 1 character
    const mixed: DiscoverItem[] = [];
    let si = 0, ci = 0;
    while (si < stories.length || ci < characters.length) {
      for (let t = 0; t < 3 && si < stories.length; t++) mixed.push(stories[si++]!);
      if (ci < characters.length) mixed.push(characters[ci++]!);
    }
    return mixed;
  }, [storiesQuery.data, charactersQuery.data]);

  const availableGenres = useMemo(() => deriveGenres(allItems), [allItems]);

  // Filter + sort
  const filtered = useMemo<DiscoverItem[]>(() => {
    let list = allItems.slice();

    if (tab === 'stories') list = list.filter((i) => i.kind === 'story');
    if (tab === 'characters') list = list.filter((i) => i.kind === 'character');

    if (debouncedQuery) {
      list = list.filter((i) => {
        const hay = `${i.title} ${i.excerpt ?? ''} ${(i.tags ?? []).join(' ')}`.toLowerCase();
        return hay.includes(debouncedQuery);
      });
    }

    if (filters.genres.length > 0) {
      list = list.filter((i) => filters.genres.some((g) => (i.tags ?? []).includes(g)));
    }

    if (filters.language !== 'all') {
      list = list.filter((i) => i.language === filters.language);
    }

    if (filters.sort === 'most_read') {
      list.sort((a, b) => {
        const sa = (a.totalPlays ?? 0) + (a.totalChats ?? 0) * 2;
        const sb = (b.totalPlays ?? 0) + (b.totalChats ?? 0) * 2;
        return sb - sa;
      });
    } else if (filters.sort === 'top_rated') {
      list.sort((a, b) => (b.totalLikes ?? 0) - (a.totalLikes ?? 0));
    } else if (filters.sort === 'trending') {
      const now = Date.now();
      list.sort((a, b) => {
        const score = (item: DiscoverItem) => {
          const engagement = (item.totalPlays ?? 0) + (item.totalChats ?? 0) * 2 + (item.totalLikes ?? 0) * 3;
          const pub = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
          const daysSince = pub ? (now - pub) / 86_400_000 : 999;
          return engagement * (1 + Math.exp(-daysSince / 14));
        };
        return score(b) - score(a);
      });
    }
    // 'newest' — already sorted from API, no-op

    return list;
  }, [allItems, tab, debouncedQuery, filters]);

  const counts = useMemo(
    () => ({
      all: allItems.length,
      stories: allItems.filter((i) => i.kind === 'story').length,
      characters: allItems.filter((i) => i.kind === 'character').length,
    }),
    [allItems],
  );

  // Reset paging + animate on filter/tab/query change
  useEffect(() => {
    setVisible(PAGE_SIZE);
    setFadeKey((k) => k + 1);
  }, [tab, debouncedQuery, filters]);

  // Infinite scroll sentinel
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || visible >= filtered.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) {
          setLoading(true);
          const t = setTimeout(() => {
            setVisible((v) => Math.min(v + PAGE_SIZE, filtered.length));
            setLoading(false);
          }, 350);
          return () => clearTimeout(t);
        }
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [filtered.length, visible, loading]);

  // Active filter chips
  const chips = useMemo<ActiveChip[]>(() => {
    const list: ActiveChip[] = [];
    const sortLabel = SORT_OPTIONS.find((s) => s.key === filters.sort)?.label;
    if (sortLabel && filters.sort !== 'trending') list.push({ key: 'sort', label: sortLabel });
    if (filters.timeRange !== 'all') {
      const label = TIME_RANGES.find((t) => t.key === filters.timeRange)?.label;
      if (label) list.push({ key: 'timeRange', label });
    }
    if (filters.rating !== 'ANY') {
      const label = RATING_OPTIONS.find((r) => r.key === filters.rating)?.label;
      if (label) list.push({ key: 'rating', label });
    }
    if (filters.language !== 'all') {
      const label = LANGUAGE_OPTIONS.find((l) => l.key === filters.language)?.label;
      if (label) list.push({ key: 'language', label });
    }
    filters.genres.forEach((g) => list.push({ key: `genre:${g}`, label: g }));
    return list;
  }, [filters]);

  const removeChip = useCallback((key: string) => {
    if (key === 'sort') setFilters((f) => ({ ...f, sort: 'trending' }));
    else if (key === 'timeRange') setFilters((f) => ({ ...f, timeRange: 'all' }));
    else if (key === 'rating') setFilters((f) => ({ ...f, rating: 'ANY' }));
    else if (key === 'language') setFilters((f) => ({ ...f, language: 'all' }));
    else if (key.startsWith('genre:')) {
      const g = key.slice('genre:'.length);
      setFilters((f) => ({ ...f, genres: f.genres.filter((x) => x !== g) }));
    }
  }, []);

  const clearAll = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const visibleItems = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;
  const isInitialLoading = storiesQuery.isLoading || charactersQuery.isLoading;

  return (
    <section className="relative px-4 pb-16 pt-6 sm:px-8">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500/10 ring-1 ring-accent-400/30">
            <Compass className="h-3.5 w-3.5 text-accent-300" strokeWidth={2} />
          </span>
          <h1 className="font-display text-xl font-semibold tracking-wide text-ink-50 sm:text-2xl">
            Discover
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="hidden sm:inline-flex items-center gap-1.5 rounded-full neigo-glass px-3 py-1.5 text-[0.8rem] font-medium text-accent-300 ring-1 ring-white/8 transition-colors hover:text-ink-50 hover:ring-accent-400/40"
        >
          <Hash className="h-3 w-3" />
          Filter
        </button>
      </div>

      {/* Search bar */}
      <DiscoverSearchBar
        value={query}
        onChange={setQuery}
        onToggleFilters={() => setFiltersOpen((o) => !o)}
        filtersOpen={filtersOpen}
      />

      {/* Collapsible filter panel */}
      <div
        className={[
          'grid overflow-hidden transition-all duration-300',
          filtersOpen ? 'mt-3 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0',
        ].join(' ')}
      >
        <div className="min-h-0">
          <DiscoverFilterPanel
            state={filters}
            onChange={setFilters}
            availableGenres={availableGenres}
            onClose={() => setFiltersOpen(false)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4">
        <DiscoverTabBar active={tab} onChange={setTab} counts={counts} />
      </div>

      {/* Filter chips + results count */}
      <div className="mt-3">
        <DiscoverFilterChips
          resultsCount={filtered.length}
          chips={chips}
          onRemove={removeChip}
          onClearAll={clearAll}
        />
      </div>

      {/* Grid */}
      {isInitialLoading ? (
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <DiscoverCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div key={fadeKey} className="mt-5 animate-neigo-fade-in">
          {visibleItems.length === 0 ? (
            <EmptyState query={debouncedQuery} />
          ) : (
            <ul
              role="list"
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
            >
              {visibleItems.map((item) => (
                <li key={item.id}>
                  <DiscoverCard item={item} />
                </li>
              ))}

              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <li key={`sk-${i}`}>
                    <DiscoverCardSkeleton />
                  </li>
                ))}
            </ul>
          )}

          {/* Sentinel */}
          {hasMore ? (
            <div ref={sentinelRef} className="flex h-20 items-center justify-center">
              {loading ? (
                <span className="inline-flex items-center gap-2 rounded-full neigo-glass px-3 py-1.5 text-[0.8rem] text-accent-300 ring-1 ring-white/10">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent-400 shadow-[0_0_8px_rgba(236,72,153,0.8)]" />
                  Summoning more…
                </span>
              ) : null}
            </div>
          ) : visibleItems.length > 0 ? (
            <p className="mt-10 text-center text-[0.8rem] text-ink-600">
              All {filtered.length} results loaded.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
