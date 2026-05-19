> 🟡 **STATUS (apr 2026): DAY 4,6,7–8 SHIPPED.** X2.3 CBS macros ✅ · X2.6 lorebook decorators ✅ · X2.5 regex scripts ✅. ❌ Day 5 X3.6 `{{button}}` macro + trigger endpoint → [BACKLOG.md](BACKLOG.md) B1.4.

---

# PLAN_IMPLEMENTS v2 — Day 4-8 (CBS macros + lorebook + regex)

> Lanjutan dari [PLAN_IMPLEMENTSv1.md](PLAN_IMPLEMENTSv1.md). Baca pre-flight §0 di v1 sebelum mulai.
>
> **Scope file ini:** Day 4 (CBS macros extend), Day 5 (`{{button}}` + trigger endpoint), Day 6 (lorebook decorators + recursive scan), Day 7-8 (regex scripts 4-mode + re2-wasm).
>
> **Prereq dari v1:** XML wrap flag mendarat (Day 1), streaming isolation (Day 1), BYOK test-ping (Day 2), browser notif (Day 3). Day 4 tidak bergantung output Day 1-3 secara teknis — aman dijalankan paralel kalau dua agent.

---

## Day 4 — X2.3 CBS macros extend (stack parser + setvar/getvar/if/calc)

**Effort:** ~6 jam. **Risk:** medium (grammar baru, butuh unit test ketat anti-prompt-injection).

### 4.1 Konsep

Macro resolver sekarang di `packages/shared/src/utils/macros.ts` hanya handle 7 token flat (identity+time). Target Day 4: port konsep Risu `risuChatParser` — **stack-based, 20-deep limit, tri-mode (resolve/tokenize/display)**. Ekstend token support jadi:

| Macro | Fungsi | Read/Write |
|---|---|---|
| `{{getvar::k}}` | ambil scriptstate[k] | R |
| `{{setvar::k::v}}` | set scriptstate[k]=v; emit nothing | W |
| `{{if cond}}…{{/if}}` | conditional block | R |
| `{{calc::expr}}` | arithmetic (whitelist operator + - * / % parens) | R |
| `{{comment}}…{{/comment}}` | dihilangkan saat resolve; visible saat display | — |
| `{{//}}` | single-line silent comment | — |
| `{{br}}` | literal `\n` | — |

**Scriptstate storage:** `chat_sessions.metadata.scriptstate: Record<string,string>`. Migrasi **tidak perlu** — kolom jsonb sudah ada.

**Sandbox:** `{{setvar}}` HANYA boleh fire dari (a) character fields, (b) preset sections, (c) trigger output. **TIDAK BOLEH** fire dari user message yang di-resolve. Enforce dengan `mode` flag: `resolveTrusted(text)` vs `resolveUserText(text)` (latter strip `{{setvar}}` ke empty).

### 4.2 Step 1 — Parser arsitektur

**File:** `packages/shared/src/utils/macros.ts` (rewrite, bukan extend — test legacy harus tetap hijau).

Signature baru:

```ts
export type MacroMode = 'resolve' | 'tokenize' | 'display';

export interface MacroContext {
  char?: string;
  user?: string;
  persona?: string;
  time?: string;
  date?: string;
  location?: string;
  weather?: string;
  scriptstate: Record<string, string>;          // mutable (by ref)
  trusted: boolean;                               // false = user input → no setvar
  maxDepth?: number;                              // default 20
}

export interface MacroResult {
  text: string;
  scriptstate: Record<string, string>;           // new state after setvar
  errors: string[];                               // depth-limit, unknown-macro, etc
}

export function resolveMacros(input: string, ctx: MacroContext, mode: MacroMode = 'resolve'): MacroResult;
```

Parser pattern: **tokenize → stack-based reduce**. Tokens:

- `TEXT` (plain)
- `MACRO_SIMPLE` (`{{name}}` or `{{name::arg1::arg2}}`)
- `BLOCK_OPEN` (`{{if …}}`, `{{comment}}`, `{{each …}}`)
- `BLOCK_CLOSE` (`{{/if}}`, `{{/comment}}`, `{{/each}}`)

