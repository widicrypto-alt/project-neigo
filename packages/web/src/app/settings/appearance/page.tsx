'use client';

/**
 * /settings/appearance — visual preferences.
 *
 * Respects OS-level prefers-reduced-motion automatically (tokens.css global),
 * but lets users force data-saver + reduce-motion on top of that.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BatteryLow, Gauge, ZapOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/cn';

const STORAGE_KEY = 'neigo.appearance.v1';

interface AppearancePrefs {
  dataSaver: boolean;
  reduceMotion: boolean;
}

const DEFAULT: AppearancePrefs = { dataSaver: false, reduceMotion: false };

function read(): AppearancePrefs {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as AppearancePrefs) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function write(prefs: AppearancePrefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* noop */
  }
}

function applyToHtml(prefs: AppearancePrefs) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('neigo-data-saver', prefs.dataSaver);
  document.documentElement.classList.toggle('neigo-reduce-motion', prefs.reduceMotion);
}

export default function AppearancePage() {
  const [prefs, setPrefs] = useState<AppearancePrefs>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);
  const t = useTranslations('settings.appearance');
  const tCommon = useTranslations('common');

  useEffect(() => {
    const loaded = read();
    setPrefs(loaded);
    applyToHtml(loaded);
    setHydrated(true);
  }, []);

  const update = (patch: Partial<AppearancePrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    write(next);
    applyToHtml(next);
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

      <ul className="divide-y divide-white/[0.06] rounded-2xl bg-white/[0.03] border border-white/[0.06]">
        <Row
          icon={<Gauge className="w-5 h-5" />}
          title={t('dataSaverTitle')}
          description={t('dataSaverDescription')}
          checked={prefs.dataSaver}
          onChange={(v) => update({ dataSaver: v })}
          disabled={!hydrated}
        />
        <Row
          icon={<ZapOff className="w-5 h-5" />}
          title={t('reduceMotionTitle')}
          description={t('reduceMotionDescription')}
          checked={prefs.reduceMotion}
          onChange={(v) => update({ reduceMotion: v })}
          disabled={!hydrated}
        />
      </ul>

      <div className="mt-6 flex items-start gap-2 text-xs text-ink-400 leading-relaxed">
        <BatteryLow className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <p>{t('batteryNote')}</p>
      </div>
    </main>
  );
}

function Row({
  icon,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <li className="flex items-start gap-3 p-4">
      <div className="shrink-0 text-ink-300 mt-0.5">{icon}</div>
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
        onClick={() => onChange(!checked)}
        className={cn(
          'relative shrink-0 mt-0.5 h-6 w-11 rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60',
          checked ? 'bg-accent-500' : 'bg-white/[0.12]',
          disabled && 'opacity-40 cursor-not-allowed',
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
