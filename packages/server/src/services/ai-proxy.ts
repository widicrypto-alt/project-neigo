import { env } from '../lib/env.js';
import { BYOK_OPENROUTER_BASE_URL } from '@neigo/shared';
import {
  assertBudget,
  assertGlobalBudget,
  recordCost,
  recordGlobalCost,
} from './cost-tracker.js';
import { recordError, recordLatency, parseCacheMetrics, type CacheMetrics } from './model-metrics.js';
import { countTokens } from './tokenizer.js';

/**
 * Thrown by {@link AiProxy} when the upstream returns a non-2xx response or
 * the stream fails before completion. Carries enough detail for callers
 * (specifically the orchestrator fallback chain) to decide whether to retry
 * without a user's BYOK key.
 */
export class AiUpstreamError extends Error {
  readonly code = 'ai_upstream_error';
  readonly status: number;
  readonly isByok: boolean;
  readonly model: string;
  constructor(message: string, opts: { status: number; isByok: boolean; model: string }) {
    super(message);
    this.name = 'AiUpstreamError';
    this.status = opts.status;
    this.isByok = opts.isByok;
    this.model = opts.model;
  }
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface AiCallOptions {
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
  stream?: boolean;
  tools?: AiToolDef[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  /**
   * If set, the call is attributed to this user: daily cost cap is enforced
   * before the request and actual usage is recorded after. Leave unset for
   * system/internal calls (e.g. background memory crystallization).
   */
  userId?: string;
  /** BYOK: user's own OpenRouter key (plaintext, never logged). Bypasses server budget. */
  byokKey?: string;
  /** BYOK: model slug chosen by user (e.g. 'anthropic/claude-sonnet-4-5'). */
  byokModel?: string;
  /** Per-model top_p sampling. */
  topP?: number;
  /** Per-model frequency penalty (helps reduce repetition). */
  frequencyPenalty?: number;
  /** Stop sequences (e.g. ChatML eos tokens). */
  stop?: string[];
}

export interface AiResult {
  content: string;
  toolCalls: AiToolCall[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  /** PLANv3 X7 — populated when upstream reports prompt-cache usage. */
  cacheMetrics?: CacheMetrics;
}

/** Resolve the API key — prefer dedicated Nous key, fall back to generic / OpenRouter. */
function resolveApiKey(): string | undefined {
  return env.NOUS_API_KEY ?? env.AI_API_KEY ?? env.OPENROUTER_API_KEY;
}

/** Resolve the light-model API key, falling back to the main Nous key. */
function resolveLightApiKey(): string | undefined {
  return env.NOUS_LIGHT_API_KEY ?? resolveApiKey();
}

/** Detect whether a model slug refers to the configured light model. */
function isLightModelSlug(slug: string | undefined): boolean {
  if (!slug) return false;
  return slug.toLowerCase() === env.AI_LIGHT_MODEL.toLowerCase();
}

interface ResolvedEndpoint {
  key: string;
  baseUrl: string;
  /** True when using the user's own OpenRouter key — budget tracking skipped. */
  isByok: boolean;
}

/** Resolve the upstream endpoint. BYOK takes priority over server keys. */
function resolveEndpoint(
  opts: Pick<AiCallOptions, 'byokKey' | 'model'>,
): ResolvedEndpoint | undefined {
  if (opts.byokKey) {
    return { key: opts.byokKey, baseUrl: BYOK_OPENROUTER_BASE_URL, isByok: true };
  }
  const key = isLightModelSlug(opts.model) ? resolveLightApiKey() : resolveApiKey();
  return key ? { key, baseUrl: env.AI_BASE_URL, isByok: false } : undefined;
}

/** Extra headers added to OpenRouter requests for app attribution. */
const OPENROUTER_ATTRIBUTION_HEADERS: Record<string, string> = {
  'HTTP-Referer': 'https://roleplay.neigo.my.id',
  'X-OpenRouter-Title': 'Project Neigo',
  'X-OpenRouter-Categories': 'roleplay',
};

/**
 * OpenRouter / OpenAI-compatible chat completion proxy.
 * Returns a full result for non-streaming, or yields text chunks for streaming.
 */
export class AiProxy {
  static async complete(opts: AiCallOptions): Promise<AiResult> {
    const endpoint = resolveEndpoint(opts);
    const isByok = endpoint?.isByok ?? false;

    if (!isByok) {
      assertGlobalBudget();
      if (opts.userId) assertBudget(opts.userId);
    }

    if (!endpoint) {
      // Local dev stub — echo a canned response
      const last = opts.messages[opts.messages.length - 1];
      return {
        content: `[stub response to: ${(last?.content ?? '').slice(0, 120)}]`,
        toolCalls: [],
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        model: 'stub',
      };
    }

    const model = isByok
      ? (opts.byokModel ?? opts.model ?? env.AI_MODEL)
      : (opts.model ?? env.AI_MODEL);

    const startedAt = performance.now();
    const res = await fetch(`${endpoint.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${endpoint.key}`,
        ...(isByok ? OPENROUTER_ATTRIBUTION_HEADERS : {}),
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.65,
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.topP !== undefined ? { top_p: opts.topP } : {}),
        ...(opts.frequencyPenalty !== undefined ? { frequency_penalty: opts.frequencyPenalty } : {}),
        ...(opts.stop?.length ? { stop: opts.stop } : {}),
        ...(opts.tools?.length ? { tools: opts.tools, tool_choice: opts.toolChoice ?? 'auto' } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      // Sanitize: never forward the raw OR body (may contain model slug, provider details)
      let errCode: string;
      try {
        const parsed = JSON.parse(body) as { error?: { code?: string | number } };
        errCode = String(parsed.error?.code ?? res.status);
      } catch {
        errCode = String(res.status);
      }
      recordError(model, errCode);
      throw new AiUpstreamError(`AI error: ${errCode}`, { status: res.status, isByok, model });
    }
    const data = (await res.json()) as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
        };
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        // PLANv3 X7 — Anthropic (via OpenRouter) + OpenAI-compatible cache fields.
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        prompt_tokens_cached?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
      model?: string;
    };
    const msg = data.choices[0]?.message;
    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;
    recordLatency(model, performance.now() - startedAt);
    if (!isByok) {
      if (opts.userId) {
        recordCost(opts.userId, promptTokens, completionTokens);
      } else {
        recordGlobalCost(promptTokens, completionTokens);
      }
    }
    return {
      content: msg?.content ?? '',
      toolCalls: (msg?.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        type: tc.type as 'function',
        function: tc.function,
      })),
      promptTokens,
      completionTokens,
      totalTokens: data.usage?.total_tokens ?? promptTokens + completionTokens,
      model: data.model ?? model,
      cacheMetrics: parseCacheMetrics(data),
    };
  }

  /**
   * Streaming variant — yields delta strings as they arrive.
   */
  static async *stream(opts: AiCallOptions): AsyncGenerator<string, void, unknown> {
    const endpoint = resolveEndpoint(opts);
    const isByok = endpoint?.isByok ?? false;

    if (!isByok) {
      assertGlobalBudget();
      if (opts.userId) assertBudget(opts.userId);
    }

    if (!endpoint) {
      const stub = `[stub stream — no AI API key configured (set NOUS_API_KEY)]`;
      for (const word of stub.split(' ')) {
        yield word + ' ';
        await new Promise((r) => setTimeout(r, 30));
      }
      return;
    }

    const model = isByok
      ? (opts.byokModel ?? opts.model ?? env.AI_MODEL)
      : (opts.model ?? env.AI_MODEL);

    const startedAt = performance.now();
    const res = await fetch(`${endpoint.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${endpoint.key}`,
        ...(isByok ? OPENROUTER_ATTRIBUTION_HEADERS : {}),
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.65,
        max_tokens: opts.maxTokens ?? 1024,
        stream: true,
        // PLANBv1 X3.3 — ask upstream to emit token usage in the final SSE chunk
        // (OpenAI / OpenRouter / Nous OpenAI-compatible spec). Falls through
        // gracefully for providers that ignore it (handled below).
        stream_options: { include_usage: true },
        ...(opts.topP !== undefined ? { top_p: opts.topP } : {}),
        ...(opts.frequencyPenalty !== undefined ? { frequency_penalty: opts.frequencyPenalty } : {}),
        ...(opts.stop?.length ? { stop: opts.stop } : {}),
      }),
    });
    if (!res.ok || !res.body) {
      recordError(model, String(res.status));
      throw new AiUpstreamError(`AI stream error ${res.status}`, {
        status: res.status,
        isByok,
        model,
      });
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completionText = '';
    let upstreamPromptTokens: number | null = null;
    let upstreamCompletionTokens: number | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) {
            completionText += chunk;
            yield chunk;
          }
          // Final chunk with stream_options.include_usage carries the official
          // token counts. Prefer upstream truth over our tokenizer estimate.
          if (parsed.usage) {
            if (typeof parsed.usage.prompt_tokens === 'number') {
              upstreamPromptTokens = parsed.usage.prompt_tokens;
            }
            if (typeof parsed.usage.completion_tokens === 'number') {
              upstreamCompletionTokens = parsed.usage.completion_tokens;
            }
          }
        } catch {
          // skip malformed
        }
      }
    }
    if (!isByok) {
      const promptText = opts.messages.map((m) => m.content).join('\n');
      const promptTokens =
        upstreamPromptTokens ?? (await countTokens(promptText));
      const completionTokens =
        upstreamCompletionTokens ?? (await countTokens(completionText));
      if (opts.userId) {
        recordCost(opts.userId, promptTokens, completionTokens);
      } else {
        recordGlobalCost(promptTokens, completionTokens);
      }
    }
    recordLatency(model, performance.now() - startedAt);
  }
}
