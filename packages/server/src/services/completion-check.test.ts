import { describe, it, expect } from 'bun:test';
import { isCompleteSentence, trimUntilPunctuation } from '@neigo/shared';

describe('PLANv3 X3.2 — isCompleteSentence', () => {
  it('recognises western punctuation', () => {
    expect(isCompleteSentence('Hi there.')).toBe(true);
    expect(isCompleteSentence('Is it?')).toBe(true);
    expect(isCompleteSentence('No way!')).toBe(true);
    expect(isCompleteSentence('Oke nih…')).toBe(true);
  });

  it('recognises CJK punctuation', () => {
    expect(isCompleteSentence('行くよ。')).toBe(true);
    expect(isCompleteSentence('何？')).toBe(true);
    expect(isCompleteSentence('本当に！')).toBe(true);
  });

  it('tolerates trailing quotes / brackets / whitespace', () => {
    expect(isCompleteSentence('"Hi."')).toBe(true);
    expect(isCompleteSentence('(done.)  \n')).toBe(true);
    expect(isCompleteSentence('Sayang♡')).toBe(true);
  });

  it('flags truncated fragments', () => {
    expect(isCompleteSentence('Wait-')).toBe(false);
    expect(isCompleteSentence('and then sh')).toBe(false);
    expect(isCompleteSentence('He said')).toBe(false);
    expect(isCompleteSentence('')).toBe(false);
  });
});

describe('PLANv3 X3.2 — trimUntilPunctuation', () => {
  it('retains the last complete sentence', () => {
    expect(trimUntilPunctuation('Fine. Then he')).toBe('Fine.');
    expect(trimUntilPunctuation('行くよ。それから彼は')).toBe('行くよ。');
  });

  it('returns the full text when already complete', () => {
    const t = 'All done.';
    expect(trimUntilPunctuation(t)).toBe(t);
  });

  it('returns the full text when no punctuation present', () => {
    expect(trimUntilPunctuation('untouched fragment')).toBe('untouched fragment');
  });
});
