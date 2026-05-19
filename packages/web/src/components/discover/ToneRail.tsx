'use client';

/**
 * PLANDESIGNv1 §3.A — Tone rail (sticky narrative-tone chips).
 * Multi-select, AND semantics, max 3 active simultaneously.
 */

import { cn } from '@/lib/cn';

export const TONE_CHIPS = [
  'Tense',
  'Tender',
  'Dark',
  'Playful',
  'Mysterious',
  'Slow-burn',
  'Action',
] as const;

export type Tone = (typeof TONE_CHIPS)[number];

interface Props {
  active: Set<Tone>;
  onToggle: (tone: Tone) => void;
  onClear: () => void;
  className?: string;
}

export function ToneRail({ active, onToggle, onClear, className }: Props) {
  return (
    <div
      className={cn(
        'sticky top-0 z-20 -mx-4 flex items-center gap-2 overflow-x-auto',
        'bg-night-canvas/85 px-4 py-3 backdrop-blur-md',
        'border-b border-white/[0.04]',
        className,
      )}
    >
      {TONE_CHIPS.map((tone) => {
        const isActive = active.has(tone);
        const disabled = !isActive && active.size >= 3;
        return (
          <button
            key={tone}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(tone)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-fast',
              'border',
              isActive
                ? 'border-accent-500/60 bg-accent-500/15 text-ink-50 shadow-[0_0_0_1px_rgba(232,90,168,0.15)]'
                : 'border-white/10 bg-white/[0.03] text-ink-300 hover:border-white/20 hover:text-ink-100',
              disabled && 'cursor-not-allowed opacity-40 hover:border-white/10 hover:text-ink-300',
            )}
            aria-pressed={isActive}
          >
            {tone}
          </button>
        );
      })}
      {active.size > 0 ? (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 shrink-0 text-xs text-ink-400 underline-offset-4 hover:text-ink-200 hover:underline"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
