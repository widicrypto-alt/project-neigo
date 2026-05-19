'use client';

import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * <Chip /> — compact selectable/removable label.
 *
 * Used for lorebook keywords (F1, wk4), persona switcher (G1c, wk9),
 * CYOA choices (F3, wk6), discover mood tags (onboarding taste step).
 *
 * Variants:
 *  - 'subtle'   (default, neutral)
 *  - 'accent'   (brand, for "selected" state)
 *  - 'outline'  (clear bg, border only)
 *  - 'ghost'    (no chrome until hover)
 *
 * Size 'sm' 28px hit zone (padded with `py-1.5` so visual ≥ 28, touch ≥ 44 via
 * expanded invisible tap area is caller's job on mobile-crowded rails).
 */

export type ChipVariant = 'subtle' | 'accent' | 'outline' | 'ghost';
export type ChipSize = 'sm' | 'md';

const VARIANTS: Record<ChipVariant, string> = {
  subtle:
    'bg-white/[0.06] text-ink-100 border border-white/[0.08] hover:bg-white/[0.1]',
  accent:
    'bg-accent-500/15 text-accent-100 border border-accent-500/40 hover:bg-accent-500/25',
  outline:
    'bg-transparent text-ink-100 border border-white/[0.15] hover:border-white/[0.3]',
  ghost:
    'bg-transparent text-ink-300 border border-transparent hover:bg-white/[0.06] hover:text-ink-50',
};

const SIZES: Record<ChipSize, string> = {
  sm: 'text-[11px] px-2.5 py-1 gap-1',
  md: 'text-xs px-3 py-1.5 gap-1.5',
};

export interface ChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: React.ReactNode;
  variant?: ChipVariant;
  size?: ChipSize;
  selected?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Show × affordance that calls `onRemove`. */
  onRemove?: () => void;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { label, variant = 'subtle', size = 'md', selected, leading, trailing, onRemove, className, type = 'button', ...rest },
  ref,
) {
  const effectiveVariant = selected ? 'accent' : variant;
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center rounded-full font-medium uppercase tracking-wider transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[effectiveVariant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {leading}
      <span className="truncate">{label}</span>
      {trailing}
      {onRemove && (
        <span
          role="button"
          tabIndex={-1}
          aria-label="Hapus"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 -mr-0.5 text-ink-400 hover:text-ink-100 leading-none"
        >
          ×
        </span>
      )}
    </button>
  );
});
