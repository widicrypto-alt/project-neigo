'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useOnlineStatus — tracks navigator.onLine.
 *
 * Returns `online` (SSR-safe: starts `true` and corrects on mount). Consumers
 * can also subscribe to a reconnected callback. Paired with `<OfflineBanner/>`.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
}

/**
 * Derived helper: fires `cb` once when the browser goes from offline → online.
 */
export function useOnReconnect(cb: () => void) {
  const online = useOnlineStatus();
  const [wasOffline, setWasOffline] = useState(false);

  const stableCb = useCallback(cb, [cb]);

  useEffect(() => {
    if (!online && !wasOffline) setWasOffline(true);
    if (online && wasOffline) {
      setWasOffline(false);
      stableCb();
    }
  }, [online, wasOffline, stableCb]);
}
