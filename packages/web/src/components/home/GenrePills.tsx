'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Compass } from 'lucide-react';

interface Props {
  genres: string[];
}

export function GenrePillsSkeleton() {
  return (
    <section aria-label="Explore by genre" className="relative px-6 py-4 sm:px-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500/10 ring-1 ring-accent-400/30">
          <Compass className="h-3.5 w-3.5 text-accent-300" strokeWidth={2} />
        </span>
        <div className="h-6 w-40 animate-pulse rounded bg-white/10" />
      </div>
      <div className="neigo-scroll -mx-2 flex snap-x snap-mandatory items-center gap-2 overflow-x-auto px-2 pb-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 w-20 animate-pulse rounded-full bg-white/8" />
        ))}
      </div>
    </section>
  );
}

export function GenrePills({ genres }: Props) {
  const searchParams = useSearchParams();
  if (genres.length === 0) {
    return <GenrePillsSkeleton />;
  }
  const urlGenre = searchParams?.get('genre') ?? null;
  const active = urlGenre;

  return (
    <section aria-label="Explore by genre" className="relative px-6 py-4 sm:px-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500/10 ring-1 ring-accent-400/30">
          <Compass className="h-3.5 w-3.5 text-accent-300" strokeWidth={2} />
        </span>
        <h2 className="font-display text-xl font-semibold tracking-wide text-ink-50 sm:text-2xl">
          Explore by <span className="text-accent-300">Genre</span>
        </h2>
      </div>

      <div className="neigo-scroll -mx-2 flex snap-x snap-mandatory items-center gap-2 overflow-x-auto px-2 pb-2">
        {genres.map((g) => {
          const isActive = g === active;
          return (
            <Link
              key={g}
              href={`/discover?genre=${encodeURIComponent(g)}`}
              aria-pressed={isActive}
              className="relative shrink-0 snap-start rounded-full px-3.5 py-1.5 text-[0.85rem] font-medium transition-all duration-200"
              style={
                isActive
                  ? {
                      background:
                        'linear-gradient(110deg, rgba(236,72,153,0.9) 0%, rgba(168,85,247,0.85) 55%, rgba(240,165,0,0.75) 140%)',
                      border: '1px solid rgba(240,165,0,0.40)',
                      color: '#f0f0ff',
                      boxShadow: '0 0 22px rgba(236,72,153,0.4)',
                    }
                  : {
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      color: '#a78bfa',
                    }
              }
            >
              {g}
            </Link>
          );
        })}
      </div>
    </section>
  );
}