/**
 * Section E2 — SSE resume buffer.
 *
 * Each /turn stream pushes a monotonically-numbered frame into a short-lived
 * Redis list keyed by streamId. If a client drops mid-stream it reconnects
 * to `/api/chat/stream/:streamId/resume?since=<n>` which replays whatever
 * frames are still buffered (TTL 5 min) and then closes.
 *
 * This is best-effort: we do NOT try to mid-flight attach to an orchestrator
 * that is still generating. Once the original handler finishes, the stream
 * list is finalised with a special marker so the resume endpoint knows when
 * to close.
 *
 * Degraded mode: if Redis is unreachable, everything no-ops and we fall back
 * to the pre-E2 behaviour (no resume).
 */
import { getQueueConnection } from './queue.js';

const STREAM_TTL_SECONDS = 300;
const DONE_MARKER = '__DONE__';

export interface BufferedFrame {
  id: number;
  event: string;
  data: string;
}

function streamKey(streamId: string): string {
  return `sse:stream:${streamId}`;
}

/**
 * Append a frame to the Redis buffer. Fire-and-forget — returns whether the
 * buffer is active (Redis reachable). Caller should use the return value
 * only to decide whether to bother tracking streamId on the client.
 */
export async function bufferFrame(
  streamId: string,
  frame: BufferedFrame,
): Promise<boolean> {
  const conn = getQueueConnection();
  if (!conn) return false;
  try {
    const key = streamKey(streamId);
    const payload = JSON.stringify(frame);
    await conn
      .multi()
      .rpush(key, payload)
      .expire(key, STREAM_TTL_SECONDS)
      .exec();
    return true;
  } catch {
    return false;
  }
}

/**
 * Finalise the buffer: append a sentinel frame so the resume endpoint knows
 * the original stream completed and it can close after replaying.
 */
export async function finalizeStream(streamId: string): Promise<void> {
  const conn = getQueueConnection();
  if (!conn) return;
  try {
    const key = streamKey(streamId);
    await conn
      .multi()
      .rpush(key, DONE_MARKER)
      .expire(key, STREAM_TTL_SECONDS)
      .exec();
  } catch {
    // best-effort
  }
}

/**
 * Read the frames starting at index `since` (exclusive). Returns the frames
 * plus a `done` flag that is true when the DONE_MARKER sentinel has been
 * seen (meaning the original stream already completed and the resume client
 * may close).
 */
export async function readFramesSince(
  streamId: string,
  since: number,
): Promise<{ frames: BufferedFrame[]; done: boolean; exists: boolean }> {
  const conn = getQueueConnection();
  if (!conn) return { frames: [], done: false, exists: false };
  const key = streamKey(streamId);
  try {
    const raw = await conn.lrange(key, 0, -1);
    if (!raw || raw.length === 0) return { frames: [], done: false, exists: false };
    const frames: BufferedFrame[] = [];
    let done = false;
    for (const item of raw) {
      if (item === DONE_MARKER) {
        done = true;
        continue;
      }
      try {
        const parsed = JSON.parse(item) as BufferedFrame;
        if (parsed.id > since) frames.push(parsed);
      } catch {
        // skip corrupt frame
      }
    }
    return { frames, done, exists: true };
  } catch {
    return { frames: [], done: false, exists: false };
  }
}
