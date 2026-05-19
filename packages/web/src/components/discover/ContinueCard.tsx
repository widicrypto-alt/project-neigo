'use client';

/**
 * PLANDESIGNv1 §3.A — Continue strip card.
 *
 * Landscape 16:9 thumbnail with title, last-activity hint, and format
 * badge. Designed to live inside a horizontal scroll rail at ~280px wide.
 */

import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Drama } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ContinueFormat = 'rp' | 'vn';

export interface ContinueItem {
  /** Stable key. Either sessionId (RP) or runId (VN). */
  key: string;
  href: string;
  format: ContinueFormat;
  title: string;
  /** Last message excerpt (RP) or scene context (VN). */
  excerpt?: string | null;
  coverImageUrl?: string | null;
  /** ISO timestamp of last activity, used by callers for sort. */
  lastOpenedAt: string;
  /** Compact progress hint. e.g. "14 turns in" / "Scene 3 of 7" */
  progressLabel?: string | null;
}

function gradientFor(id: string): { background: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const seed = ((h % 360) + 360) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${seed} 40% 22%) 0%, hsl(${(seed + 48) % 360} 38% 12%) 100%)`,
  };
}

export function ContinueCard({ item }: { item: ContinueItem }) {
  const FormatIcon = item.format === 'vn' ? BookOpen : Drama;
  const formatLabel = item.format === 'vn' ? 'VN' : 'RP';
  const gradient = item.coverImageUrl ? undefined : gradientFor(item.key);

  return (
    <Link
      href={item.href}
      className={cn(
        'group relative block w-[280px] shrink-0 snap-start overflow-hidden',
        'rounded-token-lg border border-white/[0.06] bg-night-surface',
        'transition-fast hover:border-white/[0.14]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60',
      )}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden" style={gradient}>
        {item.coverImageUrl ? (
          <Image
            src={item.coverImageUrl}
            alt=""
            fill
            sizes="280px"
            className="object-cover transition-fast group-hover:scale-[1.03]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
        <span
          className={cn(
            'absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full',
            'bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
            'text-white backdrop-blur-sm ring-1 ring-white/15',
          )}
        >
          <FormatIcon size={10} strokeWidth={2.25} />
          {formatLabel}
        </span>
      </div>

      <div className="flex flex-col gap-1 p-3">
        <h3 className="line-clamp-1 font-display text-base text-ink-50">{item.title}</h3>
        {item.excerpt ? (
          <p className="line-clamp-1 text-xs text-ink-300">{item.excerpt}</p>
        ) : null}
        {item.progressLabel ? (
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-400">
            {item.progressLabel}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
