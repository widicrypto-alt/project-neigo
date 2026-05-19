'use client';

import { cn } from '@/lib/cn';

/**
 * <Skeleton /> — shimmer placeholder.
 *
 * Accessible: hidden from screen readers by default (`aria-hidden`). Wrap
 * with an sr-only status node at the parent when the skeleton stands in
 * for loading data the user is waiting on.
 */
export function Skeleton({
  className,
  width,
  height,
  rounded = 'md',
}: {
  className?: string;
  width?: number | string;
  height?: number | string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}) {
  const radius = {
    sm: 'rounded-md',
    md: 'rounded-lg',
    lg: 'rounded-2xl',
    full: 'rounded-full',
  }[rounded];
  return (
    <span
      aria-hidden
      className={cn(
        'block animate-pulse-soft bg-white/[0.06]',
        radius,
        className,
      )}
      style={{ width, height }}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 ? '72%' : '100%'}
          rounded="sm"
        />
      ))}
    </div>
  );
}
