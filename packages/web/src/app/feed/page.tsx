'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';

type CharItem = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  tagline?: string | null;
  updatedAt: string;
  slug?: string | null;
};
type StoryItem = {
  id: string;
  title: string;
  tagline?: string | null;
  coverImageUrl?: string | null;
  updatedAt: string;
  slug?: string | null;
};

export default function FeedPage() {
  const t = useTranslations('feed');
  const [chars, setChars] = useState<CharItem[]>([]);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [state, setState] = useState<'loading' | 'unauthed' | 'empty' | 'ready'>('loading');

  useEffect(() => {
    void (async () => {
      try {
        const data = await api.get<{ characters: CharItem[]; stories: StoryItem[] }>('/api/creators/me/feed');
        setChars(data.characters ?? []);
        setStories(data.stories ?? []);
        setState((data.characters?.length ?? 0) + (data.stories?.length ?? 0) === 0 ? 'empty' : 'ready');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) setState('unauthed');
        else setState('empty');
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-rose-50 mb-6">{t('title')}</h1>
      {state === 'loading' && <p className="text-rose-300/70">{t('loading')}</p>}
      {state === 'unauthed' && (
        <p className="text-rose-300/70">
          {t.rich('unauthed', {
            login: (chunks) => <Link href="/login" className="underline">{chunks}</Link>
          })}
        </p>
      )}
      {state === 'empty' && (
        <div className="rounded-lg border border-rose-900/40 bg-rose-950/20 p-6">
          <p className="text-rose-200">{t('empty')}</p>
          <p className="text-sm text-rose-300/70 mt-1">{t('followHint')}</p>
        </div>
      )}
      {state === 'ready' && (
        <div className="space-y-8">
          {stories.length > 0 && (
            <section>
              <h2 className="text-lg font-medium text-rose-100 mb-3">{t('latestStories')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {stories.map((s) => (
                  <Link key={s.id} href={`/stories/${s.slug ?? s.id}`} className="rounded-lg border border-rose-900/40 bg-rose-950/20 hover:bg-rose-950/40 transition overflow-hidden flex">
                    {s.coverImageUrl && (
                      <div className="relative w-32 aspect-[3/4] flex-shrink-0 bg-black/40">
                        <Image src={s.coverImageUrl} alt={s.title} fill sizes="128px" className="object-cover" />
                      </div>
                    )}
                    <div className="p-3 flex-1">
                      <div className="font-medium text-rose-50 line-clamp-1">{s.title}</div>
                      {s.tagline && <div className="text-xs text-rose-300/70 line-clamp-2 mt-1">{s.tagline}</div>}
                      <div className="text-[10px] text-rose-400/50 mt-2">
                        {t('updated', { date: new Date(s.updatedAt).toLocaleDateString() })}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {chars.length > 0 && (
            <section>
              <h2 className="text-lg font-medium text-rose-100 mb-3">{t('latestCharacters')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {chars.map((c) => (
                  <Link key={c.id} href={`/characters/${c.id}`} className="rounded-lg border border-rose-900/40 bg-rose-950/20 hover:bg-rose-950/40 transition overflow-hidden">
                    {c.avatarUrl && (
                      <div className="relative aspect-square bg-black/40">
                        <Image src={c.avatarUrl} alt={c.name} fill sizes="200px" className="object-cover" />
                      </div>
                    )}
                    <div className="p-2">
                      <div className="text-sm font-medium text-rose-50 line-clamp-1">{c.name}</div>
                      {c.tagline && <div className="text-xs text-rose-300/70 line-clamp-2">{c.tagline}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
