import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, negotiateLocale, type Locale } from './config';

/**
 * next-intl v4 request-scoped config.
 *
 * Resolves locale order:
 *   1. `neigo.locale` cookie (explicit user choice)
 *   2. `Accept-Language` header negotiation
 *   3. DEFAULT_LOCALE ('id')
 *
 * Referenced from next.config.ts via createNextIntlPlugin.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  let locale: Locale;
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const headerStore = await headers();
    locale = negotiateLocale(headerStore.get('accept-language'));
  }

  const messages = (await import(`../../messages/${locale}.json`)).default as Record<
    string,
    unknown
  >;

  return {
    locale,
    messages,
    timeZone: 'Asia/Jakarta',
    now: new Date(),
  };
});

export { DEFAULT_LOCALE };
