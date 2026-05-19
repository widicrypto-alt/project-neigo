'use client';
/**
 * BACKLOG B2.11 — [TRACK:] FE display.
 *
 * Renders session tracker key-values (stored in session.metadata.trackers
 * by the orchestrator after parsing [TRACK: key=value|...] model output)
 * as a horizontal scrollable row of chips. Shown just below the story
 * chrome bar when trackers are present.
 *
 * Numeric values get a subtle bar-fill to hint at scale (capped at the
 * configured max or 100). String values render as plain chips.
 */

interface Props {
  trackers: Record<string, string> | null | undefined;
}

/** Tries to parse a value as a finite number. */
function asNum(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Compact pretty-print: integers as-is, decimals to 2 places. */
function fmtVal(v: string): string {
  const n = asNum(v);
  if (n == null) return v;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Colour palette — cycle through a small set so chips stay visually distinct. */
const PALETTE = [
  'border-violet-500/30 bg-violet-500/10 text-violet-200',
  'border-iris-500/30 bg-iris-500/10 text-iris-200',
  'border-warmth-500/30 bg-warmth-500/10 text-warmth-200',
  'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  'border-sky-500/30 bg-sky-500/10 text-sky-200',
  'border-rose-500/30 bg-rose-500/10 text-rose-200',
];

export default function TrackerBar({ trackers }: Props) {
  if (!trackers) return null;
  const entries = Object.entries(trackers);
  if (entries.length === 0) return null;

  return (
    <div
      className="border-b border-white/[0.04] bg-night-surface/40 px-4 py-1.5"
      aria-label="Tracker sesi"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-1.5 overflow-x-auto scrollbar-none">
        <span className="shrink-0 text-[9px] uppercase tracking-widest text-ink-500 font-medium pr-1">
          TRACK
        </span>
        {entries.map(([key, val], i) => {
          const num = asNum(val);
          const color = PALETTE[i % PALETTE.length]!;
          return (
            <span
              key={key}
              title={`${key} = ${val}`}
              className={`inline-flex items-center gap-1.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`}
            >
              <span className="text-inherit/70 font-normal opacity-70">{key}</span>
              <span className="font-mono tabular-nums">{fmtVal(val)}</span>
              {num != null && num >= 0 && num <= 200 && (
                <span className="relative h-1 w-10 rounded-full bg-white/10 overflow-hidden">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-current opacity-50"
                    style={{ width: `${Math.min(100, num)}%` }}
                  />
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
