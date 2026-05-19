/**
 * Wk12 PLANv2 G5 — AI Lorebook Maker.
 *
 * Takes a user-supplied topic/seed + (optional) existing entry context and
 * calls the light model to draft a lorebook entry. The raw prompt is
 * surfaced back to the caller (PLANv2 §152 — users can edit & retry the
 * prompt) alongside the structured draft.
 *
 * The service intentionally does NOT persist the entry. The route layer
 * hands the draft to the FE for review; the FE creates the entry via the
 * existing POST /api/lorebooks/:id/entries endpoint once the user saves.
 */

import { env } from '../lib/env.js';
import { AiProxy } from './ai-proxy.js';

export interface LorebookMakerInput {
  /** Free-form seed text: a topic, a character name, a region, etc. */
  seed: string;
  /** Optional: existing entries (title + content) to avoid redundant drafts. */
  existing?: Array<{ title: string; content: string }>;
  /** Optional: preferred style hints (e.g. "encyclopedic", "tavern rumor"). */
  styleHint?: string;
}

export interface LorebookMakerDraft {
  title: string;
  content: string;
  keywords: string[];
  priority: number;
  depth: number;
}

export interface LorebookMakerResult {
  /** Structured draft or null if parsing failed (raw still returned). */
  draft: LorebookMakerDraft | null;
  /** Raw model output (for debugging + user prompt-edit retry UX). */
  raw: string;
  /** The composed prompt that was sent to the model (for edit-and-retry). */
  prompt: string;
  /** Token usage from the call. */
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

const SYSTEM = `You draft single lorebook entries for interactive fiction. \
Given a topic seed, write one concise, evocative, self-contained worldbuilding entry. \
Keep content under 500 words. Pick 3-8 trigger keywords that would naturally appear in \
dialogue referencing the entry. Never invent meta-commentary; write the entry as if it \
were pulled from a wiki in-world.`;

function buildUserPrompt(input: LorebookMakerInput): string {
  const parts: string[] = [];
  parts.push(`TOPIC SEED:\n${input.seed.trim()}`);
  if (input.styleHint?.trim()) {
    parts.push(`STYLE HINT: ${input.styleHint.trim()}`);
  }
  if (input.existing && input.existing.length > 0) {
    const list = input.existing
      .slice(0, 12)
      .map((e, i) => `${i + 1}. ${e.title} — ${e.content.slice(0, 120).replace(/\s+/g, ' ')}`)
      .join('\n');
    parts.push(`EXISTING ENTRIES (avoid overlap):\n${list}`);
  }
  parts.push(
    [
      'OUTPUT FORMAT (strict JSON, nothing else):',
      '{',
      '  "title": "short title, <= 80 chars",',
      '  "content": "main entry body, 80-500 words",',
      '  "keywords": ["kw1", "kw2", "..."],',
      '  "priority": 50,',
      '  "depth": 2',
      '}',
      '- priority is 0-100 (default 50).',
      '- depth is 1-4 (how many turns the entry stays hot; default 2).',
      '- keywords: 3 to 8 short trigger words or phrases, each <= 40 chars.',
    ].join('\n'),
  );
  return parts.join('\n\n');
}

/** Best-effort JSON extraction — tolerates markdown fences and prose wrappers. */
function extractJson(raw: string): unknown | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const firstBrace = body.indexOf('{');
  const lastBrace = body.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  const slice = body.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function clampNumber(n: unknown, min: number, max: number, fallback: number): number {
  const num = typeof n === 'number' && Number.isFinite(n) ? n : Number(n);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function normalizeDraft(parsed: unknown): LorebookMakerDraft | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title.trim().slice(0, 200) : '';
  const content = typeof obj.content === 'string' ? obj.content.trim().slice(0, 8000) : '';
  const rawKeywords = Array.isArray(obj.keywords) ? obj.keywords : [];
  const keywords = rawKeywords
    .map((k) => (typeof k === 'string' ? k.trim().slice(0, 80) : ''))
    .filter((k) => k.length > 0)
    .slice(0, 30);
  if (!title || !content || keywords.length === 0) return null;
  return {
    title,
    content,
    keywords,
    priority: clampNumber(obj.priority, 0, 100, 50),
    depth: clampNumber(obj.depth, 1, 4, 2),
  };
}

export async function generateLorebookEntry(
  input: LorebookMakerInput,
  opts: { userId?: string } = {},
): Promise<LorebookMakerResult> {
  const prompt = buildUserPrompt(input);
  const result = await AiProxy.complete({
    model: env.AI_LIGHT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    maxTokens: 1200,
    userId: opts.userId,
  });
  const raw = result.content ?? '';
  const parsed = extractJson(raw);
  const draft = normalizeDraft(parsed);
  return {
    draft,
    raw,
    prompt,
    usage: {
      promptTokens: result.promptTokens ?? 0,
      completionTokens: result.completionTokens ?? 0,
    },
  };
}