Stack: push `BLOCK_OPEN` nested scope; pop saat `BLOCK_CLOSE`. Kalau `stack.length > ctx.maxDepth` → push error + treat sisa sebagai TEXT. Ini mencegah runaway `{{if a}}{{if b}}{{if c}}…` attack.

### 4.3 Step 2 — Implementation incremental

Pisahkan ke 4 commit (atau minimal 4 chunks di 1 commit):

**Chunk A — tokenizer.** Regex `\{\{([^{}]+?)\}\}` find all, split by offset. Unit test: `"hello {{char}} and {{getvar::k}}"` → 4 tokens.

**Chunk B — simple macros dispatcher.** `{{char}}`, `{{user}}`, `{{persona}}`, `{{time}}`, `{{date}}`, `{{location}}`, `{{weather}}` (reuse dari eksisting), `{{getvar::k}}`, `{{setvar::k::v}}`, `{{calc::expr}}`, `{{br}}`, `{{//}}`.

**`{{calc::expr}}` safety:** PAKAI `mathjs` (sudah di deps kalau belum, `pnpm add mathjs -F @neigo/shared`) dengan `mathjs.create({}, { matrix: 'Array' })` and whitelist `evaluate` pada scope kosong. JANGAN `eval` atau `new Function`. Timeout 50ms per expression.

**Chunk C — block macros stack.** `{{if cond}}…{{/if}}` dengan cond parsed via `mathjs` boolean eval (support `{{getvar::k}} == "ready"` dll, ganti `{{getvar}}` jadi string literal dulu via nested resolve).

**Chunk D — mode handling.**
- `resolve`: full execute, `setvar` mutates state, `comment` stripped.
- `tokenize`: skip state mutation, kembalikan placeholder untuk ambiguous (`{{char}}→"Rei"`, `{{getvar}}→""`).
- `display`: strip control (setvar→""), render content (getvar hasil, comment visible).

### 4.4 Step 3 — Unit tests (wajib sebelum merge)

**File:** `packages/shared/src/utils/__tests__/macros.test.ts`

Minimal test cases:

```ts
it('setvar then getvar in same string', () => {
  const ctx = { scriptstate: {}, trusted: true, char: 'Rei' };
  const { text, scriptstate } = resolveMacros('{{setvar::mood::happy}}{{getvar::mood}}', ctx);
  expect(text).toBe('happy');
  expect(scriptstate.mood).toBe('happy');
});

it('untrusted mode strips setvar (anti-injection)', () => {
  const ctx = { scriptstate: { trust: '100' }, trusted: false };
  const { text, scriptstate } = resolveMacros('{{setvar::trust::0}}hi', ctx);
  expect(text).toBe('hi');
  expect(scriptstate.trust).toBe('100'); // unchanged
});

it('if/endif block', () => {
  const ctx = { scriptstate: { mood: 'happy' }, trusted: true };
  const { text } = resolveMacros('{{if {{getvar::mood}} == "happy"}}yay{{/if}}', ctx);
  expect(text).toBe('yay');
});

it('recursion depth limit', () => {
  const deeplyNested = '{{if a}}'.repeat(25) + 'x' + '{{/if}}'.repeat(25);
  const { errors } = resolveMacros(deeplyNested, { scriptstate: {}, trusted: true, maxDepth: 20 });
  expect(errors).toContain('depth_limit_exceeded');
});

it('calc rejects non-math tokens', () => {
  const { text, errors } = resolveMacros('{{calc::fetch("evil")}}', { scriptstate: {}, trusted: true });
  expect(errors.length).toBeGreaterThan(0);
  expect(text).not.toContain('fetch');
});

it('display mode renders comments', () => {
  const { text } = resolveMacros('hello{{comment}}note{{/comment}}world', { scriptstate: {}, trusted: true }, 'display');
  expect(text).toContain('note');
});

it('resolve mode strips comments', () => {
  const { text } = resolveMacros('hello{{comment}}note{{/comment}}world', { scriptstate: {}, trusted: true }, 'resolve');
  expect(text).toBe('helloworld');
});
```

