'use client';

/**
 * /settings/privacy — UU PDP 2022 user controls.
 *
 * Gives users: (1) granular consent toggles (mirrors ConsentBanner sheet),
 * (2) data export request, (3) account deletion request. Deletion routes to
 * a confirmation flow (not implemented yet; toast stub for now).
 */

import Link from 'next/link';
import { ArrowLeft, Download, FileText, ShieldCheck, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/cn';
import { useToast } from '@/components/ui/Toast';
import { useConsent } from '@/lib/use-consent';

export default function PrivacyPage() {
  const { state, hydrated, update, revoke } = useConsent();
  const { show } = useToast();
  const t = useTranslations('settings.privacy');
  const tConsent = useTranslations('consent');
  const tCommon = useTranslations('common');

  const onExport = () => {
    show({
      variant: 'info',
      title: t('exportToastTitle'),
      description: t('exportToastDescription'),
    });
  };

  const onDelete = () => {
    show({
      variant: 'warning',
      title: t('deleteToastTitle'),
      description: t('deleteToastDescription'),
    });
  };

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-24">
      <header className="flex items-center gap-2 mb-6">
        <Link href="/settings" aria-label={tCommon('back')}>
          <IconButton aria-label={tCommon('back')} variant="ghost">
            <ArrowLeft />
          </IconButton>
        </Link>
        <h1 className="text-xl font-semibold text-ink-50">{t('title')}</h1>
      </header>

      <section className="mb-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-400 mb-2">
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
          {t('consentSection')}
        </div>
        <ul className="divide-y divide-white/[0.06] rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <Toggle
            title={tConsent('essentialTitle')}
            description={tConsent('essentialDescription')}
            checked
            disabled
          />
          <Toggle
            title={tConsent('analyticsTitle')}
            description={tConsent('analyticsDescription')}
            checked={state.analytics}
            onChange={(v) => update({ analytics: v })}
            disabled={!hydrated}
          />
          <Toggle
            title={tConsent('personalisationTitle')}
            description={tConsent('personalisationDescription')}
            checked={state.personalisation}
            onChange={(v) => update({ personalisation: v })}
            disabled={!hydrated}
          />
        </ul>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-400 mb-2">
          <FileText className="w-3.5 h-3.5" aria-hidden />
          {t('rightsSection')}
        </div>
        <ActionRow
          icon={<Download className="w-5 h-5" />}
          title={t('exportTitle')}
          description={t('exportDescription')}
          onClick={onExport}
        />
        <ActionRow
          icon={<Trash2 className="w-5 h-5" />}
          title={t('deleteTitle')}
          description={t('deleteDescription')}
          onClick={onDelete}
          tone="danger"
        />
        <ActionRow
          icon={<ShieldCheck className="w-5 h-5" />}
          title={t('revokeTitle')}
          description={t('revokeDescription')}
          onClick={() => {
            revoke();
            show({ variant: 'success', title: t('revokeToastTitle') });
          }}
          disabled={!hydrated || !state.acknowledged}
        />
      </section>

      <p className="text-xs text-ink-500 mt-6 leading-relaxed">
        <Link href="/legal/privacy" className="text-accent-300 underline underline-offset-2">
          {t('readFullPolicy')}
        </Link>
        . {t('footerNote')}
      </p>
    </main>
  );
}

function Toggle({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <li className="flex items-start gap-3 p-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink-50">{title}</div>
        <p className="text-xs text-ink-400 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled || !onChange}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative shrink-0 mt-0.5 h-6 w-11 rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60',
          checked ? 'bg-accent-500' : 'bg-white/[0.12]',
          (disabled || !onChange) && 'opacity-60 cursor-not-allowed',
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

function ActionRow({
  icon,
  title,
  description,
  onClick,
  tone,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  tone?: 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-left transition-colors',
        'hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        tone === 'danger' && 'hover:bg-rose-500/10 hover:border-rose-400/30',
      )}
    >
      <div
        className={cn(
          'shrink-0 mt-0.5',
          tone === 'danger' ? 'text-rose-300' : 'text-ink-300',
        )}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'text-sm font-semibold',
            tone === 'danger' ? 'text-rose-100' : 'text-ink-50',
          )}
        >
          {title}
        </div>
        <p className="text-xs text-ink-400 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}
