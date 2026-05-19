/**
 * Presence tag parsing for HAREM mode.
 * Port of PresenceManager.kt
 */
import type { Character } from '@neigo/shared';

const PRESENCE_RE = /\[PRESENCE:\s*([^\]]+)\]/gi;
const CAST_REL_RE = /\[CAST_REL:\s*([^\]]+)\]/gi;

export function parsePresenceUpdate(
  fullText: string,
  characters: ReadonlyArray<Pick<Character, 'id' | 'name'>>,
  currentPresentIds: ReadonlyArray<string>,
): string[] {
  const present = new Set(currentPresentIds);
  const lookup = new Map(characters.map((c) => [c.name.toLowerCase(), c.id]));
  let m: RegExpExecArray | null;
  PRESENCE_RE.lastIndex = 0;
  while ((m = PRESENCE_RE.exec(fullText)) !== null) {
    const body = m[1];
    if (!body) continue;
    for (const segment of body.split(',')) {
      const s = segment.trim().toLowerCase();
      for (const [name, id] of lookup) {
        if (!s.includes(name)) continue;
        if (/(arrived|enters|joins|appears)/.test(s)) present.add(id);
        else if (/(left|leaves|exits|vanishes)/.test(s)) present.delete(id);
      }
    }
  }
  return Array.from(present);
}

export interface CastRelationshipChange {
  aId: string;
  bId: string;
  rivalryDelta?: number;
  allianceDelta?: number;
}

export function parseCastRelationshipUpdates(
  fullText: string,
  characters: ReadonlyArray<Pick<Character, 'id' | 'name'>>,
): CastRelationshipChange[] {
  const lookup = new Map(characters.map((c) => [c.name.toLowerCase(), c.id]));
  const out: CastRelationshipChange[] = [];
  let m: RegExpExecArray | null;
  CAST_REL_RE.lastIndex = 0;
  while ((m = CAST_REL_RE.exec(fullText)) !== null) {
    const body = m[1];
    if (!body) continue;
    const sep = body.match(/(.+?)(?:↔|<->|vs)(.+?):(.*)/i);
    if (!sep || !sep[1] || !sep[2] || sep[3] === undefined) continue;
    const aId = lookup.get(sep[1].trim().toLowerCase());
    const bId = lookup.get(sep[2].trim().toLowerCase());
    if (!aId || !bId) continue;
    const payload = sep[3];
    const change: CastRelationshipChange = { aId, bId };
    const riv = payload.match(/rivalry\s*([+-]?\d+)/i);
    const all = payload.match(/alliance\s*([+-]?\d+)/i);
    if (riv && riv[1]) change.rivalryDelta = clampDelta(parseInt(riv[1], 10));
    if (all && all[1]) change.allianceDelta = clampDelta(parseInt(all[1], 10));
    out.push(change);
  }
  return out;
}

function clampDelta(n: number): number {
  return Math.max(-50, Math.min(50, n));
}
