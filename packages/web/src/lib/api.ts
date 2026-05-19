// In the browser, all /api/* calls go through Next.js rewrites → backend.
// On the server (SSR), we call the backend directly.
const API =
  typeof window === 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000')
    : '';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function userFacingApiMessage(error: unknown, fallback = 'Request failed.'): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : fallback;
  }
  switch (error.code) {
    case 'tier_limit':
      return error.message || 'Your current plan limit has been reached.';
    case 'tier_required':
      return 'This feature requires a higher plan.';
    case 'cost_budget_exceeded':
      return 'Your daily AI budget is exhausted. Please try again tomorrow.';
    case 'global_cost_budget_exceeded':
      return 'Service is temporarily busy. Please try again later.';
    case 'rate_limited':
      return 'Too many requests. Please wait a moment and retry.';
    default:
      return error.message || fallback;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${API}${path}`, {
        ...init,
        signal: controller.signal,
        credentials: 'include',
        // API JSON is never safe to serve from an HTTP cache — auth state,
        // tier limits, streaming prep, and session telemetry must always hit origin.
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
      clearTimeout(timeout);

      const text = await res.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new ApiError(res.status, 'invalid_json', 'Server returned malformed response');
      }

      if (!res.ok) {
        const d = (data ?? {}) as { error?: unknown; message?: string };
        const code = typeof d.error === 'string' ? d.error : 'request_failed';
        const err = new ApiError(res.status, code, d.message);

        // Only retry on 5xx errors (server errors), not 4xx (client errors)
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          lastError = err;
          continue;
        }
        throw err;
      }
      return data as T;
    } catch (err) {
      clearTimeout(timeout);

      if (err instanceof ApiError) throw err;

      // Retry on network errors and timeouts
      if (attempt < MAX_RETRIES) {
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('Request failed after retries');
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, init),
  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'DELETE' }),
};

export const API_BASE = API;
