'use client';

import { WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Banner } from '@/components/ui/Banner';
import { useOnlineStatus } from '@/lib/use-online-status';

/**
 * <OfflineBanner /> — shows when navigator.onLine is false.
 *
 * Mounted globally via Providers. Stream retries are handled elsewhere
 * (presence orchestrator); this is just the visible signal.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const t = useTranslations('offline');
  if (online) return null;
  return (
    <div
      className="fixed left-0 right-0 flex justify-center px-3 pointer-events-none"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        zIndex: 'var(--z-toast, 60)' as unknown as number,
      }}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-full max-w-md">
        <Banner
          tone="warning"
          icon={<WifiOff className="w-4 h-4" aria-hidden />}
          title={t('title')}
          description={t('description')}
        />
      </div>
    </div>
  );
}