Semua harus hijau sebelum lanjut.

### 4.5 Step 4 — Wire di server

**File:** `packages/server/src/prompts/builder.ts`

Sekarang di akhir `buildSystemPrompt`, line `resolveMacros(raw, ctx)` diganti:

```ts
const scriptstate = session.metadata?.scriptstate ?? {};
const result = resolveMacros(raw, {
  ...ctxBasic,
  scriptstate,
  trusted: true, // system prompt is trusted
}, 'resolve');

// persist scriptstate mutations
if (JSON.stringify(result.scriptstate) !== JSON.stringify(scriptstate)) {
  await db.update(schema.chatSessions)
    .set({ metadata: { ...session.metadata, scriptstate: result.scriptstate } })
    .where(eq(schema.chatSessions.id, session.id));
}
return result.text;
```

**File:** `packages/server/src/routes/chat.ts` POST handler

Untuk user message, jalankan `resolveMacros(content, { ..., trusted: false }, 'resolve')` SEBELUM store. Ini supaya `{{char}}` di pesan user tetap render, tapi `{{setvar}}` di-drop.

### 4.6 Step 5 — Wire di client display

**File:** `packages/web/src/components/chat/bubble-format.tsx` (buat baru kalau belum ada)

```tsx
import { resolveMacros } from '@neigo/shared';

export function formatBubble(content: string, ctx: MacroContext): string {
  return resolveMacros(content, ctx, 'display').text;
}
```

Dipanggil di renderer message bubble sebelum markdown-to-jsx.

### 4.7 Step 6 — Flag + commit

```ts
// env.ts
MACRO_ADVANCED_ENABLED: z.enum(['true','false']).default('false').transform(v => v==='true'),
```

Guard branch di builder: kalau flag off, fallback ke resolver lama (identity only).

Commit:

```
feat(X2.3 day4): CBS macros — setvar/getvar/if/calc/comment/br stack parser

- shared/utils/macros.ts rewrite: tri-mode, 20-deep stack, mathjs sandbox
- unit tests: anti-prompt-injection (untrusted mode), depth limit, calc safety
- builder.ts persists scriptstate mutations to session.metadata
- bubble-format.tsx display-mode renderer
- env.ts MACRO_ADVANCED_ENABLED=false

Per PLAN_IMPLEMENTSv2 §Day4.
```

### 4.8 Day 4 exit

- [ ] 8 unit test hijau termasuk injection + depth + calc.
- [ ] `pnpm -r typecheck` hijau.
- [ ] Character card dengan `{{setvar::trust::50}}{{if {{getvar::trust}} > 30}}…{{/if}}` render benar.
- [ ] Pesan user `{{setvar::trust::999}}` TIDAK mengubah state.

---

## Day 5 — X3.6 `{{button::Label::trigger}}` inline + trigger endpoint

**Effort:** ~4 jam. **Risk:** medium (surface baru untuk RCE kalau trigger whitelist bocor).

### 5.1 Step 1 — Whitelist trigger schema

Trigger bukan arbitrary JS eval — harus whitelist terdaftar per character:

**Schema extend** (tanpa migrasi — simpan di `characters.metadata.triggers`):

```ts
triggers: Array<{
  id: string;                                      // short key, a-z0-9-
  label: string;                                   // display-only
  action: 'setvar' | 'sendUserMessage' | 'runScript';
  args: {
    key?: string;        // untuk setvar
    value?: string;
    message?: string;    // untuk sendUserMessage (prefilled user turn)
    scriptId?: string;   // untuk runScript (future trigger-v2)
  };
}>
```

### 5.2 Step 2 — Macro renderer di FE

**File:** `packages/web/src/components/chat/bubble-format.tsx`

