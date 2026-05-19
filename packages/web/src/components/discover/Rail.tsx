'use client';

/**
 * PLANBv5 D2 — Unified Rail primitive.
 *
 * Generic horizontal snap-scroll rail. Designed to replace both the
 * bespoke home scrollers and to supplement DiscoverRail. Unlike
 * DiscoverRail (poster-tuned, CSS-sized via [&>*] selectors), this
 * component lets the caller choose per-item size via the `itemSize`
 * token — enabling chip/lg/xl rails without stylesheet forks.
 *
 * Empty state is a first-class prop so pages never have to fork the
 * rail render for "no items" cases.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { POSTER_SIZES, RAIL_GAP, type PosterSize, type RailGap } from '@/lib/design-tokens';

export interface RailProps<T> {
  /** Analytics / URL anchor id. */
  id?: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  viewAllHref?: string;
  itemSize?: PosterSize;
  gap?: RailGap;
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey: (item: T, index: number) => string;
  emptyState?: React.ReactNode;
  loading?: boolean;
  skeletonCount?: number;
  className?: string;
  /** When false the whole section is skipped (use for letters/etc). */
  renderWhen?: boolean;
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

export function Rail<T>({
  id,
  title,
  subtitle,
  icon,
  viewAllHref,
  itemSize = 'md',
  gap = 'normal',
  items,
  renderItem,
  getKey,
  emptyState,
  loading,
  skeletonCount = 6,
  className,
  renderWhen = true,
}: RailProps<T>) {
  const reduce = useReducedMotion();
  if (!renderWhen) return null;

  const size = POSTER_SIZES[itemSize];
  const gapClass = RAIL_GAP[gap];

  const showEmpty = !loading && items.length === 0;
  if (showEmpty && !emptyState) return null;

  return (
    <section id={id} className={cn('flex flex-col gap-3', className)}>
      <header className="flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg text-ink-50 sm:text-xl">
            {icon}
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-xs text-ink-400 sm:text-sm">{subtitle}</p> : null}
        </div>
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="flex items-center gap-1 text-xs text-ink-300 transition-fast hover:text-ink-100 sm:text-sm"
          >
            Lihat semua <ArrowRight size={14} />
          </Link>
        ) : null}
      </header>

      {showEmpty ? (
        <div className="rounded-token-lg border border-dashed border-night-line bg-night-surface2/40 p-5 text-center text-sm text-ink-400">
          {emptyState}
        </div>
      ) : (
        <motion.div
          variants={reduce ? undefined : containerVariants}
          initial={reduce ? false : 'hidden'}
          animate="show"
          className={cn(
            'flex overflow-x-auto pb-3 pl-1 pr-4',
            gapClass,
            'snap-x snap-mandatory',
            'scrollbar-thin scrollbar-thumb-night-line scrollbar-track-transparent',
          )}
        >
          {loading
            ? Array.from({ length: skeletonCount }).map((_, i) => (
                <div
                  key={`sk-${i}`}
                  className={cn(
                    'shrink-0 animate-pulse rounded-token-lg bg-white/[0.04]',
                    size.className,
                  )}
                />
              ))
            : items.map((item, index) => (
                <div
                  key={getKey(item, index)}
                  className={cn('shrink-0 snap-start', size.className)}
                >
                  {renderItem(item, index)}
                </div>
              ))}
        </motion.div>
      )}
    </section>
  );
}
