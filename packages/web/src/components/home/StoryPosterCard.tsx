'use client';

import Link from 'next/link';
import Image from 'next/image';
import { BookOpen } from 'lucide-react';

export interface StoryItem {
  id: string;
  title: string;
  synopsis: string | null;
  coverImageUrl: string | null;
  requiredTier: string;
  publishedAt: string | null;
  metadata: { tags?: string[]; genre?: string; estimatedMinutes?: number };
  cast?: Array<{ characterId?: string; displayName?: string }>;
}

function gradientFor(id: string): string {
  const GRADIENTS = [
    'from-purple-900/80 to-ink-900',
    'from-rose-900/80 to-ink-900',
    'from-sky-900/80 to-ink-900',
    'from-emerald-900/80 to-ink-900',
    'from-amber-900/80 to-ink-900',
    'from-fuchsia-900/80 to-ink-900',
    'from-cyan-900/80 to-ink-900',
    'from-orange-900/80 to-ink-900',
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

interface Props {
  story: StoryItem;
  priority?: boolean;
}

export function StoryPosterCard({ story, priority }: Props) {
  const genre =
    story.metadata?.genre ?? story.metadata?.tags?.[0] ?? 'Story';
  const badge = tierBadge(story.requiredTier);

  return (
    <Link
      href={`/stories/${story.id}`}
      aria-label={story.title}
    >
      <article
        className="group relative w-full overflow-hidden rounded-xl bg-white/4 border border-white/10 transition-all duration-250 ease-out hover:scale-[1.04] hover:shadow-[0_0_18px_rgba(236,72,153,0.35)] hover:border-accent-500/35"
        style={{ aspectRatio: '9 / 16' }}
      >
        {/* Cover */}
        <div className={`absolute inset-0 bg-linear-to-br ${gradientFor(story.id)}`} aria-hidden="true" />
        {story.coverImageUrl ? (
          <Image
            src={story.coverImageUrl}
            alt={`Cover of ${story.title}`}
            fill
            sizes="180px"
            className="object-cover"
            priority={priority}
          />
        ) : null}

        {/* Top row: type chip + badge */}
        <div className="absolute left-2 right-2 top-2 z-10 flex items-center justify-between">
          <span
            className="flex items-center justify-center rounded-full backdrop-blur-sm"
            style={{ width: 22, height: 22, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.14)' }}
            title="Story"
          >
            <BookOpen style={{ width: 12, height: 12 }} className="text-white" />
          </span>
          {badge && (
            <span
              className={`${badge.bg} font-bold uppercase text-white`}
              style={{ fontSize: '0.55rem', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.06em', lineHeight: 1.1 }}
            >
              {badge.label}
            </span>
          )}
        </div>

        {/* Bottom gradient + content */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{ height: '58%', background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 60%, transparent 100%)' }}
        />
        <div className="absolute bottom-0 left-0 right-0 flex flex-col" style={{ padding: 8 }}>
          {/* Title */}
          <h3
            className="line-clamp-2 font-display text-white text-pretty"
            style={{ fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.2, marginTop: 3 }}
          >
            {story.title}
          </h3>

          {/* Genre pill */}
          <div style={{ marginTop: 3 }}>
            <span
              className="inline-block font-semibold uppercase"
              style={{
                fontSize: '0.55rem',
                padding: '1px 6px',
                borderRadius: 999,
                background: 'rgba(123,92,240,0.28)',
                border: '1px solid rgba(123,92,240,0.5)',
                color: '#d7c8ff',
                letterSpacing: '0.08em',
                lineHeight: 1.2,
              }}
            >
              {genre}
            </span>
          </div>

          {/* Hover description */}
          <div
            className="overflow-hidden transition-all duration-300 ease-out max-h-0 group-hover:max-h-10"
            style={{ marginTop: 3 }}
          >
            <p className="line-clamp-2" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.52)', lineHeight: 1.3 }}>
              {story.synopsis ?? ''}
            </p>
          </div>
        </div>
      </article>
    </Link>
  );
}
