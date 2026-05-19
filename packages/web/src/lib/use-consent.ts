'use client';

/**
 * useConsent — UU PDP 2022 compliant consent state.
 *
 * Indonesia's Undang-Undang Perlindungan Data Pribadi (UU No. 27/2022)
 * requires (a) granular opt-in, (b) revocable consent, (c) audit trail of
 * consent version acknowledged. We persist to localStorage and expose a
 * single hook. Backend sync lands with the /me/consent endpoint in wk13.
 *
 * Version bump the CURRENT_VERSION whenever the privacy policy materially
 * changes — users will re-see the banner.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'neigo.consent.v1';
export const CURRENT_CONSENT_VERSION = 1;

export interface ConsentState {
  version: number;
  /** User has seen and acted on the banner. */
  acknowledged: boolean;
  /** Required — ToS + privacy. Without this we block auth. */
  essential: boolean;
  /** Optional — analytics telemetry (PostHog/Umami). */
  analytics: boolean;
  /** Optional — personalisation (remember persona/mood prefs for recs). */
  personalisation: boolean;
  /** Unix ms when acknowledged. */
  at: number | null;
}

const DEFAULT_STATE: ConsentState = {
  version: CURRENT_CONSENT_VERSION,
  acknowledged: false,
  essential: false,
  analytics: false,
  personalisation: false,
  at: null,
};

function readStorage(): ConsentState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CURRENT_CONSENT_VERSION) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeStorage(state: ConsentState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded or disabled — silent; banner will reappear next visit
  }
}

export function useConsent() {
  const [state, setState] = useState<ConsentState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(readStorage());
    setHydrated(true);
  }, []);

  const acceptAll = useCallback(() => {
    const next: ConsentState = {
      version: CURRENT_CONSENT_VERSION,
      acknowledged: true,
      essential: true,
      analytics: true,
      personalisation: true,
      at: Date.now(),
    };
    setState(next);
    writeStorage(next);
  }, []);

  const rejectOptional = useCallback(() => {
    const next: ConsentState = {
      version: CURRENT_CONSENT_VERSION,
      acknowledged: true,
      essential: true,
      analytics: false,
      personalisation: false,
      at: Date.now(),
    };
    setState(next);
    writeStorage(next);
  }, []);

  const update = useCallback((partial: Partial<Omit<ConsentState, 'version' | 'at'>>) => {
    setState((prev) => {
      const next: ConsentState = {
        ...prev,
        ...partial,
        version: CURRENT_CONSENT_VERSION,
        at: Date.now(),
      };
      writeStorage(next);
      return next;
    });
  }, []);

  const revoke = useCallback(() => {
    setState(DEFAULT_STATE);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* noop */
      }
    }
  }, []);

  return { state, hydrated, acceptAll, rejectOptional, update, revoke };
}
