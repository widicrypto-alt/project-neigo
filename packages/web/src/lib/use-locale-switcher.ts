'use client';

import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import { LOCALE_COOKIE, type Locale } from '@/i18n/config';

/**
 * useLocaleSwitcher — set the `neigo.locale` cookie and hard-reload so the
 * new locale takes effect on the next request (next-intl without i18n
 * routing mode reads locale server-side at request time).
 *
 * Cookie scope: path=/, SameSite=Lax, Max-Age=365d. Not Secure in dev
 * (allows http://localhost); production Caddyfile upgrades to HTTPS.
 */
export function useLocaleSwitcher() {
  const current = useLocale() as Locale;
  const setLocale = useCallback((next: Locale) => {
    if (typeof document === 'undefined') return;
    const year = 60 * 60 * 24 * 365;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${year}; SameSite=Lax`;
    window.location.reload();
  }, []);
  return { current, setLocale };
}
