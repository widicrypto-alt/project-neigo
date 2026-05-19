import { eq } from 'drizzle-orm';
import { db, schema } from './client.js';

type PersonaRecord = Record<string, unknown>;

function sanitizePersona(persona: unknown) {
  if (!persona || typeof persona !== 'object' || Array.isArray(persona)) {
    return { nextPersona: persona, changed: false };
  }

  const current = persona as PersonaRecord;
  const { live2dModelUrl: _live2dModelUrl, live2dProfile: _live2dProfile, ...rest } = current;

  const hadLive2DKeys =
    Object.prototype.hasOwnProperty.call(current, 'live2dModelUrl') ||
    Object.prototype.hasOwnProperty.call(current, 'live2dProfile');

  return {
    nextPersona: rest,
    changed: hadLive2DKeys,
  };
}

function sanitizeTags(tags: unknown) {
  if (!Array.isArray(tags)) {
    return { nextTags: tags, changed: false };
  }

  const nextTags = tags.filter((tag) => tag !== 'live2d');
  return {
    nextTags,
    changed: nextTags.length !== tags.length,
  };
}

async function main() {
  console.log('Removing legacy Live2D fields from characters...');

  const rows = await db.query.characters.findMany();
  let updated = 0;

  for (const row of rows) {
    const { nextPersona, changed: personaChanged } = sanitizePersona(row.persona);
    const { nextTags, changed: tagsChanged } = sanitizeTags(row.tags);

    if (!personaChanged && !tagsChanged) {
      continue;
    }

    await db
      .update(schema.characters)
      .set({
        persona: (nextPersona ?? {}) as PersonaRecord,
        tags: (nextTags ?? []) as string[],
        updatedAt: new Date(),
      })
      .where(eq(schema.characters.id, row.id));

    updated += 1;
  }

  console.log(`Done. Updated rows: ${updated}/${rows.length}`);
}

await main();
process.exit(0);
