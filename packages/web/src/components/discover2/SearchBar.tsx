'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onToggleFilters: () => void;
  filtersOpen: boolean;
}

export function DiscoverSearchBar({ value, onChange, onToggleFilters, filtersOpen }: Props) {
  return (
    <div className="relative flex items-center gap-2">
      <div
        className={cn(
          'group relative flex-1 rounded-2xl transition-all duration-200',
          'neigo-glass ring-1 ring-white/[0.08]',
          'focus-within:ring-accent-400/50',
          'focus-within:shadow-[0_0_0_1px_rgba(236,72,153,0.35),0_0_36px_-8px_rgba(236,72,153,0.4)]',
        )}
      >
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 transition-colors group-focus-within:text-accent-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search characters, stories, worlds…"
          aria-label="Search characters, stories, or worlds"
          className="w-full rounded-2xl bg-transparent py-3.5 pl-11 pr-10 text-[0.95rem] text-ink-50 placeholder:text-ink-500 outline-none"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange('')}
            className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-white/5 hover:text-ink-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Toggle filters"
        aria-expanded={filtersOpen}
        onClick={onToggleFilters}
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all',
          filtersOpen
            ? 'bg-accent-500/15 ring-1 ring-accent-400/50 shadow-[0_0_18px_rgba(236,72,153,0.25)] text-ink-50'
            : 'neigo-glass ring-1 ring-white/[0.08] text-ink-500 hover:text-ink-100 hover:bg-white/[0.06]',
        )}
      >
        <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}
