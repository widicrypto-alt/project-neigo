'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  /** Current average stars (0–5, float). */
  avgStars: number;
  /** Total rating count for display. */
  totalRatings: number;
  /** The authenticated user's existing rating (1–5) or null. */
  myRating: number | null;
  /** Called when user submits a rating. Pass null to remove. */
  onRate?: (stars: number | null) => Promise<void>;
  /** If false, shows read-only aggregate bar. */
  interactive?: boolean;
  size?: 'sm' | 'md';
}

export function RatingStars({
  avgStars,
  totalRatings,
  myRating,
  onRate,
  interactive = true,
  size = 'md',
}: Props) {
  const [hover, setHover] = useState(0);
  const [pending, setPending] = useState(false);

  const display = hover || myRating || 0;
  const starSize = size === 'sm' ? 16 : 22;

  async function handleClick(stars: number) {
    if (!onRate || pending) return;
    setPending(true);
    try {
      // Toggle off if same rating.
      await onRate(myRating === stars ? null : stars);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((s) => {
          const filled = interactive ? s <= display : s <= Math.round(avgStars);
          return (
            <button
              key={s}
              type="button"
              disabled={!interactive || pending}
              onClick={() => handleClick(s)}
              onMouseEnter={() => interactive && setHover(s)}
              className={cn(
                'transition-colors',
                interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default',
                pending && 'opacity-50',
              )}
            >
              <Star
                size={starSize}
                className={cn(
                  filled ? 'fill-amber-400 text-amber-400' : 'text-ink-600',
                  'transition-colors',
                )}
              />
            </button>
          );
        })}
      </div>
      {totalRatings > 0 && (
        <span className="text-sm text-ink-400">
          {avgStars.toFixed(1)} <span className="text-ink-600">({totalRatings})</span>
        </span>
      )}
    </div>
  );
}
