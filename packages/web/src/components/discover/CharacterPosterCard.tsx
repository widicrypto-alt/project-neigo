'use client';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { posterFor } from '@/lib/poster';
import { CreatorBadge } from './CreatorBadge';

const LANG_FLAG: Record<string, string> = {
  id: '🇮🇩',
  en: '🇺🇸',
  ja: '🇯🇵',
  ko: '🇰🇷',
  zh: '🇨🇳',
  es: '🇪🇸',
  pt: '🇵🇹',
  fr: '🇫🇷',
  de: '🇩🇪',
};

export interface PosterCharacter {
  id: string;
  name: string;
  avatarUrl: string | null;
  language?: string;
  tonePreset?: string;
  tags?: string[];
  creatorHandle?: string | null;
  mood?: string;
  hook?: string;
}

interface Props {
  character: PosterCharacter;
  href: string;
  priority?: boolean;
  index?: number;
}

// D6: child variant for DiscoverRail stagger container.
const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] as const } },
};

export function CharacterPosterCard({ character, href, priority, index = 0 }: Props) {
  const reduce = useReducedMotion();
  const flag = character.language ? LANG_FLAG[character.language] ?? '🌐' : '🌐';
  const src = character.avatarUrl ?? posterFor(character.id);
  const tags = (character.tags ?? []).slice(0, 2);

  return (
    <motion.div
      variants={reduce ? undefined : cardVariants}
      // Fallback when used outside a stagger container:
      initial={reduce ? false : 'hidden'}
      animate="show"
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      // D6: haptic feedback on tap
      onTap={() => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(10);
        }
      }}
    >
      <Link
        href={href}
        prefetch={false}
        className={cn(
          'group relative block aspect-[2/3] w-full overflow-hidden rounded-token-lg',
          'border border-night-line bg-night-surface2',
          'transition-base ease-standard',
          'hover:border-violet-accent/60 hover:shadow-[0_10px_30px_-10px_rgba(139,92,246,0.35)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-accent/70',
        )}
      >
        <Image
          src={src}
          alt={character.name}
          fill
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
          className="object-cover transition-transform duration-500 ease-standard group-hover:scale-[1.03]"
          priority={priority}
        />
        {/* gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night-canvas via-night-canvas/40 to-transparent" />
        {/* top-right flag */}
        <div className="absolute right-2 top-2 rounded-full bg-night-canvas/70 px-2 py-0.5 text-[11px] leading-none backdrop-blur-sm">
          <span aria-label={character.language ?? 'lang'}>{flag}</span>
        </div>
        {/* bottom content */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3">
          <div className="font-display text-lg leading-tight text-ink-50 drop-shadow-sm">
            {character.name}
          </div>
          {character.hook ? (
            <p className="line-clamp-2 text-[12px] leading-snug text-ink-200/80">
              {character.hook}
            </p>
          ) : null}
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-night-line/70 bg-night-surface/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-300"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
          {character.creatorHandle ? (
            <div className="pt-0.5">
              <CreatorBadge handle={character.creatorHandle} />
            </div>
          ) : null}
        </div>
      </Link>
    </motion.div>
  );
}
