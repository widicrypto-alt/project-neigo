'use client';

import { useEffect, useRef, useCallback, memo } from 'react';
import MessageBubble from './MessageBubble';
import type { MessageNode } from '@/lib/chat-experience';

interface MessageStreamProps {
  messages: MessageNode[];
  isLoading?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * MessageStream - Paragraph-by-paragraph streaming message display
 * 
 * Features:
 * - Auto-scroll to bottom on new message
 * - Streaming paragraph reveal animation
 * - Variable reveal delay (380-760ms per paragraph)
 */
function MessageStream({
  messages,
  isLoading = false,
  scrollRef,
}: MessageStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<string | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const currentLastMessage = messages[messages.length - 1]?.id;
    
    if (currentLastMessage !== lastMessageRef.current) {
      lastMessageRef.current = currentLastMessage || null;
      
      // Scroll to bottom after a short delay for smooth animation
      const scrollContainer = scrollRef?.current || containerRef.current;
      if (scrollContainer) {
        setTimeout(() => {
          scrollContainer.scrollTo({
            top: scrollContainer.scrollHeight,
            behavior: 'smooth',
          });
        }, 100);
      }
    }
  }, [messages, scrollRef]);

  // Handle streaming message completion
  const handleMessageComplete = useCallback(() => {
    const scrollContainer = scrollRef?.current || containerRef.current;
    if (scrollContainer) {
      setTimeout(() => {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth',
        });
      }, 100);
    }
  }, [scrollRef]);

  // Find the last streaming message index
  const lastStreamingIndex = messages.reduce((lastIndex, msg, index) => {
    if (msg.id.includes('streaming') || msg.id.includes('typing')) {
      return index;
    }
    return lastIndex;
  }, -1);

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-6 min-h-full"
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
    >
      {/* Messages */}
      {messages.map((message, index) => {
        const isLastStreaming = index === lastStreamingIndex && isLoading;
        
        return (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={isLastStreaming}
            onComplete={isLastStreaming ? handleMessageComplete : undefined}
          />
        );
      })}

      {/* Loading indicator */}
      {isLoading && lastStreamingIndex === -1 && (
        <div className="flex items-center gap-2 py-4">
          <div className="vn-typing-indicator">
            <span className="vn-typing-dot" />
            <span className="vn-typing-dot" />
            <span className="vn-typing-dot" />
          </div>
          <span className="text-sm text-ink-400">
            Sedang mengetik...
          </span>
        </div>
      )}

      {/* Bottom fade gradient for scroll indication */}
      <div
        className="h-20 -mt-16 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(8, 5, 3, 0.9) 0%, transparent 100%)',
        }}
        aria-hidden="true"
      />
    </div>
  );
}

export default memo(MessageStream);
