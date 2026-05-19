/**
 * BACKLOG B2.4 — Extracted CharacterLinker.
 *
 * Toggle-button multi-select that links characters to a consumer (e.g. a
 * scenario's `castSubset`, or a story's primary cast).
 *
 * First extracted consumer: studio/stories/[id]/edit/page.tsx (castSubset
 * per scenario). Potential second consumer: story create/edit wizard cast tab.
 */
'use client';
import { cn } from '@/lib/cn';

export interface LinkableCharacter {
  characterId: string;
  displayName: string;
  avatarUrl?: string | null;
}

interface Props {
  /** Full cast pool to pick from. */
  cast: LinkableCharacter[];
  /** Currently selected character IDs. */
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Optional: allow toggling ALL quickly. */
  allowSelectAll?: boolean;
  disabled?: boolean;
}

export function CharacterLinker({
  cast,
  selected,
  onChange,
  allowSelectAll = false,
  disabled = false,
}: Props) {
  function toggle(characterId: string) {
    if (selected.includes(characterId)) {
      onChange(selected.filter((id) => id !== characterId));
    } else {
      onChange([...selected, characterId]);
    }
  }

  function selectAll() {
    onChange(cast.map((c) => c.characterId));
  }

  function clearAll() {
    onChange([]);
  }

  if (cast.length === 0) {
    return (
      <span className="text-xs text-ink-500">Belum ada cast pada cerita ini.</span>
    );
  }

  return (
    <div className="space-y-2">
      {allowSelectAll && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={selectAll}
            className="text-[11px] text-violet-400 hover:underline disabled:opacity-40"
          >
            Pilih semua
          </button>
          <span className="text-ink-700">·</span>
          <button
            type="button"
            disabled={disabled}
            onClick={clearAll}
            className="text-[11px] text-ink-500 hover:underline disabled:opacity-40"
          >
            Hapus pilihan
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {cast.map((c) => {
          const active = selected.includes(c.characterId);
          return (
            <button
              key={c.characterId}
              type="button"
              disabled={disabled}
              onClick={() => toggle(c.characterId)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-fast disabled:cursor-not-allowed disabled:opacity-40',
                active
                  ? 'border-violet-accent bg-violet-accent/15 text-ink-50'
                  : 'border-night-line bg-night-surface text-ink-300 hover:border-ink-700',
              )}
            >
              {c.avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.avatarUrl}
                  alt=""
                  className="h-4 w-4 rounded-full object-cover"
                />
              )}
              {c.displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
