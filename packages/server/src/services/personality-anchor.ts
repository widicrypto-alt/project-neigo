/**
 * Injection builder that re-anchors a character's personality every N turns.
 * Port of Kotlin shared/.../manager/PersonalityAnchorManager.kt
 */
import type { Character, RelationshipStage } from '@neigo/shared';

export const ANCHOR_EVERY = 10;

export function shouldAnchor(turnCount: number): boolean {
  return turnCount > 0 && turnCount % ANCHOR_EVERY === 0;
}

export function buildAnchorInjection(
  character: Character,
  stage?: RelationshipStage | null,
  currentMood?: string | null,
): string {
  const lines: string[] = [];
  lines.push('═══ PERSONALITY ANCHOR (strict) ═══');
  lines.push(`Character: ${character.name}`);
  if (character.coreTraits) lines.push(`Core traits (NEVER change): ${character.coreTraits}`);
  
  // PLANIMPv7 §2.1 — Dynamic Anchor (Halo 2.0)
  // Shift personality slightly based on current emotional state.
  if (currentMood) {
    lines.push(`Current Mood: ${currentMood.toUpperCase()}`);
    if (character.dynamicTraits) {
      lines.push(`Dynamic traits (mood-aware): ${character.dynamicTraits}`);
    }
  } else if (character.dynamicTraits) {
    lines.push(`Dynamic traits (stage-aware${stage ? `, stage=${stage}` : ''}): ${character.dynamicTraits}`);
  }

  if (character.verbalHabits) lines.push(`Verbal habits: ${character.verbalHabits}`);
  if (character.conflictStyle) lines.push(`Conflict style: ${character.conflictStyle}`);
  if (character.tonePreset && character.tonePreset !== 'NONE')
    lines.push(`Tone preset: ${character.tonePreset}`);
  lines.push('Maintain all of the above STRICTLY. Do not drift.');
  return lines.join('\n');
}

export function buildInlineAnchor(character: Character): string {
  const base = character.coreTraits?.trim() || character.personality?.trim() || '';
  const trimmed = base.length > 150 ? base.slice(0, 147) + '…' : base;
  return `⚓ Anchor: ${character.name} — ${trimmed}`;
}

/**
 * v7 Bet C — Author's Note at depth.
 *
 * Standard SillyTavern-style technique: a short persona/directive note is
 * inserted as a system message N messages from the end of the conversation.
 * Being near the tail gives it dominant attention weight on the next
 * completion — far more effective at anti-drift than system-preamble only.
 *
 * Note is intentionally terse (≤ 2 lines). Too long and it derails pacing.
 */
export const AUTHORS_NOTE_DEPTH = 4;

export function buildAuthorsNote(
  character: Character,
  stage?: RelationshipStage | null,
): string {
  const lines: string[] = [];
  const core = (character.coreTraits ?? character.personality ?? '').trim();
  const summary = core.length > 140 ? core.slice(0, 137) + '…' : core;
  lines.push(
    `[Author's Note] Stay fully in-voice as ${character.name}${summary ? ` — ${summary}` : ''}.`,
  );
  if (stage) {
    lines.push(`Match the current emotional register and diction naturally.`);
  }
  return lines.join(' ');
}

/**
 * Inject an Author's-Note-style system message at `depth` messages from the
 * end of `history`. Returns a new array; input is not mutated. When history
 * is shorter than depth, the note lands at the front (after index 0).
 */
export function injectAuthorsNoteAtDepth<T extends { role: string; content: string }>(
  history: T[],
  note: string,
  depth = AUTHORS_NOTE_DEPTH,
): T[] {
  if (!note || history.length === 0) return history;
  const insertAt = Math.max(1, history.length - depth);
  const out = history.slice();
  out.splice(insertAt, 0, { role: 'system', content: note } as T);
  return out;
}
