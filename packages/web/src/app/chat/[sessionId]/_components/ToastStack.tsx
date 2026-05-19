import { cn } from '@/lib/cn';
import type { ChatToast } from './types';

export interface ToastStackProps {
  toasts: ChatToast[];
  spritePanelCollapsed?: boolean;
}

export function ToastStack({ toasts }: ToastStackProps) {
  return (
    <div className="fixed top-20 right-4 z-30 flex flex-col gap-3 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            'pointer-events-auto rounded-xl px-4 py-2.5 text-sm shadow-lift border backdrop-blur-xl animate-fade-up ' +
            (t.tone === 'milestone'
              ? 'bg-accent-500/15 border-accent-500/30 text-accent-100'
              : t.tone === 'relationship'
                ? 'bg-iris-500/15 border-iris-500/30 text-iris-300'
                : t.tone === 'mood'
                  ? 'bg-warmth-500/15 border-warmth-500/30 text-warmth-300'
                  : 'bg-white/[0.04] border-white/[0.08] text-ink-100')
          }
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
