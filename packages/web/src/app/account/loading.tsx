import { Skeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-10" role="status" aria-label="Memuat akun">
      <div>
        <Skeleton height={32} width={208} />
        <Skeleton className="mt-3" height={16} width={288} rounded="sm" />
      </div>

      <section className="card p-5 space-y-3">
        <Skeleton height={20} width={144} rounded="sm" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton height={14} width={112} rounded="sm" />
            <Skeleton height={14} width={64} rounded="sm" />
          </div>
        ))}
      </section>

      <section className="card p-5 space-y-3">
        <Skeleton height={20} width={176} rounded="sm" />
        <Skeleton height={14} rounded="sm" />
        <Skeleton height={14} width="83%" rounded="sm" />
      </section>
      <span className="sr-only">Memuat akun…</span>
    </div>
  );
}
