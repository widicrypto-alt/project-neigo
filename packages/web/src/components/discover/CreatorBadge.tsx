'use client';
import Link from 'next/link';
import { cn } from '@/lib/cn';

interface Props {
  handle: string;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Small "@handle" pill that links to a creator's public profile.
 * Used on CharacterPosterCard and story pages.
 */
export function CreatorBadge({ handle, className, size = 'sm' }: Props) {
  return (
    <Link
      href={`/creators/${handle}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-flex items-center rounded-full border border-night-line/80 bg-night-surface/70 text-ink-300 transition-fast ease-standard hover:border-violet-accent/60 hover:text-ink-100',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
        className,
      )}
    >
      @{handle}
    </Link>
  );
}
