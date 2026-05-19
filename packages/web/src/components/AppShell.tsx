'use client';

import { Suspense, useState } from 'react';
import { usePathname } from 'next/navigation';
import { RouteLoadingBar } from '@/components/RouteLoadingBar';
import { FloatingDock } from '@/components/nav/FloatingDock';
import { MobileBottomTabBar } from '@/components/nav/MobileBottomTabBar';
import { CommandPalette } from '@/components/nav/CommandPalette';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPlayRoute = /^\/stories\/[^/]+\/play/.test(pathname);
  const chromeEnabled = pathname !== '/login' && !isPlayRoute;

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  return (
    <>
      {/* Skip-to-content for keyboard/screen-reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded-lg focus:bg-accent-500 focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:outline-none"
      >
        Skip to content
      </a>

      <Suspense fallback={null}>
        <RouteLoadingBar />
      </Suspense>

      <div className="flex min-h-dvh relative">
        {chromeEnabled && (
          <>
            <nav aria-label="Main navigation" className="hidden md:block">
              <FloatingDock
                onOpenCommandPalette={() => setCommandPaletteOpen(true)}
              />
            </nav>

            <nav aria-label="Mobile navigation" className="md:hidden">
              <MobileBottomTabBar />
            </nav>

            <CommandPalette
              open={commandPaletteOpen}
              onClose={() => setCommandPaletteOpen(false)}
            />
          </>
        )}

        <main
          id="main-content"
          className={
            'flex-1 min-w-0 flex flex-col relative transition-[padding] duration-300 ease-in-out motion-reduce:transition-none ' +
            (chromeEnabled ? 'pb-28 md:pb-28' : '')
          }
        >
          {children}
        </main>
      </div>
    </>
  );
}