Ekstend display-mode resolver untuk emit React element untuk `{{button::label::trigger}}`. Karena `resolveMacros` return string, pakai **post-pass regex** di bubble-format:

```tsx
export function renderBubble(content: string, ctx: MacroContext, onTrigger: (id: string) => void): ReactNode[] {
  const resolved = resolveMacros(content, ctx, 'display').text;
  const parts: ReactNode[] = [];
  const re = /\{\{button::([^:]+)::([a-z0-9-]+)\}\}/g;
  let lastIdx = 0, match: RegExpExecArray | null;
  while ((match = re.exec(resolved)) !== null) {
    if (match.index > lastIdx) parts.push(resolved.slice(lastIdx, match.index));
    const [, label, triggerId] = match;
    parts.push(
      <button
        key={`${triggerId}-${match.index}`}
        className="cbs-button"
        onClick={() => onTrigger(triggerId)}
      >{label}</button>
    );
    lastIdx = re.lastIndex;
  }
  if (lastIdx < resolved.length) parts.push(resolved.slice(lastIdx));
  return parts;
}
```

### 5.3 Step 3 — Trigger endpoint server

**File:** `packages/server/src/routes/chat.ts`

```ts
chatRouter.post('/:sessionId/trigger', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('sessionId');
  const body = zTriggerRequest.parse(await c.req.json()); // { triggerId: string }

  const session = await loadSessionOwnedBy(sessionId, userId);
  if (!session) return c.json({ error: 'not_found' }, 404);

  const character = await loadCharacter(session.characterId);
  const trigger = character.metadata?.triggers?.find(t => t.id === body.triggerId);
  if (!trigger) return c.json({ error: 'invalid_trigger' }, 400);

  // dispatch per action (whitelist)
  switch (trigger.action) {
    case 'setvar': {
      const s = session.metadata?.scriptstate ?? {};
      s[trigger.args.key!] = trigger.args.value!;
      await db.update(schema.chatSessions)
        .set({ metadata: { ...session.metadata, scriptstate: s } })
        .where(eq(schema.chatSessions.id, sessionId));
      return c.json({ ok: true, scriptstate: s });
    }
    case 'sendUserMessage': {
      // reuse existing POST /:sessionId/send pipeline
      return triggerSendUserMessage(c, sessionId, trigger.args.message!);
    }
    case 'runScript':
      return c.json({ error: 'not_implemented_yet' }, 501);
  }
});
```

### 5.4 Step 4 — Rate limit + CSRF

Trigger endpoint SAMA rate-limit-nya dengan `/send` (jangan bypass). Tambah check `c.req.header('origin')` untuk cegah CSRF dari site lain. Session cookie sudah SameSite=Strict tapi belt-and-braces.

### 5.5 Step 5 — Commit

```
feat(X3.6 day5): inline {{button::Label::trigger}} + whitelisted trigger endpoint

- bubble-format.tsx renders CBS button as real <button>
- POST /api/chat/:sessionId/trigger (whitelist actions: setvar|sendUserMessage)
- characters.metadata.triggers[] (no migration, jsonb)
- rate-limited same as /send

Per PLAN_IMPLEMENTSv2 §Day5.
```

### 5.6 Day 5 exit

- [ ] Character dengan trigger `agree` → `{{button::Setuju::agree}}` render sebagai button.
- [ ] Klik button → scriptstate berubah di DB.
- [ ] Trigger ID yang tidak terdaftar → 400.
- [ ] Tidak ada eval/Function constructor di pathway.

---

## Day 6 — X2.6 Lorebook decorators + recursive scan

**Effort:** ~5 jam. **Risk:** medium (loop detection harus betul).

### 6.1 Decorator parser

**File baru:** `packages/server/src/services/lorebook/decorator-parser.ts`

Format directive inline di awal `content`:

```
@@depth 2
@@role system
@@probability 75
@@additional_keys dragon,flame
@@match_full_word
@@position before_char

The castle is made of obsidian…
```

Parser:

