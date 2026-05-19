'use client';

import { cn } from '@/lib/cn';

/**
 * <AuroraSkeleton /> — D6 shimmer placeholder with aurora gradient.
 *
 * Replaces plain `Skeleton` in content-heavy loading states (rails, inboxes).
 * `animate-aurora-shimmer` is defined in tailwind.config.ts + globals.css.
 * Accessible: hidden from screen readers by default.
 */
export function AuroraSkeleton({
  className,
  width,
  height,
  rounded = 'lg',
}: {
  className?: string;
  width?: number | string;
  height?: number | string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}) {
  const radius = {
    sm: 'rounded-md',
    md: 'rounded-lg',
    lg: 'rounded-2xl',
    xl: 'rounded-3xl',
    full: 'rounded-full',
  }[rounded];

  return (
    <span
      aria-hidden
      className={cn('block aurora-shimmer', radius, className)}
      style={{ width, height }}
    />
  );
}

/**
 * Skeleton for a poster card (aspect 2:3) — used in DiscoverRail loading state.
 */
export function PosterSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative flex aspect-[2/3] w-full flex-col justify-end overflow-hidden rounded-2xl border border-white/[0.05]',
        className,
      )}
    >
      <AuroraSkeleton className="absolute inset-0 rounded-none" rounded="lg" />
      <div className="relative z-10 flex flex-col gap-1.5 p-3">
        <AuroraSkeleton height={12} width="80%" rounded="sm" />
        <AuroraSkeleton height={10} width="55%" rounded="sm" />
      </div>
    </div>
  );
}

/**
 * Skeleton for a letter card in the inbox.
 */
export function LetterSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex items-start gap-3 rounded-2xl border border-white/[0.05] p-4',
        className,
      )}
    >
      <AuroraSkeleton width={40} height={40} rounded="full" />
      <div className="flex flex-1 flex-col gap-2 pt-0.5">
        <AuroraSkeleton height={12} width="55%" rounded="sm" />
        <AuroraSkeleton height={10} width="85%" rounded="sm" />
        <AuroraSkeleton height={10} width="70%" rounded="sm" />
      </div>
    </div>
  );
}
