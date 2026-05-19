export default function Loading() {
  return (
    <div className="flex-1 px-6 md:px-10 py-8 md:py-12">
      <div className="max-w-7xl mx-auto space-y-8 md:space-y-10">
        <section className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-transparent p-6 md:p-8">
          <div className="h-2.5 w-36 rounded bg-white/[0.06] animate-pulse-soft" />
          <div className="h-10 md:h-12 w-3/4 mt-4 rounded bg-white/[0.08] animate-pulse-soft" />
          <div className="h-4 w-2/3 mt-3 rounded bg-white/[0.05] animate-pulse-soft" />
          <div className="h-4 w-1/2 mt-2 rounded bg-white/[0.04] animate-pulse-soft" />
          <div className="flex flex-wrap gap-3 mt-6">
            <div className="h-11 w-36 rounded-xl bg-white/[0.09] animate-pulse-soft" />
            <div className="h-11 w-40 rounded-xl bg-white/[0.06] animate-pulse-soft" />
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4 md:mb-5 gap-4">
            <div className="space-y-2">
              <div className="h-2.5 w-24 rounded bg-white/[0.05] animate-pulse-soft" />
              <div className="h-7 w-52 rounded bg-white/[0.07] animate-pulse-soft" />
            </div>
            <div className="hidden md:block h-4 w-28 rounded bg-white/[0.04] animate-pulse-soft" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3"
              >
                <div className="h-40 rounded-xl bg-gradient-to-br from-white/[0.09] to-white/[0.03] animate-pulse-soft" />
                <div className="h-5 w-3/4 rounded bg-white/[0.06] animate-pulse-soft" />
                <div className="h-3.5 w-full rounded bg-white/[0.05] animate-pulse-soft" />
                <div className="h-3.5 w-4/5 rounded bg-white/[0.04] animate-pulse-soft" />
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-center pt-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-2">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
        <p className="text-center text-xs uppercase tracking-[0.18em] text-ink-500">Loading home...</p>
      </div>
      <div className="sr-only" aria-live="polite">
        Loading Home page
        </div>
    </div>
  );
}
