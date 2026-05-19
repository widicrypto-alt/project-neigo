'use client';

import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Flame, Sparkles, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface DiscoverItem {
  id: string;
  kind: 'story' | 'character';
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  href: string;
  genre?: string | null;
  badge?: 'TRENDING' | 'FEATURED' | 'NEW' | null;
  isNsfw?: boolean;
  language?: string;
  tags?: string[];
  totalPlays?: number;
  totalChats?: number;
  totalLikes?: number;
  publishedAt?: string | null;
}

interface Props {
  item: DiscoverItem;
  variant?: 'story' | 'character';
}

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

function gradientFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length]!;
}

export function DiscoverCard({ item, variant }: Props) {
  const resolvedVariant = variant ?? item.kind;
  if (resolvedVariant === 'character') return <CharacterCard item={item} />;
  return <StoryCard item={item} />;
}

function StoryCard({ item }: { item: DiscoverItem }) {
  const genre = item.genre ?? item.tags?.[0] ?? 'Story';

  return (
    <Link href={item.href} aria-label={item.title}>
      <article
        className={cn(
          'group relative w-full overflow-hidden rounded-xl neigo-glass ring-1 ring-white/10',
          'aspect-[9/16] transition-all duration-300',
          'hover:-translate-y-1 hover:scale-[1.02] hover:ring-accent-400/45',
          'hover:shadow-[0_0_0_1px_rgba(236,72,153,0.35),0_14px_38px_-14px_rgba(236,72,153,0.45)]',
        )}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${gradientFor(item.id)}`} aria-hidden="true" />
        {item.coverUrl && (
          <Image
            src={item.coverUrl}
            alt={`Artwork for ${item.title}`}
            fill
            sizes="180px"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
        )}

        {/* Top-left badges */}
        <div className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1">
          <span className="flex h-4 w-4 items-center justify-center rounded-md bg-black/50 text-white" title="Story">
            <BookOpen className="h-2.5 w-2.5" />
          </span>
          {item.badge === 'TRENDING' && (
            <span className="flex h-4 w-4 items-center justify-center rounded-md bg-amber-500/80 text-white" title="Trending">
              <Flame className="h-2.5 w-2.5" />
            </span>
          )}
          {item.badge === 'FEATURED' && (
            <span className="flex h-4 w-4 items-center justify-center rounded-md bg-accent-600/80 text-white" title="Featured">
              <Sparkles className="h-2.5 w-2.5" />
            </span>
          )}
        </div>

        {/* Top-right: NEW + NSFW */}
        <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1">
          {item.badge === 'NEW' && (
            <span className="rounded-full bg-emerald-500/80 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]">
              NEW
            </span>
          )}
          {item.isNsfw && (
            <span className="rounded-md bg-red-600/85 px-1 py-0.5 text-[0.55rem] font-extrabold tracking-wide text-white">
              18+
            </span>
          )}
        </div>

        {/* Bottom gradient */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{ height: '58%', background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.65) 55%, transparent 100%)' }}
        />

        {/* Bottom content */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col" style={{ padding: 8 }}>
          <h3
            className="line-clamp-2 font-display text-white"
            style={{ fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.2 }}
          >
            {item.title}
          </h3>
          <div style={{ marginTop: 3 }}>
            <span
              className="inline-block font-semibold uppercase"
              style={{
                fontSize: '0.55rem', padding: '1px 6px', borderRadius: 999,
                background: 'rgba(123,92,240,0.28)', border: '1px solid rgba(123,92,240,0.5)',
                color: '#d7c8ff', letterSpacing: '0.08em', lineHeight: 1.2,
              }}
            >
              {genre}
            </span>
          </div>

          <div className="overflow-hidden transition-all duration-300 ease-out max-h-0 group-hover:max-h-10" style={{ marginTop: 3 }}>
            <p className="line-clamp-2" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.52)', lineHeight: 1.3 }}>
              {item.excerpt ?? ''}
            </p>
          </div>
        </div>
      </article>
    </Link>
  );
}

function CharacterCard({ item }: { item: DiscoverItem }) {
  return (
    <Link href={item.href} aria-label={item.title}>
      <article
        className={cn(
          'group relative w-full overflow-hidden rounded-xl neigo-glass ring-1 ring-white/10',
          'aspect-[9/16] transition-all duration-300',
          'hover:-translate-y-1 hover:scale-[1.02]',
          'hover:shadow-[0_0_0_1px_rgba(123,92,240,0.45),0_14px_38px_-14px_rgba(123,92,240,0.45)]',
          'hover:ring-violet-400/40',
        )}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${gradientFor(item.id)}`} aria-hidden="true" />
        {item.coverUrl ? (
          <Image
            src={item.coverUrl}
            alt={item.title}
            fill
            sizes="180px"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <UserRound className="h-16 w-16 text-white/20" strokeWidth={1} />
          </div>
        )}

        {/* Type badge */}
        <div className="absolute left-1.5 top-1.5 z-10">
          <span className="flex h-4 w-4 items-center justify-center rounded-md bg-violet-500/80 text-white" title="Character">
            <UserRound className="h-2.5 w-2.5" />
          </span>
        </div>

        {/* Bottom overlay */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{ height: '50%', background: 'linear-gradient(to top, rgba(0,0,0,0.90) 0%, transparent 100%)' }}
        />
        <div className="absolute bottom-0 left-0 right-0 flex flex-col" style={{ padding: 8 }}>
          <h3
            className="line-clamp-1 font-display text-white font-bold"
            style={{ fontSize: '0.85rem', lineHeight: 1.2 }}
          >
            {item.title}
          </h3>
          {item.excerpt && (
            <p
              className="mt-0.5 line-clamp-2 text-white/65"
              style={{ fontSize: '0.65rem', lineHeight: 1.3 }}
            >
              {item.excerpt}
            </p>
          )}
        </div>
      </article>
    </Link>
  );
}

export function DiscoverCardSkeleton() {
  return (
    <div
      className="w-full animate-pulse rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06]"
      style={{ aspectRatio: '9 / 16' }}
    />
  );
}
