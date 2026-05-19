import * as Sentry from '@sentry/bun';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [Sentry.contextLinesIntegration()],
    beforeSend(event) {
      // Jangan kirim error yang expected (4xx, 5xx dengan body JSON error)
      const statusCode = event.contexts?.response?.status_code;
      if (statusCode !== undefined && statusCode < 500) return null;
      return event;
    },
  });
}

export { Sentry };
