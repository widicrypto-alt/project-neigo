import { describe, it, expect } from 'bun:test';
import {
  parseDirectives,
  passesDirectiveGate,
} from './decorator-parser.js';

describe('PLANv3 X2.6 — parseDirectives', () => {
  it('parses every known directive and strips them from body', () => {
    const src = [
      '@@depth 2',
      '@@role system',
      '@@probability 75',
      '@@additional_keys dragon, flame',
      '@@exclude_keys evil',
      '@@match_full_word',
      '@@position before_char',
      '',
      'The castle is made of obsidian.',
    ].join('\n');
    const { parsed, directives } = parseDirectives(src);
    expect(directives.depth).toBe(2);
    expect(directives.role).toBe('system');
    expect(directives.probability).toBe(75);
    expect(directives.additionalKeys).toEqual(['dragon', 'flame']);
    expect(directives.excludeKeys).toEqual(['evil']);
    expect(directives.matchFullWord).toBe(true);
    expect(directives.position).toBe('before_char');
    expect(parsed).toBe('The castle is made of obsidian.');
  });

  it('preserves unknown @@directives inline', () => {
    const src = '@@not_a_thing 5\nBody.';
    const { parsed, directives } = parseDirectives(src);
    expect(Object.keys(directives).length).toBe(0);
    expect(parsed).toContain('@@not_a_thing 5');
  });

  it('clamps integer directives to valid ranges', () => {
    const src = '@@probability 250\n@@activate_only_every 0\nbody';
    const { directives } = parseDirectives(src);
    expect(directives.probability).toBe(100);
    expect(directives.activateOnlyEvery).toBe(1); // clamped min=1
  });

  it('rejects invalid role / position values', () => {
    const src = '@@role hacker\n@@position cellar\nbody';
    const { directives } = parseDirectives(src);
    expect(directives.role).toBeUndefined();
    expect(directives.position).toBeUndefined();
  });
});

describe('PLANv3 X2.6 — passesDirectiveGate', () => {
  const ctx = (over: Partial<{ turnCount: number; haystack: string; random: () => number }> = {}) => ({
    turnCount: 5,
    haystack: 'the dragon lives here',
    ...over,
  });

  it('activate_only_after gates by turn count', () => {
    expect(passesDirectiveGate({ activateOnlyAfter: 10 }, ctx({ turnCount: 5 }))).toBe(false);
    expect(passesDirectiveGate({ activateOnlyAfter: 3 }, ctx({ turnCount: 5 }))).toBe(true);
  });

  it('additional_keys requires ALL extra keys in haystack', () => {
    expect(
      passesDirectiveGate(
        { additionalKeys: ['dragon', 'missing'] },
        ctx({ haystack: 'dragon here' }),
      ),
    ).toBe(false);
    expect(
      passesDirectiveGate(
        { additionalKeys: ['dragon', 'lives'] },
        ctx({ haystack: 'the dragon lives here' }),
      ),
    ).toBe(true);
  });

  it('exclude_keys blocks activation when ANY key appears', () => {
    expect(
      passesDirectiveGate({ excludeKeys: ['evil'] }, ctx({ haystack: 'the evil dragon' })),
    ).toBe(false);
    expect(
      passesDirectiveGate({ excludeKeys: ['evil'] }, ctx({ haystack: 'the good dragon' })),
    ).toBe(true);
  });

  it('probability uses injected RNG', () => {
    // probability=50, random=0.2 → 0.2*100=20 < 50 → pass
    expect(passesDirectiveGate({ probability: 50 }, ctx({ random: () => 0.2 }))).toBe(true);
    // probability=50, random=0.8 → 0.8*100=80 >= 50 → fail
    expect(passesDirectiveGate({ probability: 50 }, ctx({ random: () => 0.8 }))).toBe(false);
  });

  it('activate_only_every gates by modulo', () => {
    expect(
      passesDirectiveGate({ activateOnlyEvery: 3 }, ctx({ turnCount: 6 })),
    ).toBe(true);
    expect(
      passesDirectiveGate({ activateOnlyEvery: 3 }, ctx({ turnCount: 7 })),
    ).toBe(false);
  });
});
