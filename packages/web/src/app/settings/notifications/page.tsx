'use client';

/**
 * /settings/notifications — push + in-app notification preferences.
 *
 * Wk4 Phase B scaffold. Backend wiring (POST /me/notifications) follows
 * when the notification-prefs route lands on server (wk11 per roadmap).
 * For now we persist to localStorage as a local-first UX.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, BellOff, MessageCircle, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/cn';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

const STORAGE_KEY = 'neigo.notifs.v1';

interface NotifPrefs {
  push: boolean;
  inAppChatPing: boolean;
  weeklyNewCharacters: boolean;
  nudge: boolean;
}

const DEFAULT: NotifPrefs = {
  push: false,
  inAppChatPing: true,
  weeklyNewCharacters: true,
  nudge: false,
};

function read(): NotifPrefs {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as NotifPrefs) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function write(prefs: NotifPrefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* noop */
  }
}

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);
  const { show } = useToast();
  const t = useTranslations('settings.notifications');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();

  // PLANv3 X3.7 — server-backed notifyOnReply pref (user.metadata).
  interface MeResponse {
    user: { id: string; metadata?: Record<string, unknown> };
  }
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/api/auth/me'),
  });
  const notifyOnReply = Boolean(
    (me.data?.user?.metadata as Record<string, unknown> | undefined)?.notifyOnReply,
  );
  const patchMeta = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.patch('/api/auth/metadata', patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  useEffect(() => {
    setPrefs(read());
    setHydrated(true);
  }, []);

  const update = (patch: Partial<NotifPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    write(next);
  };

  const onTogglePush = async (next: boolean) => {
    if (!next) {
      update({ push: false });
      show({ variant: 'info', title: t('pushDisabled') });
      return;
    }
    if (typeof Notification === 'undefined') {
      show({ variant: 'error', title: t('pushUnsupported') });
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        update({ push: true });
        show({ variant: 'success', title: t('pushEnabled') });
      } else {
        show({ variant: 'warning', title: t('pushDenied') });
      }
    } catch {
      show({ variant: 'error', title: t('pushError') });
    }
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
          icon={prefs.push ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          title={t('pushTitle')}
          description={t('pushDescription')}
          checked={prefs.push}
          onChange={onTogglePush}
          disabled={!hydrated}
        />
        <Row
          icon={<MessageCircle className="w-5 h-5" />}
          title={t('inAppPingTitle')}
          description={t('inAppPingDescription')}
          checked={prefs.inAppChatPing}
          onChange={(v) => update({ inAppChatPing: v })}
          disabled={!hydrated}
        />
        <Row
          icon={<Sparkles className="w-5 h-5" />}
          title={t('weeklyTitle')}
          description={t('weeklyDescription')}
          checked={prefs.weeklyNewCharacters}
          onChange={(v) => update({ weeklyNewCharacters: v })}
          disabled={!hydrated}
        />
        <Row
          icon={<Sparkles className="w-5 h-5" />}
          title={t('nudgeTitle')}
          description={t('nudgeDescription')}
          checked={prefs.nudge}
          onChange={(v) => update({ nudge: v })}
          disabled={!hydrated}
        />
        {/* PLANv3 X3.7 — server-backed, persists to user.metadata.notifyOnReply */}
        <Row
          icon={<Bell className="w-5 h-5" />}
          title="Reply notification when tab is inactive"
          description="Browser notification appears when a character finishes replying while you're on another tab."
          checked={notifyOnReply}
          onChange={async (v) => {
            if (v && typeof Notification !== 'undefined' && Notification.permission === 'default') {
              try {
                const perm = await Notification.requestPermission();
                if (perm !== 'granted') {
                  show({ variant: 'warning', title: 'Permission denied.' });
                  return;
                }
              } catch {
                show({ variant: 'error', title: 'Failed to request permission.' });
                return;
              }
            }
            patchMeta.mutate({ notifyOnReply: v });
          }}
          disabled={!hydrated || me.isPending || patchMeta.isPending}
        />
      </ul>

      <p className="text-xs text-ink-500 mt-4 leading-relaxed">
        {t('footerNote')}
      </p>
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
