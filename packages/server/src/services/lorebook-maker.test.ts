/**
 * Wk12 G5 — lorebook-maker JSON extraction tests.
 *
 * Exercises just the pure parsing path: feeding various model-style
 * responses and confirming the draft normaliser behaves.
 */
import { describe, test, expect } from 'bun:test';

// Re-create the pure bits under test. The service module also imports
// AiProxy; to keep the test hermetic we inline the extractor + normaliser.

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

function normalizeDraft(parsed: unknown) {
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

describe('lorebook-maker JSON extraction', () => {
  test('parses bare JSON', () => {
    const raw = '{"title":"t","content":"c","keywords":["a","b"],"priority":70,"depth":3}';
    const parsed = extractJson(raw);
    const draft = normalizeDraft(parsed);
    expect(draft).not.toBeNull();
    expect(draft!.priority).toBe(70);
    expect(draft!.depth).toBe(3);
    expect(draft!.keywords).toEqual(['a', 'b']);
  });

  test('parses fenced JSON with prose', () => {
    const raw = 'Here you go:\n```json\n{"title":"x","content":"y","keywords":["z"]}\n```\nEnjoy.';
    const draft = normalizeDraft(extractJson(raw));
    expect(draft?.title).toBe('x');
    expect(draft?.priority).toBe(50); // default
    expect(draft?.depth).toBe(2);
  });

  test('returns null for missing keywords', () => {
    const draft = normalizeDraft(extractJson('{"title":"a","content":"b","keywords":[]}'));
    expect(draft).toBeNull();
  });

  test('clamps priority / depth out of range', () => {
    const raw = '{"title":"a","content":"b","keywords":["k"],"priority":9999,"depth":-5}';
    const draft = normalizeDraft(extractJson(raw));
    expect(draft?.priority).toBe(100);
    expect(draft?.depth).toBe(1);
  });

  test('drops empty / non-string keywords', () => {
    const raw = '{"title":"a","content":"b","keywords":["keep","",null,42,"also"]}';
    const draft = normalizeDraft(extractJson(raw));
    expect(draft?.keywords).toEqual(['keep', 'also']);
  });

  test('rejects trailing garbage but no JSON', () => {
    expect(extractJson('totally not json')).toBeNull();
  });
});
