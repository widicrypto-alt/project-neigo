'use client';

import Link from 'next/link';
import Image from 'next/image';
import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { posterFor } from '@/lib/poster';
import type { StoryItem } from './StoryPosterCard';

function gradientFor(id: string): string {
  const GRADIENTS = [
    'from-purple-900 via-[#0e0c1c] to-[#07080f]',
    'from-rose-900 via-[#1a0c10] to-[#07080f]',
    'from-sky-900 via-[#0c131a] to-[#07080f]',
    'from-emerald-900 via-[#0c1a11] to-[#07080f]',
    'from-amber-900 via-[#1a140c] to-[#07080f]',
    'from-fuchsia-900 via-[#160c1a] to-[#07080f]',
    'from-cyan-900 via-[#0c161a] to-[#07080f]',
    'from-orange-900 via-[#1a110c] to-[#07080f]',
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length]!;
}

function tierBadge(tier: string): { bg: string; label: string } | null {
  if (tier === 'FREE') return null;
  if (tier === 'FOUNDER') return { bg: 'bg-amber-500', label: 'FOUNDER' };
  if (tier === 'PAID') return { bg: 'bg-accent-600', label: 'PRO' };
  return null;
}

function isAdultContent(story: StoryItem): boolean {
  const tags = story.metadata?.tags ?? [];
  return tags.some((t) => ['18+', 'nsfw', 'adult', 'mature'].includes(t.toLowerCase()));
}

interface Props {
  story: StoryItem;
  priority?: boolean;
  className?: string;
}

export function StoryLandscapeCard({ story, priority, className }: Props) {
  const genre = story.metadata?.genre ?? story.metadata?.tags?.[0] ?? null;
  const badge = tierBadge(story.requiredTier);
  const adult = isAdultContent(story);
  const coverSrc = story.coverImageUrl ?? posterFor(story.id);
  const creatorLabel = story.cast?.[0]?.displayName ?? null;

  return (
    <Link href={`/stories/${story.id}`} aria-label={story.title} className="block">
      <article
        className={cn(
          'group relative flex overflow-hidden rounded-xl',
          'border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl',
          'transition-all duration-200 ease-out',
          'hover:border-accent-500/40 hover:shadow-[0_0_22px_rgba(236,72,153,0.18)] hover:bg-white/[0.06]',
          className,
        )}
      >
        {/* Left: Portrait thumbnail */}
        <div className="relative shrink-0 overflow-hidden rounded-l-xl" style={{ width: 72 }}>
          <div
            className={`absolute inset-0 bg-linear-to-br ${gradientFor(story.id)}`}
            aria-hidden="true"
          />
          <Image
            src={coverSrc}
            alt={`Cover of ${story.title}`}
            fill
            sizes="72px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.06]"
            priority={priority}
          />

          <span
            className="absolute left-1.5 top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full"
            style={{ background: 'rgba(0,0,0,0.58)', border: '1px solid rgba(255,255,255,0.13)' }}
          >
            <BookOpen className="h-2.5 w-2.5 text-white" strokeWidth={2} />
          </span>

          {adult && (
            <span
              className="absolute right-1 top-1.5 rounded bg-rose-600 font-bold text-white"
              style={{ fontSize: '0.55rem', padding: '1px 4px', lineHeight: 1.4, letterSpacing: '0.04em' }}
            >
              18+
            </span>
          )}
        </div>

        {/* Right: Content with generous spacing */}
        <div className="flex min-w-0 flex-1 flex-col justify-between px-3.5 py-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 font-display text-[0.85rem] font-bold leading-snug text-ink-50">
              {story.title}
            </h3>
            {badge && (
              <span
                className={`${badge.bg} shrink-0 font-bold uppercase text-white`}
                style={{
                  fontSize: '0.52rem',
                  padding: '2px 5px',
                  borderRadius: 999,
                  letterSpacing: '0.07em',
                  lineHeight: 1.1,
                  marginTop: 1,
                }}
              >
                {badge.label}
              </span>
            )}
          </div>

          <p className="mt-1.5 line-clamp-2 text-[0.72rem] leading-relaxed text-ink-400">
            {story.synopsis ?? 'No description available.'}
          </p>

          <div className="mt-2 flex items-center justify-between gap-2">
            {genre ? (
              <span
                className="inline-block font-semibold uppercase"
                style={{
                  fontSize: '0.58rem',
                  padding: '1.5px 7px',
                  borderRadius: 999,
                  background: 'rgba(123,92,240,0.22)',
                  border: '1px solid rgba(123,92,240,0.45)',
                  color: '#c4b0ff',
                  letterSpacing: '0.07em',
                  lineHeight: 1.2,
                }}
              >
                {genre}
              </span>
            ) : (
              <span />
            )}
            {creatorLabel && (
              <span
                className="truncate text-[0.68rem] text-ink-600"
                style={{ maxWidth: 80 }}
              >
                @{creatorLabel}
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