```ts
export interface LoreDirectives {
  activateOnlyAfter?: number;
  activateOnlyEvery?: number;
  keepActivateAfterMatch?: boolean;
  dontActivateAfterMatch?: boolean;
  depth?: number;
  role?: 'system' | 'user' | 'assistant';
  scanDepth?: number;
  probability?: number;
  additionalKeys?: string[];
  excludeKeys?: string[];
  matchFullWord?: boolean;
  position?: 'after_char' | 'before_char' | 'personality' | 'scenario';
}

const DIRECTIVE_RE = /^@@(\w+)(?:\s+(.+))?$/gm;

export function parseDirectives(content: string): { parsed: string; directives: LoreDirectives } {
  const directives: LoreDirectives = {};
  let cleanLines: string[] = [];
  for (const line of content.split('\n')) {
    const m = /^@@(\w+)(?:\s+(.*))?$/.exec(line.trim());
    if (!m) { cleanLines.push(line); continue; }
    const [, key, rawVal] = m;
    switch (key) {
      case 'activate_only_after': directives.activateOnlyAfter = parseInt(rawVal ?? '0', 10); break;
      case 'activate_only_every': directives.activateOnlyEvery = parseInt(rawVal ?? '0', 10); break;
      case 'keep_activate_after_match': directives.keepActivateAfterMatch = true; break;
      case 'dont_activate_after_match': directives.dontActivateAfterMatch = true; break;
      case 'depth': directives.depth = parseInt(rawVal ?? '0', 10); break;
      case 'role': directives.role = (rawVal as any) ?? 'system'; break;
      case 'scan_depth': directives.scanDepth = parseInt(rawVal ?? '4', 10); break;
      case 'probability': directives.probability = parseInt(rawVal ?? '100', 10); break;
      case 'additional_keys': directives.additionalKeys = rawVal?.split(',').map(s => s.trim()) ?? []; break;
      case 'exclude_keys': directives.excludeKeys = rawVal?.split(',').map(s => s.trim()) ?? []; break;
      case 'match_full_word': directives.matchFullWord = true; break;
      case 'position': directives.position = (rawVal as any) ?? 'after_char'; break;
      default: cleanLines.push(line); // unknown directive kept inline
    }
  }
  return { parsed: cleanLines.join('\n').trim(), directives };
}
```

Unit test: setiap directive + directive tanpa value (boolean flag) + unknown directive preserved.

### 6.2 Wire di activation pipeline

**File:** `packages/server/src/services/lorebook/keyword-scan.ts`

Saat load lorebook entry, run `parseDirectives(entry.content)`. Hasil `directives` dipakai saat scan:

- `activate_only_after N` → skip kalau `session.turnCount < N`.
- `activate_only_every N` → skip kalau `session.turnCount % N !== 0`.
- `probability N` → `Math.random()*100 < N` else skip.
- `additional_keys [a,b]` → ALL additional keys harus match (selain primary key).
- `exclude_keys [a,b]` → match → SKIP activation.
- `match_full_word` → pakai regex `\bkey\b` bukan substring.
- `scan_depth N` → hanya cek N message terakhir (default 4).
- `depth N` → inject di posisi N dari akhir history.
- `role` → tag inject message dengan role.
- `position` → route ke slot yang sesuai di builder.ts.

**File:** `packages/server/src/services/lorebook/retriever.ts`

Sesuaikan return type untuk carry `directives` per entry, dan expose `position` agar builder.ts bisa distribute entries ke slot yang benar (`<lorebook_before_char>`, `<personality_extras>`, dll).

### 6.3 Recursive scan

**File:** `packages/server/src/services/lorebook/keyword-scan.ts`

Tambah function baru:

```ts
export async function scanRecursive(
  seedText: string,
  entries: LoreEntry[],
  opts: { maxRounds: number; session: Session }
): Promise<Set<string>> {
  const activated = new Set<string>();
  let scanText = seedText;
  for (let round = 0; round < opts.maxRounds; round++) {
    const newHits = scanOnce(scanText, entries, activated, opts.session);
    if (newHits.length === 0) break;
    for (const e of newHits) activated.add(e.id);
    scanText = newHits.map(e => e.parsed).join('\n'); // next round scans newly activated content
  }
  return activated;
}
```

