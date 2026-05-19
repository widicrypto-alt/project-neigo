/**
 * PLANBv1 — X3.3 real tokenizer (shared service).
 *
 * Wraps `gpt-tokenizer`'s cl100k_base encoding as the universal proxy
 * tokenizer for all OpenRouter / Nous / Anthropic / DeepSeek upstreams.
 *
 * Why cl100k as universal proxy: within ±10% of Llama/Mistral/Qwen BPE
 * for our Indo–JP–EN traffic mix. Billing truth still comes from
 * OpenRouter / Nous `usage` in the SSE stream (see ai-proxy.ts); this
 * service only fills the gap when upstream omits usage, or when we
 * need pre-request budgeting (lorebook retriever, context compaction).
 *
 * Policy:
 *   • `estimateTokensFast(text)`  — synchronous `ceil(len/4)` baseline;
 *     always available; used on hot paths where we already stored an
 *     accurate count at write time.
 *   • `countTokens(text)`         — accurate, lazy-loads cl100k on
 *     first call, falls back to fast path on any error. Safe in
 *     post-turn fire-and-forget paths.
 *   • `warmTokenizer()`           — fire-and-forget on boot so cold
 *     requests don't pay the dynamic-import tax.
 */

type EncoderModule = {
  countTokens: (input: string) => number;
};

let encoder: EncoderModule | null = null;
let loadPromise: Promise<EncoderModule> | null = null;

/** Synchronous heuristic — always available, never throws. */
export function estimateTokensFast(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Lazy-load cl100k once. Subsequent callers share the same promise. */
async function loadEncoder(): Promise<EncoderModule> {
  if (encoder) return encoder;
  if (!loadPromise) {
    loadPromise = import('gpt-tokenizer/encoding/cl100k_base').then(
      (m) => {
        encoder = { countTokens: m.countTokens };
        return encoder;
      },
    );
  }
  return loadPromise;
}

/**
 * Accurate token count. Never throws — falls back to the heuristic on
 * any loader or encoder error.
 */
export async function countTokens(text: string): Promise<number> {
  if (!text) return 0;
  try {
    const enc = await loadEncoder();
    return enc.countTokens(text);
  } catch {
    return estimateTokensFast(text);
  }
}

/**
 * Batch variant for arrays of strings. Single lazy-load, single error
 * boundary, returns per-element counts.
 */
export async function countTokensBatch(texts: string[]): Promise<number[]> {
  if (texts.length === 0) return [];
  try {
    const enc = await loadEncoder();
    return texts.map((t) => (t ? enc.countTokens(t) : 0));
  } catch {
    return texts.map(estimateTokensFast);
  }
}

/**
 * Warm the encoder on server boot (fire-and-forget). Pay the ~5–10 ms
 * dynamic-import cost once up front so the first real request doesn't
 * stall.
 */
export function warmTokenizer(): void {
  void countTokens('warmup');
}
