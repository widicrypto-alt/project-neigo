import { Skeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="flex-1 min-h-0 flex flex-col" role="status" aria-label="Memuat percakapan">
      <div className="p-4 md:p-6 border-b border-white/[0.06]">
        <Skeleton height={12} width={96} rounded="sm" />
        <Skeleton className="mt-2" height={28} width={208} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={i % 2 === 0 ? 'flex justify-start' : 'flex justify-end'}>
            <div className="max-w-[75%] rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 space-y-2">
              <Skeleton height={14} width={176} rounded="sm" />
              <Skeleton height={14} width={144} rounded="sm" />
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 md:p-6 border-t border-white/[0.06]">
        <Skeleton height={48} rounded="lg" />
      </div>
      <span className="sr-only">Memuat percakapan…</span>
    </div>
  );
}
