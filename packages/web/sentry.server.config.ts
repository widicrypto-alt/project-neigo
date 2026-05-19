import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      // Drop non-5xx errors — expected failures (404, 401, 403) are not actionable
      const statusCode = event.contexts?.response?.status_code;
      if (statusCode !== undefined && statusCode < 500) return null;
      return event;
    },
  });
}
