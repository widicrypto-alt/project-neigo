'use client';
import { useState } from 'react';
import { Heart, Bookmark, Flower2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type ReactionKind = 'like' | 'bookmark' | 'rose';

interface Counts {
  like: number;
  bookmark: number;
  rose: number;
}

interface Props {
  counts: Counts;
  myReactions: ReactionKind[];
  onToggle?: (kind: ReactionKind) => Promise<void>;
  disabled?: boolean;
}

const REACTIONS: { kind: ReactionKind; Icon: React.ElementType; label: string; activeClass: string }[] = [
  { kind: 'like', Icon: Heart, label: 'Suka', activeClass: 'text-rose-500 fill-rose-500' },
  { kind: 'bookmark', Icon: Bookmark, label: 'Simpan', activeClass: 'text-amber-400 fill-amber-400' },
  { kind: 'rose', Icon: Flower2, label: 'Rose', activeClass: 'text-pink-400 fill-pink-400' },
];

export function ReactionBar({ counts, myReactions, onToggle, disabled }: Props) {
  const [pending, setPending] = useState<ReactionKind | null>(null);

  async function handleToggle(kind: ReactionKind) {
    if (!onToggle || pending || disabled) return;
    setPending(kind);
    try {
      await onToggle(kind);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {REACTIONS.map(({ kind, Icon, label, activeClass }) => {
        const active = myReactions.includes(kind);
        const count = counts[kind];
        return (
          <button
            key={kind}
            type="button"
            title={label}
            disabled={!!pending || disabled}
            onClick={() => handleToggle(kind)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-all',
              'border border-ink-700 hover:border-ink-500',
              active ? 'bg-ink-800 border-opacity-80' : 'bg-transparent',
              pending === kind && 'opacity-60 scale-95',
            )}
          >
            <Icon
              size={16}
              className={cn('transition-colors', active ? activeClass : 'text-ink-500')}
            />
            {count > 0 && (
              <span className={cn('tabular-nums', active ? 'text-ink-200' : 'text-ink-500')}>
                {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
