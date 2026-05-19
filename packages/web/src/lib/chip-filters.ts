'use client';

/**
 * PLANBv5 D2 — Home chip filter store with URL sync.
 *
 * Filters are client-side: they hide/show cards within the existing
 * rails rather than triggering fresh queries. URL params `?lang=` and
 * `?genre=` are the source of truth so filters are deep-linkable and
 * survive back/forward navigation.
 *
 * Supported values are open strings — the chip row seeds common ones
 * but arbitrary tags deep-link too.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export interface ChipFilters {
  lang: string[];
  genre: string[];
}

export function useChipFilters(): {
  filters: ChipFilters;
  toggle: (kind: 'lang' | 'genre', value: string) => void;
  clear: () => void;
  isActive: (kind: 'lang' | 'genre', value: string) => boolean;
  any: boolean;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const filters = useMemo<ChipFilters>(() => {
    const parse = (key: string) =>
      (params.get(key) ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    return { lang: parse('lang'), genre: parse('genre') };
  }, [params]);

  const setParam = useCallback(
    (key: string, values: string[]) => {
      const next = new URLSearchParams(params.toString());
      if (values.length === 0) next.delete(key);
      else next.set(key, values.join(','));
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const toggle = useCallback(
    (kind: 'lang' | 'genre', value: string) => {
      const current = filters[kind];
      const v = value.trim().toLowerCase();
      const next = current.includes(v) ? current.filter((x) => x !== v) : [...current, v];
      setParam(kind, next);
    },
    [filters, setParam],
  );

  const clear = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete('lang');
    next.delete('genre');
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const isActive = useCallback(
    (kind: 'lang' | 'genre', value: string) =>
      filters[kind].includes(value.trim().toLowerCase()),
    [filters],
  );

  return {
    filters,
    toggle,
    clear,
    isActive,
    any: filters.lang.length + filters.genre.length > 0,
  };
}

/** Pure filter helper so pages can prune arrays client-side. */
export function matchesChipFilters(
  filters: ChipFilters,
  candidate: { language?: string | null; tags?: string[] | null },
): boolean {
  if (filters.lang.length === 0 && filters.genre.length === 0) return true;
  if (filters.lang.length > 0) {
    const lang = (candidate.language ?? '').toLowerCase();
    if (!filters.lang.includes(lang)) return false;
  }
  if (filters.genre.length > 0) {
    const tags = (candidate.tags ?? []).map((t) => t.toLowerCase());
    const any = filters.genre.some((g) => tags.includes(g));
    if (!any) return false;
  }
  return true;
}
