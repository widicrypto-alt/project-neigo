/**
 * BACKLOG B2.5 — Character rename cast-denorm service.
 *
 * When a character is renamed, every `stories.cast[]` row that references
 * that character needs its `displayName` resynced. The jsonb column is
 * queried with a GIN-style predicate by serializing the cast to text and
 * using a containment check — no index needed for the scan because most
 * installations have O(hundreds) of stories, not millions.
 *
 * Idempotent: running twice with the same name is a no-op (we compare
 * before writing).
 */
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

export interface CastEntry {
  characterId: string;
  displayName: string;
  role: string;
}

export async function resyncCastDisplayName(args: {
  characterId: string;
  newName: string;
}): Promise<{ scanned: number; updated: number }> {
  const { characterId, newName } = args;
  if (!characterId || !newName) return { scanned: 0, updated: 0 };

  // Candidate stories: jsonb `cast` contains an object with the target id.
  // Using @> with a JSONB array of one element is index-friendly once a GIN
  // index exists; without one, PG falls back to a sequential scan but the
  // predicate is still correct.
  const candidates = await db.execute(sql`
    SELECT id, "cast" AS cast
    FROM stories
    WHERE "cast" @> ${JSON.stringify([{ characterId }])}::jsonb
  `);

  const rows = (candidates as unknown as { rows: Array<{ id: string; cast: unknown }> }).rows ?? [];
  let updated = 0;
  for (const row of rows) {
    const cast = Array.isArray(row.cast) ? (row.cast as CastEntry[]) : [];
    let dirty = false;
    const next = cast.map((entry) => {
      if (entry.characterId === characterId && entry.displayName !== newName) {
        dirty = true;
        return { ...entry, displayName: newName };
      }
      return entry;
    });
    if (!dirty) continue;
    await db
      .update(schema.stories)
      .set({ cast: next, updatedAt: new Date() })
      .where(eq(schema.stories.id, row.id));
    updated++;
  }
  return { scanned: rows.length, updated };
}
