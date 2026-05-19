'use client';

/**
 * <Sheet /> — bottom sheet primitive for mobile action menus + detail panes.
 *
 * Wk4 pre-flight. Bespoke implementation using framer-motion (already
 * installed). Planned swap to Radix Dialog + vaul physics in a follow-up
 * commit once deps land (see FRONTEND.md §17.1 Q2).
 *
 * Behaviour contract (so the swap is API-stable):
 * - Open/close driven by `open` prop (controlled) + `onClose` callback.
 * - Backdrop click closes. ESC closes. Android back-button closes (via
 *   history.pushState sentinel).
 * - Focus is trapped inside the sheet while open; restored to trigger on close.
 * - Respects prefers-reduced-motion (fades only, no slide).
 * - `role="dialog"` + `aria-modal="true"`; heading slot wires `aria-labelledby`.
 * - Body scroll locked while open.
 */

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Optional accessible title; renders visually when provided. */
  title?: ReactNode;
  /** Optional description under title. */
  description?: ReactNode;
  children: ReactNode;
  /** 'bottom' (default, mobile) | 'right' (widescreen side panel, lg:+). */
  side?: 'bottom' | 'right';
  /** Hide the top drag handle. Default false for bottom sheets. */
  hideHandle?: boolean;
  className?: string;
  /** Extra content rendered in the backdrop layer (e.g. a full-bleed image). */
  backdrop?: ReactNode;
}

function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const { overflow, paddingRight } = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [active]);
}

function useHistoryClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const sentinel = { neigoSheet: true };
    window.history.pushState(sentinel, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // If closed programmatically, drop the sentinel from history.
      if (window.history.state && (window.history.state as { neigoSheet?: boolean }).neigoSheet) {
        window.history.back();
      }
    };
  }, [active, onClose]);
}

function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, onClose]);
}

function useFocusTrap(active: boolean, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = ref.current.querySelectorAll<HTMLElement>(
      'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || focusables.length === 0) return;
      const firstEl = focusables[0]!;
      const lastEl = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [active, ref]);
}

export function Sheet(props: SheetProps) {
  const {
    open,
    onClose,
    title,
    description,
    children,
    side = 'bottom',
    hideHandle = false,
    className,
    backdrop,
  } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useLockBodyScroll(open);
  useHistoryClose(open, onClose);
  useEscape(open, onClose);
  useFocusTrap(open, ref);

  const onBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const initial = side === 'right' ? { x: '100%' } : { y: '100%' };
  const animate = side === 'right' ? { x: 0 } : { y: 0 };
  const exit = initial;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex"
          style={{ zIndex: 'var(--z-sheet, 50)' as unknown as number }}
          onClick={onBackdropClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="presentation"
        >
          <div aria-hidden className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm">
            {backdrop}
          </div>
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            className={cn(
              'relative bg-ink-900/95 border border-white/8 backdrop-blur-2xl shadow-(--shadow-hero) text-ink-100',
              side === 'bottom'
                ? 'mt-auto w-full max-w-140 mx-auto rounded-t-3xl pb-[max(env(safe-area-inset-bottom),1rem)]'
                : 'ml-auto h-full w-full max-w-105 rounded-l-3xl pr-[max(env(safe-area-inset-right),1rem)]',
              className,
            )}
            initial={initial}
            animate={animate}
            exit={exit}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          >
            {side === 'bottom' && !hideHandle && (
              <div className="flex justify-center pt-2 pb-1">
                <span aria-hidden className="h-1 w-10 rounded-full bg-white/15" />
              </div>
            )}
            {(title || description) && (
              <div className="px-5 pt-3 pb-2">
                {title && (
                  <h2 id={titleId} className="text-lg font-semibold text-ink-50">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descId} className="text-sm text-ink-300 mt-1">
                    {description}
                  </p>
                )}
              </div>
            )}
            <div className="px-5 pb-5 overflow-y-auto max-h-[calc(90vh-64px)]">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
