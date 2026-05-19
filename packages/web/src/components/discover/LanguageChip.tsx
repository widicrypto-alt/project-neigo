'use client';

/**
 * REDESIGNv2 D2 — Language filter chip.
 *
 * Controlled pill used by the home/discover filter row.
 * Label comes from a whitelist so an untrusted lang code can't inject markup.
 */

import { cn } from '@/lib/cn';

export type LanguageCode = 'id' | 'ja' | 'en' | 'ko' | 'zh' | 'es' | 'pt' | 'fr' | 'de';

const LABELS: Record<LanguageCode, { flag: string; label: string }> = {
  id: { flag: '🇮🇩', label: 'Indonesia' },
  ja: { flag: '🇯🇵', label: '日本語' },
  en: { flag: '🇺🇸', label: 'English' },
  ko: { flag: '🇰🇷', label: '한국어' },
  zh: { flag: '🇨🇳', label: '中文' },
  es: { flag: '🇪🇸', label: 'Español' },
  pt: { flag: '🇵🇹', label: 'Português' },
  fr: { flag: '🇫🇷', label: 'Français' },
  de: { flag: '🇩🇪', label: 'Deutsch' },
};

interface Props {
  lang: LanguageCode;
  active: boolean;
  onClick: (lang: LanguageCode) => void;
  className?: string;
}

export function LanguageChip({ lang, active, onClick, className }: Props) {
  const meta = LABELS[lang];
  if (!meta) return null;
  return (
    <button
      type="button"
      onClick={() => onClick(lang)}
      data-active={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-fast',
        active
          ? 'border-accent bg-accent/15 text-ink-50'
          : 'border-white/[0.08] bg-white/[0.02] text-ink-400 hover:border-white/[0.15] hover:text-ink-200',
        className,
      )}
    >
      <span aria-hidden>{meta.flag}</span>
      {meta.label}
    </button>
  );
}
