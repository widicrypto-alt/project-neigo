'use client';
import Image from 'next/image';
import Link from 'next/link';

export interface CastMember {
  characterId: string;
  displayName: string;
  role: string;
  avatarUrl?: string | null;
}

export interface CastStripProps {
  cast: CastMember[];
}

export function CastStrip({ cast }: CastStripProps) {
  if (!cast || cast.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
      {cast.map((m) => (
        <Link
          key={m.characterId}
          href={`/characters/${m.characterId}`}
          className="group shrink-0 w-20 flex flex-col items-center gap-1 text-center"
        >
          <div className="relative w-14 h-14 rounded-full overflow-hidden bg-ink-800 border border-ink-700 group-hover:border-violet-500 transition-colors">
            {m.avatarUrl ? (
              <Image src={m.avatarUrl} alt={m.displayName} fill sizes="56px" className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lg text-ink-600">
                ✦
              </div>
            )}
          </div>
          <p className="text-[10px] text-ink-300 line-clamp-2 group-hover:text-violet-300">
            {m.displayName}
          </p>
          {m.role && (
            <p className="text-[9px] text-ink-600 uppercase tracking-wider line-clamp-1">
              {m.role}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}
