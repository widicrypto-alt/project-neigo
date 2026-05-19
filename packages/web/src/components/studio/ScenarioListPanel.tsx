/**
 * BACKLOG B2.4 — Extracted ScenarioListPanel.
 *
 * Sidebar list of scenarios with UP/DOWN reorder controls and an "Add" button.
 * First extracted consumer: studio/stories/[id]/edit/page.tsx.
 * Potential second consumer: a scenario quick-picker modal / template cloner.
 */
'use client';
import { cn } from '@/lib/cn';
import { Plus } from 'lucide-react';

export interface ScenarioItem {
  id: string;
  title: string | null;
  tileSubtitle?: string | null;
}

interface Props {
  scenarios: ScenarioItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  creating?: boolean;
}

export function ScenarioListPanel({
  scenarios,
  activeId,
  onSelect,
  onCreate,
  creating = false,
}: Props) {
  return (
    <aside className="space-y-2">
      <button
        onClick={onCreate}
        disabled={creating}
        className="flex w-full items-center justify-center gap-2 rounded-token-md border border-dashed border-night-line bg-night-surface/40 py-2 text-xs text-ink-300 transition-fast hover:border-violet-accent hover:text-ink-100 disabled:opacity-50"
      >
        <Plus size={14} /> {creating ? 'Membuat…' : 'Tambah skenario'}
      </button>
      {scenarios.map((s, i) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={cn(
            'w-full rounded-token-md border px-3 py-2 text-left text-sm transition-fast',
            activeId === s.id
              ? 'border-violet-accent bg-violet-accent/10 text-ink-50'
              : 'border-night-line bg-night-surface text-ink-300 hover:border-ink-700',
          )}
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-500">
            Skenario {i + 1}
          </div>
          <div className="line-clamp-1 font-medium">{s.title || '(tanpa judul)'}</div>
          {s.tileSubtitle ? (
            <div className="line-clamp-1 text-[11px] text-ink-500">{s.tileSubtitle}</div>
          ) : null}
        </button>
      ))}
    </aside>
  );
}
