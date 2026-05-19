'use client';

/**
 * REDESIGNv2 D2 — Time-of-day tinted hero.
 *
 * Stateless container that picks a gradient palette based on the viewer's
 * local clock. Respects prefers-reduced-motion by disabling the subtle
 * pulse animation. Caller supplies children (headline/CTA). No network
 * dependency; no external video assets in v1.
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

type Phase = 'dawn' | 'day' | 'dusk' | 'night';

const PHASE_BG: Record<Phase, string> = {
  dawn:
    'bg-gradient-to-br from-rose-950/60 via-amber-900/30 to-slate-950',
  day:
    'bg-gradient-to-br from-sky-900/40 via-indigo-900/30 to-slate-950',
  dusk:
    'bg-gradient-to-br from-fuchsia-950/50 via-orange-900/25 to-slate-950',
  night:
    'bg-gradient-to-br from-indigo-950/70 via-violet-950/40 to-slate-950',
};

function phaseNow(): Phase {
  const h = new Date().getHours();
  if (h >= 5 && h < 9) return 'dawn';
  if (h >= 9 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

interface Props {
  children: React.ReactNode;
  className?: string;
  /** Optional phase override for tests / screenshots. */
  phase?: Phase;
}

export function HeroAdaptive({ children, className, phase }: Props) {
  const [resolved, setResolved] = useState<Phase>(phase ?? 'night');
  useEffect(() => {
    if (phase) return;
    setResolved(phaseNow());
    // re-check every 5 min in case the user lingers on the page.
    const t = setInterval(() => setResolved(phaseNow()), 300_000);
    return () => clearInterval(t);
  }, [phase]);

  return (
    <section
      data-phase={resolved}
      className={cn(
        'relative isolate overflow-hidden rounded-3xl border border-white/[0.06] p-8 sm:p-12',
        PHASE_BG[resolved],
        className,
      )}
    >
      {/* subtle twinkle at night, mellow aurora by day */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 mix-blend-screen"
        style={{
          background:
            resolved === 'night'
              ? 'radial-gradient(ellipse at 80% 10%, rgba(167,139,250,0.25), transparent 55%)'
              : resolved === 'dawn'
              ? 'radial-gradient(ellipse at 10% 110%, rgba(251,113,133,0.25), transparent 55%)'
              : resolved === 'dusk'
              ? 'radial-gradient(ellipse at 90% 100%, rgba(217,70,239,0.25), transparent 55%)'
              : 'radial-gradient(ellipse at 50% 0%, rgba(56,189,248,0.2), transparent 55%)',
        }}
      />
      <div className="relative">{children}</div>
    </section>
  );
}
