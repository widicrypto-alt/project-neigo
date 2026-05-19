'use client';

import { cn } from '@/lib/cn';

export interface CastMember {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isSpeaking?: boolean;
  trustScore?: number | null;
}

interface CastRosterProps {
  /** All cast members in the current scene */
  members: CastMember[];
  /** Currently active speaker */
  activeSpeakerId?: string | null;
  /** Callback when user taps a cast member */
  onSelectMember?: (memberId: string) => void;
}

export function CastRoster({ members, activeSpeakerId, onSelectMember }: CastRosterProps) {
  if (members.length < 3) return null;

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2 border-b border-white/[0.06] bg-ink-900/80 backdrop-blur-sm">
      {members.map((member) => {
        const isActive = activeSpeakerId === member.id;
        return (
          <button
            key={member.id}
            type="button"
            onClick={() => onSelectMember?.(member.id)}
            className={cn(
              'group relative flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition-all',
              isActive
                ? 'bg-accent-500/20 border border-accent-500/40'
                : 'hover:bg-white/[0.05] border border-transparent',
            )}
          >
            {/* Avatar circle */}
            <div className="relative">
              <div className={cn(
                'h-10 w-10 rounded-full overflow-hidden border-2 transition-all',
                isActive ? 'border-accent-400 scale-105' : 'border-white/[0.15] group-hover:border-white/[0.25]',
              )}>
                {member.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={member.avatarUrl}
                    alt={member.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-ink-800 flex items-center justify-center text-ink-400 text-xs font-semibold">
                    {member.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              {/* Speaking indicator dot */}
              {isActive && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-accent-400 animate-pulse border border-ink-900" />
              )}
            </div>
            {/* Name */}
            <span className={cn(
              'text-[10px] font-medium transition-colors truncate max-w-[60px]',
              isActive ? 'text-accent-200' : 'text-ink-400 group-hover:text-ink-200',
            )}>
              {member.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
