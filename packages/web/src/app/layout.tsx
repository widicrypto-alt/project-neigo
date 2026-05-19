import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces, Noto_Serif_JP, Manrope, Crimson_Text, Be_Vietnam_Pro } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import '@/styles/globals.css';
import { Providers } from '@/lib/providers';
import { PwaRegister } from '@/components/PwaRegister';
import { AuroraBackdrop } from '@/components/AuroraBackdrop';
import { AppShell } from '@/components/AppShell';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
});
const notoSerifJp = Noto_Serif_JP({
  subsets: ['latin'],
  variable: '--font-jp',
  weight: ['400', '500', '700'],
  display: 'swap',
  preload: false,
});
const manrope = Manrope({ subsets: ['latin'], variable: '--font-chat', display: 'swap' });
const crimsonText = Crimson_Text({ 
  subsets: ['latin'], 
  weight: ['400', '600', '700'],
  variable: '--font-novel', 
  display: 'swap' 
});
const beVietnam = Be_Vietnam_Pro({ 
  subsets: ['latin'], 
  weight: ['400', '500', '600', '700'],
  variable: '--font-display-modern', 
  display: 'swap' 
});

export const metadata: Metadata = {
  title: 'Project Neigo — 星夜詠み',
  description: 'Cinematic AI companions. Not a character. A presence.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon-192.svg',
    shortcut: '/icon-192.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#07080f',
  width: 'device-width',
  initialScale: 1,
  // FRONTEND.md §17.1 Q4: do NOT lock maximumScale or userScalable — required
  // by WCAG 2.2 SC 1.4.4 (text can scale to 200%). Cinematic feel preserved
  // by double-tap capture on the sprite stage (see WaifuStage, wk5+).
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // next-intl v4: resolve locale + messages at request time (src/i18n/request.ts).
  // Locale from `neigo.locale` cookie → Accept-Language → 'id' default.
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} className={`${inter.variable} ${manrope.variable} ${crimsonText.variable} ${beVietnam.variable} ${fraunces.variable} ${notoSerifJp.variable}`}>
      <body className="min-h-dvh bg-[#07080f] text-ink-100 antialiased selection:bg-accent-500/30 selection:text-accent-100 font-chat">
        <AuroraBackdrop />
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Jakarta">
          <Providers>
            <AppShell>{children}</AppShell>
            <PwaRegister />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
