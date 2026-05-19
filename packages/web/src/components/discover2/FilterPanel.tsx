'use client';

import { cn } from '@/lib/cn';

export type SortKey = 'trending' | 'newest' | 'most_read' | 'top_rated';
export type Rating = 'SAFE' | 'MATURE';
export type Language = 'id' | 'en' | 'ja';
export type TimeRangeKey = 'all' | 'week' | 'month' | 'year';

export interface FilterState {
  sort: SortKey;
  genres: string[];
  rating: Rating | 'ANY';
  language: Language | 'all';
  timeRange: TimeRangeKey;
}

export const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'trending', label: 'Trending' },
  { key: 'newest', label: 'Newest' },
  { key: 'most_read', label: 'Most Read' },
  { key: 'top_rated', label: 'Top Rated' },
];

export const RATING_OPTIONS: Array<{ key: Rating; label: string }> = [
  { key: 'SAFE', label: 'Safe' },
  { key: 'MATURE', label: '18+' },
];

export const LANGUAGE_OPTIONS: Array<{ key: Language | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'id', label: 'Indonesian' },
  { key: 'en', label: 'English' },
  { key: 'ja', label: 'Japanese' },
];

export const TIME_RANGES: Array<{ key: TimeRangeKey; label: string }> = [
  { key: 'all', label: 'All Time' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
];

interface Props {
  state: FilterState;
  onChange: (next: FilterState) => void;
  availableGenres?: string[];
  onClose: () => void;
}

function pillClass(isActive: boolean) {
  return cn(
    'rounded-full px-3 py-1.5 text-[0.8rem] transition-all duration-150',
    isActive
      ? 'bg-gradient-to-r from-accent-500 to-violet-500 text-white ring-1 ring-accent-400/50 shadow-[0_0_14px_rgba(236,72,153,0.35)]'
      : 'neigo-glass ring-1 ring-white/[0.07] text-ink-300 hover:text-ink-50 hover:ring-accent-400/35 hover:bg-accent-500/8',
  );
}

export function DiscoverFilterPanel({ state, onChange, availableGenres = [], onClose: _onClose }: Props) {
  const toggleGenre = (g: string) => {
    const next = state.genres.includes(g)
      ? state.genres.filter((x) => x !== g)
      : [...state.genres, g];
    onChange({ ...state, genres: next });
  };

  return (
    <div
      role="dialog"
      aria-label="Filters"
      className="rounded-2xl neigo-glass-strong ring-1 ring-white/[0.09] p-4 sm:p-5 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)]"
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {/* Sort */}
        <section aria-label="Sort by">
          <h3 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-ink-500">Sort by</h3>
          <div className="flex flex-wrap gap-1.5">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onChange({ ...state, sort: opt.key })}
                className={pillClass(state.sort === opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Content rating */}
        <section aria-label="Content rating">
          <h3 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-ink-500">Content rating</h3>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => onChange({ ...state, rating: 'ANY' })} className={pillClass(state.rating === 'ANY')}>
              Any
            </button>
            {RATING_OPTIONS.map((r) => (
              <button key={r.key} type="button" onClick={() => onChange({ ...state, rating: r.key })} className={pillClass(state.rating === r.key)}>
                {r.label}
              </button>
            ))}
          </div>
        </section>

        {/* Language */}
        <section aria-label="Language">
          <h3 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-ink-500">Language</h3>
          <div className="flex flex-wrap gap-1.5">
            {LANGUAGE_OPTIONS.map((l) => (
              <button key={l.key} type="button" onClick={() => onChange({ ...state, language: l.key })} className={pillClass(state.language === l.key)}>
                {l.label}
              </button>
            ))}
          </div>
        </section>

        {/* Time range */}
        <section aria-label="Time range">
          <h3 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-ink-500">Time range</h3>
          <div className="flex flex-wrap gap-1.5">
            {TIME_RANGES.map((t) => (
              <button key={t.key} type="button" onClick={() => onChange({ ...state, timeRange: t.key })} className={pillClass(state.timeRange === t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Genres — full width, only shown when we have genres */}
      {availableGenres.length > 0 && (
        <section aria-label="Genre" className="mt-5 border-t border-white/[0.06] pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-500">Genre</h3>
            {state.genres.length > 0 && (
              <button
                type="button"
                onClick={() => onChange({ ...state, genres: [] })}
                className="text-[0.7rem] font-medium text-accent-300 hover:text-ink-50"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableGenres.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => toggleGenre(g)}
                className={pillClass(state.genres.includes(g))}
              >
                {g}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
