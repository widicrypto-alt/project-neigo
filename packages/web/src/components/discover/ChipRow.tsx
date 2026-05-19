'use client';
import { cn } from '@/lib/cn';

export interface ChipItem {
  key: string;
  label: string;
  count?: number;
}

interface Props {
  chips: ChipItem[];
  selected: Set<string> | string | null;
  onToggle: (key: string) => void;
  multi?: boolean;
  className?: string;
  sticky?: boolean;
}

/**
 * Generic chip row — used for genre, mood, and language filters.
 * Sticky variant clings to the top of the scroll container with a blurred
 * night-canvas backdrop so content beneath stays readable.
 */
export function ChipRow({ chips, selected, onToggle, multi = true, className, sticky }: Props) {
  const isOn = (k: string) =>
    multi ? (selected as Set<string>)?.has?.(k) ?? false : selected === k;
  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto py-2 pl-1 pr-4',
        'scrollbar-none',
        sticky &&
          'sticky top-14 z-20 -mx-4 border-b border-night-line/60 bg-night-canvas/80 px-4 backdrop-blur-md',
        className,
      )}
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onToggle(chip.key)}
          className={cn(
            'shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-fast ease-standard',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-accent/70',
            isOn(chip.key)
              ? 'border-violet-accent bg-violet-accent/15 text-ink-50'
              : 'border-night-line bg-night-surface/70 text-ink-300 hover:border-violet-accent/50 hover:text-ink-100',
          )}
        >
          {chip.label}
          {typeof chip.count === 'number' && chip.count > 0 ? (
            <span className="ml-1.5 text-[11px] text-ink-400">{chip.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
