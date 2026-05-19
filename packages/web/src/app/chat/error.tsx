'use client';

export default function ChatError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-950 p-6">
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-semibold text-ink-100">Chat unavailable</h2>
        <p className="mt-2 text-sm text-ink-400">
          Something went wrong loading your chats. Please try again.
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-accent-500/20 px-4 py-2 text-sm text-accent-200 hover:bg-accent-500/30 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
