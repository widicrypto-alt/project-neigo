/**
 * BACKLOG B2.4 — VN Readiness Meter.
 *
 * Visualizes how "VN-ready" a story is based on the `vnReadinessPct` field
 * returned by GET /api/stories/:id. The backend computes the score from:
 * cover image, cast, ≥1 scenario with narration, plot, and background image.
 *
 * First consumer: stories/[id]/page.tsx owner sidebar.
 * Second consumer: studio/stories/[id]/page.tsx (write tab header).
 */
'use client';
import { cn } from '@/lib/cn';

interface Props {
  /** 0–100 percentage of VN readiness. */
  pct: number;
  className?: string;
  /** Show the detailed checklist below the bar. */
  showChecklist?: boolean;
}

const TIERS = [
  { min: 80, label: 'Siap VN', color: 'bg-emerald-500' },
  { min: 50, label: 'Hampir siap', color: 'bg-amber-400' },
  { min: 0, label: 'Butuh setup', color: 'bg-ink-600' },
];

const CHECKLIST_ITEMS = [
  { label: 'Cover image', weight: 20 },
  { label: 'Cast (≥1 karakter)', weight: 20 },
  { label: 'Background gambar di skenario', weight: 20 },
  { label: 'Narasi pembuka skenario', weight: 20 },
  { label: 'Plot cerita', weight: 20 },
];

function getTier(pct: number) {
  return TIERS.find((t) => pct >= t.min) ?? TIERS[TIERS.length - 1]!;
}

export function VnReadinessMeter({ pct, className, showChecklist = false }: Props) {
  const tier = getTier(pct);
  const clamped = Math.min(100, Math.max(0, pct));

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-ink-400">VN Readiness</span>
        <span
          className={cn(
            'font-semibold',
            clamped >= 80 ? 'text-emerald-400' : clamped >= 50 ? 'text-amber-400' : 'text-ink-500',
          )}
        >
          {clamped}% · {tier.label}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className={cn('h-full rounded-full transition-all duration-500', tier.color)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showChecklist && (
        <ul className="mt-2 space-y-1">
          {CHECKLIST_ITEMS.map((item) => {
            // Approximate: mark as done if the overall pct covers this item's weight.
            // The server computes the real score; we just give visual guidance.
            const done = clamped >= item.weight;
            return (
              <li
                key={item.label}
                className={cn(
                  'flex items-center gap-1.5 text-[11px]',
                  done ? 'text-ink-400 line-through opacity-60' : 'text-ink-300',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-1.5 w-1.5 rounded-full flex-shrink-0',
                    done ? 'bg-emerald-500' : 'bg-ink-700',
                  )}
                />
                {item.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
