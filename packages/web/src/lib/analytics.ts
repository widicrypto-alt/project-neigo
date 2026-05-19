/**
 * Analytics stub — batches and sends events to /api/analytics/events.
 * Fails silently. Opt-out via localStorage 'neigo:analytics-optout' = '1'.
 */
import { api } from './api';

type Event = {
  name: string;
  entityType?: string | null;
  entityId?: string | null;
  props?: Record<string, unknown>;
};

let queue: Event[] = [];
let flushTimer: number | null = null;

function isOptedOut(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem('neigo:analytics-optout') === '1';
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await api.post('/api/analytics/events', { events: batch });
  } catch {
    // swallow
  }
}

export function trackEvent(name: string, props?: Record<string, unknown> & { entityType?: string; entityId?: string }): void {
  if (isOptedOut()) return;
  const { entityType, entityId, ...rest } = props ?? {};
  queue.push({ name, entityType, entityId, props: rest });
  if (flushTimer) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => { void flush(); }, 1500);
  if (queue.length >= 10) void flush();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { void flush(); });
}
