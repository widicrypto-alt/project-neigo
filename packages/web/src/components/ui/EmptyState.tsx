'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * <EmptyState /> — full-area placeholder for zero-content routes.
 *
 * Used by Discover (no recs yet), chat list (no sessions), search (no hits).
 * Indonesian-first copy expected from callers; this component is chrome only.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-16 gap-3',
        className,
      )}
    >
      {icon && (
        <div className="text-ink-500 w-12 h-12 flex items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.06]">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-ink-100">{title}</h3>
      {description && (
        <p className="text-sm text-ink-400 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
