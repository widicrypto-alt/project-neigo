'use client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { MessageSquare, BookOpen, Users, Sparkles, X, ChevronDown, Check, Trash2, Clock3, ArrowRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, userFacingApiMessage } from '@/lib/api';
import { posterFor } from '@/lib/poster';
import { cn } from '@/lib/cn';
import { PageMotion } from '@/components/PageMotion';
import {
  BYOK_MODEL_CATALOG,
  DEFAULT_AI_MODEL,
  type ChatMode,
  type ChatSession,
  type Character,
} from '@neigo/shared';

const ADVANCED_SCENE_PRESET_KEY = 'neigo.new-thread.advanced-scene';
const ROLEPLAY_POV_OPTIONS = [
  { value: '', label: 'Auto / Character-driven' },
  { value: 'third_person_limited', label: 'Third Person Limited' },
  { value: 'third_person_omniscient', label: 'Third Person Omniscient' },
  { value: 'first_person_character', label: 'First Person (Character "I")' },
] as const;

interface ThreadSession extends ChatSession {
  characterName?: string | null;
  lastMessagePreview?: string | null;
  expiringInDays?: number | null;
}

interface StoryListItem {
  id: string;
  title: string;
  synopsis: string | null;
  tagline?: string | null;
  coverImageUrl: string | null;
}

interface ThreadCardItem {
  id: string;
  href: string;
  title: string;
  description: string;
  eyebrow: string;
  meta: string[];
  coverImageUrl: string | null;
  storyTitle: string | null;
  scenarioTitle: string | null;
  characterName: string | null;
  isStoryThread: boolean;
  expiresLabel: string | null;
}

function formatRelativeTime(value?: string | null): string {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';

  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'Now';
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m ago`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))}h ago`;
  if (diff < day * 2) return 'Yesterday';
  return `${Math.max(2, Math.floor(diff / day))}d ago`;
}


