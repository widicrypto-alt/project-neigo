'use client';

/**
 * REDESIGNv2 D2 — Genre filter chip.
 *
 * Identical shape to LanguageChip but for character/story tags. Label is
 * free text (user-authored tags), so we render with `textContent` via
 * React; no dangerouslySetInnerHTML.
 */

import { cn } from '@/lib/cn';

interface Props {
  genre: string;
  active: boolean;
  onClick: (g: string) => void;
  className?: string;
}

export function GenreChip({ genre, active, onClick, className }: Props) {
  return (
    <button
      type="button"
      onClick={() => onClick(genre)}
      data-active={active}
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-fast',
        active
          ? 'border-fuchsia-400/70 bg-fuchsia-400/15 text-ink-50'
          : 'border-white/[0.08] bg-white/[0.02] text-ink-400 hover:border-white/[0.15] hover:text-ink-200',
        className,
      )}
    >
      {genre}
    </button>
  );
}
