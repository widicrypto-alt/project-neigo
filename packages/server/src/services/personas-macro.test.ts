/**
 * Wk8 G1a — persona macro resolution.
 *
 * Does NOT require a DB. Verifies that when PromptBuilder is handed a
 * personaName, the G2 macro pass expands {{user}} and {{persona}}
 * against the persona (not the raw display name). Also checks the
 * fallback path (null persona → display name).
 */
import { describe, it, expect } from 'bun:test';
import { resolveMacros } from '@neigo/shared';

describe('Wk8 G1a — persona macros', () => {
  it('expands {{user}} to personaName when set', () => {
    const out = resolveMacros('Hello {{user}}, welcome.', {
      character: { name: 'Lysandra' },
      userDisplayName: 'rei_kun',
      personaName: 'Haruki',
    });
    expect(out).toBe('Hello Haruki, welcome.');
  });

  it('falls back to userDisplayName when personaName is null', () => {
    const out = resolveMacros('Hi {{user}}.', {
      character: { name: 'Lysandra' },
      userDisplayName: 'rei_kun',
      personaName: null,
    });
    expect(out).toBe('Hi rei_kun.');
  });

  it('expands {{persona}} only when personaName is set, empty otherwise', () => {
    const withPersona = resolveMacros('[{{persona}}]', {
      character: { name: 'Lysandra' },
      userDisplayName: 'rei_kun',
      personaName: 'Haruki',
    });
    const withoutPersona = resolveMacros('[{{persona}}]', {
      character: { name: 'Lysandra' },
      userDisplayName: 'rei_kun',
      personaName: null,
    });
    expect(withPersona).toBe('[Haruki]');
    expect(withoutPersona).toBe('[]');
  });

  it('expands {{char}} independently of persona', () => {
    const out = resolveMacros('{{char}} looks at {{user}}.', {
      character: { name: 'Lysandra' },
      userDisplayName: 'rei_kun',
      personaName: 'Haruki',
    });
    expect(out).toBe('Lysandra looks at Haruki.');
  });

  it('leaves unknown tokens intact (surfaces bugs)', () => {
    const out = resolveMacros('check {{unknown_token}} here', {
      character: { name: 'Lysandra' },
      userDisplayName: 'rei_kun',
      personaName: null,
    });
    expect(out).toContain('{{unknown_token}}');
  });

  it('trims whitespace from personaName before substitution', () => {
    const out = resolveMacros('{{user}}', {
      character: { name: 'L' },
      userDisplayName: 'rei',
      personaName: '   Haruki   ',
    });
    expect(out).toBe('Haruki');
  });
});
