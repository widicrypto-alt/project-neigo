'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { StoryLandscapeCard } from './StoryLandscapeCard';
import type { StoryItem } from './StoryPosterCard';

interface Props {
  items: StoryItem[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

export function StoriesInfiniteGrid({
  items,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage && !isFetchingRef.current) {
          isFetchingRef.current = true;
          fetchNextPage();
        }
      },
      { rootMargin: '200px 0px', threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Reset fetch guard when fetch completes
  useEffect(() => {
    if (!isFetchingNextPage) {
      isFetchingRef.current = false;
    }
  }, [isFetchingNextPage]);

  return (
    <section aria-label="Discover more stories" className="relative px-6 py-5 sm:px-8">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 ring-1 ring-violet-400/30">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" strokeWidth={2} />
          </span>
          <h2 className="font-display text-xl font-semibold tracking-wide text-ink-50 sm:text-2xl">
            <span className="text-violet-400">Discover</span> More
          </h2>
        </div>
        <p className="mt-1 text-[0.85rem] text-ink-500">
          Keep scrolling — the library rewrites itself as you go.
        </p>
      </div>

      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {items.map((s) => (
          <StoryLandscapeCard key={s.id} story={s} />
        ))}
      </div>

      <div
        ref={sentinelRef}
        aria-hidden="true"
        className="mt-6 flex items-center justify-center py-6"
        role="status"
        aria-live="polite"
      >
        {isFetchingNextPage ? (
          <span className="inline-flex items-center gap-2 rounded-full neigo-glass px-4 py-2 text-[0.8rem] text-accent-300 ring-1 ring-white/10">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-400" />
            Summoning more stories…
          </span>
        ) : hasNextPage ? (
          <span className="inline-flex items-center gap-2 rounded-full neigo-glass px-4 py-2 text-[0.8rem] text-ink-500 ring-1 ring-white/6">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-600 animate-pulse" />
            Scroll for more
          </span>
        ) : (
          <p className="text-[0.8rem] text-ink-600">All {items.length} stories loaded.</p>
        )}
      </div>
    </section>
  );
}
