import { describe, it, expect } from 'bun:test';
import { runRegexScripts, type RegexScript } from '@neigo/shared';

function s(p: Partial<RegexScript>): RegexScript {
  return {
    id: 's1',
    findRegex: '',
    replaceString: '',
    trimStrings: [],
    flags: 'g',
    ...p,
  };
}

describe('PLANv3 X2.5 — runRegexScripts', () => {
  it('applies basic replacement with g flag', () => {
    const r = runRegexScripts('foo foo bar', [s({ findRegex: 'foo', replaceString: 'BAR' })], {
      turnIndex: 0,
    });
    expect(r.text).toBe('BAR BAR bar');
    expect(r.applied).toEqual(['s1']);
    expect(r.errors).toEqual([]);
  });

  it('rejects invalid pattern and skips without breaking pipeline', () => {
    const r = runRegexScripts(
      'keep me',
      [
        s({ id: 'bad', findRegex: '(' }),
        s({ id: 'good', findRegex: 'me', replaceString: 'YOU' }),
      ],
      { turnIndex: 0 },
    );
    expect(r.text).toBe('keep YOU');
    expect(r.applied).toEqual(['good']);
    expect(r.errors[0]?.id).toBe('bad');
    expect(r.errors[0]?.reason).toContain('invalid_pattern');
  });

  it('honours min/max depth', () => {
    const scripts = [s({ id: 'a', findRegex: 'x', replaceString: 'A', minDepth: 0, maxDepth: 2 })];
    expect(runRegexScripts('x', scripts, { turnIndex: 1 }).text).toBe('A');
    expect(runRegexScripts('x', scripts, { turnIndex: 5 }).text).toBe('x');
  });

  it('truncates oversize input and reports', () => {
    const big = 'a'.repeat(1024);
    const r = runRegexScripts(big, [], { turnIndex: 0, maxInputBytes: 100 });
    expect(r.text.length).toBe(100);
    expect(r.errors[0]?.reason).toBe('input_truncated');
  });

  it('rejects patterns that exceed the length cap', () => {
    const r = runRegexScripts('x', [s({ findRegex: 'a'.repeat(300) })], {
      turnIndex: 0,
      maxPatternLength: 256,
    });
    expect(r.applied).toEqual([]);
    expect(r.errors[0]?.reason).toBe('pattern_too_long');
  });

  it('filters disallowed flags', () => {
    // `z` is not allowed — sanitiseFlags drops it, regex compiles fine.
    const r = runRegexScripts('Xx', [s({ findRegex: 'x', replaceString: 'o', flags: 'gizZ' })], {
      turnIndex: 0,
    });
    // i is kept, so both X and x match.
    expect(r.text).toBe('oo');
  });

  it('applies trim_strings after replace', () => {
    const r = runRegexScripts(
      'hello *cough*',
      [s({ findRegex: 'hello', replaceString: 'hi', trimStrings: [' *cough*'] })],
      { turnIndex: 0 },
    );
    expect(r.text).toBe('hi');
  });

  it('excludePromptOnly skips promptOnly scripts (edit_input stage)', () => {
    const r = runRegexScripts(
      'nya',
      [
        s({ id: 'stored', findRegex: 'nya', replaceString: 'meow', promptOnly: false }),
        s({ id: 'prompt-only', findRegex: 'meow', replaceString: 'PURR', promptOnly: true }),
      ],
      { turnIndex: 0, excludePromptOnly: true },
    );
    expect(r.text).toBe('meow');
    expect(r.applied).toEqual(['stored']);
  });

  it('empty script list returns text unchanged', () => {
    expect(runRegexScripts('abc', [], { turnIndex: 0 }).text).toBe('abc');
  });

  it('empty findRegex reports empty_pattern (not pattern_too_long)', () => {
    const r = runRegexScripts('abc', [s({ id: 'empty', findRegex: '' })], { turnIndex: 0 });
    expect(r.applied).toEqual([]);
    expect(r.errors[0]).toEqual({ id: 'empty', reason: 'empty_pattern' });
  });

  it('surfaces flag_global_added advisory when /g is auto-injected', () => {
    const r = runRegexScripts(
      'foo foo',
      [s({ id: 'no-g', findRegex: 'foo', replaceString: 'X', flags: 'i' })],
      { turnIndex: 0 },
    );
    // Both matches replaced because /g was forced on.
    expect(r.text).toBe('X X');
    expect(r.errors.some((e) => e.id === 'no-g' && e.reason === 'flag_global_added')).toBe(true);
  });

  it('does not emit flag_global_added when user already passes /g', () => {
    const r = runRegexScripts(
      'foo foo',
      [s({ id: 'has-g', findRegex: 'foo', replaceString: 'X', flags: 'g' })],
      { turnIndex: 0 },
    );
    expect(r.errors.some((e) => e.reason === 'flag_global_added')).toBe(false);
  });
});
