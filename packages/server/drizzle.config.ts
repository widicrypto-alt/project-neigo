import { defineConfig } from 'drizzle-kit';

// drizzle-kit cannot reliably use Supabase's transaction pooler (port 6543)
// because prepared statements are disabled there. When DIRECT_URL is set we
// always prefer it for migrations; fall back to DATABASE_URL otherwise.
const url =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/neigo';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
