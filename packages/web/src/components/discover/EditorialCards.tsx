import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { gradientFor } from '@/components/discover/StoryCard';

interface SplitFeatureCardProps {
  href: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  imageAlt?: string;
  eyebrow?: string;
  badges?: string[];
  meta?: Array<string | null | undefined>;
  ctaLabel?: string;
  priority?: boolean;
  reverse?: boolean;
  className?: string;
  idForGradient?: string;
  actionSlot?: ReactNode;
}

interface OverlayPosterCardProps {
  href: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  imageAlt?: string;
  eyebrow?: string;
  badges?: string[];
  meta?: string | null;
  priority?: boolean;
  className?: string;
  idForGradient?: string;
}

interface ImageOnlyCharacterCardProps {
  href: string;
  name: string;
  imageUrl?: string | null;
  imageAlt?: string;
  priority?: boolean;
  className?: string;
  idForGradient?: string;
}

function CoverImage({
  src,
  alt,
  priority,
  idForGradient,
  sizes,
}: {
  src?: string | null;
  alt: string;
  priority?: boolean;
  idForGradient: string;
  sizes: string;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
      />
    );
  }

  return <div className="absolute inset-0" style={gradientFor(idForGradient)} aria-hidden="true" />;
}

export function SplitFeatureCard({
  href,
  title,
  description,
  imageUrl,
  imageAlt,
  eyebrow,
  badges = [],
  meta = [],
  ctaLabel = 'Open',
  priority,
  reverse = false,
  className,
  idForGradient,
  actionSlot,
}: SplitFeatureCardProps) {
  const metaItems = meta.filter(Boolean) as string[];

  return (
    <article
      className={cn(
        'grid gap-4 rounded-[30px] border border-white/[0.08] bg-white/[0.03] p-3 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.9)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]',
        className,
      )}
    >
      <Link
        href={href}
        className={cn(
          'group relative block overflow-hidden rounded-[24px] border border-white/[0.08] bg-night-surface aspect-[4/3] lg:aspect-auto lg:min-h-[290px]',
          reverse ? 'lg:order-2' : '',
        )}
      >
        <CoverImage
          src={imageUrl}
          alt={imageAlt ?? title}
          priority={priority}
          idForGradient={idForGradient ?? href}
          sizes="(max-width: 1024px) 100vw, 40vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      </Link>

      <div
        className={cn(
          'flex min-w-0 flex-col justify-between rounded-[24px] border border-white/[0.06] bg-ink-950/55 p-5 backdrop-blur-sm',
          reverse ? 'lg:order-1' : '',
        )}
      >
        <div className="space-y-4">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-300">
              {eyebrow}
            </p>
          ) : null}
          <div className="space-y-3">
            <h3 className="font-display text-2xl leading-tight text-ink-50 md:text-[2rem]">{title}</h3>
            {description ? (
              <p className="max-w-2xl text-sm leading-7 text-ink-300 md:text-[15px]">
                {description}
              </p>
            ) : null}
          </div>

          {badges.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {badges.slice(0, 4).map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-ink-300"
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}

          {metaItems.length > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500">
              {metaItems.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {actionSlot ?? (
            <Link
              href={href}
              className="inline-flex items-center gap-2 rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-400"
            >
              {ctaLabel}
              <ArrowRight className="h-4 w-4" strokeWidth={2.1} />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function OverlayPosterCard({
  href,
  title,
  description,
  imageUrl,
  imageAlt,
  eyebrow,
  badges = [],
  meta,
  priority,
  className,
  idForGradient,
}: OverlayPosterCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative block aspect-[3/4] overflow-hidden rounded-[24px] border border-white/[0.08] bg-night-surface shadow-[0_16px_36px_-26px_rgba(0,0,0,0.95)] transition-transform duration-300 hover:-translate-y-1 hover:border-white/[0.14]',
        className,
      )}
      aria-label={title}
    >
      <CoverImage
        src={imageUrl}
        alt={imageAlt ?? title}
        priority={priority}
        idForGradient={idForGradient ?? href}
        sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/28 to-transparent" />

      {eyebrow ? (
        <span className="absolute left-3 top-3 rounded-full border border-white/[0.12] bg-black/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-100 backdrop-blur-sm">
          {eyebrow}
        </span>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 space-y-2 p-4">
        <h3 className="font-display text-xl leading-tight text-ink-50 line-clamp-2">{title}</h3>
        {description ? (
          <p className="text-sm leading-6 text-ink-300 line-clamp-3">{description}</p>
        ) : null}

        {badges.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {badges.slice(0, 2).map((badge) => (
              <span
                key={badge}
                className="rounded-full bg-white/[0.1] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-100 backdrop-blur-sm"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}

        {meta ? <p className="text-[11px] uppercase tracking-[0.16em] text-ink-400">{meta}</p> : null}
      </div>
    </Link>
  );
}

export function ImageOnlyCharacterCard({
  href,
  name,
  imageUrl,
  imageAlt,
  priority,
  className,
  idForGradient,
}: ImageOnlyCharacterCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative block aspect-[3/4] overflow-hidden rounded-[22px] border border-white/[0.08] bg-night-surface shadow-[0_16px_36px_-26px_rgba(0,0,0,0.95)] transition-transform duration-300 hover:-translate-y-1 hover:border-accent-300/35',
        className,
      )}
      aria-label={name}
      title={name}
    >
      <CoverImage
        src={imageUrl}
        alt={imageAlt ?? name}
        priority={priority}
        idForGradient={idForGradient ?? href}
        sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 16vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="absolute inset-x-3 bottom-3 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <span className="inline-flex rounded-full border border-white/[0.14] bg-black/45 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-ink-100 backdrop-blur-sm">
          {name}
        </span>
      </div>
    </Link>
  );
}