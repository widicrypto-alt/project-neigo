'use client';

import { forwardRef, useImperativeHandle, useRef, memo } from 'react';
import MessageStream from './MessageStream';
import type { MessageNode } from '@/lib/chat-experience';

interface ChatColumnProps {
  characterName: string;
  messages: MessageNode[];
  isLoading?: boolean;
  className?: string;
}

export interface ChatColumnHandle {
  scrollToBottom: () => void;
  getScrollPosition: () => number;
}

/**
 * ChatColumn - Scrollable message area
 * 
 * Layout:
 * ┌─────────────────────────────────┐
 * │         ChatHeader              │
 * ├─────────────────────────────────┤
 * │                                 │
 * │       MessageStream             │
 * │       ├── MessageBubble[]       │
 * │       └── Loading indicator      │
 * │                                 │
 * │                                 │
 * └─────────────────────────────────┘
 */
const ChatColumn = forwardRef<ChatColumnHandle, ChatColumnProps>(
  function ChatColumn(
    { characterName, messages, isLoading = false, className = '' },
    ref
  ) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Expose scroll methods to parent
    useImperativeHandle(ref, () => ({
      scrollToBottom: () => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
          });
        }
      },
      getScrollPosition: () => {
        return scrollRef.current?.scrollTop ?? 0;
      },
    }));

    return (
      <main
        ref={scrollRef}
        className={`vn-chat-column ${className}`}
        data-chat-column
        role="main"
        aria-label={`Chat with ${characterName}`}
      >
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Welcome message for empty state */}
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-900/40 to-orange-950/50 flex items-center justify-center mb-6">
                <span className="text-3xl">✨</span>
              </div>
              <h2 className="text-xl font-semibold text-ink-100 mb-2">
                Mulai Percakapan
              </h2>
              <p className="text-ink-400 max-w-sm">
                Ketik pesan untuk berbicara dengan {characterName}
              </p>
            </div>
          )}

          {/* Message Stream */}
          <MessageStream
            messages={messages}
            isLoading={isLoading}
            scrollRef={scrollRef}
          />
        </div>
      </main>
    );
  }
);

export default memo(ChatColumn);
