/**
 * Apply post-Drizzle raw SQL migrations (e.g. pgvector column add).
 *
 * Drizzle-kit `push` cannot express a `vector(N)` column, so we keep that part
 * in `drizzle/0001_pgvector.sql` and run it through this helper.
 *
 * Run with:  `bun run src/db/migrate.ts`
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql as pg } from './client.js';
import { logger } from '../lib/logger.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', '..', 'drizzle');

async function main() {
  let files: string[] = [];
  try {
    files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    logger.info('No drizzle/ directory, nothing to migrate.');
    return;
  }
  for (const file of files) {
    const path = join(migrationsDir, file);
    const content = await readFile(path, 'utf8');
    logger.info({ file }, 'applying migration');
    try {
      await pg.unsafe(content);
      logger.info({ file }, 'migration applied');
    } catch (err: any) {
      if (err.code === '42P07' || err.code === '42701') {
        logger.info({ file }, 'migration already exists, skipped');
      } else {
        logger.error({ err, file }, 'migration failed');
        throw err;
      }
    }
  }
  logger.info('all migrations applied');
}

await main();
process.exit(0);
