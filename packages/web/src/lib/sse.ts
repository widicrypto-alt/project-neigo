import type { SseEvent } from '@neigo/shared';
import { API_BASE } from './api';

export interface SseOptions {
  onEvent: (event: SseEvent) => void;
  onError?: (err: Error) => void;
  onDone?: () => void;
  signal?: AbortSignal;
}

interface StreamState {
  streamId: string | null;
  lastEventId: number;
  sawDone: boolean;
}

const MAX_RESUME_ATTEMPTS = 3;
const RESUME_BACKOFF_MS = [300, 800, 1800];

/**
 * Read an SSE body stream, dispatching events to the caller. Updates
 * `state` with the latest event id / streamId / done marker so a caller
 * that catches a transport error can resume where it left off.
 *
 * Returns `true` if the stream ended cleanly (reader.done), `false` if it
 * was aborted. Throws on network errors so the outer resume loop can react.
 */
async function consumeStream(
  res: Response,
  opts: SseOptions,
  state: StreamState,
): Promise<void> {
  if (!res.body) throw new Error('SSE response had no body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      let data = '';
      let idField: string | null = null;
      for (const l of lines) {
        if (l.startsWith('data:')) data += l.slice(5).trim();
        else if (l.startsWith('id:')) idField = l.slice(3).trim();
      }
      if (idField) {
        const n = Number.parseInt(idField, 10);
        if (Number.isFinite(n) && n > state.lastEventId) state.lastEventId = n;
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as SseEvent;
        // Transport-level events — handled internally, not forwarded.
        if (parsed.type === 'stream_ready') {
          state.streamId = parsed.streamId;
          continue;
        }
        if (parsed.type === 'resume_paused') {
          // Buffer exhausted but upstream still writing; break out so the
          // resume loop can wait + re-poll with the latest lastEventId.
          return;
        }
        if (parsed.type === 'error') {
          state.sawDone = true;
          // Note: we type cast safely assuming error events have a message
          opts.onError?.(new Error((parsed as any).message || 'Server-sent stream error.'));
          continue;
        }
        opts.onEvent(parsed);
        if (parsed.type === 'done') state.sawDone = true;
      } catch (err) {
        console.warn('bad SSE chunk', err, data);
      }
    }
  }
}

async function fetchResumeStream(
  streamId: string,
  since: number,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${API_BASE}/api/chat/stream/${streamId}/resume?since=${since}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'text/event-stream' },
    signal,
  });
}

/** POST JSON body and stream back `SseEvent` objects. */
export async function postSse(path: string, body: unknown, opts: SseOptions) {
  const state: StreamState = { streamId: null, lastEventId: 0, sawDone: false };

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) {
      const errorText = await res.text().catch(() => '');
      let message = `SSE error ${res.status}`;
      if (errorText) {
        try {
          const parsed = JSON.parse(errorText) as { message?: string; error?: string };
          message = parsed.message ?? parsed.error ?? message;
        } catch {
          message = errorText;
        }
      }
      opts.onError?.(new Error(message));
      return;
    }
    await consumeStream(res, opts, state);
  } catch (error) {
    if (opts.signal?.aborted) return;
    // Network error mid-stream — fall through to resume loop below if we
    // learned the streamId in time; otherwise report to the caller.
    if (!state.streamId) {
      opts.onError?.(
        error instanceof Error ? error : new Error('SSE request failed.'),
      );
      return;
    }
  }

  if (state.sawDone) {
    opts.onDone?.();
    return;
  }

  // Resume loop: stream ended without `done` and we have a streamId.
  // Poll the resume endpoint up to N times with backoff.
  if (state.streamId) {
    for (let attempt = 0; attempt < MAX_RESUME_ATTEMPTS; attempt += 1) {
      if (opts.signal?.aborted) return;
      await new Promise((r) => setTimeout(r, RESUME_BACKOFF_MS[attempt] ?? 2000));
      try {
        const res = await fetchResumeStream(state.streamId, state.lastEventId, opts.signal);
        if (!res.ok) continue;
        await consumeStream(res, opts, state);
        if (state.sawDone) {
          opts.onDone?.();
          return;
        }
      } catch (err) {
        if (opts.signal?.aborted) return;
        // Retry on transient errors; give up after the loop exhausts.
        if (attempt === MAX_RESUME_ATTEMPTS - 1) {
          opts.onError?.(
            err instanceof Error ? err : new Error('SSE resume failed.'),
          );
          return;
        }
      }
    }
  }

  opts.onError?.(new Error('SSE stream ended before completion.'));
}
