'use client';

/**
 * PLANDESIGNv1 §3.A — Unified Discover story card.
 *
 * Single component for every entry on Discover. The `format` prop
 * decides RP vs VN visual treatment (badge top-left). Variants control
 * grid footprint inside the editorial mosaic.
 *
 * The cover always renders — either from `coverImageUrl` or from a
 * deterministic gradient derived from the story id (no outline-book
 * placeholder anywhere).
 */

import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Drama } from 'lucide-react';
import { cn } from '@/lib/cn';

export type StoryCardFormat = 'rp' | 'vn';
export type StoryCardVariant = 'standard' | 'tall' | 'wide' | 'hero';

export interface StoryCardItem {
  id: string;
  href: string;
  title: string;
  /** One line from inside the story — dialogue or narration. */
  pullQuote?: string | null;
  coverImageUrl?: string | null;
  /** Tone tags for rendering chips on the card. Max 2 shown. */
  tones?: string[];
  /** Estimated runtime / depth label. e.g. "~45 min" or "3 characters" */
  metaLabel?: string | null;
  /** Tiny actor strip at the bottom (avatars + names). Max 3 shown. */
  cast?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  format: StoryCardFormat;
}

interface Props {
  item: StoryCardItem;
  variant?: StoryCardVariant;
  className?: string;
  priority?: boolean;
}

// PLANDESIGNv1 §1 rule 6 — generated covers are deterministic per id; never the
// same neighbour treatment twice in a row at typical grid widths.
export function gradientFor(id: string): { background: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const seed = ((h % 360) + 360) % 360;
  const a = `hsl(${seed} 38% 22%)`;
  const b = `hsl(${(seed + 52) % 360} 42% 12%)`;
  return { background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` };
}

const VARIANT_CLASS: Record<StoryCardVariant, string> = {
  // 1×1 standard, portrait-leaning
  standard: 'aspect-[3/4]',
  // 1×2 tall column
  tall: 'aspect-[3/4] md:row-span-2 md:aspect-auto md:min-h-full',
  // 2×1 landscape
  wide: 'aspect-[16/9] md:col-span-2',
  // 2×2 hero
  hero: 'aspect-[4/3] md:col-span-2 md:row-span-2 md:aspect-auto md:min-h-full',
};

const VARIANT_TITLE_CLASS: Record<StoryCardVariant, string> = {
  standard: 'text-base md:text-lg line-clamp-2',
  tall: 'text-lg md:text-xl line-clamp-2',
  wide: 'text-lg md:text-xl line-clamp-1',
  hero: 'text-2xl md:text-3xl line-clamp-2',
};

const VARIANT_QUOTE_CLASS: Record<StoryCardVariant, string> = {
  standard: 'text-xs line-clamp-2',
  tall: 'text-sm line-clamp-3',
  wide: 'text-sm line-clamp-2',
  hero: 'text-base md:text-lg line-clamp-3',
};

export function StoryCard({ item, variant = 'standard', className, priority }: Props) {
  const gradient = item.coverImageUrl ? undefined : gradientFor(item.id);
  const FormatIcon = item.format === 'vn' ? BookOpen : Drama;
  const formatLabel = item.format === 'vn' ? 'VN' : 'RP';
  const cast = (item.cast ?? [])
    .map((member, index) => ({
      id: member.id || `${item.id}-cast-${index}`,
      name: member.name?.trim() || '?',
      avatarUrl: member.avatarUrl ?? null,
    }))
    .slice(0, 3);

  return (
    <Link
      href={item.href}
      className={cn(
        'group relative block overflow-hidden rounded-token-lg border border-white/[0.06]',
        'bg-night-surface transition-fast hover:border-white/[0.12]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60',
        VARIANT_CLASS[variant],
        className,
      )}
      style={gradient}
      aria-label={`${item.title} — ${formatLabel}`}
    >
      {item.coverImageUrl ? (
        <Image
          src={item.coverImageUrl}
          alt=""
          fill
          priority={priority}
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          className="object-cover transition-fast group-hover:scale-[1.02]"
        />
      ) : null}

      {/* Bottom-up scrim for legibility */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent transition-fast group-hover:from-black/70" />

      {/* Format badge */}
      <span
        className={cn(
          'absolute left-3 top-3 inline-flex items-center gap-1 rounded-full',
          'bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
          'text-white backdrop-blur-sm ring-1 ring-white/15',
        )}
      >
        <FormatIcon size={11} strokeWidth={2.25} />
        {formatLabel}
      </span>

      {/* Content stack */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4">
        <h3 className={cn('font-display leading-tight text-ink-50', VARIANT_TITLE_CLASS[variant])}>
          {item.title}
        </h3>

        {item.pullQuote ? (
          <p
            className={cn(
              'font-display italic text-ink-200/85',
              VARIANT_QUOTE_CLASS[variant],
            )}
          >
            “{item.pullQuote}”
          </p>
        ) : null}

        {(item.tones?.length || item.metaLabel) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-ink-300">
            {item.tones?.slice(0, 2).map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5"
              >
                {t}
              </span>
            ))}
            {item.metaLabel ? (
              <span className="text-ink-400 normal-case tracking-normal text-xs">
                · {item.metaLabel}
              </span>
            ) : null}
          </div>
        )}

        {cast.length ? (
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-300/90">
            <div className="flex -space-x-1.5">
              {cast.map((c) =>
                c.avatarUrl ? (
                  <Image
                    key={c.id}
                    src={c.avatarUrl}
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5 rounded-full border border-night-canvas object-cover"
                  />
                ) : (
                  <div
                    key={c.id}
                    className="h-5 w-5 rounded-full border border-night-canvas bg-white/10 text-[9px] font-semibold text-ink-200 grid place-items-center"
                  >
                    {c.name.slice(0, 1).toUpperCase()}
                  </div>
                ),
              )}
            </div>
            <span className="truncate">
              {cast
                .map((c) => c.name)
                .join(' · ')}
            </span>
          </div>
        ) : null}
      </div>
    </Link>
  );
}
