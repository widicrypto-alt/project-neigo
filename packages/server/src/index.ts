import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { csrf } from 'hono/csrf';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { Sentry } from './lib/sentry.js';
import { startCronJobs } from './lib/cron.js';
import { startSessionWorkers } from './lib/session-workers.js';
import { authRouter } from './routes/auth.js';
import { charactersRouter } from './routes/characters.js';
import { sessionsRouter } from './routes/sessions.js';
import { chatRouter } from './routes/chat.js';
import { tierRouter } from './routes/tier.js';
import { pushRouter } from './routes/push.js';
import { opsRouter } from './routes/ops.js';
import { byokRouter } from './routes/byok.js';
import { lorebooksRouter } from './routes/lorebooks.js';
import { personasRouter } from './routes/personas.js';
import { presetsRouter } from './routes/presets.js';
import { foldersRouter } from './routes/folders.js';
import { schedulesRouter } from './routes/schedules.js';
import { creatorsRouter } from './routes/creators.js';
import { storiesRouter } from './routes/stories.js';
import { meRouter } from './routes/me.js';
import { regexScriptsRouter } from './routes/regex-scripts.js';
import { agentConfigsRouter } from './routes/agent-configs.js';
import { characterCommentsRouter, storyCommentsRouter } from './routes/comments.js';
import { analyticsRouter } from './routes/analytics.js';
import { spriteManifestRouter } from './routes/sprite-manifest.js';
import { uploadsRouter } from './routes/uploads.js';
import { mcProfilesRouter } from './routes/mc-profiles.js';
import { warmTokenizer } from './services/tokenizer.js';

const app = new Hono();

// ── Security Headers ─────────────────────────────────────────────────
app.use('*', secureHeaders());

// ── CSRF Protection (state-changing methods from cross-origin) ───────
app.use('*', csrf({
  origin: env.WEB_ORIGIN.split(',').map((s) => s.trim()),
}));

// ── Request Logging ──────────────────────────────────────────────────
app.use('*', honoLogger());

// ── CORS ─────────────────────────────────────────────────────────────
app.use(
  '*',
  cors({
    origin: env.WEB_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  }),
);

// ── Health Checks (with DB + Redis verification) ─────────────────────
app.get('/', (c) => c.json({ name: 'neigo-server', version: '0.1.0' }));

app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

async function healthCheck(c: import('hono').Context) {
  const checks: Record<string, 'ok' | 'degraded' | 'down'> = {};
  let overallOk = true;

  // Check PostgreSQL
  try {
    const { db } = await import('./db/client.js');
    const { sql: drizzleSql } = await import('drizzle-orm');
    await db.execute(drizzleSql`SELECT 1`);
    checks.db = 'ok';
  } catch {
    checks.db = 'down';
    overallOk = false;
  }

  // Check Redis (optional — degraded, not down)
  try {
    const { getQueueConnection } = await import('./lib/queue.js');
    const conn = getQueueConnection();
    if (conn) {
      await conn.ping();
      checks.redis = 'ok';
    } else {
      checks.redis = 'degraded';
    }
  } catch {
    checks.redis = 'degraded';
  }

  const status = overallOk ? 200 : 503;
  return c.json({
    ok: overallOk,
    status: overallOk ? 'ok' : 'degraded',
    checks,
    time: new Date().toISOString(),
  }, status);
}

// ── Public: featured characters for onboarding ───────────────────────
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from './db/client.js';
app.get('/api/featured-characters', async (c) => {
  const rows = await db
    .select({
      id: schema.characters.id,
      name: schema.characters.name,
      avatarUrl: schema.characters.avatarUrl,
      persona: schema.characters.persona,
      tonePreset: schema.characters.tonePreset,
      chapter: schema.characters.chapter,
      gender: schema.characters.gender,
      age: schema.characters.age,
      discoverOrder: schema.characters.discoverOrder,
      folder: schema.characters.folder,
      tags: schema.characters.tags,
      language: schema.characters.language,
      languagesSpoken: schema.characters.languagesSpoken,
    })
    .from(schema.characters)
    .where(and(
      eq(schema.characters.isPublic, true),
      eq(schema.characters.isRetired, false),
      sql`${schema.characters.deletedAt} IS NULL`,
    ))
    .limit(60);
  const visibleRows = rows
    .sort((a, b) => {
      const ca = a.chapter ?? 99;
      const cb = b.chapter ?? 99;
      if (ca !== cb) return ca - cb;
      const oa = a.discoverOrder ?? 99;
      const ob = b.discoverOrder ?? 99;
      return oa - ob;
    });
  return c.json({ characters: visibleRows });
});

