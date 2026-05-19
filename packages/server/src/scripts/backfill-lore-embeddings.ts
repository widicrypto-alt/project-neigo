/**
 * Sprint 1: CIM v1 — Backfill Lore Embeddings.
 *
 * Iterates over all enabled lorebook entries, computes their embeddings,
 * and stores them in the `embedding` column.
 *
 * Run with: bun run src/scripts/backfill-lore-embeddings.ts
 */
import { sql } from 'drizzle-orm';
import { db, schema, sql as pg } from '../db/client.js';
import { Embeddings } from '../services/embeddings.js';

async function main() {
  console.log('--- Lore Embeddings Backfill Start ---');

  // Load entries missing embeddings
  const entries = await db.query.lorebookEntries.findMany({
    where: (e, { eq }) => eq(e.enabled, true),
    columns: { id: true, title: true, content: true },
  });

  console.log(`Found ${entries.length} enabled entries to check.`);

  let updatedCount = 0;
  for (const entry of entries) {
    // Check if embedding already exists (raw SQL since it's not in drizzle schema)
    const [row] = await pg.unsafe(
      `SELECT embedding IS NOT NULL as "hasEmbedding" FROM lorebook_entries WHERE id = $1`,
      [entry.id] as never[],
    );

    if (row?.hasEmbedding) {
      console.log(`[${entry.id}] ${entry.title}: already has embedding. Skipping.`);
      continue;
    }

    console.log(`[${entry.id}] ${entry.title}: generating embedding...`);
    try {
      const text = `${entry.title}\n${entry.content}`;
      const vec = await Embeddings.embed(text);
      const vecLit = Embeddings.toPgLiteral(vec);

      await pg.unsafe(
        `UPDATE lorebook_entries SET embedding = $1::vector WHERE id = $2`,
        [vecLit, entry.id] as never[],
      );
      updatedCount++;
    } catch (err) {
      console.error(`[${entry.id}] Failed:`, (err as Error).message);
    }
  }

  console.log(`--- Backfill Complete: ${updatedCount} entries updated ---`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .then(() => process.exit(0));
