'use client';
/**
 * OpeningQuoteCard — cinematic quote card for story plot tab.
 * PLANIMPv3: opening_quote (≤280), opening_quote_by (≤120).
 */
import { Quote } from 'lucide-react';

export interface OpeningQuoteCardProps {
  quote: string | null | undefined;
  by?: string | null | undefined;
}

export function OpeningQuoteCard({ quote, by }: OpeningQuoteCardProps) {
  if (!quote || !quote.trim()) return null;
  return (
    <figure className="relative rounded-2xl border border-violet-accent/30 bg-gradient-to-br from-violet-950/30 via-ink-900/40 to-ink-950 px-6 py-7 overflow-hidden">
      <Quote
        size={56}
        className="absolute -top-2 -left-2 text-violet-accent/15 pointer-events-none"
        aria-hidden
      />
      <blockquote className="relative text-ink-100 text-lg md:text-xl italic leading-relaxed font-serif">
        &ldquo;{quote}&rdquo;
      </blockquote>
      {by && by.trim() && (
        <figcaption className="mt-3 text-xs text-ink-500 uppercase tracking-widest">
          — {by}
        </figcaption>
      )}
    </figure>
  );
}
