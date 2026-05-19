'use client';

import { cn } from '@/lib/cn';

export type DiscoverTab = 'all' | 'stories' | 'characters';

interface Props {
  active: DiscoverTab;
  onChange: (tab: DiscoverTab) => void;
  counts?: Partial<Record<DiscoverTab, number>>;
}

const TABS: Array<{ key: DiscoverTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'stories', label: 'Stories' },
  { key: 'characters', label: 'Characters' },
];

export function DiscoverTabBar({ active, onChange, counts }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Discover categories"
      className="flex items-center gap-1 border-b border-white/[0.06]"
    >
      {TABS.map((t) => {
        const isActive = active === t.key;
        const count = counts?.[t.key];
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              'group relative inline-flex items-center gap-1.5 px-4 py-3 text-[0.95rem] transition-colors',
              isActive ? 'font-semibold text-ink-50' : 'font-medium text-ink-500 hover:text-ink-100',
            )}
          >
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-accent-400 to-violet-400" />
            )}
            <span>{t.label}</span>
            {typeof count === 'number' ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-mono tabular-nums transition-colors',
                  isActive
                    ? 'bg-accent-500/20 text-accent-200'
                    : 'bg-white/[0.05] text-ink-500',
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
