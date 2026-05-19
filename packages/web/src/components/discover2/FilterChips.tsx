'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ActiveChip {
  key: string;
  label: string;
}

interface Props {
  resultsCount: number;
  chips: ActiveChip[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}

export function DiscoverFilterChips({ resultsCount, chips, onRemove, onClearAll }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[0.8rem] text-ink-500 tabular-nums">
        {resultsCount.toLocaleString()} results
      </span>

      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip.key)}
          className="inline-flex items-center gap-1.5 rounded-full neigo-glass ring-1 ring-white/[0.08] px-2.5 py-1 text-[0.78rem] font-medium text-ink-200 transition-colors hover:text-ink-50 hover:ring-accent-400/40"
        >
          {chip.label}
          <X className="h-3 w-3 text-ink-500" />
        </button>
      ))}

      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-[0.78rem] font-medium text-ink-500 hover:text-ink-200 transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
