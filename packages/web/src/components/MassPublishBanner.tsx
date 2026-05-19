'use client';
/**
 * BACKLOG B2.7 — One-shot mass-publish opt-in banner.
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';

const DISMISS_KEY = 'mass-publish-banner-dismissed-at';
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface Summary {
  characterCount: number;
  storyCount: number;
  total: number;
}

export function MassPublishBanner() {
  const t = useTranslations('massPublish');
  const qc = useQueryClient();
  // Initialize as false (show) — localStorage check happens in useLayoutEffect
  // to avoid SSR/hydration mismatch flash
  const [dismissed, setDismissed] = useState(false);

  // useEffect + typeof window guard avoids SSR hydration mismatch warning
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return;
    const at = Number(raw);
    if (!Number.isFinite(at) || Date.now() - at > DISMISS_TTL_MS) return;
    setDismissed(true);
  }, []);

  const summary = useQuery({
    queryKey: ['me-private-summary'],
    queryFn: () => api.get<Summary>('/api/me/private-summary'),
    staleTime: 60_000,
    enabled: !dismissed,
    retry: false,
  });

  const flip = useMutation({
    mutationFn: () =>
      api.post<{ charactersUpdated: number; storiesUpdated: number }>('/api/me/mass-publish', {
        includeCharacters: true,
        includeStories: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me-private-summary'] });
    },
  });

  if (dismissed) return null;
  if (summary.isError) return null;
  if (!summary.data || summary.data.total === 0) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  return (
    <div className="mx-4 mt-4 sm:mx-6 rounded-xl border border-violet-500/30 bg-violet-500/[0.07] p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-violet-100">
            {t('title')}
          </h3>
          <div className="mt-1 text-xs text-violet-200/80">
            {t.rich('description', {
              chars: summary.data.characterCount,
              stories: summary.data.storyCount,
              both: (summary.data.characterCount > 0 && summary.data.storyCount > 0).toString(),
              strong: (chunks) => <strong>{chunks}</strong>
            })}
          </div>
          {flip.data && (
            <p className="mt-2 text-xs text-emerald-300">
              {t('success', { 
                chars: flip.data.charactersUpdated, 
                stories: flip.data.storiesUpdated 
              })}
            </p>
          )}
          {flip.isError && (
            <p className="mt-2 text-xs text-rose-300">{t('error')}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => flip.mutate()}
              disabled={flip.isPending}
              className="rounded-md bg-violet-500 hover:bg-violet-400 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white"
            >
              {flip.isPending ? t('pending') : t('action')}
            </button>
            <button
              onClick={dismiss}
              className="rounded-md border border-violet-400/30 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/10"
            >
              {t('dismiss')}
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label={t('close')}
          className="rounded p-1 text-violet-300 hover:bg-violet-500/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
