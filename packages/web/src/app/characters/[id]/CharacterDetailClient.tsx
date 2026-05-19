'use client';

import { use, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, MessageCircle, Globe, Lock, Star, Loader2 } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';

interface CharacterDetail {
  slug: string | null;
  tagline: string | null;
  descriptionMd: string | null;
  descriptionHtml: string | null;
  loreSectionsMd: Array<{ title: string; bodyMd: string; order: number }>;
  exampleDialogMd: string | null;
  exampleDialogHtml: string | null;
  isSecretPromptHidden: boolean;
  totalViews: number | null;
  totalChats: number | null;
  totalLikes: number | null;
  avgStars: number | null;
  totalRatings: number | null;
  publishedAt: string | null;
}

interface Character {
  id: string;
  name: string;
  avatarUrl: string | null;
  tagline?: string | null;
  tonePreset: string;
  isPublic: boolean;
  language: string;
  tags: string[];
}

const TONE_LABELS: Record<string, string> = {
  NONE: 'Default',
  TSUNDERE: 'Tsundere',
  STOIC: 'Cold & Calm',
  PLAYFUL: 'Cheerful & Lively',
  NURTURING: 'Gentle & Sweet',
  MYSTERIOUS: 'Mysterious',
  ENERGETIC: 'Energetic',
  MELANCHOLIC: 'Melancholic',
  FORMAL: 'Formal',
  VILLAIN: 'Villain',
};

function gradientFor(id: string): string {
  const GRADIENTS = [
    'from-purple-900 to-ink-950',
    'from-rose-900 to-ink-950',
    'from-sky-900 to-ink-950',
    'from-emerald-900 to-ink-950',
    'from-amber-900 to-ink-950',
    'from-fuchsia-900 to-ink-950',
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length]!;
}

