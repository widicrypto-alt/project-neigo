'use client';

/**
 * <ConsentBanner /> — UU PDP 2022 consent surface.
 *
 * Shown at first visit OR after privacy policy version bump. Offers three
 * actions: Terima semua, Tolak yang opsional, Atur preferensi (→ opens
 * granular sheet). Essential consent (ToS + privacy) is mandatory; without
 * it we should block auth (enforced at /login, not here).
 *
 * Mounted globally via Providers so every route guarantees compliance.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { cn } from '@/lib/cn';
import { useConsent } from '@/lib/use-consent';

export function ConsentBanner() {
  const { state, hydrated, acceptAll, rejectOptional, update } = useConsent();
  const t = useTranslations('consent');
  const [open, setOpen] = useState(false);
  const [draftAnalytics, setDraftAnalytics] = useState(false);
  const [draftPersonalisation, setDraftPersonalisation] = useState(false);

  if (!hydrated || state.acknowledged) return null;

  const onOpenSettings = () => {
    setDraftAnalytics(state.analytics);
    setDraftPersonalisation(state.personalisation);
    setOpen(true);
  };

  const onSave = () => {
    update({
      acknowledged: true,
      essential: true,
      analytics: draftAnalytics,
      personalisation: draftPersonalisation,
    });
    setOpen(false);
  };

  return (
    <>
      <div
        className="fixed left-0 right-0 px-3 flex justify-center pointer-events-none"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
          zIndex: 'var(--z-toast, 60)' as unknown as number,
        }}
        role="region"
        aria-label={t('sheetTitle')}
      >
        <div className="pointer-events-auto w-full max-w-lg rounded-2xl bg-ink-900/95 border border-white/[0.1] backdrop-blur-xl shadow-[var(--shadow-hero)] p-4 text-sm text-ink-100">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-accent-300 shrink-0 mt-0.5" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-ink-50">{t('title')}</div>
              <p className="text-xs text-ink-300 mt-1 leading-relaxed">
                {t('body')}{' '}
                <Link href="/legal/privacy" className="text-accent-300 underline underline-offset-2">
                  {t('readPolicy')}
                </Link>
                .
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={acceptAll}
              className="flex-1 min-w-[140px] rounded-full bg-accent-500 hover:bg-accent-400 text-white font-semibold text-sm px-4 py-2.5 transition-colors"
            >
              {t('acceptAll')}
            </button>
            <button
              type="button"
              onClick={rejectOptional}
              className="flex-1 min-w-[140px] rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-ink-100 font-medium text-sm px-4 py-2.5 transition-colors"
            >
              {t('rejectOptional')}
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full rounded-full text-ink-300 hover:text-ink-50 font-medium text-xs px-4 py-2 transition-colors"
            >
              {t('openSettings')}
            </button>
          </div>
        </div>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('sheetTitle')}
        description={t('sheetDescription')}
      >
        <ul className="divide-y divide-white/[0.06]">
          <ConsentRow
            title={t('essentialTitle')}
            description={t('essentialDescription')}
            checked
            disabled
          />
          <ConsentRow
            title={t('analyticsTitle')}
            description={t('analyticsDescription')}
            checked={draftAnalytics}
            onChange={setDraftAnalytics}
          />
          <ConsentRow
            title={t('personalisationTitle')}
            description={t('personalisationDescription')}
            checked={draftPersonalisation}
            onChange={setDraftPersonalisation}
          />
        </ul>
        <div className="flex gap-2 mt-4">
          <ConsentButton onClick={() => setOpen(false)} variant="ghost" />
          <ConsentButton onClick={onSave} variant="primary" />
        </div>
      </Sheet>
    </>
  );
}

function ConsentButton({
  onClick,
  variant,
}: {
  onClick: () => void;
  variant: 'ghost' | 'primary';
}) {
  const tCommon = useTranslations('common');
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-full font-medium text-sm px-4 py-2.5 transition-colors',
        variant === 'primary'
          ? 'bg-accent-500 hover:bg-accent-400 text-white font-semibold'
          : 'bg-white/[0.06] hover:bg-white/[0.1] text-ink-100',
      )}
    >
      {tCommon(variant === 'primary' ? 'save' : 'cancel')}
    </button>
  );
}

function ConsentRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <li className="py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink-50">{title}</div>
        <p className="text-xs text-ink-400 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative shrink-0 mt-0.5 h-6 w-11 rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60',
          checked ? 'bg-accent-500' : 'bg-white/[0.12]',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </li>
  );
}
