import { moodMeta, type MoodMeta } from '@neigo/shared';
import { cn } from '@/lib/cn';

const TONE_CLASSES: Record<MoodMeta['tone'], string> = {
  neutral: 'border-white/[0.1] bg-white/[0.04] text-ink-200',
  accent: 'border-accent-500/25 bg-accent-500/[0.12] text-accent-200',
  iris: 'border-iris-500/25 bg-iris-500/[0.12] text-iris-200',
  warmth: 'border-warmth-500/25 bg-warmth-500/[0.12] text-warmth-200',
  emerald: 'border-emerald-500/25 bg-emerald-500/[0.12] text-emerald-200',
  sky: 'border-sky-500/25 bg-sky-500/[0.12] text-sky-200',
  violet: 'border-violet-500/25 bg-violet-500/[0.12] text-violet-200',
  rose: 'border-rose-500/25 bg-rose-500/[0.12] text-rose-200',
};

export interface MoodBadgeProps {
  mood: string | null | undefined;
  size?: 'xs' | 'sm';
  showLabel?: boolean;
  className?: string;
}

/**
 * Mood chip — canonical display for a character's current mood.
 * Coerces any free-form server mood string via {@link normaliseMood}.
 * The outer `transition-colors` makes tone changes animate smoothly when
 * the `mood` prop swaps key, per FRONTEND.md §F2 (mood crossfades).
 */
export function MoodBadge({ mood, size = 'xs', showLabel = true, className }: MoodBadgeProps) {
  const meta = moodMeta(mood);
  const tone = TONE_CLASSES[meta.tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border backdrop-blur-sm transition-colors duration-300 ease-out',
        tone,
        size === 'xs'
          ? 'px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] font-medium'
          : 'px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] font-medium',
        className,
      )}
      title={`Mood: ${meta.label}`}
      aria-label={`Mood: ${meta.label}`}
    >
      <span aria-hidden className="leading-none">{meta.emoji}</span>
      {showLabel && <span>{meta.label}</span>}
    </span>
  );
}
