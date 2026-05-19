/**
 * Wk10 PLANv2 G4 — Client-side slash-command parser.
 *
 * We intentionally keep this client-only. The server still ingests plain
 * text on `/api/chat/:id/turn` plus a small set of typed flags — it will
 * NEVER route raw `/cmd` strings (see PLANv2 §5 "G4 guardrail"). The
 * parser's job is to turn what the user typed into a typed command object
 * the composer / chat page can act on.
 *
 * Supported commands (per PLANv2 §wk10 acceptance):
 *   /sys <text>         — one-off system note (injected as system msg)
 *   /narrator <text>    — force the reply to be narrator-voiced
 *   /continue           — ask the character to continue the last reply
 *   /as <name>: <text>  — speak as a named minor character this turn only
 *   /scene <text>       — emit a scene card update (tagged text)
 *   /impersonate <text> — speak as {{char}} (user authoring the character's line)
 *   /random             — let the character pick any action / prop
 *   /help               — show available commands (handled in UI)
 *
 * Unknown slashes (e.g. `/bogus`) return `kind: 'unknown'` so the composer
 * can surface a friendly error instead of shipping junk upstream.
 *
 * This module is pure — no React, no fetch — so it is trivial to snapshot-test.
 */

export type SlashCommand =
  | { kind: 'none'; text: string }
  | { kind: 'sys'; text: string }
  | { kind: 'narrator'; text: string }
  | { kind: 'continue' }
  | { kind: 'as'; speaker: string; text: string }
  | { kind: 'scene'; text: string }
  | { kind: 'impersonate'; text: string }
  | { kind: 'random' }
  | { kind: 'help' }
  | { kind: 'unknown'; token: string; rest: string };

/** Stable list of supported slash names (without the leading `/`). */
export const SLASH_COMMANDS = [
  'sys',
  'narrator',
  'continue',
  'as',
  'scene',
  'impersonate',
  'random',
  'help',
] as const;

export type SlashName = (typeof SLASH_COMMANDS)[number];

const NEEDS_TEXT: ReadonlySet<SlashName> = new Set(['sys', 'narrator', 'scene', 'impersonate']);
const NO_ARGS: ReadonlySet<SlashName> = new Set(['continue', 'random', 'help']);

function isKnown(name: string): name is SlashName {
  return (SLASH_COMMANDS as readonly string[]).includes(name);
}

/**
 * Parse a raw composer value. Only a leading `/` triggers command mode; a
 * slash anywhere else stays as plain text. The command name itself is case
 * insensitive (so `/HELP` works) — rest-text is preserved verbatim.
 */
export function parseSlashCommand(input: string): SlashCommand {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith('/')) {
    return { kind: 'none', text: input };
  }
  // `//` escapes a literal leading slash (user actually wants to send `/foo`).
  if (trimmed.startsWith('//')) {
    return { kind: 'none', text: trimmed.slice(1) };
  }
  // Split head from tail on the first whitespace.
  const match = trimmed.match(/^\/([a-zA-Z_][a-zA-Z0-9_-]*)\b\s*([\s\S]*)$/);
  if (!match) {
    // "/" alone or non-word after slash — treat as plain text so the user
    // isn't blocked from typing.
    return { kind: 'none', text: input };
  }
  const name = match[1]!.toLowerCase();
  const rest = match[2] ?? '';

  if (!isKnown(name)) {
    return { kind: 'unknown', token: name, rest: rest.trim() };
  }

  // Validate args.
  const hasText = rest.trim().length > 0;
  if (NEEDS_TEXT.has(name) && !hasText) {
    return { kind: 'unknown', token: name, rest: '' };
  }
  if (NO_ARGS.has(name) && hasText) {
    // Extra args after a no-arg command — still route the command, but
    // drop the noise. (Don't classify as unknown; users type too fast.)
  }

  switch (name) {
    case 'sys':
      return { kind: 'sys', text: rest.trim() };
    case 'narrator':
      return { kind: 'narrator', text: rest.trim() };
    case 'continue':
      return { kind: 'continue' };
    case 'scene':
      return { kind: 'scene', text: rest.trim() };
    case 'impersonate':
      return { kind: 'impersonate', text: rest.trim() };
    case 'random':
      return { kind: 'random' };
    case 'help':
      return { kind: 'help' };
    case 'as': {
      // "/as Alice: hello" or "/as Alice hello" — first word is the speaker
      // if there's no colon.
      const colon = rest.indexOf(':');
      if (colon > 0) {
        const speaker = rest.slice(0, colon).trim();
        const text = rest.slice(colon + 1).trim();
        if (!speaker || !text) return { kind: 'unknown', token: 'as', rest: rest.trim() };
        return { kind: 'as', speaker, text };
      }
      const space = rest.search(/\s/);
      if (space <= 0) return { kind: 'unknown', token: 'as', rest: rest.trim() };
      const speaker = rest.slice(0, space).trim();
      const text = rest.slice(space + 1).trim();
      if (!speaker || !text) return { kind: 'unknown', token: 'as', rest: rest.trim() };
      return { kind: 'as', speaker, text };
    }
  }
}

/**
 * Short usage line per command, surfaced in the `/help` popover (wk10 UI).
 */
export const SLASH_USAGE: Record<SlashName, string> = {
  sys: '/sys <note> — add a one-off system hint for this turn.',
  narrator: '/narrator <text> — force a narrator-voiced reply.',
  continue: '/continue — ask the character to keep going from the last reply.',
  as: '/as <name>: <text> — speak as a minor named character.',
  scene: '/scene <text> — tag a scene change.',
  impersonate: '/impersonate <text> — author the character\'s next line.',
  random: '/random — let the character surprise you.',
  help: '/help — show this list.',
};
