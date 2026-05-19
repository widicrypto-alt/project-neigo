'use client';

/**
 * PLANDESIGNv1 §3.A — Format filter (segmented).
 * Single-select. Lives in the top rail next to the page title.
 */

import { BookOpen, Drama, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';

export type FormatFilterValue = 'all' | 'rp' | 'vn';

const OPTIONS: Array<{ key: FormatFilterValue; label: string; icon: React.ElementType }> = [
  { key: 'all', label: 'All', icon: Sparkles },
  { key: 'rp', label: 'Roleplay', icon: Drama },
  { key: 'vn', label: 'Visual Novels', icon: BookOpen },
];

interface Props {
  value: FormatFilterValue;
  onChange: (v: FormatFilterValue) => void;
  className?: string;
}

export function FormatFilter({ value, onChange, className }: Props) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-white/[0.08]',
        'bg-white/[0.03] p-1',
        className,
      )}
      role="radiogroup"
      aria-label="Filter by format"
    >
      {OPTIONS.map(({ key, label, icon: Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-fast',
              active
                ? 'bg-white/[0.10] text-ink-50 shadow-sm'
                : 'text-ink-300 hover:text-ink-100',
            )}
          >
            <Icon size={12} strokeWidth={2.25} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
