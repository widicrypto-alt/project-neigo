'use client';

/**
 * <Toast /> — context-based toast stack.
 *
 * Wk4 pre-flight. Bespoke implementation. Planned swap to Sonner in a
 * follow-up commit (see FRONTEND.md §17.1 Q3).
 *
 * API contract (stable across swap):
 * - `useToast()` returns `{ show, dismiss }` from a provider.
 * - `show({ variant, title, description, duration })` → toast id.
 * - Variants: 'info' | 'success' | 'warning' | 'error' | 'loading'.
 * - Stack bottom-center above BottomBar (offset 88px).
 * - `aria-live="polite"` by default; `assertive` for 'error'.
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error' | 'loading';

export interface ToastInput {
  variant?: ToastVariant;
  title: string;
  description?: string;
  /** ms before auto-dismiss. 0 = sticky. Default 4500; 'loading' default 0. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastInput {
  id: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastCtx {
  show: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const h = timers.current.get(id);
    if (h) {
      clearTimeout(h);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (input: ToastInput): string => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const variant = input.variant ?? 'info';
      const duration = input.duration ?? (variant === 'loading' ? 0 : 4500);
      const item: ToastItem = { ...input, id, variant, duration };
      setItems((prev) => [...prev, item].slice(-4)); // cap stack at 4
      if (duration > 0) {
        const h = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, h);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const captured = timers.current;
    return () => {
      captured.forEach((h) => clearTimeout(h));
      captured.clear();
    };
  }, []);

  const value = useMemo<ToastCtx>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Toaster items={items} dismiss={dismiss} />
    </Ctx.Provider>
  );
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: 'bg-ink-900/95 border-white/[0.1] text-ink-100',
  success: 'bg-emerald-950/95 border-emerald-400/25 text-emerald-50',
  warning: 'bg-amber-950/95 border-amber-400/30 text-amber-50',
  error: 'bg-rose-950/95 border-rose-400/30 text-rose-50',
  loading: 'bg-ink-900/95 border-white/[0.1] text-ink-100',
};

function Toaster({ items, dismiss }: { items: ToastItem[]; dismiss: (id: string) => void }) {
  return (
    <div
      className="fixed left-0 right-0 flex flex-col items-center gap-2 px-3 pointer-events-none"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
        zIndex: 'var(--z-toast, 60)' as unknown as number,
      }}
    >
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            role="status"
            aria-live={t.variant === 'error' ? 'assertive' : 'polite'}
            className={cn(
              'pointer-events-auto w-full max-w-sm rounded-2xl border px-4 py-3 shadow-[var(--shadow-lift)] backdrop-blur-xl',
              VARIANT_STYLES[t.variant],
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{t.title}</div>
                {t.description && (
                  <div className="text-xs opacity-80 mt-0.5 leading-snug">
                    {t.description}
                  </div>
                )}
              </div>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="text-xs font-semibold uppercase tracking-wider text-accent-300 hover:text-accent-200 shrink-0"
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Tutup"
                className="text-ink-400 hover:text-ink-100 shrink-0 -mr-1"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
