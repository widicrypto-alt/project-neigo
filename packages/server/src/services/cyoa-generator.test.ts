/**
 * Unit tests for the Wk5 F3 CYOA generator parser.
 *
 * Focused on `tryParse` since it runs on untrusted LLM output and is the
 * most likely failure surface. Live upstream calls are not exercised here.
 */
import { describe, it, expect } from 'bun:test';
import { _internal } from './cyoa-generator.js';

const { tryParse, buildPrompt } = _internal;

describe('cyoa-generator tryParse', () => {
  it('parses a clean JSON object with choices array', () => {
    const raw = JSON.stringify({
      choices: [
        { label: 'Stay', sendText: 'aku tetap di sini.' },
        { label: 'Leave', sendText: 'aku pergi dari kafe.' },
      ],
    });
    const result = tryParse(raw);
    expect(result).toHaveLength(2);
    expect(result[0]?.label).toBe('Stay');
  });

  it('strips code-fence wrappers', () => {
    const raw = '```json\n{"choices":[{"label":"A","sendText":"aa"},{"label":"B","sendText":"bb"}]}\n```';
    const result = tryParse(raw);
    expect(result).toHaveLength(2);
  });

  it('accepts a raw array shape', () => {
    const raw = JSON.stringify([
      { label: 'A', sendText: 'aa' },
      { label: 'B', sendText: 'bb' },
      { label: 'C', sendText: 'cc' },
    ]);
    const result = tryParse(raw);
    expect(result).toHaveLength(3);
  });

  it('returns [] for fewer than 2 items', () => {
    const raw = JSON.stringify({ choices: [{ label: 'only', sendText: 'only one' }] });
    expect(tryParse(raw)).toEqual([]);
  });

  it('caps at 4 items', () => {
    const raw = JSON.stringify({
      choices: Array.from({ length: 6 }, (_, i) => ({
        label: `L${i}`,
        sendText: `text ${i}`,
      })),
    });
    expect(tryParse(raw)).toHaveLength(4);
  });

  it('dedupes by casefolded sendText', () => {
    const raw = JSON.stringify({
      choices: [
        { label: 'A', sendText: 'Hello there.' },
        { label: 'B', sendText: 'hello THERE.' },
        { label: 'C', sendText: 'Different reply.' },
      ],
    });
    const result = tryParse(raw);
    expect(result).toHaveLength(2);
  });

  it('rejects oversize labels (> 32 chars)', () => {
    const raw = JSON.stringify({
      choices: [
        { label: 'x'.repeat(33), sendText: 'ok' },
        { label: 'ok', sendText: 'fine' },
      ],
    });
    expect(tryParse(raw)).toEqual([]);
  });

  it('rejects oversize sendText (> 240 chars)', () => {
    const raw = JSON.stringify({
      choices: [
        { label: 'short', sendText: 'x'.repeat(241) },
        { label: 'ok', sendText: 'fine' },
      ],
    });
    expect(tryParse(raw)).toEqual([]);
  });

  it('returns [] on non-JSON garbage', () => {
    expect(tryParse('not json at all')).toEqual([]);
    expect(tryParse('')).toEqual([]);
  });

  it('extracts the first {...} block when prose wraps the JSON', () => {
    const raw = 'Sure! Here you go: {"choices":[{"label":"a","sendText":"aa"},{"label":"b","sendText":"bb"}]} — enjoy.';
    const result = tryParse(raw);
    expect(result).toHaveLength(2);
  });
});

describe('cyoa-generator buildPrompt', () => {
  it('produces a system+user pair with the character name', () => {
    const msgs = buildPrompt({
      characterName: 'Kaia',
      userName: 'Aku',
      lastCharacterText: '"Mau ngobrol bentar?"',
      recentHistory: [{ role: 'CHARACTER', text: 'Halo.' }],
      trustScore: 40,
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[0]?.content).toContain('Kaia');
    expect(msgs[1]?.content).toContain('"Mau ngobrol bentar?"');
  });

  it('raises intimacy gate at high trust', () => {
    const low = buildPrompt({
      characterName: 'K',
      userName: 'A',
      lastCharacterText: 'x',
      recentHistory: [],
      trustScore: 20,
    });
    const high = buildPrompt({
      characterName: 'K',
      userName: 'A',
      lastCharacterText: 'x',
      recentHistory: [],
      trustScore: 80,
    });
    expect(low[0]?.content).toMatch(/not yet high enough/i);
    expect(high[0]?.content).toMatch(/allowed when they fit naturally/i);
  });
});
