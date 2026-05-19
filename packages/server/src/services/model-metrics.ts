/**
 * In-memory per-model latency tracker.
 *
 * Keeps a ring buffer of the last N completion durations per model slug,
 * plus a transient error counter. Used by:
 *   - Orchestrator to emit `system_hint` SSE events when the current call
 *     is markedly slower than the recent average.
 *   - GET /api/byok to surface per-model averages on the settings page.
 *
 * Deliberately process-local (like cost-tracker). No DB table — on restart
 * the stats warm back up within a few turns.
 */

const MAX_SAMPLES = 20;
const STALE_MS = 60 * 60 * 1000; // drop entries older than 1h

interface ModelStats {
  samples: Array<{ ms: number; at: number }>;
  errors: number;
  lastError: { code: string; at: number } | null;
}

const buckets = new Map<string, ModelStats>();

function get(model: string): ModelStats {
  let s = buckets.get(model);
  if (!s) {
    s = { samples: [], errors: 0, lastError: null };
    buckets.set(model, s);
  }
  return s;
}

function prune(stats: ModelStats): void {
  const cutoff = Date.now() - STALE_MS;
  while (stats.samples.length > 0 && stats.samples[0]!.at < cutoff) {
    stats.samples.shift();
  }
}

/** Record the duration of a successful call. */
export function recordLatency(model: string, ms: number): void {
  if (!model || !Number.isFinite(ms) || ms <= 0) return;
  const stats = get(model);
  stats.samples.push({ ms, at: Date.now() });
  while (stats.samples.length > MAX_SAMPLES) stats.samples.shift();
}

/** Record a failure (HTTP non-2xx, timeout, etc). */
export function recordError(model: string, code: string): void {
  if (!model) return;
  const stats = get(model);
  stats.errors += 1;
  stats.lastError = { code, at: Date.now() };
}

export interface ModelLatencySummary {
  model: string;
  count: number;
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  errors: number;
  lastError: { code: string; at: number } | null;
}

/** Summarize stats for a single model (null if no samples). */
export function getLatency(model: string): ModelLatencySummary | null {
  const stats = buckets.get(model);
  if (!stats) return null;
  prune(stats);
  if (stats.samples.length === 0 && stats.errors === 0) return null;
  const sorted = [...stats.samples].map((s) => s.ms).sort((a, b) => a - b);
  const avg = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
  const p = (q: number) =>
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]! : 0;
  return {
    model,
    count: sorted.length,
    avgMs: Math.round(avg),
    p50Ms: p(0.5),
    p90Ms: p(0.9),
    errors: stats.errors,
    lastError: stats.lastError,
  };
}

/** Snapshot of all known models (for the /api/byok latency surface). */
export function getAllLatency(): ModelLatencySummary[] {
  const out: ModelLatencySummary[] = [];
  for (const key of buckets.keys()) {
    const s = getLatency(key);
    if (s) out.push(s);
  }
  return out.sort((a, b) => b.count - a.count);
}

/**
 * Returns true if a current call of `currentMs` is materially slower than
 * the recent average for the model (at least 3 prior samples needed to
 * avoid noise; ratio threshold defaults to 2x; absolute floor at 4s to
 * suppress hints for genuinely fast models).
 */
export function isSlowVsBaseline(
  model: string,
  currentMs: number,
  opts: { minSamples?: number; ratio?: number; floorMs?: number } = {},
): { slow: boolean; avgMs: number; ratio: number } {
  const minSamples = opts.minSamples ?? 3;
  const ratioThreshold = opts.ratio ?? 2;
  const floorMs = opts.floorMs ?? 4000;
  const summary = getLatency(model);
  if (!summary || summary.count < minSamples) return { slow: false, avgMs: 0, ratio: 0 };
  if (currentMs < floorMs) return { slow: false, avgMs: summary.avgMs, ratio: currentMs / summary.avgMs };
  const ratio = currentMs / Math.max(1, summary.avgMs);
  return { slow: ratio >= ratioThreshold, avgMs: summary.avgMs, ratio };
}

// ── PLANv3 X7 — prompt cache visibility ──────────────────────────────
/**
 * Upstream prompt-cache hit metrics. We track three variants seen in
 * the wild:
 *   - Anthropic via OpenRouter: `cache_creation_input_tokens` +
 *     `cache_read_input_tokens` in usage.
 *   - Some OpenRouter providers: `prompt_tokens_cached`.
 *   - OpenAI-style providers may nest under `usage.prompt_tokens_details.cached_tokens`.
 *
 * Missing fields stay undefined — consumers should treat "no entry" as
 * "no cache activity reported" rather than zero.
 */
export interface CacheMetrics {
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  promptTokensCached?: number;
}

export function parseCacheMetrics(raw: unknown): CacheMetrics {
  if (!raw || typeof raw !== 'object') return {};
  const usage =
    (raw as { usage?: unknown }).usage !== undefined && typeof (raw as { usage?: unknown }).usage === 'object'
      ? (raw as { usage: Record<string, unknown> }).usage
      : (raw as Record<string, unknown>);

  const out: CacheMetrics = {};
  const cci = pickNumber(usage, 'cache_creation_input_tokens');
  if (cci != null) out.cacheCreationInputTokens = cci;
  const cri = pickNumber(usage, 'cache_read_input_tokens');
  if (cri != null) out.cacheReadInputTokens = cri;
  const ptc = pickNumber(usage, 'prompt_tokens_cached');
  if (ptc != null) out.promptTokensCached = ptc;
  // OpenAI-style nested.
  const details = (usage as Record<string, unknown>).prompt_tokens_details;
  if (details && typeof details === 'object') {
    const ct = pickNumber(details as Record<string, unknown>, 'cached_tokens');
    if (ct != null && out.promptTokensCached == null) out.promptTokensCached = ct;
  }
  return out;
}

export function hasCacheActivity(m: CacheMetrics | null | undefined): boolean {
  if (!m) return false;
  return (
    (m.cacheCreationInputTokens ?? 0) > 0 ||
    (m.cacheReadInputTokens ?? 0) > 0 ||
    (m.promptTokensCached ?? 0) > 0
  );
}

function pickNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  return null;
}
