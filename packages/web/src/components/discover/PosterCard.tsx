'use client';

/**
 * REDESIGNv2 D2 — Generic 2:3 poster card.
 *
 * Lower-denominator alternative to CharacterPosterCard / StoryCoverCard
 * for rails that mix subjects (characters, stories, lorebooks). Accepts
 * a neutral item shape so any discovery source can feed it.
 */

import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/cn';

export interface PosterItem {
  id: string;
  href: string;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  badge?: string;
}

interface Props {
  item: PosterItem;
  /** Width in px for the outer aspect box. Default 168 (rail-sized). */
  width?: number;
  className?: string;
}

export function PosterCard({ item, width = 168, className }: Props) {
  return (
    <Link
      href={item.href}
      className={cn(
        'group relative flex shrink-0 flex-col gap-2 transition-fast hover:-translate-y-0.5',
        className,
      )}
      style={{ width }}
    >
      <div
        className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]"
        style={{ aspectRatio: '2 / 3' }}
      >
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            sizes={`${width}px`}
            className="object-cover transition-slow group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-900/30 via-fuchsia-900/20 to-slate-900/40 text-3xl text-ink-500">
            {item.title.slice(0, 1).toUpperCase()}
          </div>
        )}
        {item.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-ink-950/80 px-2 py-0.5 text-[10px] font-medium text-ink-100 backdrop-blur">
            {item.badge}
          </span>
        )}
      </div>
      <div className="px-0.5">
        <p className="line-clamp-1 text-sm font-medium text-ink-100">{item.title}</p>
        {item.subtitle && (
          <p className="line-clamp-1 text-[11px] text-ink-400">{item.subtitle}</p>
        )}
      </div>
    </Link>
  );
}
