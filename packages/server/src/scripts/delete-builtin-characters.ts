/**
 * One-time script to hard-delete all built-in characters from the database.
 * Run with: bun run src/scripts/delete-builtin-characters.ts
 */
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

async function main() {
  console.log('--- Deleting Built-in Characters ---');

  const builtins = await db.query.characters.findMany({
    where: eq(schema.characters.isBuiltIn, true),
    columns: { id: true, name: true },
  });

  console.log(`Found ${builtins.length} built-in characters.`);

  for (const char of builtins) {
    console.log(`Deleting [${char.id}] ${char.name}...`);
    
    // We use hard delete because user explicitly wants them GONE.
    // Note: This might fail if there are active sessions due to FK constraints.
    // In a real production scenario, we might want to nullify or delete sessions first.
    try {
      await db.delete(schema.characters).where(eq(schema.characters.id, char.id));
      console.log(`  ✓ Deleted.`);
    } catch (err) {
      console.warn(`  ✗ Failed to delete ${char.name}:`, (err as Error).message);
      console.info(`    Attempting to set isRetired=true and isPublic=false instead...`);
      await db.update(schema.characters)
        .set({ isRetired: true, isPublic: false, isBuiltIn: false })
        .where(eq(schema.characters.id, char.id));
      console.log(`    ✓ Character hidden and retired.`);
    }
  }

  console.log('--- Done ---');
}

main()
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  })
  .then(() => process.exit(0));
