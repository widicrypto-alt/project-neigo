'use client';

import { memo, useCallback } from 'react';
import Link from 'next/link';

interface ChatHeaderProps {
  characterName?: string;
  sessionTitle?: string;
  onBack?: () => void;
  onSettings?: () => void;
}

/**
 * ChatHeader - Top navigation for the chat page
 * 
 * Features:
 * - Back button
 * - Character/Session title
 * - Settings menu
 */
function ChatHeader({
  characterName = 'Character',
  sessionTitle,
  onBack,
  onSettings,
}: ChatHeaderProps) {
  const displayTitle = sessionTitle || characterName;

  return (
    <header className="fixed top-0 left-0 right-0 z-20 h-14 bg-gradient-to-b from-[#07080f] via-[#07080f]/95 to-transparent">
      <div className="flex items-center justify-between h-full px-4">
        {/* Left: Back Button */}
        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              onClick={onBack}
              aria-label="Kembali"
              title="Kembali"
            >
              <svg
                className="w-5 h-5 text-ink-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : (
            <Link
              href="/chat"
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              aria-label="Kembali ke daftar chat"
              title="Kembali"
            >
              <svg
                className="w-5 h-5 text-ink-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          )}
        </div>

        {/* Center: Title */}
        <div className="flex-1 flex items-center justify-center">
          <h1 className="text-sm font-medium text-ink-100 truncate max-w-[200px] md:max-w-[300px]">
            {displayTitle}
          </h1>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {/* Settings Button */}
          {onSettings && (
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              onClick={onSettings}
              aria-label="Pengaturan"
              title="Pengaturan"
            >
              <svg
                className="w-5 h-5 text-ink-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          )}

          {/* More Options */}
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
            aria-label="Opsi lainnya"
            title="Opsi lainnya"
          >
            <svg
              className="w-5 h-5 text-ink-300"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

export default memo(ChatHeader);
