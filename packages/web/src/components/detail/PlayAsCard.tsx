'use client';
import Image from 'next/image';
import Link from 'next/link';

export interface PlayAsCardProps {
  character: { id: string; name: string; avatarUrl?: string | null } | null | undefined;
}

export function PlayAsCard({ character }: PlayAsCardProps) {
  if (!character) return null;
  return (
    <Link
      href={`/characters/${character.id}`}
      className="block rounded-2xl border border-violet-500/40 bg-gradient-to-r from-violet-900/30 via-violet-950/20 to-ink-900/40 px-4 py-4 hover:border-violet-400 transition-colors group"
    >
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="relative w-14 h-14 rounded-full overflow-hidden bg-ink-800 border-2 border-violet-400/50">
            {character.avatarUrl ? (
              <Image src={character.avatarUrl} alt={character.name} fill sizes="56px" className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lg">✨</div>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-violet-400">Play as</p>
          <p className="text-lg font-bold text-ink-100 truncate group-hover:text-violet-200">
            {character.name.toUpperCase()}
          </p>
        </div>
      </div>
    </Link>
  );
}