// ── Routes ───────────────────────────────────────────────────────────
app.route('/api/auth', authRouter);
app.route('/api/characters', charactersRouter);
app.route('/api/characters/:id/sprite-manifest', spriteManifestRouter);
app.route('/api/sessions', sessionsRouter);
app.route('/api/chat', chatRouter);
app.route('/api/tier', tierRouter);
app.route('/api/push', pushRouter);
app.route('/api/ops', opsRouter);
app.route('/api/byok', byokRouter);
app.route('/api/lorebooks', lorebooksRouter);
app.route('/api/personas', personasRouter);
app.route('/api/presets', presetsRouter);
app.route('/api/folders', foldersRouter);
app.route('/api/schedules', schedulesRouter);
app.route('/api/creators', creatorsRouter);
app.route('/api/stories', storiesRouter);
app.route('/api/me', meRouter);
app.route('/api/regex-scripts', regexScriptsRouter);
app.route('/api/agent-configs', agentConfigsRouter);
app.route('/api/characters/:id/comments', characterCommentsRouter);
app.route('/api/stories/:id/comments', storyCommentsRouter);
app.route('/api/analytics', analyticsRouter);
app.route('/api/uploads', uploadsRouter);
app.route('/api/mc-profiles', mcProfilesRouter);

// ── Global Error Handler (production-safe) ───────────────────────────
app.onError((err, c) => {
  // Log full error via Pino (with redaction) + capture to Sentry
  logger.error({ err, path: c.req.path, method: c.req.method }, 'unhandled server error');
  Sentry.captureException(err);

  // In production, never leak internal error details to clients
  const message = env.NODE_ENV === 'production'
    ? 'An internal error occurred'
    : err.message;

  return c.json({ error: 'internal_error', message }, 500);
});

app.notFound((c) => c.json({ error: 'not_found' }, 404));

// ── Bootstrap ────────────────────────────────────────────────────────
logger.info(`Neigo server listening on :${env.PORT}`);
startCronJobs();
startSessionWorkers();
warmTokenizer();

// PLANBv7 W-D — register R2 provider for context blob externalization
(async () => {
  try {
    const { installDefaultBlobProvider } = await import('./services/context-blobs.js');
    installDefaultBlobProvider();
  } catch (err) {
    logger.warn({ err }, 'blob provider registration failed');
  }
})();

// ── Graceful Shutdown ────────────────────────────────────────────────
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'graceful shutdown initiated');

  // 1. Stop accepting new connections
  // (Bun will stop accepting after the process exits; we drain in-flight work first)

  // 2. Close database pool
  try {
    const { sql: queryClient } = await import('./db/client.js');
    await queryClient.end({ timeout: 5 });
    logger.info('database pool closed');
  } catch (err) {
    logger.warn({ err }, 'error closing database pool');
  }

  // 3. Close Redis connection
  try {
    const { getQueueConnection } = await import('./lib/queue.js');
    const conn = getQueueConnection();
    if (conn) {
      await conn.quit();
      logger.info('redis connection closed');
    }
  } catch (err) {
    logger.warn({ err }, 'error closing redis connection');
  }

  // 4. Flush Sentry
  await Sentry.close(2000);

  logger.info('shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled promise rejection');
  Sentry.captureException(reason);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  Sentry.captureException(err);
  process.exit(1);
});

export default {
  port: env.PORT,
  fetch: app.fetch,
  reusePort: true,
};
