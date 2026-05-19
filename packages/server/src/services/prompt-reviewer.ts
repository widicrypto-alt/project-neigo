/**
 * Wk12 PLANv2 G6 — Prompt Reviewer.
 *
 * Second-pass, cheap-model review of an already-captured prompt snapshot.
 * Produces a small structured score + reasoning bullets that the FE
 * surfaces in the F4 Prompt Inspector. Gated at the route layer to PAID.
 *
 * We deliberately send only the assembled MESSAGES (no sampling, no row
 * metadata) so the reviewer is focused on prompt quality, not
 * infrastructure. The reviewer verdict is logged into session_events
 * (event_type='prompt_review') for later analytics.
 */

import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { env } from '../lib/env.js';
import { AiProxy } from './ai-proxy.js';

export interface PromptReviewInput {
  snapshotId: string;
  userId: string;
}

export interface PromptReviewResult {
  score: number; // 0-100
  verdict: 'pass' | 'warn' | 'fail';
  highlights: string[]; // 1-5 short bullets
  suggestions: string[]; // 1-5 short bullets
  prompt: string; // the review prompt we sent (for transparency)
  raw: string;
}

const SYSTEM = `You are a prompt-quality reviewer. You read an assembled \
chat-LLM prompt (system + extra system + history + latest user) and report \
how well it is likely to steer the model. Be terse, concrete, and favour \
actionable feedback over praise. Never roleplay. Never answer the prompt.`;

function buildReviewPrompt(messages: Array<{ role: string; content: string }>): string {
  // Keep each message capped so we don't blow context. Prefer first and
  // last chunks (system blocks up top, recent turns at the bottom).
  const MAX_PER_MSG = 1500;
  const slices = messages.map((m) => {
    const c = m.content.length > MAX_PER_MSG
      ? `${m.content.slice(0, MAX_PER_MSG / 2)}\n…[truncated]…\n${m.content.slice(-MAX_PER_MSG / 2)}`
      : m.content;
    return `[${m.role}]\n${c}`;
  });

  return [
    'Review this prompt. Output strict JSON only:',
    '{',
    '  "score": 0-100 integer,',
    '  "verdict": "pass" | "warn" | "fail",',
    '  "highlights": ["<=12 words", "..."],   // 1-5 strengths',
    '  "suggestions": ["<=12 words", "..."]   // 1-5 concrete fixes',
    '}',
    '',
    'Rubric:',
    '- Persona clarity (voice anchors, style, constraints).',
    '- Scene grounding (who/where/when is explicit).',
    '- Contradictions between system blocks.',
    '- Leakage of meta / instruction stubs.',
    '- Recency-bias: is the latest user turn well-supported?',
    '',
    'PROMPT:',
    '─────────────',
    slices.join('\n\n'),
    '─────────────',
  ].join('\n');
}

function extractJson(raw: string): unknown | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  try {
    return JSON.parse(body.slice(first, last + 1));
  } catch {
    return null;
  }
}

function clampScore(n: unknown): number {
  const num = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(num)) return 50;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function asVerdict(v: unknown, score: number): 'pass' | 'warn' | 'fail' {
  if (v === 'pass' || v === 'warn' || v === 'fail') return v;
  if (score >= 75) return 'pass';
  if (score >= 45) return 'warn';
  return 'fail';
}

function asBullets(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((s) => s.length > 0)
    .slice(0, 5);
}

export async function reviewPromptSnapshot(
  input: PromptReviewInput,
): Promise<PromptReviewResult | null> {
  const snap = await db.query.promptSnapshots.findFirst({
    where: eq(schema.promptSnapshots.id, input.snapshotId),
  });
  if (!snap) return null;
  if (snap.userId !== input.userId) return null;

  const messages = (snap.messages as Array<{ role: string; content: string }>) ?? [];
  const prompt = buildReviewPrompt(messages);

  const result = await AiProxy.complete({
    model: env.AI_LIGHT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    maxTokens: 600,
    userId: input.userId,
  });

  const raw = result.content ?? '';
  const parsed = extractJson(raw) as Record<string, unknown> | null;
  const score = clampScore(parsed?.score);
  const verdict = asVerdict(parsed?.verdict, score);
  const highlights = asBullets(parsed?.highlights);
  const suggestions = asBullets(parsed?.suggestions);

  // Log to session_events for later F4 UI / analytics. Best-effort.
  try {
    await db.insert(schema.sessionEvents).values({
      id: nanoid(),
      sessionId: snap.sessionId,
      userId: input.userId,
      characterId: snap.characterId ?? null,
      eventType: 'prompt_review',
      payload: {
        snapshotId: snap.id,
        score,
        verdict,
        highlights,
        suggestions,
      },
      turnIndex: snap.turnIndex ?? null,
    });
  } catch (err) {
    console.warn('[prompt-reviewer] event log failed', err);
  }

  return { score, verdict, highlights, suggestions, prompt, raw };
}