export default function CharacterDetailClient({ id }: { id: string }) {
  const t = useTranslations('character');
  const commonT = useTranslations('common');
  const navT = useTranslations('nav');
  const router = useRouter();

  const [character, setCharacter] = useState<Character | null>(null);
  const [detail, setDetail] = useState<CharacterDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [activeTab, setActiveTab] = useState<'description' | 'lore' | 'dialog'>('description');

  useEffect(() => {
    api
      .get<{ character: Character; detail: CharacterDetail }>(`/api/characters/${id}`)
      .then((r) => {
        setCharacter(r.character);
        setDetail(r.detail);
      })
      .catch((e) => setErr(userFacingApiMessage(e, t('notFound'))));
  }, [id, t]);

  async function handleChat() {
    setStarting(true);
    try {
      const result = await api.post<{ sessionId: string }>('/api/sessions', {
        characterId: id,
        mode: 'normal',
      });
      router.push(`/chat/${result.sessionId}`);
    } catch (e) {
      const msg = userFacingApiMessage(e, t('startFailed'));
      if (msg.includes('401') || msg === 'unauthorized') {
        router.push('/login');
      } else {
        setStarting(false);
      }
    }
  }

  if (err) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
        <p className="text-red-400">{err}</p>
        <Link href="/" className="text-violet-400 hover:underline text-sm">{commonT('backToHome')}</Link>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const toneLabel = TONE_LABELS[character.tonePreset] ?? character.tonePreset;
  const hasLore = (detail?.loreSectionsMd ?? []).some((s) => s.bodyMd?.trim());
  const hasDialog = !!(detail?.exampleDialogMd?.trim() || detail?.exampleDialogHtml?.trim());

  const tabs = [
    { key: 'description' as const, label: t('about'), show: true },
    { key: 'lore' as const, label: t('lore'), show: hasLore },
    { key: 'dialog' as const, label: t('dialogue'), show: hasDialog },
  ].filter((t) => t.show);

  return (
    <div className="min-h-screen bg-ink-950">
      <div className={`relative w-full bg-linear-to-b ${gradientFor(character.id)}`} style={{ minHeight: 280 }}>
        {character.avatarUrl && (
          <Image
            src={character.avatarUrl}
            alt={character.name}
            fill
            className="object-cover object-top opacity-20"
            priority
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-ink-950 via-ink-950/50 to-transparent" />

        <div className="relative z-10 mx-auto max-w-3xl px-4 pt-14 pb-8">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-200 mb-6 transition-colors">
            <ArrowLeft size={15} /> {navT('home')}
          </Link>

          <div className="flex gap-5 items-end">
            <div className="relative shrink-0 w-24 h-24 rounded-2xl overflow-hidden bg-ink-800 border border-ink-700">
              {character.avatarUrl ? (
                <Image src={character.avatarUrl} alt={character.name} fill className="object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full text-3xl">✨</div>
              )}
            </div>

            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  'text-[10px] rounded-full px-2 py-0.5 flex items-center gap-1',
                  character.isPublic ? 'bg-emerald-900/50 text-emerald-400' : 'bg-ink-800 text-ink-500',
                )}>
                  {character.isPublic ? <Globe size={9} /> : <Lock size={9} />}
                  {character.isPublic ? t('public') : t('private')}
                </span>
                {character.tonePreset !== 'NONE' && (
                  <span className="text-[10px] rounded-full px-2 py-0.5 bg-violet-900/50 text-violet-300">
                    {toneLabel}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-ink-50 leading-tight">{character.name}</h1>
              {detail?.tagline && (
                <p className="mt-1 text-sm text-ink-400 italic">{detail.tagline}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-500">
                {(detail?.totalRatings ?? 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <Star size={11} className="text-amber-400" />
                    {(detail?.avgStars ?? 0).toFixed(1)} ({detail?.totalRatings})
                  </span>
                )}
                {(detail?.totalChats ?? 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <MessageCircle size={11} />
                    {t('stats.chats', { count: detail?.totalChats?.toLocaleString() ?? '0' })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 -mt-4 mb-6">
        <button
          onClick={handleChat}
          disabled={starting}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-violet-600 to-iris-500 py-3.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {starting ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
          {starting ? t('starting') : t('chatAction', { name: character.name })}
        </button>
      </div>

      {tabs.length > 1 && (
        <div className="mx-auto max-w-3xl px-4">
          <div className="flex gap-1 border-b border-ink-800 mb-6">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                  activeTab === key ? 'border-violet-500 text-violet-300' : 'border-transparent text-ink-500 hover:text-ink-300',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl px-4 pb-20">
        {activeTab === 'description' && detail?.descriptionHtml && (
          <div
            className="prose prose-invert prose-sm max-w-none text-ink-300"
            dangerouslySetInnerHTML={{ __html: detail.descriptionHtml }}
          />
        )}
        {activeTab === 'description' && !detail?.descriptionHtml && detail?.descriptionMd && (
          <p className="text-sm text-ink-400 whitespace-pre-wrap">{detail.descriptionMd}</p>
        )}
        {activeTab === 'description' && !detail?.descriptionHtml && !detail?.descriptionMd && (
          <p className="text-sm text-ink-500 italic">{t('noDescription')}</p>
        )}

        {activeTab === 'lore' && (
          <div className="space-y-6">
            {(detail?.loreSectionsMd ?? [])
              .filter((s) => s.bodyMd?.trim())
              .sort((a, b) => a.order - b.order)
              .map((sec, i) => (
                <div key={i}>
                  {sec.title && (
                    <h3 className="text-sm font-bold uppercase tracking-wider text-violet-400 mb-2">{sec.title}</h3>
                  )}
                  <p className="text-sm text-ink-300 whitespace-pre-wrap">{sec.bodyMd}</p>
                </div>
              ))}
          </div>
        )}

        {activeTab === 'dialog' && (
          <div>
            {detail?.exampleDialogHtml ? (
              <div
                className="prose prose-invert prose-sm max-w-none text-ink-300"
                dangerouslySetInnerHTML={{ __html: detail.exampleDialogHtml }}
              />
            ) : (
              <pre className="text-sm text-ink-300 whitespace-pre-wrap font-sans">{detail?.exampleDialogMd}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
