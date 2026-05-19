'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { posterFor } from '@/lib/poster';

export interface HeroCharacter {
  id: string;
  name: string;
  avatarUrl: string | null;
  tonePreset: string;
  personality: string;
  tags: string[];
  language: string;
  isBuiltIn: boolean;
}

interface Props {
  characters: HeroCharacter[];
}

const WIDTHS = [150, 118, 96, 76];
const OPACITIES = [1, 0.52, 0.28, 0.13];
const SCALES = [1, 0.88, 0.78, 0.68];
const HALF_WINDOW = 3;

function roleLabelFor(char: HeroCharacter): string {
  if (char.tonePreset) return char.tonePreset.replace(/_/g, ' ');
  return char.tags[0] ?? 'Character';
}

export function HeroCarousel({ characters }: Props) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const charIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    characters.forEach((c, i) => map.set(c.id, i));
    return map;
  }, [characters]);

  useEffect(() => {
    if (paused || characters.length < 2) return;
    const id = setInterval(() => {
      setActive((a) => (a + 1) % characters.length);
    }, 5000);
    return () => clearInterval(id);
  }, [paused, characters.length]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const activeCard = container.querySelector(`[data-char-id="${characters[active]?.id}"]`);
    if (activeCard) {
      activeCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [active, characters]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container || characters.length === 0) return;
    const center = container.scrollLeft + container.clientWidth / 2;
    let closestIdx = 0;
    let closestDist = Infinity;
    const cards = container.querySelectorAll('[data-char-id]');
    cards.forEach((card) => {
      const el = card as HTMLElement;
      const cardCenter = el.offsetLeft + el.offsetWidth / 2;
      const dist = Math.abs(center - cardCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = Array.from(cards).indexOf(card);
      }
    });
    setActive(closestIdx);
  };

  if (characters.length === 0) return null;

  const goTo = (i: number) => {
    const next = ((i % characters.length) + characters.length) % characters.length;
    setActive(next);
  };

  const visibleCards = [];
  for (let d = -HALF_WINDOW; d <= HALF_WINDOW; d++) {
    const idx =
      ((active + d) % characters.length + characters.length) % characters.length;
    visibleCards.push({ char: characters[idx]!, distFromCenter: Math.abs(d), offset: d });
  }

  return (
    <section
      aria-label="Featured characters"
      className="relative isolate pt-3 pb-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="pointer-events-none absolute inset-0 hero-ambient" aria-hidden="true" />

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full neigo-glass px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-accent-300">
          <Sparkles className="h-3 w-3 text-amber-400" />
          Featured Characters
        </div>
        <h1 className="mt-2 font-display font-bold tracking-tight text-[1.8rem] leading-[1.1] sm:text-[2.2rem]">
          <span className="text-gradient-hero">Live the Story</span>
          <span className="text-ink-100"> — </span>
          <span className="text-gradient-hero">Feel Every Moment</span>
        </h1>
        <p className="mx-auto mt-1.5 max-w-2xl text-[0.8rem] leading-snug text-ink-500">
          Journey alongside your favorite characters in adventures that move your soul.
        </p>
      </div>

      {/* MOBILE: Snap-scroll cover flow */}
      <div className="relative z-10 mt-4 md:hidden">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-3 neigo-scroll"
          style={{ scrollPaddingLeft: '24px', scrollPaddingRight: '24px' }}
        >
          {characters.map((char, i) => {
            const isActive = i === active;
            const coverSrc = char.avatarUrl ?? posterFor(char.id);

            return (
              <Link
                key={char.id}
                href={`/characters/${char.id}`}
                data-char-id={char.id}
                className={cn(
                  'group relative shrink-0 snap-center rounded-xl overflow-hidden border transition-all duration-300 ease-out',
                  isActive
                    ? 'border-amber-400/50 shadow-[0_0_24px_rgba(245,158,11,0.15)]'
                    : 'border-white/10 scale-90 opacity-50',
                )}
                style={{ width: '70vw', maxWidth: 280, aspectRatio: '9 / 16' }}
                aria-label={`View ${char.name}`}
              >
                <div className="absolute inset-0 bg-linear-to-br from-accent-800/60 to-ink-900" />
                <Image
                  src={coverSrc}
                  alt={char.name}
                  fill
                  sizes="70vw"
                  className={cn(
                    'object-cover transition-transform duration-500',
                    isActive ? 'opacity-95 group-hover:scale-105' : 'opacity-65 mix-blend-luminosity',
                  )}
                  priority={isActive}
                />

                {!isActive && <div className="absolute inset-0 bg-ink-950/30" />}

                <div className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/85 via-black/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 px-3 pb-3">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-amber-400">
                    {roleLabelFor(char)}
                  </p>
                  <h3 className="mt-1 font-display text-[1.05rem] font-bold leading-tight text-white">
                    {char.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[0.7rem] leading-relaxed text-white/70">
                    {char.personality?.split('.')[0] ?? ''}
                  </p>
                </div>

                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/40"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    Featured
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-1.5">
          {characters.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === active
                  ? 'w-5 bg-accent-400 shadow-[0_0_10px_rgba(236,72,153,0.8)]'
                  : 'w-1.5 bg-white/20 hover:bg-white/40',
              )}
            />
          ))}
        </div>
      </div>

      {/* DESKTOP: JS-driven cover flow */}
      <div className="relative z-10 mt-3 hidden md:block">
        <button
          aria-label="Previous character"
          onClick={() => goTo(active - 1)}
          className="absolute left-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full neigo-glass-strong text-ink-50 transition hover:scale-105 hover:bg-accent-500/15"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          aria-label="Next character"
          onClick={() => goTo(active + 1)}
          className="absolute right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full neigo-glass-strong text-ink-50 transition hover:scale-105 hover:bg-accent-500/15"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>

        <div
          className="flex items-center justify-center"
          style={{ width: '100%', gap: 'clamp(8px, 2vw, 20px)', padding: '0 48px', minHeight: 280 }}
        >
          {visibleCards.map(({ char, distFromCenter, offset }) => {
            const tier = Math.min(distFromCenter, 3) as 0 | 1 | 2 | 3;
            const isActive = distFromCenter === 0;
            const originalIndex = charIndexMap.get(char.id) ?? 0;
            const coverSrc = char.avatarUrl ?? posterFor(char.id);
            const sharedClass = 'group relative';
            const sharedStyle = {
              width: WIDTHS[tier],
              aspectRatio: '9 / 16',
              opacity: OPACITIES[tier],
              transform: `scale(${SCALES[tier]})`,
              flexShrink: 0,
              transition: 'width 0.4s ease, opacity 0.4s ease, transform 0.4s ease',
              zIndex: 50 - distFromCenter,
            } as const;

            const inner = (
                <div
                  className={cn(
                    'relative h-full w-full overflow-hidden rounded-xl border transition-colors duration-500',
                    isActive
                      ? 'border-amber-400/50 glow-pulse'
                      : 'border-white/10',
                  )}
                >
                  <div className="absolute inset-0 bg-linear-to-br from-accent-800/60 to-ink-900" />
                  <Image
                    src={coverSrc}
                    alt={isActive ? char.name : ''}
                    fill
                    sizes={`${WIDTHS[tier]}px`}
                    className={cn(
                      'rounded-xl object-cover',
                      isActive ? 'opacity-95' : 'opacity-65 mix-blend-luminosity',
                    )}
                    priority={isActive}
                  />

                  {!isActive && <div className="absolute inset-0 bg-ink-950/30" />}

                  {isActive && (
                    <>
                      <div
                        className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/85 via-black/40 to-transparent"
                        aria-hidden="true"
                      />
                      <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5">
                        <p className="text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-amber-400">
                          {roleLabelFor(char)}
                        </p>
                        <h3 className="mt-0.5 font-display text-[0.95rem] font-bold leading-tight text-white">
                          {char.name}
                        </h3>
                        <p className="mt-0.5 truncate text-[0.65rem] text-white/70">
                          {char.personality?.split('.')[0] ?? ''}
                        </p>
                      </div>

                      <span
                        aria-hidden="true"
                        className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/40"
                      >
                        <Sparkles className="h-2 w-2" />
                        Featured
                      </span>
                    </>
                  )}
                </div>
            );

            if (isActive) {
              return (
                <Link
                  key={`${char.id}-${offset}`}
                  href={`/characters/${char.id}`}
                  aria-label={`View ${char.name}`}
                  className={sharedClass}
                  style={sharedStyle}
                >
                  {inner}
                </Link>
              );
            }

            return (
              <button
                key={`${char.id}-${offset}`}
                onClick={() => goTo(originalIndex)}
                aria-label={`Focus ${char.name}`}
                className={sharedClass}
                style={sharedStyle}
              >
                {inner}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-center gap-1.5">
          {characters.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === active
                  ? 'w-5 bg-accent-400 shadow-[0_0_10px_rgba(236,72,153,0.8)]'
                  : 'w-1.5 bg-white/20 hover:bg-white/40',
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
