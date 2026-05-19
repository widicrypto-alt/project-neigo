'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { posterFor } from '@/lib/poster';

interface StripChar {
  id: string;
  name: string;
  avatarUrl: string | null;
  language?: string;
}

/**
 * D-Density: Full-width horizontal character strip — mirrors IsekaiZero's
 * top carousel. Auto-scrolls via CSS marquee animation so no JS timer runs.
 * Duplicates the list to create seamless loop.
 * `prefers-reduced-motion` disables the scroll and shows a static snap row instead.
 */
export function CharacterStrip({ characters }: { characters: StripChar[] }) {
  const reduce = useReducedMotion();

  if (characters.length === 0) return null;

  // Need at least enough cards to fill viewport twice for seamless loop.
  // Repeat until we have ≥ 12 entries.
  let items = characters;
  while (items.length < 12) items = [...items, ...characters];
  // Duplicate for the loop.
  const loop = [...items, ...items];

  if (reduce) {
    return (
      <div
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-none"
        style={{ scrollbarWidth: 'none' }}
      >
        {characters.map((c) => (
          <StripCard key={c.id} char={c} />
        ))}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      {/* fade edges */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-ink-950 to-transparent" />
      <div
        className="flex gap-3"
        style={{
          animation: 'characterScroll 40s linear infinite',
          width: 'max-content',
        }}
      >
        {loop.map((c, i) => (
          <StripCard key={`${c.id}-${i}`} char={c} />
        ))}
      </div>

      <style>{`
        @keyframes characterScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes characterScroll { 0%,100% { transform: none; } }
        }
      `}</style>
    </div>
  );
}

function StripCard({ char }: { char: StripChar }) {
  const src = char.avatarUrl ?? posterFor(char.id);
  return (
    <Link
      href={`/chat?cid=${char.id}`}
      className="group relative shrink-0 overflow-hidden rounded-xl border border-white/[0.06] bg-night-surface2 transition-all duration-200 hover:border-violet-accent/50 hover:scale-[1.03]"
      style={{ width: 120, height: 180 }}
      tabIndex={-1}
      aria-label={char.name}
    >
      <Image
        src={src}
        alt={char.name}
        fill
        sizes="120px"
        className="object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night-canvas/90 via-night-canvas/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-2">
        <div className="truncate font-display text-[11px] text-ink-100 leading-tight">
          {char.name}
        </div>
      </div>
    </Link>
  );
}