`maxRounds = 3` default (configurable per lorebook via flag `LOREBOOK_RECURSIVE_SCAN_ENABLED` + column `recursive_scan: boolean`).

Dedupe via `activated` Set — entry id sudah pernah aktif tidak re-scan.

### 6.4 Flag + column

**Migrasi:** TIDAK perlu migrasi baru untuk recursive flag; simpan di `lorebooks.metadata.recursiveScan: boolean`. Existing `lorebooks.metadata jsonb` dari 0017.

`env.ts`:
```ts
LOREBOOK_DECORATORS_ENABLED: z.enum(['true','false']).default('false').transform(v => v==='true'),
LOREBOOK_RECURSIVE_SCAN_ENABLED: z.enum(['true','false']).default('false').transform(v => v==='true'),
```

### 6.5 Unit + integration tests

**File:** `packages/server/src/services/lorebook/__tests__/decorator-parser.test.ts` — semua directive + unknown.

**File:** `packages/server/src/services/lorebook/__tests__/recursive-scan.test.ts`:

```ts
it('A → B → C propagates within max rounds', () => {
  const entries = [
    { id: 'A', keywords: ['dragon'], content: 'The dragon lives in castle.' },
    { id: 'B', keywords: ['castle'], content: 'The castle holds gold.' },
    { id: 'C', keywords: ['gold'], content: 'The gold is cursed.' },
  ];
  const activated = scanRecursive('Tell me about the dragon.', entries, { maxRounds: 3, session });
  expect([...activated]).toEqual(expect.arrayContaining(['A','B','C']));
});

it('A ↔ B mutual reference does not loop forever', () => {
  const entries = [
    { id: 'A', keywords: ['alpha'], content: 'mentions beta' },
    { id: 'B', keywords: ['beta'], content: 'mentions alpha' },
  ];
  const activated = scanRecursive('alpha', entries, { maxRounds: 3, session });
  expect(activated.size).toBe(2);
});

it('exclude_keys blocks activation', () => {
  const entry = { id: 'X', keywords: ['wizard'], content: '@@exclude_keys evil\nThe wizard…' };
  // seed text contains both "wizard" AND "evil" → should NOT activate
});
```

### 6.6 Commit

```
feat(X2.6 day6): lorebook decorators (@@…) + recursive scan (max 3 rounds)

- services/lorebook/decorator-parser.ts parse inline @@directives
- keyword-scan.ts respects depth/role/probability/additional_keys/exclude_keys
- scanRecursive() dedupes via Set, max 3 rounds anti-loop
- env.ts LOREBOOK_DECORATORS_ENABLED + LOREBOOK_RECURSIVE_SCAN_ENABLED

Per PLAN_IMPLEMENTSv2 §Day6.
```

### 6.7 Day 6 exit

- [ ] decorator parser 100% test coverage for each directive.
- [ ] Recursive A→B→C test hijau.
- [ ] Mutual A↔B loop detection hijau.
- [ ] Flag OFF = behaviour Day 5 persis (no drift).

---

## Day 7-8 — X2.5 Regex scripts 4-mode (re2-wasm sandbox)

**Effort:** ~10 jam total (2 hari). **Risk:** tinggi (regex-DoS dari user input). Sandbox wajib.

### 7.1 Migrasi 0029 (atau 0028 kalau Day 9 belum commit)

**File:** `packages/server/drizzle/0029_regex_scripts.sql`

