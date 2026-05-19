import { and, eq } from 'drizzle-orm';
import { db, schema } from './client.js';
import { formatAutoSessionTitle } from '../lib/session-title.js';

async function main() {
  console.log('Backfilling empty chat session titles...');

  const sessions = await db.select().from(schema.chatSessions);

  let scanned = 0;
  let updated = 0;

  for (const row of sessions) {
    scanned += 1;
    const existing = row.title ?? '';
    if (existing.trim().length > 0) continue;

    const character = await db.query.characters.findFirst({
      where: eq(schema.characters.id, row.characterId),
    });

    const nextTitle = formatAutoSessionTitle({
      title: row.title,
      mode: row.mode,
      characterName: character?.name ?? null,
      createdAt: row.createdAt,
    });

    await db
      .update(schema.chatSessions)
      .set({ title: nextTitle })
      .where(and(eq(schema.chatSessions.id, row.id), eq(schema.chatSessions.title, row.title)));

    updated += 1;
  }

  console.log(`Done. Scanned: ${scanned}, Updated: ${updated}`);
}

await main();
process.exit(0);
