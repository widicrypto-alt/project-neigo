'use client';
/**
 * PLANv3 X2.8 — leaf component that reads live streaming tokens from
 * `chatStreamingBuffer` via `useSyncExternalStore`. Only this leaf
 * re-renders on chunk arrival; siblings and the surrounding message
 * list are unaffected.
 *
 * Intentionally dumb: the parent owns the bubble's kind/speaker styling
 * and simply passes a `render` function that receives the current text.
 */
import { memo, useSyncExternalStore } from 'react';
import { chatStreamingBuffer } from '@/lib/streaming-buffer';

export interface StreamingContentProps {
  messageId: string;
  render: (text: string) => React.ReactNode;
  /** Shown while the buffer is empty (before the first chunk lands). */
  placeholder?: React.ReactNode;
}

const ServerSnapshot = '' as const;

export const StreamingContent = memo(function StreamingContent({
  messageId,
  render,
  placeholder = null,
}: StreamingContentProps) {
  const text = useSyncExternalStore(
    (cb) => chatStreamingBuffer.subscribe(messageId, cb),
    () => chatStreamingBuffer.getSnapshot(messageId),
    () => ServerSnapshot,
  );
  if (!text) return <>{placeholder}</>;
  return <>{render(text)}</>;
});
