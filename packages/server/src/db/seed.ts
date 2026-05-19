import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { db, schema } from './client.js';

/**
 * Seed minimal demo data: one user.
 * Run with: bun run src/db/seed.ts
 */
async function main() {
  console.log('Seeding…');
  const email = 'admin@neigo.my.id';
  const existing = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, email),
  });
  if (existing) {
    console.log('Demo user already exists, skipping.');
    return;
  }
  const userId = nanoid();
  await db.insert(schema.users).values({
    id: userId,
    email,
    passwordHash: await bcrypt.hash('demopass123', 10),
    displayName: 'Demo User',
    tier: 'PREMIUM_PLUS',
  });

  console.log(
    `✓ Seeded demo user ${email} (password: demopass123).`,
  );
}

await main();
process.exit(0);
