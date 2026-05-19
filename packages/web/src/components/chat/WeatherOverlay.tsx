/**
 * MARINARA H3 — Weather overlay.
 *
 * CSS-only particle/sheet animation keyed on
 * `session.metadata.sceneState.weather`. Respects
 * `prefers-reduced-motion`; returns null when reduced motion is on
 * OR the weather is unrecognised.
 *
 * Supported values: rain | snow | fog | night | storm | sunset
 */
'use client';

import { useEffect, useState } from 'react';

type Weather = 'rain' | 'snow' | 'fog' | 'night' | 'storm' | 'sunset';

function normalise(raw: string | undefined): Weather | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v.includes('rain') || v.includes('hujan')) return 'rain';
  if (v.includes('snow') || v.includes('salju')) return 'snow';
  if (v.includes('fog') || v.includes('kabut') || v.includes('mist')) return 'fog';
  if (v.includes('night') || v.includes('malam')) return 'night';
  if (v.includes('storm') || v.includes('badai') || v.includes('thunder')) return 'storm';
  if (v.includes('sunset') || v.includes('senja')) return 'sunset';
  return null;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

export function WeatherOverlay({ weather }: { weather: string | undefined }) {
  const reduced = useReducedMotion();
  const kind = normalise(weather);
  if (!kind) return null;

  if (kind === 'rain') {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-[5] opacity-40"
        style={{
          backgroundImage:
            'repeating-linear-gradient(105deg, rgba(148,163,184,0.35) 0px, rgba(148,163,184,0.35) 1px, transparent 1px, transparent 6px)',
          animation: reduced ? undefined : 'neigo-rain 0.9s linear infinite',
        }}
      />
    );
  }
  if (kind === 'snow') {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-[5] opacity-50"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.85) 0.5px, transparent 1.5px),' +
            'radial-gradient(circle at 70% 60%, rgba(255,255,255,0.7) 0.5px, transparent 1.5px),' +
            'radial-gradient(circle at 40% 80%, rgba(255,255,255,0.6) 0.5px, transparent 1.5px)',
          backgroundSize: '200px 200px, 180px 180px, 160px 160px',
          animation: reduced ? undefined : 'neigo-snow 12s linear infinite',
        }}
      />
    );
  }
  if (kind === 'fog') {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-[5]"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(226,232,240,0.12), rgba(226,232,240,0.04) 60%, transparent 80%)',
        }}
      />
    );
  }
  if (kind === 'night') {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-[5]"
        style={{
          background:
            'radial-gradient(ellipse at 80% -10%, rgba(129,140,248,0.18), transparent 50%), linear-gradient(to bottom, rgba(15,23,42,0.35), transparent 40%)',
        }}
      />
    );
  }
  if (kind === 'storm') {
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-[5] opacity-55"
        style={{
          backgroundImage:
            'repeating-linear-gradient(100deg, rgba(148,163,184,0.45) 0px, rgba(148,163,184,0.45) 1.5px, transparent 1.5px, transparent 5px)',
          animation: reduced ? undefined : 'neigo-rain 0.55s linear infinite',
        }}
      />
    );
  }
  // sunset
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-[5]"
      style={{
        background:
          'linear-gradient(to bottom, rgba(251,146,60,0.18), rgba(244,114,182,0.12) 40%, transparent 70%)',
      }}
    />
  );
}