```sql
CREATE TYPE regex_scope AS ENUM ('character','preset','user');
CREATE TYPE regex_placement AS ENUM ('edit_input','edit_output','edit_process','edit_display');

CREATE TABLE regex_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope regex_scope NOT NULL,
  scope_id uuid,                              -- character_id / preset_id / NULL for user-global
  name text NOT NULL,
  find_regex text NOT NULL,
  replace_string text NOT NULL DEFAULT '',
  trim_strings text[] NOT NULL DEFAULT '{}',
  placement regex_placement NOT NULL,
  flags text NOT NULL DEFAULT 'g',
  prompt_only boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  min_depth integer,
  max_depth integer,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_regex_scripts_scope ON regex_scripts (user_id, scope, scope_id, placement, order_index);

-- RLS
ALTER TABLE regex_scripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY regex_scripts_owner ON regex_scripts
  USING (user_id = current_setting('app.user_id', true)::uuid);
```

Tambah juga ke `packages/server/src/db/schema.ts` export `regexScripts`.

### 7.2 Runner sandbox

**File baru:** `packages/shared/src/utils/regex-runner.ts`

Pakai `re2-wasm` package — linear-time guarantee, no catastrophic backtracking. Install: `pnpm add re2-wasm -F @neigo/shared`.

```ts
import { RE2 } from 're2-wasm';

export interface RegexScript {
  id: string;
  findRegex: string;
  replaceString: string;
  trimStrings: string[];
  flags: string;
  minDepth?: number | null;
  maxDepth?: number | null;
  promptOnly: boolean;
}

const TIMEOUT_MS = 10;

export function runRegexScripts(
  text: string,
  scripts: RegexScript[],
  ctx: { turnIndex: number }
): { text: string; applied: string[]; errors: string[] } {
  let current = text;
  const applied: string[] = [];
  const errors: string[] = [];

  for (const s of scripts) {
    if (s.minDepth != null && ctx.turnIndex < s.minDepth) continue;
    if (s.maxDepth != null && ctx.turnIndex > s.maxDepth) continue;

    const start = Date.now();
    try {
      const re = new RE2(s.findRegex, s.flags);
      current = re.replace(current, s.replaceString);
      for (const trim of s.trimStrings) {
        current = current.replaceAll(trim, '');
      }
      applied.push(s.id);
    } catch (e: any) {
      errors.push(`${s.id}: ${e?.message}`);
    }
    if (Date.now() - start > TIMEOUT_MS) {
      errors.push(`${s.id}: timeout`);
    }
  }
  return { text: current, applied, errors };
}
```

**Catatan re2-wasm:** tidak support lookbehind/backrefs dalam pattern tertentu. Kalau rule user pakai fitur unsupported → fallback ERROR (bukan silent), tampilkan di UI.

### 7.3 Wire 4-mode di orchestrator + client

**Mode `edit_input`** — di `POST /chat/:sessionId/send` handler, setelah validation body, sebelum `db.insert(chatMessages)`:

```ts
const scripts = await loadScripts(userId, characterId, 'edit_input');
const { text: cleanedInput } = runRegexScripts(body.content, scripts, { turnIndex });
const messageContent = scripts.filter(s => !s.promptOnly).length > 0 ? cleanedInput : body.content;
// scripts with promptOnly=true don't modify storage; applied only at edit_process stage
```

**Mode `edit_process`** — di `builder.ts` setelah full prompt assembly, sebelum return:

```ts
const scripts = await loadScripts(userId, characterId, 'edit_process');
const { text: processedPrompt } = runRegexScripts(finalPrompt, scripts, { turnIndex });
return processedPrompt;
```

**Mode `edit_output`** — di `orchestrator.ts runSinglePass` setelah response complete, sebelum validator chain:

```ts
const scripts = await loadScripts(userId, characterId, 'edit_output');
const { text: cleanedOutput } = runRegexScripts(rawResponse, scripts, { turnIndex });
// feed cleanedOutput to validators
```

**Mode `edit_display`** — **CLIENT-SIDE** only. Ambil scripts via `/api/regex-scripts?placement=edit_display`, cache di TanStack Query.

**File:** `packages/web/src/components/chat/bubble-format.tsx`

```ts
import { runRegexScripts } from '@neigo/shared';

export function renderAssistant(content: string, scripts: RegexScript[], turnIndex: number, ctx: MacroContext) {
  const { text } = runRegexScripts(content, scripts, { turnIndex });
  return renderBubble(text, ctx, /*onTrigger*/);
}
```

