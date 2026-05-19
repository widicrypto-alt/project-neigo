import { PassType } from '@neigo/shared';

/**
 * Stats parser — extracts `[STATS:…]` and `[REL_UPDATE:…]` tags from a model
 * response and returns both the clean text and parsed updates.
 *
 * Ported from `shared/domain/manager/StatsParsingManager.kt`.
 */
export interface ParsedStats {
  trust?: number;
  affection?: number;
  tension?: number;
  jealousy?: number;
  loyalty?: number;
  voice?: number;
  mood?: string;
  label?: string;
  characterId?: string;
}

export function parseAndStripStats(raw: string): { clean: string; updates: ParsedStats[] } {
  const updates: ParsedStats[] = [];
  const tagRe = /\[(?:STATS|REL_UPDATE):\s*([^\]]+)\]/gi;
  let clean = raw.replace(tagRe, (_m, body: string) => {
    const update: ParsedStats = {};
    for (const pair of body.split('|').map((s) => s.trim())) {
      const [k, v] = pair.split('=').map((s) => s.trim());
      if (!k || v === undefined) continue;
      const key = k.toLowerCase();
      switch (key) {
        case 'trust':
        case 'affection':
        case 'tension':
        case 'jealousy':
        case 'loyalty':
        case 'voice':
          update[key] = Number.parseInt(v, 10) || 0;
          break;
        case 'mood':
        case 'label':
          update[key] = v;
          break;
        case 'character':
          update.characterId = v;
          break;
      }
    }
    updates.push(update);
    return '';
  });
  clean = clean.replace(/\n{3,}/g, '\n\n').trim();
  return { clean, updates };
}

export function passTypeFromRole(role: string): PassType {
  const upper = role.toUpperCase();
  if (upper in PassType) return upper as PassType;
  return PassType.CHARACTER_MAIN;
}

const VALID_EMOTIONS = new Set([
  'neutral', 'happy', 'sad', 'angry', 'surprised', 'thinking',
  'curious', 'tender', 'warm', 'playful', 'vulnerable', 'conflicted',
  'cold', 'anxious', 'focused', 'smile', 'laugh', 'confused',
]);

const EMOTION_TAG_RE = /\[EMOTION:\s*([a-z_]+)(?:\s+character=[^\]]+)?\]/gi;

/**
 * Strips [EMOTION: KEY] tags from LLM output and returns the detected emotion.
 * Returns undefined if no valid emotion tag is found.
 */
export function parseAndStripEmotion(raw: string): { clean: string; emotion: string | undefined } {
  let emotion: string | undefined;
  const clean = raw.replace(EMOTION_TAG_RE, (_m, key: string) => {
    const k = key.toLowerCase().trim();
    if (VALID_EMOTIONS.has(k)) emotion = k;
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { clean, emotion };
}

/**
 * Arc save tag — model signals a good story beat for arc checkpointing.
 * Format: [ARC_SAVE] or [ARC_SAVE: Chapter 1 - The Meeting]
 */
export interface ArcSaveTag {
  title?: string;
  triggered: boolean;
}

const ARC_SAVE_TAG_RE = /\[ARC_SAVE(?::\s*([^\]]+))?\]/gi;

/**
 * Strips [ARC_SAVE] tags from LLM output and returns detection result.
 */
export function parseAndStripArcSave(raw: string): { clean: string; arcSave: ArcSaveTag | null } {
  let triggered = false;
  let title: string | undefined;

  const clean = raw.replace(ARC_SAVE_TAG_RE, (_m, tagBody: string | undefined) => {
    triggered = true;
    if (tagBody) title = tagBody.trim();
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();

  return {
    clean,
    arcSave: triggered ? { title, triggered } : null,
  };
}
