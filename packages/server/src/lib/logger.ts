/**
 * Singleton Pino logger for the Neigo server.
 *
 * Behaviour:
 *  - Development (NODE_ENV !== 'production'): colourised human-readable output
 *    via pino-pretty, with log level defaulting to 'debug'.
 *  - Production: NDJSON to stdout, consumed by Fly.io / systemd journald.
 *    Log level defaults to 'info' and can be overridden via LOG_LEVEL env var.
 *
 * Sensitive fields are redacted at the serialiser layer — they never appear in
 * any log stream, even if accidentally logged by application code.
 *
 * Usage:
 *   import { logger } from '../lib/logger.js';
 *   logger.info('server started');
 *   logger.child({ requestId, userId }).info({ statusCode: 200 }, 'request');
 */
import pino from 'pino';
import { env } from './env.js';

const isProd = env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),

  // Redact sensitive values at serialiser level — value is never stored.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      // Payload fields that must never be logged:
      'password',
      'passwordHash',
      'token',
      'tokenHash',
      'refreshToken',
      'apiKey',
      'byokOrKeyEnc',
      'p256dh',
      'auth', // Web Push subscription
    ],
    censor: '[REDACTED]',
  },

  // Production: plain NDJSON — zero formatting overhead.
  // Development: colourised human-readable via pino-pretty worker thread.
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
});

export type Logger = typeof logger;
