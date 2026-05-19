'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type StoryItem = {
  id: string;
  title: string;
  synopsis?: string | null;
  coverImageUrl?: string | null;
  tagline?: string | null;
  slug?: string | null;
};
type CharacterItem = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  tagline?: string | null;
};

type Props = {
  entityType: 'character' | 'story';
  entityId: string;
};

export function RelatedGrid({ entityType, entityId }: Props) {
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const path = entityType === 'character'
          ? `/api/characters/${entityId}/related`
          : `/api/stories/${entityId}/related`;
        const data = await api.get<{ stories: StoryItem[]; characters: CharacterItem[] }>(path);
        if (cancelled) return;
        setStories(data.stories ?? []);
        setCharacters(data.characters ?? []);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  if (loading) return null;
  if (stories.length === 0 && characters.length === 0) return null;

  return (
    <section className="mt-8 space-y-6">
      {stories.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-rose-200 mb-3">Cerita terkait</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {stories.map((s) => (
              <Link
                key={s.id}
                href={`/stories/${s.slug ?? s.id}`}
                className="group rounded-lg border border-rose-900/40 bg-rose-950/20 hover:bg-rose-950/40 transition overflow-hidden"
              >
                {s.coverImageUrl && (
                  <div className="relative aspect-[16/9] bg-black/40">
                    <Image
                      src={s.coverImageUrl}
                      alt={s.title}
                      fill
                      sizes="(max-width: 768px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="p-3">
                  <div className="font-medium text-rose-50 group-hover:text-rose-200 line-clamp-1">{s.title}</div>
                  {s.tagline && <div className="text-xs text-rose-300/70 line-clamp-2 mt-1">{s.tagline}</div>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {characters.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-rose-200 mb-3">Karakter terkait</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {characters.map((c) => (
              <Link
                key={c.id}
                href={`/characters/${c.id}`}
                className="group text-center"
              >
                <div className="relative aspect-square rounded-full overflow-hidden border border-rose-900/40 bg-black/40 mb-2">
                  {c.avatarUrl && (
                    <Image src={c.avatarUrl} alt={c.name} fill sizes="96px" className="object-cover group-hover:scale-105 transition" />
                  )}
                </div>
                <div className="text-xs text-rose-50 group-hover:text-rose-200 line-clamp-1">{c.name}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
