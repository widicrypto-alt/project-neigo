import { describe, it, expect } from 'bun:test';
import { resolveMacrosEx, type MacroContextAdvanced } from '@neigo/shared';

function ctx(partial: Partial<MacroContextAdvanced> = {}): MacroContextAdvanced {
  return {
    character: { name: 'Rei' },
    userDisplayName: 'Ren',
    scriptstate: partial.scriptstate ?? {},
    trusted: partial.trusted ?? true,
    ...partial,
  } as MacroContextAdvanced;
}

describe('resolveMacrosEx — advanced CBS macros', () => {
  it('setvar then getvar in same string mutates state', () => {
    const c = ctx();
    const r = resolveMacrosEx('{{setvar::mood::happy}}{{getvar::mood}}', c);
    expect(r.text).toBe('happy');
    expect(c.scriptstate.mood).toBe('happy');
  });

  it('untrusted mode strips setvar (anti-injection)', () => {
    const c = ctx({ scriptstate: { trust: '100' }, trusted: false });
    const r = resolveMacrosEx('{{setvar::trust::0}}hi', c);
    expect(r.text).toBe('hi');
    expect(c.scriptstate.trust).toBe('100');
  });

  it('if/endif block with nested getvar in condition', () => {
    const c = ctx({ scriptstate: { mood: 'happy' } });
    const r = resolveMacrosEx('{{if {{getvar::mood}} == "happy"}}yay{{/if}}', c);
    expect(r.text).toBe('yay');
  });

  it('if block evaluates to empty when cond false', () => {
    const c = ctx({ scriptstate: { trust: '10' } });
    const r = resolveMacrosEx('{{if {{getvar::trust}} > 50}}hi{{/if}}X', c);
    expect(r.text).toBe('X');
  });

  it('depth limit exceeded → error emitted, text preserved as literals', () => {
    const deeplyNested = '{{if 1}}'.repeat(25) + 'x' + '{{/if}}'.repeat(25);
    const c = ctx({ maxDepth: 20 });
    const r = resolveMacrosEx(deeplyNested, c);
    expect(r.errors.some((e) => e.startsWith('depth_limit'))).toBe(true);
  });

  it('calc rejects non-math tokens (no fetch/eval escape)', () => {
    const c = ctx();
    const r = resolveMacrosEx('{{calc::fetch("evil")}}', c);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.text).not.toContain('fetch');
  });

  it('calc evaluates safe arithmetic', () => {
    const c = ctx();
    const r = resolveMacrosEx('{{calc::(2+3)*4}}', c);
    expect(r.text).toBe('20');
  });

  it('display mode renders comment body; resolve mode strips', () => {
    const src = 'hello{{comment}}note{{/comment}}world';
    const disp = resolveMacrosEx(src, ctx(), 'display').text;
    const res = resolveMacrosEx(src, ctx(), 'resolve').text;
    expect(disp).toContain('note');
    expect(res).toBe('helloworld');
  });

  it('br emits literal newline; // silent', () => {
    const r = resolveMacrosEx('a{{br}}b{{//}}c', ctx());
    expect(r.text).toBe('a\nb' + 'c');
  });

  it('legacy tokens still work via shared lookup', () => {
    const r = resolveMacrosEx('hi {{char}}', ctx());
    expect(r.text).toBe('hi Rei');
  });

  it('unknown macro preserved as literal', () => {
    const r = resolveMacrosEx('keep {{nosuch}} this', ctx());
    expect(r.text).toBe('keep {{nosuch}} this');
  });

  it('tokenize mode does not mutate scriptstate on setvar', () => {
    const c = ctx({ scriptstate: { a: '1' } });
    resolveMacrosEx('{{setvar::a::99}}', c, 'tokenize');
    expect(c.scriptstate.a).toBe('1');
  });
});
