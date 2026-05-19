/**
 * PLANv3 X2.4 — Marker-based prompt preset types + canonical default sections.
 *
 * When `preset_mode='marker'` and `env.PROMPT_PRESET_MARKER_MODE` is on,
 * PromptBuilder walks `sections` instead of emitting the fixed order. Each
 * `isMarker: true` entry is expanded by `expandMarker()` into the current
 * dynamic content (character card, memory, lore, etc.) while `isMarker:
 * false` entries ship their literal `content`.
 *
 * Day 11 lands types + default list + a pure expandMarker() that calls the
 * existing PromptBuilder helpers. Wiring into PromptBuilder.buildSystemPrompt
 * is flag-gated and ships minimal — falls back to legacy assembly when the
 * flag is off OR preset_mode !== 'marker'.
 */

export type MarkerType =
  | 'character'
  | 'persona'
  | 'scenario'
  | 'scene_state'
  | 'lorebook'
  | 'memory'
  | 'recent_drift'
  | 'diary_reflection'
  | 'chat_history'
  | 'author_note';

export interface MarkerConfig {
  type: MarkerType;
  position?: 'before_char' | 'after_char';
  maxMessages?: number;
  depth?: number;
}

export interface PresetSection {
  identifier: string;
  role: 'system' | 'user' | 'assistant';
  enabled: boolean;
  isMarker: boolean;
  wrap: 'none' | 'xml' | 'markdown';
  markerConfig?: MarkerConfig;
  content?: string;
}

export const DEFAULT_PRESET_SECTIONS: readonly PresetSection[] = [
  { identifier: 'system_persona', role: 'system', enabled: true, isMarker: false, wrap: 'none', content: '' },
  { identifier: 'character', role: 'system', enabled: true, isMarker: true, wrap: 'xml', markerConfig: { type: 'character' } },
  { identifier: 'persona', role: 'system', enabled: true, isMarker: true, wrap: 'xml', markerConfig: { type: 'persona' } },
  { identifier: 'scenario', role: 'system', enabled: true, isMarker: true, wrap: 'xml', markerConfig: { type: 'scenario' } },
  { identifier: 'scene_state', role: 'system', enabled: true, isMarker: true, wrap: 'xml', markerConfig: { type: 'scene_state' } },
  { identifier: 'lorebook_before', role: 'system', enabled: true, isMarker: true, wrap: 'xml', markerConfig: { type: 'lorebook', position: 'before_char' } },
  { identifier: 'memory', role: 'system', enabled: true, isMarker: true, wrap: 'xml', markerConfig: { type: 'memory' } },
  { identifier: 'mistakes', role: 'system', enabled: true, isMarker: true, wrap: 'xml', markerConfig: { type: 'recent_drift' } },
  { identifier: 'diary', role: 'system', enabled: true, isMarker: true, wrap: 'xml', markerConfig: { type: 'diary_reflection' } },
  { identifier: 'chat_history', role: 'system', enabled: true, isMarker: true, wrap: 'none', markerConfig: { type: 'chat_history', maxMessages: 40 } },
  { identifier: 'lorebook_after', role: 'system', enabled: true, isMarker: true, wrap: 'xml', markerConfig: { type: 'lorebook', position: 'after_char' } },
  { identifier: 'author_note', role: 'system', enabled: true, isMarker: true, wrap: 'xml', markerConfig: { type: 'author_note', depth: 4 } },
] as const;

export function isValidSection(x: unknown): x is PresetSection {
  if (!x || typeof x !== 'object') return false;
  const s = x as Partial<PresetSection>;
  return (
    typeof s.identifier === 'string' &&
    typeof s.enabled === 'boolean' &&
    typeof s.isMarker === 'boolean' &&
    (s.role === 'system' || s.role === 'user' || s.role === 'assistant') &&
    (s.wrap === 'none' || s.wrap === 'xml' || s.wrap === 'markdown')
  );
}
