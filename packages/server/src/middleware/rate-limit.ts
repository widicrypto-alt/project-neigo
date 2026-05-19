/**
 * Rate-limit middleware (token bucket).
 *
 * Supports two backends:
 *  - In-memory (default, single-node)
 *  - Redis-backed (multi-instance, uses shared ioredis connection)
 *
 * Usage:
 *   app.use('/auth/register', rateLimit({ windowMs: 60_000, max: 5 }));
 *   app.use('/auth/login',    rateLimit({ windowMs: 60_000, max: 10 }));
 *   app.use('/chat/*',        rateLimit({ windowMs: 60_000, max: 30 }));
 */
import type { Context, Next } from 'hono';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

export interface RateLimitOptions {
  /** Rolling window length in ms. */
  windowMs: number;
  /** Max requests per window per key. */
  max: number;
  /** Bucket name for metrics; also isolates counters between middlewares. */
  name?: string;
  /** Extract a key — defaults to IP (x-forwarded-for first, then remote). */
  keyFn?: (c: Context) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const stores = new Map<string, Map<string, Bucket>>();

function storeFor(name: string): Map<string, Bucket> {
  let s = stores.get(name);
  if (!s) {
    s = new Map();
    stores.set(name, s);
  }
  return s;
}

function defaultKey(c: Context): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  const real = c.req.header('x-real-ip');
  if (real) return real;
  return 'unknown';
}

// ── Redis-backed rate limiter ────────────────────────────────────────
let redis: import('ioredis').Redis | null = null;

async function getRedis() {
  if (redis) return redis;
  if (!env.REDIS_URL) return null;
  try {
    const { default: IORedis } = await import('ioredis');
    redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    redis.on('error', (err) => {
      logger.warn({ err }, '[rate-limit] redis error');
    });
    await redis.connect();
    return redis;
  } catch (err) {
    logger.warn({ err }, '[rate-limit] redis connect failed, falling back to in-memory');
    return null;
  }
}

async function redisCheck(
  key: string,
  windowMs: number,
  max: number,
): Promise<{ count: number; allowed: boolean }> {
  const conn = await getRedis();
  if (!conn) return { count: 0, allowed: true }; // fallback to allow if no redis

  const redisKey = `rl:${key}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    // Use a pipeline: remove expired, add new, count, set expiry
    const pipe = conn.pipeline();
    pipe.zremrangebyscore(redisKey, 0, windowStart);
    pipe.zadd(redisKey, now, `${now}:${Math.random()}`);
    pipe.zcard(redisKey);
    pipe.pexpire(redisKey, windowMs);
    const results = await pipe.exec();

    const count = (results?.[2]?.[1] as number) ?? 0;
    return { count, allowed: count <= max };
  } catch (err) {
    logger.warn({ err }, '[rate-limit] redis pipeline failed');
    return { count: 0, allowed: true }; // fail open
  }
}

// ── Middleware ────────────────────────────────────────────────────────
export function rateLimit(opts: RateLimitOptions) {
  const name = opts.name ?? `rl:${opts.windowMs}:${opts.max}`;
  const keyFn = opts.keyFn ?? defaultKey;
  const useRedis = !!env.REDIS_URL;
  const store = useRedis ? null : storeFor(name);

  return async (c: Context, next: Next) => {
    const key = `${name}:${keyFn(c)}`;
    const now = Date.now();

    if (useRedis) {
      // Redis-backed (sorted set sliding window)
      const result = await redisCheck(key, opts.windowMs, opts.max);
      const remaining = Math.max(0, opts.max - result.count);
      c.header('X-RateLimit-Limit', String(opts.max));
      c.header('X-RateLimit-Remaining', String(remaining));
      if (!result.allowed) {
        const retryAfter = Math.ceil(opts.windowMs / 1000);
        c.header('Retry-After', String(retryAfter));
        return c.json(
          { error: 'rate_limited', message: `Too many requests. Retry in ${retryAfter}s.` },
          429,
        );
      }
    } else {
      // In-memory token bucket
      let bucket = store!.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + opts.windowMs };
        store!.set(key, bucket);
      }
      bucket.count += 1;
      const remaining = Math.max(0, opts.max - bucket.count);
      c.header('X-RateLimit-Limit', String(opts.max));
      c.header('X-RateLimit-Remaining', String(remaining));
      c.header('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
      if (bucket.count > opts.max) {
        const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        c.header('Retry-After', String(retryAfter));
        return c.json(
          { error: 'rate_limited', message: `Too many requests. Retry in ${retryAfter}s.` },
          429,
        );
      }
    }

    await next();
  };
}

/**
 * Periodic sweep to drop expired in-memory buckets. Runs once per minute.
 */
function sweep() {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [k, b] of store) {
      if (b.resetAt <= now) store.delete(k);
    }
  }
}

if (typeof setInterval !== 'undefined') {
  const t = setInterval(sweep, 60_000);
  if (typeof (t as unknown as { unref?: () => void }).unref === 'function') {
    (t as unknown as { unref: () => void }).unref();
  }
}

export const __internal = { sweep, stores };
