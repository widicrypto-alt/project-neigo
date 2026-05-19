import { describe, it, expect } from 'bun:test';
import { shouldRecall, shouldSave } from './memory-policy.js';

describe('PLANv3 X4.6 — shouldRecall', () => {
  it('skips too-short messages', () => {
    const d = shouldRecall('oke', { turnCount: 5 });
    expect(d.recall).toBe(false);
    expect(d.reason).toBe('too_short');
  });

  it('skips greeting-only messages', () => {
    expect(shouldRecall('halo', { turnCount: 5 }).recall).toBe(false);
    expect(shouldRecall('pagi!', { turnCount: 5 }).recall).toBe(false);
    expect(shouldRecall('konbanwa', { turnCount: 5 }).recall).toBe(false);
  });

  it('always recalls in early turns', () => {
    const d = shouldRecall('ceritakan tentang dirimu kemarin', { turnCount: 1 });
    expect(d.recall).toBe(true);
    expect(d.reason).toBe('early_turn');
  });

  it('default-on for substantive later turns', () => {
    const d = shouldRecall('apa yang kamu ingat soal tugas minggu lalu di kantor?', {
      turnCount: 20,
    });
    expect(d.recall).toBe(true);
    expect(d.reason).toBe('default');
  });
});

describe('PLANv3 X4.6 — shouldSave', () => {
  it('saves on promise regardless of length', () => {
    expect(shouldSave('ok', 0.5, 0.5, true).save).toBe(true);
  });

  it('saves on mood spike', () => {
    const d = shouldSave('long response text here that exceeds threshold', 0.2, 0.7, false);
    expect(d.save).toBe(true);
    expect(d.reason).toBe('mood_spike');
  });

  it('skips too-short responses without signal', () => {
    expect(shouldSave('ok', 0.5, 0.5, false).save).toBe(false);
  });

  it('skips smalltalk first-sentence even when long', () => {
    const d = shouldSave('Iya. ' + 'dst. '.repeat(40), 0.5, 0.5, false);
    expect(d.save).toBe(false);
    expect(d.reason).toBe('smalltalk');
  });

  it('saves substantive prose by default', () => {
    const d = shouldSave(
      'Dia menatap jendela, kopi di tangannya mulai dingin sementara memori tadi malam kembali.',
      0.5,
      0.5,
      false,
    );
    expect(d.save).toBe(true);
    expect(d.reason).toBe('default');
  });
});
