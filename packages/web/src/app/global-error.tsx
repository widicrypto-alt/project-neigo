'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Log to console in dev; in prod this would go to Sentry via beforeSend
    if (process.env.NODE_ENV !== 'production') {
      console.error(error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh bg-ink-950 text-ink-100 flex items-center justify-center p-10">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink-400">
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            className="mt-4 rounded-lg bg-accent-500/20 px-4 py-2 text-sm text-accent-200 hover:bg-accent-500/30 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
