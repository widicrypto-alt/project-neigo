import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { env } from '../lib/env.js';

/**
 * Postgres client.
 *
 * Supabase / hosted Postgres require SSL. We auto-enable `ssl: 'require'` when:
 * - DATABASE_URL contains `sslmode=require`
 * - The host looks like a Supabase pooler (`*.supabase.co` / `*.pooler.supabase.com`)
 * - NODE_ENV === 'production' and host is not localhost
 */
function resolveSslOption(url: string): 'require' | false {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (u.searchParams.get('sslmode') === 'require') return 'require';
    if (/supabase\.(co|com)$/i.test(host)) return 'require';
    if (env.NODE_ENV === 'production' && host !== 'localhost' && host !== '127.0.0.1') {
      return 'require';
    }
    return false;
  } catch {
    return false;
  }
}

const ssl = resolveSslOption(env.DATABASE_URL);

// Detect pgbouncer transaction pooler (Supabase uses port 6543 for it).
// In transaction pooling mode, prepared statements must be disabled.
const isPooler = /:(6543)(\/|\?|$)/.test(env.DATABASE_URL) || /pooler\.supabase/i.test(env.DATABASE_URL);

const queryClient = postgres(env.DATABASE_URL, {
  max: 20,
  ssl,
  prepare: !isPooler,
  connect_timeout: 10,
  idle_timeout: 600,
  max_lifetime: 3600,
  // Include the extensions schema so the vector type resolves after it was
  // moved from public → extensions (migration 0003_security.sql).
  // A non-existent schema in search_path is silently ignored by Postgres, so
  // this is safe before the migration runs.
  connection: {
    search_path: '"$user",public,extensions',
  },
});

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
export { schema };
export { queryClient as sql };

