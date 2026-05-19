import { Skeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-8" role="status" aria-label="Memuat pengaturan">
      <div>
        <Skeleton height={32} width={208} />
        <Skeleton className="mt-3" height={16} width={288} rounded="sm" />
      </div>

      <section className="card p-5 md:p-6 space-y-4">
        <Skeleton height={20} width={160} rounded="sm" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton height={14} width={112} rounded="sm" />
            <Skeleton height={44} rounded="lg" />
          </div>
        ))}
        <Skeleton height={112} rounded="lg" />
        <Skeleton height={44} width={176} rounded="lg" />
      </section>
      <span className="sr-only">Memuat pengaturan…</span>
    </div>
  );
}
