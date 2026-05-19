/**
 * next-intl v4 configuration.
 *
 * We use "without i18n routing" mode: no `/en/...` URL prefix, locale comes
 * from the `neigo.locale` cookie (fallback: Accept-Language → 'id').
 * Rationale per FRONTEND.md §17.1 Q6 — ID-first, auth-gated surface doesn't
 * need SEO-separated URLs. Can add localePrefix routing later when content
 * gets public/indexed pages.
 */

export const LOCALES = ['en', 'id', 'de', 'fr', 'it', 'pt', 'hi', 'es', 'th'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'neigo.locale';

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  // Cheap parse: take the first language tag, match by prefix.
  // Indonesian is the only language besides English with its own UI translations.
  // All other Accept-Language values (ja, zh, ko, es, fr, de, pt, …) fall back to English.
  const first = header.split(',')[0]?.trim().toLowerCase() ?? '';
  if (first.startsWith('id')) return 'id';
  return 'en';
}
