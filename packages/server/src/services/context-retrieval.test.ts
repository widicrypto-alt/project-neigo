import { describe, it, expect } from 'bun:test';
import { isRecallQuery, __internals } from './context-retrieval.js';

describe('PLANv3 X4.4 — isRecallQuery', () => {
  it('matches Indonesian recall markers', () => {
    expect(isRecallQuery('ingat pas kita di taman?')).toBe(true);
    expect(isRecallQuery('kemarin kamu bilang apa')).toBe(true);
    expect(isRecallQuery('waktu kita makan malam')).toBe(true);
    expect(isRecallQuery('pernah ke Shibuya kan?')).toBe(true);
  });

  it('matches English recall markers', () => {
    expect(isRecallQuery('remember what you said')).toBe(true);
    expect(isRecallQuery('last time we talked')).toBe(true);
    expect(isRecallQuery('you promised me something')).toBe(true);
  });

  it('does not match casual greetings', () => {
    expect(isRecallQuery('halo, apa kabar?')).toBe(false);
    expect(isRecallQuery('good morning')).toBe(false);
    expect(isRecallQuery('how are you today')).toBe(false);
  });
});

describe('PLANv3 X4.4 — clampK', () => {
  const { clampK } = __internals;
  it('defaults to 5 for undefined/invalid', () => {
    expect(clampK(undefined)).toBe(5);
    expect(clampK(NaN)).toBe(5);
    expect(clampK(0)).toBe(5);
    expect(clampK(-3)).toBe(5);
  });
  it('caps at 50', () => {
    expect(clampK(100)).toBe(50);
    expect(clampK(50)).toBe(50);
  });
  it('floors fractions', () => {
    expect(clampK(3.7)).toBe(3);
  });
});

describe('PLANv3 X4.4 — RRF constant matches memory-retriever', () => {
  it('uses the same k=60 as hybridSearchRRF', () => {
    expect(__internals.RRF_K).toBe(60);
  });
});
