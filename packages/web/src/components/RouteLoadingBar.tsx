'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function RouteLoadingBar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Finish visual loading shortly after route state changes.
    if (!loading) return;
    const t = window.setTimeout(() => setLoading(false), 220);
    return () => window.clearTimeout(t);
  }, [pathname, search, loading]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setLoading(true);
    };

    const onSubmit = () => setLoading(true);

    window.addEventListener('click', onClick, true);
    window.addEventListener('submit', onSubmit, true);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('submit', onSubmit, true);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={
        'pointer-events-none fixed top-0 left-0 right-0 z-[60] h-0.5 origin-left transition-opacity duration-200 ' +
        (loading ? 'opacity-100' : 'opacity-0')
      }
    >
      <div className="h-full w-full bg-gradient-to-r from-accent-400 via-iris-400 to-accent-300 animate-route-progress" />
    </div>
  );
}
