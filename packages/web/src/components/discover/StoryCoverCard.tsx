'use client';
import Image from 'next/image';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';

// D-Density: child variant for DiscoverRail stagger.
const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] as const } },
};

const TIER_COLOR: Record<string, string> = {
  FREE:    'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  PAID:    'bg-violet-500/20 text-violet-300 border-violet-500/30',
  FOUNDER: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

const LANG_FLAG: Record<string, string> = {
  id: '🇮🇩', en: '🇺🇸', ja: '🇯🇵', ko: '🇰🇷', zh: '🇨🇳',
};

export interface StoryCoverItem {
  id: string;
  title: string;
  synopsis: string | null;
  coverImageUrl: string | null;
  language: string;
  requiredTier: string;
  authorId: string;
  metadata?: { tags?: string[] };
}

/**
 * D-Density: Story cover card for the "Cerita baru" rail.
 * Mirrors IsekaiZero's story card style: cover image (gradient fallback),
 * title, synopsis, tier badge, language flag.
 */
export function StoryCoverCard({ story, index = 0 }: { story: StoryCoverItem; index?: number }) {
  const reduce = useReducedMotion();
  const flag = LANG_FLAG[story.language] ?? '🌐';
  const tierClass = TIER_COLOR[story.requiredTier] ?? TIER_COLOR.FREE!;
  const locked = story.requiredTier !== 'FREE';
  const tags = (story.metadata?.tags ?? []).slice(0, 2);

  // Gradient cover fallback — unique per story using id hash color
  const gradientSeed = story.id.charCodeAt(0) % 360;
  const fallbackStyle = {
    background: `linear-gradient(135deg, hsl(${gradientSeed},40%,18%) 0%, hsl(${(gradientSeed + 60) % 360},35%,12%) 100%)`,
  };

  return (
    <motion.div
      variants={reduce ? undefined : cardVariants}
      initial={reduce ? false : 'hidden'}
      animate="show"
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
    >
      <Link
        href={`/stories/${story.id}`}
        className={cn(
          'group relative block aspect-[2/3] w-full overflow-hidden rounded-2xl border border-night-line',
          'transition-base ease-standard',
          'hover:border-violet-accent/60 hover:shadow-[0_10px_30px_-10px_rgba(139,92,246,0.35)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-accent/70',
        )}
      >
        {/* Cover or gradient fallback */}
        {story.coverImageUrl ? (
          <Image
            src={story.coverImageUrl}
            alt={story.title}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0" style={fallbackStyle} />
        )}

        {/* Gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night-canvas via-night-canvas/40 to-transparent" />

        {/* Top row: lang flag + lock */}
        <div className="absolute left-2 right-2 top-2 flex items-center justify-between">
          <span className="rounded-full bg-night-canvas/70 px-2 py-0.5 text-[11px] backdrop-blur-sm">
            {flag}
          </span>
          {locked && (
            <span className="rounded-full bg-night-canvas/70 p-1 backdrop-blur-sm">
              <Lock size={10} className="text-amber-300" />
            </span>
          )}
        </div>

        {/* Bottom content */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3">
          <div className="font-display text-sm leading-tight text-ink-50 line-clamp-2">
            {story.title}
          </div>
          {story.synopsis && (
            <p className="line-clamp-2 text-[10px] leading-snug text-ink-200/70">
              {story.synopsis}
            </p>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-night-line/60 bg-night-surface/70 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ink-300"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <span className={cn('self-start rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider font-medium', tierClass)}>
            {story.requiredTier}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

/**
 * Placeholder CTA card — used when stories rail is empty.
 * Looks like a real story card but invites creation.
 */
export function StoryCtaCard({ href, label, sublabel, gradientAngle = 135 }: {
  href: string;
  label: string;
  sublabel?: string;
  gradientAngle?: number;
}) {
  const t = useTranslations('common');
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-night-line bg-night-surface/40 p-4 text-center',
        'transition-base ease-standard hover:border-violet-accent/60 hover:bg-night-surface/70',
      )}
    >
      <div
        className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity duration-300"
        style={{ background: `linear-gradient(${gradientAngle}deg, rgba(139,92,246,0.4), rgba(236,72,153,0.25), transparent 70%)` }}
      />
      <div className="relative z-10 flex flex-col items-center gap-2">
        <div className="font-display text-sm text-ink-100 leading-tight">{label}</div>
        {sublabel && <div className="text-[10px] text-ink-400 leading-snug">{sublabel}</div>}
        <div className="mt-1 rounded-full border border-violet-accent/40 px-3 py-1 text-[10px] text-violet-hot">
          {t('start')} →
        </div>
      </div>
    </Link>
  );
}