### 7.4 CRUD endpoints

**File:** `packages/server/src/routes/regex-scripts.ts` (baru)

```ts
GET    /api/regex-scripts?placement=edit_display
GET    /api/regex-scripts?scope=character&scopeId=...
POST   /api/regex-scripts
PATCH  /api/regex-scripts/:id
DELETE /api/regex-scripts/:id
POST   /api/regex-scripts/:id/test  (dry-run preview; body: { sampleText })
```

`/:id/test` endpoint — run RE2 on `sampleText`, return `{ before, after, matched: number, latencyMs }`. Editor UI pakai ini untuk validate regex sebelum save.

### 7.5 FE editor

**File:** `packages/web/src/app/settings/regex/page.tsx` (baru)

List + editor monaco-like textarea:
- Pattern input (dengan regex syntax highlighting minimal)
- Replacement input (support `$1..$9`)
- Flags checkboxes (`g`, `i`, `m`, `s`)
- Placement dropdown (4 option)
- Scope selector (character / preset / user)
- `minDepth` / `maxDepth` number inputs
- `promptOnly` toggle
- Test panel: textarea input → "Run" → show diff output + match count.

### 7.6 Day 7 exit (mid-sprint)

- [ ] Migrasi 0029 applied.
- [ ] Runner unit test: RE2 replace basic, timeout detection, trim_strings, minDepth filter.
- [ ] Endpoint CRUD + test hijau.
- [ ] Flag `REGEX_SCRIPTS_ENABLED=false` gate service calls (orchestrator check flag before load).

### 7.7 Day 8 — FE + integration + deploy-ready

- FE editor jadi end-to-end.
- Wire 4-mode di 4 lokasi kode.
- Snapshot test di `prompt_snapshots.metadata.regexApplied: string[]` agar F4 Prompt Inspection bisa tampilkan rules yang fire.
- Integration test: user bikin rule `/(?i)\s*nya\b/g → ''` dengan `minDepth=0, maxDepth=3` → send 5 pesan dengan "nya"; verify pesan 1-4 dibersihkan, pesan 5 tidak.

### 7.8 Commit Day 7-8

```
feat(X2.5 day7+8): regex scripts 4-mode (edit_input/output/process/display) with re2-wasm sandbox

- drizzle/0029_regex_scripts.sql + RLS
- shared/utils/regex-runner.ts (RE2, 10ms timeout, trim_strings)
- server/routes/regex-scripts.ts CRUD + POST /:id/test
- wire edit_input in chat.ts, edit_process in builder.ts, edit_output in orchestrator.ts
- web/app/settings/regex/page.tsx editor UI with live test
- client-side edit_display via bubble-format.tsx

Per PLAN_IMPLEMENTSv2 §Day7-8. Flag REGEX_SCRIPTS_ENABLED off.
```

### 7.9 Day 8 exit

- [ ] 4-mode integration test hijau.
- [ ] Editor UI end-to-end (create → test → save → fires in chat).
- [ ] `prompt_snapshots` carries `regexApplied` ids for F4 overlay.
- [ ] re2-wasm bundle size check — `pnpm --filter @neigo/web build` report: target bundle ≤ 80KB gzip increase (lazy-load kalau overshoot).

---

## Handoff ke v3

Setelah Day 8, stack punya: reorderable DSL foundation (macros+regex+lorebook decorators), 4-mode regex pipeline, whitelist-trigger buttons. 

**Next (baca `PLAN_IMPLEMENTSv3.md`):** Day 9-10 agent pipeline framework (X2.7) — migrasi 0028 `agent_configs`, executor + batched prompt, phased validator adapter. Day 11 marker-based reorderable preset (X2.4) — butuh Day 1 XML + Day 4 macros sudah mendarat.

---

*File revision: PLAN_IMPLEMENTSv2 · 2026-04-22 · Day 4-8.*
