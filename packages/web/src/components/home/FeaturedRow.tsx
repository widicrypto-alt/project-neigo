'use client';

import Link from 'next/link';
import { ArrowRight, Flame, Sparkles } from 'lucide-react';
import { StoryLandscapeCard } from './StoryLandscapeCard';
import type { StoryItem } from './StoryPosterCard';

interface Props {
  stories: StoryItem[];
  title?: string;
  subtitle?: string;
  accentColor?: 'amber' | 'teal' | 'violet';
  viewAllHref?: string;
}

const ICON_STYLE: Record<string, { iconClass: string; wrapBg: string; wrapRing: string; icon: typeof Flame }> = {
  amber: {
    iconClass: 'text-amber-400',
    wrapBg: 'bg-[rgba(240,165,0,0.10)]',
    wrapRing: 'ring-1 ring-[rgba(240,165,0,0.35)]',
    icon: Flame,
  },
  teal: {
    iconClass: 'text-teal-400',
    wrapBg: 'bg-[rgba(20,184,166,0.10)]',
    wrapRing: 'ring-1 ring-[rgba(20,184,166,0.35)]',
    icon: Sparkles,
  },
  violet: {
    iconClass: 'text-violet-400',
    wrapBg: 'bg-[rgba(139,92,246,0.10)]',
    wrapRing: 'ring-1 ring-[rgba(139,92,246,0.35)]',
    icon: Sparkles,
  },
};

export function FeaturedRow({
  stories,
  title = 'Featured Stories',
  subtitle = "Hand-picked worlds the Project Neigo community can't stop playing.",
  accentColor = 'amber',
  viewAllHref = '/discover',
}: Props) {
  const list = stories.slice(0, 6);
  const style = ICON_STYLE[accentColor]!;
  const Icon = style.icon;

  return (
    <section aria-label={title} className="group/section relative px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg ${style.wrapBg} ${style.wrapRing}`}>
              <Icon className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${style.iconClass}`} strokeWidth={2} />
            </span>
            <h2 className="font-display text-[1.1rem] sm:text-xl font-semibold tracking-wide text-ink-50">
              {title}
            </h2>
          </div>
          <p className="mt-1 text-[0.75rem] sm:text-[0.85rem] text-ink-500">{subtitle}</p>
        </div>
        <Link
          href={viewAllHref}
          className="group/link inline-flex items-center gap-1 text-[0.8rem] sm:text-sm font-medium text-accent-300/70 transition-colors hover:text-ink-50 hover:opacity-100"
        >
          View All
          <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform group-hover/link:translate-x-0.5" />
        </Link>
      </div>

      <div className="neigo-scroll -mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        <ul role="list" className="flex" style={{ gap: 10 }}>
          {list.map((s, i) => (
            <li key={s.id} style={{ width: 300, flexShrink: 0 }} className="sm:w-[320px]">
              <StoryLandscapeCard story={s} priority={i < 3} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
