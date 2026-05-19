/**
 * In-memory per-user cost counter + daily circuit breaker.
 *
 * v7 economics: Hermes-4-405B is the only model. Pricing (per 1M tokens):
 *   prompt: $0.09
 *   completion: $0.37
 *
 * Goal: protect the $20 alpha budget. Per-user daily cents cap; when exceeded,
 * `AiProxy` throws `CostBudgetExceededError` so the route can return 402.
 *
 * Not persisted: resets on process restart. That is intentional for alpha —
 * promotes to Redis when we go multi-node. Logs also hit `api_usage` in DB
 * via the existing path, so the authoritative trail survives restarts.
 */

import { env } from '../lib/env.js';

/** Prices per 1M tokens, in USD. Source: Nous inference pricing page. */
const PRICE = {
  promptPerM: 0.09,
  completionPerM: 0.37,
} as const;

export function costUsd(promptTokens: number, completionTokens: number): number {
  return (
    (promptTokens / 1_000_000) * PRICE.promptPerM +
    (completionTokens / 1_000_000) * PRICE.completionPerM
  );
}

interface DailyBucket {
  /** Cents spent today (integer, rounded up so we never undercount). */
  cents: number;
  /** UNIX ms when the bucket rolls over. */
  resetAt: number;
}

const DAILY_MS = 24 * 60 * 60 * 1000;

/** Per-user daily cap in cents. Default 50¢ — i.e. ~580 turns per user/day. */
const DEFAULT_DAILY_CAP_CENTS = env.AI_USER_DAILY_CAP_CENTS;
/** Global daily cap in cents. Default $20/day for closed alpha protection. */
const DEFAULT_GLOBAL_DAILY_CAP_CENTS = env.AI_GLOBAL_DAILY_CAP_CENTS;

const userDaily = new Map<string, DailyBucket>();
let globalDaily: DailyBucket = { cents: 0, resetAt: Date.now() + DAILY_MS };

export class CostBudgetExceededError extends Error {
  code = 'cost_budget_exceeded' as const;
  constructor(
    public userId: string,
    public usedCents: number,
    public capCents: number,
  ) {
    super(`Daily cost cap hit for user ${userId}: ${usedCents}¢ / ${capCents}¢`);
  }
}

export class GlobalCostBudgetExceededError extends Error {
  code = 'global_cost_budget_exceeded' as const;
  constructor(
    public usedCents: number,
    public capCents: number,
  ) {
    super(`Global daily cost cap hit: ${usedCents}¢ / ${capCents}¢`);
  }
}

function bucket(userId: string): DailyBucket {
  const now = Date.now();
  let b = userDaily.get(userId);
  if (!b || b.resetAt <= now) {
    b = { cents: 0, resetAt: now + DAILY_MS };
    userDaily.set(userId, b);
  }
  return b;
}

function globalBucket(): DailyBucket {
  const now = Date.now();
  if (globalDaily.resetAt <= now) {
    globalDaily = { cents: 0, resetAt: now + DAILY_MS };
  }
  return globalDaily;
}

/** Called *before* a call: reject early if already over cap. */
export function assertBudget(userId: string, capCents = DEFAULT_DAILY_CAP_CENTS): void {
  const b = bucket(userId);
  if (b.cents >= capCents) {
    throw new CostBudgetExceededError(userId, b.cents, capCents);
  }
}

/** Called before a call: reject early if global daily cap is exhausted. */
export function assertGlobalBudget(capCents = DEFAULT_GLOBAL_DAILY_CAP_CENTS): void {
  const b = globalBucket();
  if (b.cents >= capCents) {
    throw new GlobalCostBudgetExceededError(b.cents, capCents);
  }
}

/** Called *after* a call: record actual cost. */
export function recordCost(userId: string, promptTokens: number, completionTokens: number): void {
  const cents = Math.ceil(costUsd(promptTokens, completionTokens) * 100);
  if (cents <= 0) return;
  const g = globalBucket();
  g.cents += cents;
  const b = bucket(userId);
  b.cents += cents;
}

/** Record non-user-attributed calls (background jobs/system prompts). */
export function recordGlobalCost(promptTokens: number, completionTokens: number): void {
  const cents = Math.ceil(costUsd(promptTokens, completionTokens) * 100);
  if (cents <= 0) return;
  const g = globalBucket();
  g.cents += cents;
}

/** Read-only snapshot for admin/debug. */
export function getUserDaily(userId: string): { cents: number; resetAt: number } {
  const b = bucket(userId);
  return { cents: b.cents, resetAt: b.resetAt };
}

export function getGlobalDaily(): { cents: number; resetAt: number } {
  const b = globalBucket();
  return { cents: b.cents, resetAt: b.resetAt };
}

export function getBudgetCaps(): { userDailyCapCents: number; globalDailyCapCents: number } {
  return {
    userDailyCapCents: DEFAULT_DAILY_CAP_CENTS,
    globalDailyCapCents: DEFAULT_GLOBAL_DAILY_CAP_CENTS,
  };
}

export function listTopUserDaily(limit = 20): Array<{ userId: string; cents: number; resetAt: number }> {
  return Array.from(userDaily.entries())
    .map(([userId, b]) => ({ userId, cents: b.cents, resetAt: b.resetAt }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, Math.max(1, limit));
}

export const __internal = {
  userDaily,
  DEFAULT_DAILY_CAP_CENTS,
  DEFAULT_GLOBAL_DAILY_CAP_CENTS,
  globalBucket,
};
