import type { Context } from 'hono';
import type { SseEvent } from '@neigo/shared';
import { streamSSE } from 'hono/streaming';
import { nanoid } from 'nanoid';
import { bufferFrame, finalizeStream, readFramesSince, type BufferedFrame } from './sse-buffer.js';

/**
 * Wk1 P0 cache-bust audit (PLANv2 §6 item 1).
 *
 * Force every SSE response off every cache layer. Defense-in-depth against
 * intermediary proxies, buggy SW revalidation, and browsers that cache the
 * open stream frame based on `Cache-Control: no-cache` (revalidate) alone.
 *
 *  - `no-store`       — proxies & browsers must not persist any byte.
 *  - `no-transform`   — blocks gzip-on-proxy from merging/splitting frames.
 *  - `X-Accel-Buffering: no` — disables nginx buffering (harmless elsewhere).
 */
function applyStreamNoStoreHeaders(c: Context): void {
  c.header('Cache-Control', 'no-store, no-transform, must-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('X-Accel-Buffering', 'no');
}

/**
 * Helper to stream SseEvent objects as Server-Sent Events.
 *
 * Section E2 additions:
 *  - Each emitted frame carries an `id:` field (monotonic per stream).
 *  - Each frame is also mirrored to a short-lived Redis list so a client
 *    that drops mid-stream can reconnect via the resume endpoint and pick
 *    up any events it missed.
 *
 * The handler receives an `emit` function and a `streamId` it can surface
 * to the client (e.g. as an initial `{type: 'stream_ready', streamId}`
 * event) so the client knows which key to resume against.
 */
export async function sseResponse(
  c: Context,
  handler: (
    emit: (event: SseEvent) => Promise<void>,
    ctx: { streamId: string },
  ) => Promise<void>,
) {
  const streamId = nanoid(16);
  applyStreamNoStoreHeaders(c);
  return streamSSE(c, async (stream) => {
    let seq = 0;
    const emit = async (event: SseEvent) => {
      seq += 1;
      const data = JSON.stringify(event);
      // Mirror into Redis first (best-effort, no await blocker for the wire).
      void bufferFrame(streamId, { id: seq, event: event.type, data });
      await stream.writeSSE({
        id: String(seq),
        event: event.type,
        data,
      });
    };
    // Keepalive comment every 15 s — prevents QUIC idle-timeout during long
    // LLM calls where no events are in-flight.
    const keepalive = setInterval(() => {
      void stream.write(': ping\n\n');
    }, 15_000);
    try {
      await handler(emit, { streamId });
    } catch (err) {
      await emit({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearInterval(keepalive);
      void finalizeStream(streamId);
    }
  });
}

/**
 * Replay any buffered frames for an existing stream to a resumed client.
 * Emits frames with id > `since`, then closes. If the original stream is
 * still in-flight (no DONE marker) the client is expected to wait briefly
 * and poll this endpoint again; we return what we have today plus a
 * `resume_paused` marker.
 */
export async function sseResumeResponse(
  c: Context,
  streamId: string,
  since: number,
) {
  applyStreamNoStoreHeaders(c);
  return streamSSE(c, async (stream) => {
    const { frames, done, exists } = await readFramesSince(streamId, since);
    if (!exists) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ type: 'error', message: 'stream_expired' }),
      });
      return;
    }
    for (const f of frames as BufferedFrame[]) {
      await stream.writeSSE({
        id: String(f.id),
        event: f.event,
        data: f.data,
      });
    }
    if (!done) {
      await stream.writeSSE({
        event: 'resume_paused',
        data: JSON.stringify({ type: 'resume_paused' }),
      });
    }
  });
}
