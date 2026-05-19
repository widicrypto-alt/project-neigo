'use client';
/**
 * TokenInfoPanel — 2-column labeled list of estimated token counts.
 * Works for both character (character/exampleDialog/total) and story
 * (plot/characters/total + per-scenario breakdown).
 */
export interface TokenInfoEntry {
  label: string;
  value: number;
}

export interface TokenInfoPanelProps {
  entries: TokenInfoEntry[];
  subRows?: Array<{ label: string; value: number }>;
  totalLabel?: string;
  totalValue?: number;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toString();
}

export function TokenInfoPanel({ entries, subRows, totalLabel, totalValue }: TokenInfoPanelProps) {
  if (entries.length === 0 && !totalValue && (!subRows || subRows.length === 0)) return null;
  return (
    <div className="rounded-lg border border-night-line bg-night-surface/40 p-4 text-xs">
      <p className="uppercase tracking-wider text-ink-500 mb-3">Perkiraan Token</p>
      <dl className="space-y-1.5">
        {entries.map((e) => (
          <div key={e.label} className="flex items-center justify-between">
            <dt className="text-ink-400">{e.label}</dt>
            <dd className="text-ink-200 font-mono">{fmt(e.value)}</dd>
          </div>
        ))}
        {subRows && subRows.length > 0 && (
          <details className="mt-2">
            <summary className="text-ink-500 cursor-pointer hover:text-ink-300">
              Per skenario ({subRows.length})
            </summary>
            <div className="mt-2 pl-2 space-y-1 border-l border-ink-800">
              {subRows.map((r, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-ink-500 truncate pr-2">{r.label}</span>
                  <span className="text-ink-300 font-mono shrink-0">{fmt(r.value)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
        {typeof totalValue === 'number' && (
          <div className="flex items-center justify-between pt-2 mt-2 border-t border-ink-800">
            <dt className="text-ink-300 font-medium">{totalLabel ?? 'Total'}</dt>
            <dd className="text-violet-300 font-mono font-semibold">{fmt(totalValue)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
