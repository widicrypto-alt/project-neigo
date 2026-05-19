'use client';

import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * <Banner /> — persistent contextual bar (offline, quota warning, version skew).
 *
 * `role="status"` by default; callers pass `tone` to drive color + aria-live.
 * Dismissible with remembered state is the caller's job (use `onDismiss`).
 */

export type BannerTone = 'info' | 'success' | 'warning' | 'error';

const TONES: Record<BannerTone, string> = {
  info: 'bg-iris-500/10 border-iris-400/30 text-iris-100',
  success: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-100',
  warning: 'bg-amber-500/10 border-amber-400/30 text-amber-100',
  error: 'bg-rose-500/10 border-rose-400/30 text-rose-100',
};

export function Banner({
  tone = 'info',
  icon,
  title,
  description,
  action,
  onDismiss,
  className,
}: {
  tone?: BannerTone;
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      role="status"
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-3 rounded-2xl border px-4 py-3 backdrop-blur-md',
        TONES[tone],
        className,
      )}
    >
      {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
      <div className="flex-1 min-w-0">
        {title && <div className="text-sm font-semibold">{title}</div>}
        {description && (
          <div className="text-xs opacity-85 mt-0.5 leading-relaxed">{description}</div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            onDismiss();
          }}
          aria-label="Tutup"
          className="shrink-0 opacity-70 hover:opacity-100 -mr-1"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
