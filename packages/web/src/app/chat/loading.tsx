import { Skeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="flex-1 flex min-h-0" role="status" aria-label="Memuat obrolan">
      <aside className="w-80 shrink-0 border-r border-white/[0.06] flex flex-col min-h-0 bg-ink-950/40 backdrop-blur-xl">
        <div className="px-5 pt-5 pb-4">
          <Skeleton height={10} width={80} rounded="sm" />
          <Skeleton className="mt-2" height={24} width={96} />
        </div>
        <div className="mx-5 hairline" />
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl p-2.5">
              <Skeleton width={44} height={44} rounded="lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton height={12} width="75%" rounded="sm" />
                <Skeleton height={10} width="50%" rounded="sm" />
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex items-center justify-center p-10 text-center">
        <div className="w-full max-w-sm space-y-3">
          <Skeleton className="mx-auto" height={32} width={192} />
          <Skeleton height={14} rounded="sm" />
          <Skeleton className="mx-auto" height={14} width="80%" rounded="sm" />
          <Skeleton className="mx-auto mt-4" height={40} width={176} rounded="lg" />
        </div>
      </div>
      <span className="sr-only">Memuat obrolan…</span>
    </div>
  );
}
