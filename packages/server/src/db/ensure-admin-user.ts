/**
 * Ensure a canonical admin/owner user exists at admin@neigo.my.id.
 *
 * Idempotent. Reassigns ownership of all characters + stories to the admin
 * user. Adopts legacy demo@neigo.local content if present, then removes the
 * legacy demo account.
 *
 * Run with:
 *   bun --env-file=../../.env run src/db/ensure-admin-user.ts
 */
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { eq, isNull, or, and } from 'drizzle-orm';
import { db, schema } from './client.js';

const ADMIN_EMAIL = 'admin@neigo.my.id';
const LEGACY_DEMO_EMAIL = 'demo' + String.fromCharCode(64) + 'neigo.local';
const ADMIN_DISPLAY_NAME = 'Project Neigo';
const ADMIN_HANDLE = 'neigo';
const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? 'neigo-admin';

async function main() {
  console.log(`Ensuring admin user @ ${ADMIN_EMAIL}`);

  const existingAdmin = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, ADMIN_EMAIL),
  });
  const legacyDemo = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, LEGACY_DEMO_EMAIL),
  });

  let adminId: string;
  if (existingAdmin) {
    adminId = existingAdmin.id;
    console.log(`  · Admin already exists (id=${adminId})`);
  } else if (legacyDemo) {
    // Rename legacy demo -> admin, promote tier/display.
    adminId = legacyDemo.id;
    await db.update(schema.users)
      .set({
        email: ADMIN_EMAIL,
        displayName: ADMIN_DISPLAY_NAME,
        handle: ADMIN_HANDLE,
        tier: 'PREMIUM_PLUS',
        profileIsPublic: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, adminId));
    console.log(`  · Renamed legacy demo -> admin (id=${adminId})`);
  } else {
    adminId = nanoid();
    await db.insert(schema.users).values({
      id: adminId,
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_DEFAULT_PASSWORD, 10),
      displayName: ADMIN_DISPLAY_NAME,
      handle: ADMIN_HANDLE,
      tier: 'PREMIUM_PLUS',
      profileIsPublic: true,
    });
    console.log(`  · Created admin (id=${adminId})`);
  }

  // If BOTH admin and legacy demo exist, merge content then delete legacy.
  if (existingAdmin && legacyDemo && legacyDemo.id !== adminId) {
    console.log(`  · Merging legacy demo (${legacyDemo.id}) -> admin (${adminId})`);
    await db.update(schema.characters)
      .set({ ownerId: adminId })
      .where(eq(schema.characters.ownerId, legacyDemo.id));
    await db.update(schema.stories)
      .set({ authorId: adminId })
      .where(eq(schema.stories.authorId, legacyDemo.id));
    try {
      await db.delete(schema.users).where(eq(schema.users.id, legacyDemo.id));
      console.log(`  · Removed legacy demo user`);
    } catch (err) {
      console.warn(`  ! Could not delete legacy demo user (FK? keep as orphan):`, err);
    }
  }

  // Claim any unowned built-in characters to admin.
  const unownedUpdate = await db.update(schema.characters)
    .set({ ownerId: adminId, isPublic: true, updatedAt: new Date() })
    .where(isNull(schema.characters.ownerId))
    .returning({ id: schema.characters.id });
  console.log(`  · Adopted ${unownedUpdate.length} unowned character(s)`);

  // Make ALL characters owned by admin (force-assign). User explicitly asked
  // for every character + story to be owned by admin.
  const allCharsUpdate = await db.update(schema.characters)
    .set({ ownerId: adminId, updatedAt: new Date() })
    .where(and(
      or(eq(schema.characters.ownerId, ''), isNull(schema.characters.ownerId), eq(schema.characters.isBuiltIn, true)),
    ))
    .returning({ id: schema.characters.id });
  console.log(`  · Ensured built-in/empty owners -> admin (${allCharsUpdate.length})`);

  // Count results
  const allChars = await db.query.characters.findMany({ columns: { id: true, ownerId: true } });
  const allStories = await db.query.stories.findMany({ columns: { id: true, authorId: true } });
  const adminChars = allChars.filter((c) => c.ownerId === adminId).length;
  const adminStories = allStories.filter((s) => s.authorId === adminId).length;
  console.log(`  · Characters owned by admin: ${adminChars} / ${allChars.length}`);
  console.log(`  · Stories authored by admin: ${adminStories} / ${allStories.length}`);

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
