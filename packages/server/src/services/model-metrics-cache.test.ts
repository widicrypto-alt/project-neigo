/**
 * PLANv3 X7 — parseCacheMetrics covers the three upstream shapes we
 * observe in the wild (Anthropic via OpenRouter, OpenAI-compatible
 * nested, and generic `prompt_tokens_cached`).
 */
import { describe, it, expect } from 'bun:test';
import { parseCacheMetrics, hasCacheActivity } from './model-metrics.js';

describe('PLANv3 X7 — parseCacheMetrics', () => {
  it('pulls Anthropic cache fields from usage', () => {
    const raw = {
      usage: {
        prompt_tokens: 1200,
        completion_tokens: 180,
        cache_creation_input_tokens: 800,
        cache_read_input_tokens: 400,
      },
    };
    const m = parseCacheMetrics(raw);
    expect(m.cacheCreationInputTokens).toBe(800);
    expect(m.cacheReadInputTokens).toBe(400);
    expect(m.promptTokensCached).toBeUndefined();
    expect(hasCacheActivity(m)).toBe(true);
  });

  it('pulls OpenRouter generic prompt_tokens_cached', () => {
    const raw = { usage: { prompt_tokens_cached: 350 } };
    expect(parseCacheMetrics(raw).promptTokensCached).toBe(350);
  });

  it('falls back to OpenAI-style prompt_tokens_details.cached_tokens', () => {
    const raw = { usage: { prompt_tokens_details: { cached_tokens: 512 } } };
    expect(parseCacheMetrics(raw).promptTokensCached).toBe(512);
  });

  it('prefers explicit prompt_tokens_cached over nested details', () => {
    const raw = {
      usage: {
        prompt_tokens_cached: 100,
        prompt_tokens_details: { cached_tokens: 999 },
      },
    };
    expect(parseCacheMetrics(raw).promptTokensCached).toBe(100);
  });

  it('returns empty object when usage is missing', () => {
    expect(parseCacheMetrics({})).toEqual({});
    expect(parseCacheMetrics(null)).toEqual({});
    expect(parseCacheMetrics(undefined)).toEqual({});
    expect(hasCacheActivity(null)).toBe(false);
    expect(hasCacheActivity({})).toBe(false);
  });

  it('rejects non-numeric / negative cache counts', () => {
    const raw = {
      usage: {
        cache_creation_input_tokens: -1,
        cache_read_input_tokens: 'garbage',
        prompt_tokens_cached: NaN,
      },
    };
    expect(parseCacheMetrics(raw)).toEqual({});
  });

  it('accepts raw usage object (no outer wrapper)', () => {
    const raw = { cache_read_input_tokens: 64 };
    expect(parseCacheMetrics(raw).cacheReadInputTokens).toBe(64);
  });
});