export default function ChatIndexPage() {
  const t = useTranslations('threads');
  const commonT = useTranslations('common');
  const navT = useTranslations('nav');
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const newSceneCharId = searchParams.get('newScene');
  
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<{ sessions: ThreadSession[] }>('/api/sessions'),
  });
  const chars = useQuery({
    queryKey: ['characters'],
    queryFn: () => api.get<{ characters: Character[] }>('/api/characters'),
  });
  const stories = useQuery({
    queryKey: ['stories-thread-index'],
    queryFn: () => api.get<{ stories: StoryListItem[] }>('/api/stories?limit=80'),
    staleTime: 60_000,
  });
  
  const [showNew, setShowNew] = useState(false);
  const [prefillCharId, setPrefillCharId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (newSceneCharId) {
      setPrefillCharId(newSceneCharId);
      setShowNew(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('newScene');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
    }
  }, [newSceneCharId]);

  const deleteSession = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/sessions/${id}`, { method: 'DELETE', credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error('delete_failed');
        return r.json();
      }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['sessions'] });
      const prev = queryClient.getQueryData<{ sessions: ChatSession[] }>(['sessions']);
      queryClient.setQueryData<{ sessions: ChatSession[] }>(['sessions'], (old) =>
        old ? { ...old, sessions: old.sessions.filter((s) => s.id !== id) } : old,
      );
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev !== undefined) queryClient.setQueryData(['sessions'], context.prev);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const charsById = useMemo(
    () => new Map((chars.data?.characters ?? []).map((c) => [c.id, c])),
    [chars.data?.characters],
  );
  const storiesById = useMemo(
    () => new Map((stories.data?.stories ?? []).map((story) => [story.id, story])),
    [stories.data],
  );
  const threadCards = useMemo<ThreadCardItem[]>(() => {
    return (sessions.data?.sessions ?? []).map((session) => {
      const metadata = (session.metadata ?? {}) as Record<string, unknown>;
      const storyId = typeof metadata.storyId === 'string' ? metadata.storyId : null;
      const story = storyId ? storiesById.get(storyId) : undefined;
      const storyTitle = typeof metadata.storyTitle === 'string' ? metadata.storyTitle : story?.title ?? null;
      const scenarioTitle = typeof metadata.scenarioTitle === 'string' ? metadata.scenarioTitle : null;
      const character = charsById.get(session.characterId);
      const title =
        session.title?.trim() || scenarioTitle || storyTitle || character?.name || `Thread ${session.id.slice(0, 6)}`;
      const description =
        session.lastMessagePreview?.trim() ||
        (typeof session.sceneCard?.openingNote === 'string' ? session.sceneCard.openingNote : '') ||
        story?.tagline?.trim() ||
        story?.synopsis?.split('\n')[0]?.trim() ||
        t('emptyState.fallback');
      const isStoryThread = Boolean(storyId || storyTitle || scenarioTitle);

      return {
        id: session.id,
        href: `/chat/${session.id}`,
        title,
        description,
        eyebrow: isStoryThread ? 'Story thread' : 'Freeform thread',
        meta: [
          character?.name ?? session.characterName ?? 'Unknown character',
          `${session.turnCount} ${session.turnCount === 1 ? 'turn' : 'turns'}`,
          formatRelativeTime(session.lastMessageAt),
        ],
        coverImageUrl: story?.coverImageUrl ?? posterFor(session.characterId ?? session.id),
        storyTitle,
        scenarioTitle,
        characterName: character?.name ?? session.characterName ?? null,
        isStoryThread,
        expiresLabel:
          typeof session.expiringInDays === 'number' && session.expiringInDays > 0
            ? `Expires in ${session.expiringInDays}d`
            : null,
      };
    });
  }, [charsById, sessions.data, storiesById, t]);
  const featuredThread = threadCards[0] ?? null;
  const archiveThreads = threadCards.slice(1);

  return (
    <PageMotion>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10 pb-32">
        <header className="flex items-center justify-between">
          <h1 className="font-display text-4xl text-ink-50 tracking-tight">{t('title')}</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/discover?tab=stories"
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm font-medium text-ink-100 hover:bg-white/[0.08] transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              Stories
            </Link>
            <Link
              href="/discover?tab=characters"
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm font-medium text-ink-100 hover:bg-white/[0.08] transition-colors"
            >
              <Users className="h-4 w-4" />
              Characters
            </Link>
          </div>
        </header>

        {sessions.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5 auto-rows-[240px]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`rounded-[28px] border border-white/[0.08] bg-white/[0.03] animate-pulse-soft ${i === 0 ? 'md:col-span-2 row-span-2' : ''}`} />
            ))}
          </div>
        ) : threadCards.length === 0 ? (
          <div className="rounded-[32px] border border-dashed border-white/[0.1] bg-white/[0.02] px-6 py-20 text-center flex flex-col items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-white/[0.05] flex items-center justify-center mb-5">
               <MessageSquare className="h-8 w-8 text-ink-600" strokeWidth={1.5} />
            </div>
            <h3 className="font-display text-2xl text-ink-50 mb-2">{t('emptyState.title')}</h3>
            <p className="text-sm text-ink-400 max-w-sm mb-8">{t('emptyState.description')}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/discover?tab=stories" className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-ink-100 hover:bg-white/[0.1] transition-colors">
                <BookOpen className="h-4 w-4" /> {t('emptyState.discover')}
              </Link>
              <Link href="/discover?tab=characters" className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-ink-100 hover:bg-white/[0.1] transition-colors">
                <Users className="h-4 w-4" /> {t('emptyState.discoverCharacters')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5 auto-rows-[240px] md:auto-rows-[280px]">
            {featuredThread && (
              <div className="sm:col-span-2 lg:col-span-2 xl:col-span-2 row-span-2 group relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-night-surface shadow-2xl">
                 <Image src={featuredThread.coverImageUrl || posterFor(featuredThread.id)} fill className="object-cover transition-transform duration-1000 group-hover:scale-105" alt="" />
                 <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                 
                 {deletingId === featuredThread.id ? (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-6 text-center">
                       <p className="text-lg text-white font-medium mb-4">{t('delete.confirm')}</p>
                       <div className="flex gap-3">
                          <button onClick={(e) => { e.preventDefault(); deleteSession.mutate(featuredThread.id); setDeletingId(null); }} className="px-6 py-2.5 rounded-full bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors">{t('delete.action')}</button>
                          <button onClick={(e) => { e.preventDefault(); setDeletingId(null); }} className="px-6 py-2.5 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">{commonT('cancel')}</button>
                       </div>
                    </div>
                 ) : (
                   <div className="absolute inset-0 p-6 md:p-8 flex flex-col justify-end">
                      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                         <div className="space-y-3 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                               <span className="rounded-full bg-accent-500/20 border border-accent-500/30 backdrop-blur-md px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-accent-200">{t('featured.lastPlayed')}</span>
                               <span className="text-[11px] uppercase tracking-wider text-white/50 font-medium">{featuredThread.meta[2]}</span>
                            </div>
                            <h2 className="font-display text-3xl md:text-5xl text-white leading-tight truncate">{featuredThread.title}</h2>
                            <p className="text-sm md:text-base text-white/70 line-clamp-2 md:line-clamp-3 leading-relaxed max-w-2xl">{featuredThread.description}</p>
                         </div>
                         
                         <div className="flex shrink-0 gap-3 md:opacity-0 md:translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                            <button onClick={(e) => { e.preventDefault(); setDeletingId(featuredThread.id); }} className="p-3.5 rounded-full bg-white/10 backdrop-blur-md text-white hover:bg-red-500/80 hover:text-white transition-colors" title="Delete thread">
                              <Trash2 className="w-5 h-5" strokeWidth={1.5} />
                            </button>
                            <Link href={featuredThread.href} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-white text-black font-bold hover:bg-white/90 transition-colors">
                               {t('featured.continue')} <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                            </Link>
                         </div>
                      </div>
                   </div>
                 )}
              </div>
            )}

            {archiveThreads.map(thread => (
              <Link href={thread.href} key={thread.id} className="group relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-night-surface shadow-lg hover:border-white/[0.2] hover:shadow-2xl transition-all duration-300">
                 <Image src={thread.coverImageUrl || posterFor(thread.id)} fill className="object-cover transition-transform duration-700 group-hover:scale-105" alt="" />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />
                 
                 <div className="absolute inset-0 p-5 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                       {thread.expiresLabel ? (
                          <span className="rounded-full bg-black/40 border border-amber-500/30 backdrop-blur-md px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-amber-300">
                             {thread.expiresLabel}
                          </span>
                       ) : <div />}
                       <button onClick={(e) => { e.preventDefault(); setDeletingId(thread.id); }} className="opacity-0 group-hover:opacity-100 p-2 rounded-full bg-black/40 backdrop-blur-md text-white/60 hover:text-red-400 hover:bg-black/80 transition-all">
                          <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                    
                    <div className="space-y-1.5 translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                       <div className="flex justify-between items-center text-[10px] text-white/50 uppercase tracking-widest font-medium">
                          <span className="truncate pr-2">{thread.meta[0]}</span>
                          <span className="shrink-0">{thread.meta[2]}</span>
                       </div>
                       <h3 className="font-display text-xl text-white truncate drop-shadow-md">{thread.title}</h3>
                       <p className="text-xs text-white/60 line-clamp-2 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100">{thread.description}</p>
                    </div>
                 </div>
                 
                 {deletingId === thread.id && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-4 text-center">
                       <p className="text-sm text-white font-medium mb-4">{t('delete.confirmShort')}</p>
                       <div className="flex gap-2">
                          <button onClick={(e) => { e.preventDefault(); deleteSession.mutate(thread.id); setDeletingId(null); }} className="px-4 py-2 rounded-full bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors">{t('delete.action')}</button>
                          <button onClick={(e) => { e.preventDefault(); setDeletingId(null); }} className="px-4 py-2 rounded-full bg-white/10 text-white text-xs hover:bg-white/20 transition-colors">{commonT('cancel')}</button>
                       </div>
                    </div>
                 )}
              </Link>
            ))}
          </div>
        )}
      </div>
      {showNew && (
        <NewChatModal
          onClose={() => {
            setShowNew(false);
            setPrefillCharId(null);
          }}
          initialCharacterId={prefillCharId}
        />
      )}
    </PageMotion>
  );
}

function NewChatModal({ onClose, initialCharacterId }: { onClose: () => void; initialCharacterId?: string | null }) {
  const t = useTranslations('threads.newModal');
  const commonT = useTranslations('common');
  const chars = useQuery({
    queryKey: ['characters'],
    queryFn: () => api.get<{ characters: Character[] }>('/api/characters'),
  });
  const queryClient = useQueryClient();
  const [characterId, setCharacterId] = useState<string>(initialCharacterId ?? '');
  const mode: ChatMode = 'STORY';
  const [premise, setPremise] = useState<string>('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sceneLocation, setSceneLocation] = useState('');
  const [sceneTime, setSceneTime] = useState('');
  const [sceneWeather, setSceneWeather] = useState('');
  const [sceneMood, setSceneMood] = useState('');
  const [sceneUserRole, setSceneUserRole] = useState('');
  const [sceneLanguage, setSceneLanguage] = useState('');
  const [scenePov, setScenePov] = useState('');
  const [creating, setCreating] = useState(false);
  const [aiModel, setAiModel] = useState<string>(DEFAULT_AI_MODEL);
  const [generatingScene, setGeneratingScene] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAdvancedPreset = Boolean(
    sceneLocation.trim() ||
      sceneTime.trim() ||
      sceneWeather.trim() ||
      sceneMood.trim() ||
      sceneUserRole.trim() ||
        sceneLanguage.trim() ||
        scenePov.trim(),
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ADVANCED_SCENE_PRESET_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        location?: string;
        time?: string;
        weather?: string;
        mood?: string;
        userRole?: string;
        language?: string;
        pov?: string;
        advancedOpen?: boolean;
      };
      setSceneLocation(parsed.location ?? '');
      setSceneTime(parsed.time ?? '');
      setSceneWeather(parsed.weather ?? '');
      setSceneMood(parsed.mood ?? '');
      setSceneUserRole(parsed.userRole ?? '');
      setSceneLanguage(parsed.language ?? '');
      setScenePov(parsed.pov ?? '');
      setAdvancedOpen(Boolean(parsed.advancedOpen));
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        ADVANCED_SCENE_PRESET_KEY,
        JSON.stringify({
          location: sceneLocation,
          time: sceneTime,
          weather: sceneWeather,
          mood: sceneMood,
          userRole: sceneUserRole,
          language: sceneLanguage,
          pov: scenePov,
          advancedOpen,
        }),
      );
    } catch {
    }
  }, [advancedOpen, sceneLanguage, sceneLocation, sceneMood, scenePov, sceneTime, sceneUserRole, sceneWeather]);

  function resetAdvancedPreset() {
    setSceneLocation('');
    setSceneTime('');
    setSceneWeather('');
    setSceneMood('');
    setSceneUserRole('');
    setSceneLanguage('');
    setScenePov('');
    try {
      window.localStorage.removeItem(ADVANCED_SCENE_PRESET_KEY);
    } catch {
    }
  }

  async function generateScene() {
    if (!characterId) return;
    setGeneratingScene(true);
    try {
      const result = await api.post<{
        location: string;
        time: string;
        weather: string;
        mood: string;
        userRole: string;
        language: string;
      }>('/api/sessions/suggest-scene', {
        characterId,
        premise: premise.trim() || undefined,
        mode,
      });
      if (result.location) setSceneLocation(result.location);
      if (result.time) setSceneTime(result.time);
      if (result.weather) setSceneWeather(result.weather);
      if (result.mood) setSceneMood(result.mood);
      if (result.userRole) setSceneUserRole(result.userRole);
      if (result.language) setSceneLanguage(result.language);
    } catch {
    } finally {
      setGeneratingScene(false);
    }
  }

  async function create() {
    if (!characterId) return;
    setError(null);
    setCreating(true);
    try {
      const openingNote = premise.trim();
      const sceneCard: Record<string, string> = {};
      if (openingNote) sceneCard.openingNote = openingNote;
      if (sceneLocation.trim()) sceneCard.location = sceneLocation.trim();
      if (sceneTime.trim()) sceneCard.time = sceneTime.trim();
      if (sceneWeather.trim()) sceneCard.weather = sceneWeather.trim();
      if (sceneMood.trim()) sceneCard.mood = sceneMood.trim();
      if (sceneUserRole.trim()) sceneCard.userRole = sceneUserRole.trim();
      if (sceneLanguage.trim()) sceneCard.language = sceneLanguage.trim();
      if (scenePov.trim()) sceneCard.pov = scenePov.trim();

      const r = await api.post<{ session: ChatSession }>('/api/sessions', {
        characterId,
        mode,
        castCharacterIds: [],
        title: '',
        sceneCard,
        aiModel,
      });
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      window.location.href = `/chat/${r.session.id}`;
    } catch (e) {
      setError(userFacingApiMessage(e, 'Failed to create session.'));
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center md:p-4 bg-ink-950/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card card-glow p-6 md:p-7 w-full md:max-w-lg max-h-[92dvh] md:max-h-[90vh] overflow-y-auto animate-slide-up-sheet md:animate-fade-up rounded-t-3xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-accent-400 mb-1">
              {t('eyebrow')}
            </p>
            <h3 className="display text-2xl tracking-tight text-ink-50">
              {t('title')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-500 hover:text-ink-100 hover:bg-white/[0.05] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-[11px] uppercase tracking-[0.14em] text-ink-500 font-medium mb-1.5 block">
              {t('character')}
            </label>
            <CharacterSelect
              value={characterId}
              onChange={setCharacterId}
              characters={chars.data?.characters ?? []}
              loading={chars.isLoading}
              disabled={chars.isLoading || (chars.data?.characters.length ?? 0) === 0}
            />
            {(chars.data?.characters.length ?? 0) === 0 && !chars.isLoading && (
              <p className="text-[11px] text-ink-500 mt-1.5">{t('characterHint')}</p>
            )}
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-[0.14em] text-ink-500 font-medium mb-1.5 block">
              {t('model')} <span className="text-ink-600 normal-case tracking-normal">— {t('modelHint')}</span>
            </label>
            <select
              className="input"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
            >
              <option value={DEFAULT_AI_MODEL}>Hermes-4-405B (default)</option>
              {BYOK_MODEL_CATALOG.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.tier}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-ink-600 display-italic mt-1.5">
              {t('byokNote')}
            </p>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-[0.14em] text-ink-500 font-medium mb-1.5 block">
              {t('premise')} <span className="text-ink-600 normal-case tracking-normal">— {t('premiseOptional')}</span>
            </label>
            <textarea
              className="input min-h-[72px] resize-y leading-relaxed"
              placeholder="A rainy afternoon. She's been waiting at the café longer than she should have."
              value={premise}
              maxLength={400}
              onChange={(e) => setPremise(e.target.value)}
            />
            <p className="text-[10px] text-ink-600 display-italic mt-1.5">
              {t('premiseHint')}
            </p>
          </div>

          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="w-full px-4 py-3 text-left flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-ink-500 font-medium">{t('advanced')}</p>
                <p className="text-xs text-ink-600 mt-0.5">{t('advancedHint')}</p>
              </div>
              <ChevronDown
                className={'w-4 h-4 transition-transform ' + (advancedOpen ? 'rotate-180 text-accent-300' : 'text-ink-500')}
                strokeWidth={2}
              />
            </button>

            {advancedOpen && (
              <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {hasAdvancedPreset && (
                  <div className="sm:col-span-2 flex justify-end">
                    <button
                      type="button"
                      onClick={resetAdvancedPreset}
                      className="text-xs text-ink-500 hover:text-ink-100 transition-colors"
                    >
                      {t('reset')}
                    </button>
                  </div>
                )}
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={generateScene}
                    disabled={!characterId || generatingScene}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-accent-500/30 bg-accent-500/10 px-3 py-1.5 text-xs text-accent-200 transition-all hover:bg-accent-500/20 hover:text-accent-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Sparkles className="w-3 h-3" />
                    {generatingScene ? t('generating') : t('generate')}
                  </button>
                </div>
                <label className="block">
                  <span className="text-xs text-ink-400">Location</span>
                  <input
                    className="input mt-1"
                    value={sceneLocation}
                    onChange={(e) => setSceneLocation(e.target.value)}
                    placeholder="Rooftop garden"
                    maxLength={80}
                  />
                </label>

                <label className="block">
                  <span className="text-xs text-ink-400">Time</span>
                  <input
                    className="input mt-1"
                    value={sceneTime}
                    onChange={(e) => setSceneTime(e.target.value)}
                    placeholder="Midnight"
                    maxLength={60}
                  />
                </label>

                <label className="block">
                  <span className="text-xs text-ink-400">Weather</span>
                  <input
                    className="input mt-1"
                    value={sceneWeather}
                    onChange={(e) => setSceneWeather(e.target.value)}
                    placeholder="Light rain"
                    maxLength={60}
                  />
                </label>

                <label className="block">
                  <span className="text-xs text-ink-400">Mood</span>
                  <input
                    className="input mt-1"
                    value={sceneMood}
                    onChange={(e) => setSceneMood(e.target.value)}
                    placeholder="Tense but intimate"
                    maxLength={80}
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="text-xs text-ink-400">Your Role</span>
                  <input
                    className="input mt-1"
                    value={sceneUserRole}
                    onChange={(e) => setSceneUserRole(e.target.value)}
                    placeholder="An old friend returning after years"
                    maxLength={120}
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="text-xs text-ink-400">Language</span>
                  <input
                    className="input mt-1"
                    value={sceneLanguage}
                    onChange={(e) => setSceneLanguage(e.target.value)}
                    placeholder="English"
                    maxLength={30}
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="text-xs text-ink-400">POV</span>
                  <select
                    className="input mt-1"
                    value={scenePov}
                    onChange={(e) => setScenePov(e.target.value)}
                  >
                    {ROLEPLAY_POV_OPTIONS.map((option) => (
                      <option key={option.value || 'auto'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-ink-600 display-italic mt-1.5">
                    {t('povHint')}
                  </p>
                </label>
              </div>
            )}
          </section>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button onClick={onClose} className="btn-ghost flex-1">
              {commonT('cancel')}
            </button>
            <button
              onClick={create}
              disabled={!characterId || creating}
              className="btn-primary flex-1"
            >
              {creating ? t('opening') : t('openAction')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CharacterSelect({
  value,
  onChange,
  characters,
  loading,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  characters: Character[];
  loading: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [ratingFilter, setRatingFilter] = useState<'ALL' | 'SFW' | 'NSFW' | 'EXPLICIT'>('ALL');
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => characters.find((c) => c.id === value), [characters, value]);
  const filteredCharacters = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byRating = ratingFilter === 'ALL' ? characters : characters.filter((c) => c.contentRating === ratingFilter);
    if (!q) return byRating;
    return byRating.filter((c) => c.name.toLowerCase().includes(q));
  }, [characters, query, ratingFilter]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open || !filteredCharacters.length) return;
    const selectedIndex = filteredCharacters.findIndex((c) => c.id === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, filteredCharacters, value]);

  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.querySelector<HTMLButtonElement>(`[data-option-index="${activeIndex}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!filteredCharacters.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filteredCharacters.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(filteredCharacters.length - 1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const next = filteredCharacters[activeIndex];
      if (!next) return;
      onChange(next.id);
      setOpen(false);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  }

  const label = loading
    ? 'Loading characters...'
    : selected?.name ?? (characters.length ? 'Select...' : 'No characters available');

  function renderHighlightedName(name: string, term: string) {
    const q = term.trim();
    if (!q) return name;

    const lowerName = name.toLowerCase();
    const lowerQuery = q.toLowerCase();
    const parts: Array<{ text: string; match: boolean }> = [];

    let cursor = 0;
    while (cursor < name.length) {
      const hit = lowerName.indexOf(lowerQuery, cursor);
      if (hit === -1) {
        parts.push({ text: name.slice(cursor), match: false });
        break;
      }
      if (hit > cursor) {
        parts.push({ text: name.slice(cursor, hit), match: false });
      }
      parts.push({ text: name.slice(hit, hit + q.length), match: true });
      cursor = hit + q.length;
    }

    return (
      <>
        {parts.map((part, index) =>
          part.match ? (
            <mark
              key={`${part.text}-${index}`}
              className="rounded bg-accent-500/20 px-0.5 text-accent-100"
            >
              {part.text}
            </mark>
          ) : (
            <span key={`${part.text}-${index}`}>{part.text}</span>
          ),
        )}
      </>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          'w-full rounded-2xl border px-4 py-3 text-left transition-all flex items-center justify-between gap-3 ' +
          (disabled
            ? 'border-white/[0.08] bg-white/[0.02] text-ink-600 cursor-not-allowed'
            : open
              ? 'border-accent-500/60 bg-accent-500/[0.06] text-ink-50 shadow-glow-soft'
              : 'border-white/[0.12] bg-white/[0.02] text-ink-100 hover:border-white/[0.2]')
        }
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className={'w-4 h-4 shrink-0 transition-transform ' + (open ? 'rotate-180 text-accent-300' : 'text-ink-500')}
          strokeWidth={2}
        />
      </button>

      {open && !disabled && (
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className="absolute left-0 right-0 mt-2 z-30 max-h-64 overflow-y-auto rounded-2xl border border-white/[0.12] bg-ink-950/95 backdrop-blur-xl shadow-[0_20px_45px_-20px_rgba(0,0,0,0.85)] p-1.5"
        >
          <div className="px-1.5 pb-1.5">
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              placeholder="Search character..."
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-2.5 py-2 text-sm text-ink-100 placeholder:text-ink-600 focus:outline-none focus:ring-1 focus:ring-accent-400/50 focus:border-accent-400/40"
            />
          </div>

          <div className="flex gap-1 px-1.5 pb-1.5">
            {(['ALL', 'SFW', 'NSFW', 'EXPLICIT'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => { setRatingFilter(r); setActiveIndex(0); }}
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                  ratingFilter === r && r === 'NSFW' && 'border-amber-500/60 bg-amber-500/15 text-amber-300',
                  ratingFilter === r && r === 'EXPLICIT' && 'border-rose-500/60 bg-rose-500/15 text-rose-300',
                  ratingFilter === r && (r === 'ALL' || r === 'SFW') && 'border-accent-500/60 bg-accent-500/15 text-accent-300',
                  ratingFilter !== r && 'border-white/[0.08] text-ink-500 hover:text-ink-300 hover:border-white/[0.16]',
                )}
              >
                {r === 'ALL' ? 'All' : r === 'EXPLICIT' ? '18+' : r}
              </button>
            ))}
          </div>

          {filteredCharacters.map((character, index) => {
            const isSelected = value === character.id;
            const isActive = index === activeIndex;
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                key={character.id}
                data-option-index={index}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onChange(character.id);
                  setOpen(false);
                }}
                className={
                  'w-full rounded-xl px-3 py-2.5 text-left flex items-center justify-between gap-2 transition-colors ' +
                  (isActive
                    ? 'bg-accent-500/15 text-ink-50'
                    : 'text-ink-300 hover:bg-white/[0.05] hover:text-ink-100')
                }
              >
                <span className="truncate">{renderHighlightedName(character.name, query)}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {character.contentRating && character.contentRating !== 'SFW' && (
                    <span className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded font-medium',
                      character.contentRating === 'NSFW' && 'bg-amber-500/20 text-amber-400',
                      character.contentRating === 'EXPLICIT' && 'bg-rose-500/20 text-rose-400',
                    )}>
                      {character.contentRating}
                    </span>
                  )}
                  {isSelected && <Check className="w-4 h-4 text-accent-300" strokeWidth={2.2} />}
                </span>
              </button>
            );
          })}

          {filteredCharacters.length === 0 && (
            <p className="px-3 py-2 text-sm text-ink-500">
              {query
                ? 'No character matches your search.'
                : ratingFilter !== 'ALL'
                  ? `No ${ratingFilter === 'EXPLICIT' ? '18+' : ratingFilter} characters.`
                  : 'No characters available.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
