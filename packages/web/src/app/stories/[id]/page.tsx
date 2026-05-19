import { Metadata } from 'next';
import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpen, Clock, Star, Users, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { StoryInteractiveContent } from './StoryInteractiveContent';
import type { McProfile } from '@/components/mc/McProfileEditor';
import type { CharacterAsMcOption } from '@/components/mc/McProfileSelector';

interface CastEntry {
  characterId: string;
  displayName: string;
  role: string;
  avatarUrl?: string | null;
}

interface Scenario {
  id: string;
  title: string;
  synopsis?: string | null;
}

interface PlayAsCharacter {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Story {
  id: string;
  title: string;
  synopsis: string | null;
  tagline: string | null;
  coverImageUrl: string | null;
  language: string;
  requiredTier: string;
  tags: string[];
  status: string;
  cast: CastEntry[];
  playAsCharacter?: PlayAsCharacter | null;
  hasMcSlot?: boolean;
  requiresMcReplacement?: boolean;
  openingQuote?: string | null;
  openingQuoteBy?: string | null;
  plotHtml?: string | null;
  isAdult18plus?: boolean;
  metadata?: { tags?: string[]; estimatedMinutes?: number };
  social: {
    plays: number;
    ratings: number;
    avgStars: number;
  };
  scenarios: Scenario[];
  metCharacterIds?: string[];
  discoveryMode?: boolean;
  showCastList?: boolean;
}

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

async function getStoryData(id: string) {
  try {
    return await api.get<{ story: Story; scenarios?: Scenario[] }>(`/api/stories/${id}`);
  } catch (e) {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getStoryData(id);
  if (!data) return { title: 'Story Not Found' };

  const { story } = data;
  return {
    title: `${story.title} | Project Neigo`,
    description: story.synopsis || story.tagline,
    openGraph: {
      title: story.title,
      description: story.synopsis || undefined,
      images: story.coverImageUrl ? [{ url: story.coverImageUrl }] : [],
    },
  };
}

export default async function StoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookieString = cookieStore.toString();
  
  const data = await getStoryData(id);
  if (!data) notFound();

  const { story } = data;
  const scenarios = data.scenarios ?? story.scenarios ?? [];

  // Fetch auth-dependent data
  let mcProfiles: McProfile[] = [];
  let userCharacters: CharacterAsMcOption[] = [];
  
  try {
    const [pRes, cRes] = await Promise.allSettled([
      api.get<{ profiles: McProfile[] }>('/api/mc-profiles', { headers: { Cookie: cookieString } }),
      api.get<{ characters: CharacterAsMcOption[] }>('/api/mc-profiles/character-options', { headers: { Cookie: cookieString } })
    ]);
    
    if (pRes.status === 'fulfilled') mcProfiles = pRes.value.profiles;
    if (cRes.status === 'fulfilled') userCharacters = cRes.value.characters;
  } catch (e) {
    // Ignore errors for unauthenticated users
  }

  const hasConfirmedAdult = (await cookieStore).get('neigo_adult_confirmed')?.value === '1';
  const tags = story.tags ?? story.metadata?.tags ?? [];
  const estimatedMinutes = story.metadata?.estimatedMinutes;

  return (
    <div className="min-h-screen bg-ink-950">
      {/* Hero */}
      <div className={`relative w-full bg-gradient-to-b ${gradientFor(story.id)}`} style={{ minHeight: 320 }}>
        {story.coverImageUrl && (
          <Image
            src={story.coverImageUrl}
            alt={story.title}
            fill
            className="object-cover opacity-30"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-transparent" />

        <div className="relative z-10 mx-auto max-w-3xl px-4 pt-14 pb-8">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-200 mb-6 transition-colors">
            <ArrowLeft size={15} /> Home
          </Link>

          <div className="flex gap-5 items-start">
            {/* Cover thumbnail */}
            <div className="shrink-0 w-24 h-36 rounded-xl overflow-hidden bg-ink-800 border border-ink-700 relative">
              {story.coverImageUrl ? (
                <Image src={story.coverImageUrl} alt={story.title} fill className="object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <BookOpen size={28} className="text-ink-600" />
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="flex-1 min-w-0">
              {story.requiredTier !== 'FREE' && (
                <span className="inline-block mb-1.5 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white tracking-wide">
                  {story.requiredTier}
                </span>
              )}
              <h1 className="text-2xl font-bold text-ink-50 leading-tight">{story.title}</h1>
              {story.tagline && (
                <p className="mt-1 text-sm text-ink-400 italic">{story.tagline}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-500">
                {estimatedMinutes && (
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {estimatedMinutes} menit
                  </span>
                )}
                {(story.social?.ratings ?? 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <Star size={12} className="text-amber-400" />
                    {(story.social?.avgStars ?? 0).toFixed(1)} ({story.social?.ratings})
                  </span>
                )}
                {(story.social?.plays ?? 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {story.social?.plays?.toLocaleString()} main
                  </span>
                )}
              </div>

              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tags.slice(0, 6).map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-6">
        {/* Opening quote */}
        {story.openingQuote && (
          <blockquote className="border-l-4 border-violet-500/50 pl-4 py-1">
            <p className="text-sm italic text-ink-300">&ldquo;{story.openingQuote}&rdquo;</p>
            {story.openingQuoteBy && (
              <footer className="mt-1 text-xs text-ink-500">— {story.openingQuoteBy}</footer>
            )}
          </blockquote>
        )}

        {/* Synopsis */}
        {story.synopsis && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">Sinopsis</h2>
            <p className="text-sm text-ink-300 leading-relaxed whitespace-pre-line">{story.synopsis}</p>
          </section>
        )}

        {/* Plot HTML */}
        {story.plotHtml && (!story.isAdult18plus || hasConfirmedAdult) && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">Detail Cerita</h2>
            <div
              className="prose prose-sm prose-invert max-w-none text-ink-300"
              dangerouslySetInnerHTML={{ __html: story.plotHtml }}
            />
          </section>
        )}

        {/* Cast */}
        {story.cast && story.cast.length > 0 && story.showCastList !== false && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3 flex items-center gap-2">
              <Users size={14} /> Karakter ({story.cast.length})
            </h2>
            <div className="flex flex-wrap gap-3">
              {story.cast.map((c) => {
                const isMet = !story.discoveryMode || (story.metCharacterIds && story.metCharacterIds.includes(c.characterId));
                return (
                  <div key={c.characterId} className={cn("flex items-center gap-3 rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 transition-all hover:bg-ink-800/80", !isMet && "opacity-80")}>
                    <div className={cn("w-10 h-10 rounded-full overflow-hidden bg-ink-950 shrink-0 relative", !isMet && "blur-[1.5px] grayscale brightness-50")}>
                      {c.avatarUrl ? (
                        <Image src={c.avatarUrl} alt={isMet ? c.displayName : "???"} fill className="object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full text-sm text-ink-600 font-bold">
                          {isMet ? c.displayName?.[0]?.toUpperCase() : "?"}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className={cn("text-sm font-semibold", isMet ? "text-ink-200" : "text-ink-600 italic")}>
                        {isMet ? c.displayName : "Karakter Misterius"}
                      </p>
                      {c.role && isMet && <p className="text-[10px] text-violet-400/80 capitalize font-medium">{c.role}</p>}
                      {!isMet && <p className="text-[10px] text-amber-500/70 capitalize font-medium">Belum Ditemui</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Interactive content (Client Component) */}
        <StoryInteractiveContent
          story={{
            id: story.id,
            title: story.title,
            synopsis: story.synopsis,
            hasMcSlot: story.hasMcSlot,
            cast: story.cast,
            tags: story.tags,
            isAdult18plus: story.isAdult18plus,
          }}
          scenarios={scenarios}
          mcProfiles={mcProfiles}
          userCharacters={userCharacters}
          hasConfirmedAdult={hasConfirmedAdult}
        />
      </div>
    </div>
  );
}
