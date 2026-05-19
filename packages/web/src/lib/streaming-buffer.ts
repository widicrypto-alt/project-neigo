/**
 * PLANv3 X2.8 — streaming isolation.
 *
 * Isolates live SSE token streams from the React component tree so that
 * new chunks arriving at 60 Hz do NOT trigger `setState` in the chat page
 * (which would re-render the entire MessageList + every BubbleView).
 *
 * Pattern: an external store keyed by messageId. The streaming bubble
 * component subscribes via `useSyncExternalStore` to its own id only,
 * so only that single leaf re-renders per chunk.
 *
 * Lifecycle:
 *   1. page handler: `chatStreamingBuffer.reset(id)` when the first chunk
 *      for a new messageId arrives (implicit on `append`).
 *   2. page handler: `chatStreamingBuffer.append(id, chunk)` on every chunk.
 *   3. page handler: on `done`, read the accumulated `getSnapshot(id)`,
 *      commit it into React state as a finalized bubble, then
 *      `chatStreamingBuffer.clear(id)` once the static bubble renders.
 *
 * Notifiers are fired synchronously — React 18's automatic batching will
 * coalesce microtask-adjacent re-renders. We intentionally keep the set
 * of listeners per-id so unrelated bubbles never wake up.
 */

type Listener = () => void;

const contents = new Map<string, string>();
const listeners = new Map<string, Set<Listener>>();

function notify(id: string) {
  const set = listeners.get(id);
  if (!set) return;
  for (const cb of set) cb();
}

export const chatStreamingBuffer = {
  getSnapshot(id: string): string {
    return contents.get(id) ?? '';
  },

  subscribe(id: string, cb: Listener): () => void {
    let set = listeners.get(id);
    if (!set) {
      set = new Set();
      listeners.set(id, set);
    }
    set.add(cb);
    return () => {
      const s = listeners.get(id);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) listeners.delete(id);
    };
  },

  append(id: string, chunk: string): void {
    const prev = contents.get(id) ?? '';
    contents.set(id, prev + chunk);
    notify(id);
  },

  /** Replace the buffer for `id` (used when recovering from resume). */
  set(id: string, content: string): void {
    contents.set(id, content);
    notify(id);
  },

  /** Drop the entry — call after the static bubble has committed. */
  clear(id: string): void {
    if (!contents.has(id)) return;
    contents.delete(id);
    notify(id);
  },

  /** Debug / testing helper. */
  _sizeForTest(): number {
    return contents.size;
  },
};

export type ChatStreamingBuffer = typeof chatStreamingBuffer;
