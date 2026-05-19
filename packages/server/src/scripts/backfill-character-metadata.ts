/**
 * PLANIMPv7 §3.1 — Backfill character metadata columns.
 *
 * Iterates over all characters, parses `persona.age` and `persona.gender`,
 * and updates the top-level `age` (int) and `gender` (varchar 1) columns.
 *
 * Run with: bun run src/scripts/backfill-character-metadata.ts
 */
import { sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

async function main() {
  console.log('--- Character Metadata Backfill Start ---');

  const rows = await db.query.characters.findMany({
    columns: { id: true, name: true, persona: true },
  });

  console.log(`Found ${rows.length} characters to process.`);

  let updatedCount = 0;
  for (const row of rows) {
    const persona = (row.persona ?? {}) as Record<string, unknown>;
    const rawAge = String(persona.age ?? '');
    const rawGender = String(persona.gender ?? '');

    const age = parseInt(rawAge, 10);
    const normalizedAge = Number.isNaN(age) ? null : age;

    const g = rawGender.trim().toUpperCase().slice(0, 1);
    const normalizedGender = ['M', 'F', 'O'].includes(g) ? g : (rawGender ? 'O' : null);

    console.log(`[${row.id}] ${row.name}: age="${rawAge}"->${normalizedAge}, gender="${rawGender}"->${normalizedGender}`);

    await db
      .update(schema.characters)
      .set({
        age: normalizedAge,
        gender: normalizedGender,
      })
      .where(sql`id = ${row.id}`);
    
    updatedCount++;
  }

  console.log(`--- Backfill Complete: ${updatedCount} rows updated ---`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .then(() => process.exit(0));
