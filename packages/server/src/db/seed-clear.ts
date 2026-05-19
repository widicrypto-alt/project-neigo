import { db, schema } from './client.js';
import { sql } from 'drizzle-orm';

/**
 * Wipes all Character and Story data (including sprites/images and all
 * session data that references characters). Schema, users, personas, and
 * application logic are untouched.
 *
 * Deletion order respects FK constraints:
 *   1. chatSessions  (RESTRICT FK on characterId — must go first; cascades
 *      all session children: messages, memories, dynamic states, arcs, etc.)
 *   2. characterImages  (cascade from characters, explicit for clarity)
 *   3. characters
 *   4. stories  (cascades: scenes, character refs, runs, reactions, comments)
 *
 * Run with: bun run src/db/seed-clear.ts
 */
async function main() {
  console.log('🧹 Clearing Character and Story data...\n');

  // ── 1. Chat sessions (unblocks the RESTRICT FK on characters) ─────────────
  await db.delete(schema.chatSessions).execute();
  console.log('✓ Deleted chat_sessions (+ cascaded messages, memories, arcs…)');

  // ── 2. Character images / sprites ─────────────────────────────────────────
  await db.delete(schema.characterImages).execute();
  console.log('✓ Deleted character_images (sprites)');

  // ── 3. Characters ─────────────────────────────────────────────────────────
  await db.delete(schema.characters).execute();
  console.log('✓ Deleted characters');

  // ── 4. Stories (cascades scenes, character refs, runs, reactions) ─────────
  await db.delete(schema.stories).execute();
  console.log('✓ Deleted stories (+ cascaded scenes, runs, refs…)');

  // ── Verification ──────────────────────────────────────────────────────────
  const [charCount, storyCount, sessionCount, imageCount] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(schema.characters),
    db.select({ n: sql<number>`count(*)` }).from(schema.stories),
    db.select({ n: sql<number>`count(*)` }).from(schema.chatSessions),
    db.select({ n: sql<number>`count(*)` }).from(schema.characterImages),
  ]);

  console.log('\n📊 Database status after cleanup:');
  console.log(`  • characters:       ${charCount[0]?.n ?? '?'}`);
  console.log(`  • stories:          ${storyCount[0]?.n ?? '?'}`);
  console.log(`  • chat_sessions:    ${sessionCount[0]?.n ?? '?'}`);
  console.log(`  • character_images: ${imageCount[0]?.n ?? '?'}`);

  const clean =
    Number(charCount[0]?.n ?? 1) === 0 &&
    Number(storyCount[0]?.n ?? 1) === 0 &&
    Number(sessionCount[0]?.n ?? 1) === 0 &&
    Number(imageCount[0]?.n ?? 1) === 0;

  if (clean) {
    console.log('\n✅ Database cleaned successfully! Ready to create new characters and stories.');
  } else {
    console.error('\n❌ Some rows remain — check for unexpected FK constraints.');
    process.exit(1);
  }

  process.exit(0);
}

await main();
