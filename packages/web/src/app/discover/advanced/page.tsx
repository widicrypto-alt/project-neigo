'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Dices, Lock, Radio, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { posterFor } from '@/lib/poster';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { DiscoverOnboarding } from '@/components/DiscoverOnboarding';
import type { StoryCoverItem } from '@/components/discover/StoryCoverCard';

const POSTURE_MAP: Record<
  string,
  { tagline: string; hook: string; mood: string }
> = {
  STOIC: {
    tagline: "Someone who's been waiting.",
    hook: 'Never says it, but counted the days.',
    mood: 'Quiet',
  },
  MELANCHOLIC: {
    tagline: "Someone who's been waiting.",
    hook: 'The silence felt longer than it was.',
    mood: 'Wistful',
  },
  TSUNDERE: {
    tagline: "Someone who doesn't trust you yet.",
    hook: "Won't look at you first.",
    mood: 'Guarded',
  },
  FORMAL: {
    tagline: "Someone who doesn't trust you yet.",
    hook: 'Politeness is easier than honesty.',
    mood: 'Measured',
  },
  MYSTERIOUS: {
    tagline: 'Someone you hurt once.',
    hook: "Remembers. Hasn't decided if you do.",
    mood: 'Unsettled',
  },
  PLAYFUL: {
    tagline: 'Someone you hurt once.',
    hook: 'The joke stopped being funny a while ago.',
    mood: 'Bittersweet',
  },
  NURTURING: {
    tagline: "Someone who's been waiting.",
    hook: 'Keeps the kettle warm just in case.',
    mood: 'Tender',
  },
  ENERGETIC: {
    tagline: "Someone who doesn't trust you yet.",
    hook: 'Moves fast so you can keep up.',
    mood: 'Alive',
  },
};

const DEFAULT_META = {
  tagline: 'Someone new.',
  hook: 'Waiting to be discovered.',
  mood: 'Open',
};

type GenderFilter = 'all' | 'F' | 'M';
type AgeFilter = 'all' | 'young' | 'adult' | 'mature';

const VIBE_OPTIONS: { key: string; label: string }[] = [
  { key: 'STOIC', label: 'Stoic' },
  { key: 'MELANCHOLIC', label: 'Melancholic' },
  { key: 'TSUNDERE', label: 'Tsundere' },
  { key: 'PLAYFUL', label: 'Playful' },
  { key: 'MYSTERIOUS', label: 'Mysterious' },
  { key: 'NURTURING', label: 'Nurturing' },
  { key: 'FORMAL', label: 'Formal' },
  { key: 'ENERGETIC', label: 'Energetic' },
];

const AGE_BUCKETS: { key: AgeFilter; label: string; range: [number, number] | null }[] = [
  { key: 'all', label: 'All ages', range: null },
  { key: 'young', label: '18–22', range: [18, 22] },
  { key: 'adult', label: '23–30', range: [23, 30] },
  { key: 'mature', label: '31+', range: [31, 99] },
];

interface FeaturedChar {
  id: string;
  name: string;
  tonePreset: string;
  chapter: number | null;
  gender: 'F' | 'M' | null;
  age: number | null;
  discoverOrder: number | null;
  tags?: string[] | null;
  persona?: Record<string, unknown> | null;
}

interface FeaturedResponse {
  characters: FeaturedChar[];
}

interface StoriesResponse {
  stories: StoryCoverItem[];
}

interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    metadata?: Record<string, unknown> | null;
  };
}

interface CreateSessionResponse {
  session: { id: string };
}

const TIER_COLOR: Record<string, string> = {
  FREE: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-200',
  PAID: 'border-rose-400/30 bg-rose-400/12 text-rose-100',
  FOUNDER: 'border-amber-400/30 bg-amber-400/12 text-amber-100',
};

const LANG_FLAG: Record<string, string> = {
  id: '🇮🇩',
  en: '🇺🇸',
  ja: '🇯🇵',
  ko: '🇰🇷',
  zh: '🇨🇳',
};

const STORY_PLACEHOLDERS = [
  {
    href: '/stories',
    title: 'Rak novel sedang diisi ulang',
    description: 'Begitu cerita baru naik, grid ini akan jadi tempat pertama buat menemukannya.',
  },
  {
    href: '/studio/stories',
    title: 'Tulis visual novel pertamamu',
    description: 'Kalau belum ada yang pas, buka studio dan isi rak dengan ceritamu sendiri.',
  },
  {
    href: '/discover/advanced',
    title: 'Cek roster karakter dulu',
    description: 'Pilih spotlight di atas, lalu balik lagi ke bawah saat rak cerita sudah penuh.',
  },
];

// Deterministic hash — maps string to [0, 1) reproducibly.
function hashToUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1_000_003) / 1_000_003;
}

// 10-minute bucket so the "who's online" set rotates predictably.
function currentPresenceBucket(): number {
  return Math.floor(Date.now() / (10 * 60 * 1000));
}

interface SpotlightPosterProps {
  char: FeaturedChar;
  active: boolean;
  distance: number;
  onSelect: () => void;
  buttonRef?: (node: HTMLButtonElement | null) => void;
}

function SpotlightPoster({ char, active, distance, onSelect, buttonRef }: SpotlightPosterProps) {
  const depth = Math.abs(distance);
  const sizeClass = active
    ? 'h-[230px] w-[150px] md:h-[276px] md:w-[180px]'
    : depth === 1
      ? 'h-[188px] w-[118px] md:h-[220px] md:w-[138px]'
      : depth === 2
        ? 'h-[164px] w-[102px] md:h-[194px] md:w-[120px]'
        : 'h-[142px] w-[88px] md:h-[170px] md:w-[104px]';
  const translateY = active ? -18 : Math.min(22, depth * 7 + 6);
  const scale = active ? 1 : Math.max(0.76, 1 - depth * 0.08);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`Pilih ${char.name}`}
      className={cn(
        'group relative shrink-0 snap-center overflow-hidden rounded-[28px] border transition-all duration-500 ease-out',
        sizeClass,
        active
          ? 'border-[#f4bccd]/50 shadow-[0_28px_90px_-26px_rgba(248,168,194,0.68)]'
          : 'border-white/[0.08] shadow-[0_18px_40px_-34px_rgba(7,8,15,0.9)] hover:border-white/[0.18]',
      )}
      style={{
        transform: `translate3d(0, ${translateY}px, 0) scale(${scale})`,
        filter: active
          ? 'saturate(1.04)'
          : `saturate(${Math.max(0.58, 1 - depth * 0.16)}) blur(${depth > 2 ? 1.2 : 0}px)`,
        zIndex: active ? 40 : Math.max(12, 30 - depth),
      }}
    >
      <Image
        src={posterFor(char.id)}
        alt={char.name}
        fill
        sizes={active ? '180px' : '138px'}
        className={cn(
          'object-cover transition-transform duration-700',
          active ? 'scale-[1.02]' : 'scale-100 group-hover:scale-[1.04]',
        )}
      />
      <div
        className={cn(
          'absolute inset-0 transition-opacity',
          active
            ? 'bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(8,10,22,0.1)_22%,rgba(7,8,15,0.9)_100%)] opacity-100'
            : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(7,8,15,0.22)_28%,rgba(7,8,15,0.92)_100%)] opacity-85',
        )}
      />
      {active ? (
        <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-[#ffd7e2]/55 ring-offset-2 ring-offset-transparent" />
      ) : null}
      {active ? (
        <div className="absolute inset-x-0 bottom-0 p-3 text-left">
          <div className="truncate text-sm font-medium text-ink-50">{char.name}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-ink-300">center stage</div>
        </div>
      ) : null}
    </button>
  );
}

function VisualNovelGridCard({ story, index }: { story: StoryCoverItem; index: number }) {
  const flag = LANG_FLAG[story.language] ?? '🌐';
  const tierClass = TIER_COLOR[story.requiredTier] ?? TIER_COLOR.FREE;
  const tags = (story.metadata?.tags ?? []).slice(0, 2);
  const locked = story.requiredTier !== 'FREE';
  const synopsis = story.synopsis?.trim()
    || 'Cerita ini belum menaruh sinopsis, tapi cover-nya sudah cukup untuk mengundang kamu masuk.';
  const gradientSeed = story.id.charCodeAt(0) % 360;
  const fallbackStyle = {
    background: `linear-gradient(160deg, hsl(${gradientSeed},38%,20%) 0%, hsl(${(gradientSeed + 42) % 360},40%,14%) 100%)`,
  };

  return (
    <Link
      href={`/stories/${story.id}`}
      className="group card card-hover grid min-h-[230px] overflow-hidden rounded-[28px] border-white/[0.08] bg-[linear-gradient(145deg,rgba(15,22,63,0.88),rgba(10,13,33,0.98))] lg:grid-cols-[152px_minmax(0,1fr)]"
    >
      <div className="relative min-h-[210px] overflow-hidden lg:min-h-full">
        {story.coverImageUrl ? (
          <Image
            src={story.coverImageUrl}
            alt={story.title}
            fill
            sizes="(max-width: 1024px) 100vw, 152px"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.05]"
          />
        ) : (
          <div className="absolute inset-0" style={fallbackStyle} />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,11,26,0.02),rgba(7,8,15,0.28)_34%,rgba(7,8,15,0.94)_100%)] lg:bg-[linear-gradient(90deg,rgba(7,8,15,0.12),rgba(7,8,15,0.08)_24%,rgba(7,8,15,0.94)_100%)]" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded-full border border-white/[0.08] bg-ink-950/70 px-2 py-0.5 text-[11px] backdrop-blur-sm">{flag}</span>
          <span className="rounded-full border border-white/[0.08] bg-ink-950/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-ink-300 backdrop-blur-sm">
            VN {String(index + 1).padStart(2, '0')}
          </span>
        </div>
        {locked ? (
          <span className="absolute bottom-3 left-3 rounded-full border border-amber-400/30 bg-ink-950/72 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-200 backdrop-blur-sm">
            locked tier
          </span>
        ) : null}
      </div>

      <div className="flex flex-col justify-between p-4 sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em]', tierClass)}>
              {story.requiredTier}
            </span>
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-ink-400"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-4 line-clamp-2 font-display text-2xl leading-tight text-ink-50">{story.title}</div>
          <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-ink-300/88">{synopsis}</p>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-3">
          <div className="text-xs text-ink-500">
            {story.language.toUpperCase()} route · {(tags[0] ?? 'story').toLowerCase()}
          </div>
          <span className="inline-flex items-center gap-1 text-sm text-rose-100">
            Buka novel
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function VisualNovelPlaceholderCard({ href, title, description }: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group card card-hover flex min-h-[230px] flex-col justify-between rounded-[28px] border border-dashed border-white/[0.1] bg-[linear-gradient(145deg,rgba(15,22,63,0.44),rgba(10,13,33,0.84))] p-5"
    >
      <div>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-ink-400">
          grid placeholder
        </span>
        <div className="mt-4 font-display text-2xl leading-tight text-ink-50">{title}</div>
        <p className="mt-3 text-sm leading-relaxed text-ink-400">{description}</p>
      </div>

      <div className="mt-5 inline-flex items-center gap-1 text-sm text-rose-100">
        Buka rak
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

export default function DiscoverPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<GenderFilter>('all');
  const [query, setQuery] = useState('');
  const [vibe, setVibe] = useState<string | null>(null);
  const [ageBucket, setAgeBucket] = useState<AgeFilter>('all');
  const [activeSpotlight, setActiveSpotlight] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [presenceBucket, setPresenceBucket] = useState(() => currentPresenceBucket());
  const spotlightStripRef = useRef<HTMLDivElement | null>(null);
  const spotlightRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const touchStartY = useRef(0);
  const pulling = useRef(false);

  // Featured characters
  const charsQuery = useQuery({
    queryKey: ['featured-characters'],
    queryFn: () => api.get<FeaturedResponse>('/api/featured-characters'),
    staleTime: 60_000,
  });
  const chars = useMemo(() => charsQuery.data?.characters ?? [], [charsQuery.data]);

  const storiesQuery = useQuery({
    queryKey: ['stories-advanced'],
    queryFn: () => api.get<StoriesResponse>('/api/stories?limit=6'),
    staleTime: 5 * 60_000,
  });
  const stories = useMemo(() => storiesQuery.data?.stories ?? [], [storiesQuery.data]);

  // Auth (me) — used for onboarding gate. Soft-fail for anon.
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });

  // Onboarding gate
  useEffect(() => {
    const user = meQuery.data?.user;
    if (!user) return;
    const completed = Boolean((user.metadata ?? {}).onboardingCompleted);
    if (!completed) setShowOnboarding(true);
  }, [meQuery.data]);

  // Presence bucket ticker — re-derive every 60 s (cheap); bucket only changes every 10 min.
  useEffect(() => {
    const id = setInterval(() => setPresenceBucket(currentPresenceBucket()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Surprise Me — pick random matching char, create session, navigate.
  const surprise = useMutation({
    mutationFn: async (characterId: string) => {
      const res = await api.post<CreateSessionResponse>('/api/sessions', {
        mode: 'ROLEPLAY',
        characterId,
        castCharacterIds: [],
        title: '',
        sceneCard: {},
      });
      return res.session.id;
    },
    onSuccess: (sessionId) => {
      router.push(`/chat/${sessionId}`);
    },
  });

  function handleSurprise() {
    // Pool respects gender filter; ignores search/vibe/age so surprise stays surprising.
    const pool = chars.filter((c) => filter === 'all' || c.gender === filter);
    if (pool.length === 0) return;
    if (!meQuery.data?.user) {
      router.push('/login');
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    surprise.mutate(pick.id);
  }

  // Pull-to-refresh on mobile
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        touchStartY.current = e.touches[0]!.clientY;
        pulling.current = true;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current) return;
      const dy = e.touches[0]!.clientY - touchStartY.current;
      if (dy > 0 && window.scrollY === 0) {
        setPullY(Math.min(dy * 0.4, 80));
      }
    };
    const onTouchEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      if (pullY >= 60) {
        setRefreshing(true);
        setPullY(0);
        await charsQuery.refetch();
        setTimeout(() => setRefreshing(false), 600);
      } else {
        setPullY(0);
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [pullY, charsQuery]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get('g');
    if (g === 'F' || g === 'M') setFilter(g);
    const q = params.get('q');
    if (q) setQuery(q);
    const v = params.get('vibe');
    if (v) setVibe(v.toUpperCase());
  }, []);

  function selectFilter(next: GenderFilter) {
    setFilter(next);
    const url = new URL(window.location.href);
    if (next === 'all') url.searchParams.delete('g');
    else url.searchParams.set('g', next);
    window.history.replaceState({}, '', url.toString());
  }

  // Normalized search index per char.
  function charSearchBlob(c: FeaturedChar): string {
    const persona = (c.persona ?? {}) as Record<string, unknown>;
    const parts: (string | undefined)[] = [
      c.name,
      c.tonePreset,
      c.gender ?? undefined,
      ...(c.tags ?? []),
      typeof persona.personality === 'string' ? persona.personality : undefined,
      typeof persona.speechStyle === 'string' ? persona.speechStyle : undefined,
      typeof persona.background === 'string' ? persona.background : undefined,
    ];
    return parts.filter(Boolean).join(' — ').toLowerCase();
  }

  // Apply gender/search/vibe/age filters to the full char list.
  const visibleChars = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ageRange = AGE_BUCKETS.find((b) => b.key === ageBucket)?.range ?? null;
    return chars.filter((c) => {
      if (filter !== 'all' && c.gender !== filter) return false;
      if (vibe && c.tonePreset !== vibe) return false;
      if (ageRange) {
        if (c.age == null) return false;
        if (c.age < ageRange[0] || c.age > ageRange[1]) return false;
      }
      if (q && !charSearchBlob(c).includes(q)) return false;
      return true;
    });
  }, [chars, filter, vibe, ageBucket, query]);

  const hasActiveSearch = query.trim().length > 0 || vibe !== null || ageBucket !== 'all';

  // "Who's online" — deterministic rotation: score = hash(id + bucket), top-6.
  const onlineChars = useMemo(() => {
    if (chars.length === 0) return [];
    const scored = chars
      .filter((c) => filter === 'all' || c.gender === filter)
      .map((c) => ({ c, score: hashToUnit(`${c.id}:${presenceBucket}`) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.c);
    return scored;
  }, [chars, filter, presenceBucket]);

  const spotlightChars = useMemo(() => {
    const source = hasActiveSearch ? visibleChars : [...onlineChars, ...visibleChars];
    const unique = new Map<string, FeaturedChar>();
    for (const character of source) {
      if (!unique.has(character.id)) unique.set(character.id, character);
    }
    return Array.from(unique.values()).slice(0, 10);
  }, [hasActiveSearch, onlineChars, visibleChars]);

  const visibleStories = useMemo(() => stories.slice(0, 6), [stories]);
  const activeHero = spotlightChars[activeSpotlight] ?? null;
  const activeHeroMeta = activeHero ? (POSTURE_MAP[activeHero.tonePreset] ?? DEFAULT_META) : DEFAULT_META;

  useEffect(() => {
    if (spotlightChars.length === 0) {
      setActiveSpotlight(0);
      return;
    }
    if (activeSpotlight >= spotlightChars.length) setActiveSpotlight(0);
  }, [activeSpotlight, spotlightChars.length]);

  useEffect(() => {
    if (hasActiveSearch || spotlightChars.length < 2) return;
    const intervalId = window.setInterval(() => {
      setActiveSpotlight((current) => (current + 1) % spotlightChars.length);
    }, 5200);
    return () => window.clearInterval(intervalId);
  }, [hasActiveSearch, spotlightChars.length]);

  useEffect(() => {
    const container = spotlightStripRef.current;
    const target = spotlightRefs.current[activeSpotlight];
    if (!container || !target) return;

    const frameId = window.requestAnimationFrame(() => {
      const nextLeft = target.offsetLeft - (container.clientWidth - target.clientWidth) / 2;
      container.scrollTo({ left: Math.max(0, nextLeft), behavior: 'smooth' });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeSpotlight, spotlightChars.length]);

  function resetFilters() {
    setQuery('');
    setVibe(null);
    setAgeBucket('all');
  }

  function openScene(characterId: string) {
    router.push(`/chat?newScene=${characterId}`);
  }

  const surpriseError = surprise.error instanceof ApiError ? surprise.error.code : null;

  return (
    <div className="flex-1 flex flex-col">
      {/* Pull-to-refresh indicator */}
      {(pullY > 0 || refreshing) && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-ink-900/90 border border-white/[0.1] backdrop-blur text-xs text-ink-300 transition-opacity"
          style={{ opacity: pullY > 20 || refreshing ? 1 : 0 }}
        >
          <svg
            className={refreshing ? 'animate-spin-slow' : ''}
            style={{ transform: refreshing ? undefined : `rotate(${(pullY / 80) * 360}deg)` }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {refreshing ? 'Refreshing…' : pullY >= 60 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}
      <section className="relative overflow-hidden px-6 pb-8 pt-8 md:px-12 md:pb-10 md:pt-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top,rgba(108,118,255,0.22),transparent_42%),radial-gradient(circle_at_50%_12%,rgba(250,190,208,0.18),transparent_34%)]" />
        <div className="pointer-events-none absolute left-1/2 top-[220px] h-24 w-[74%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(244,188,205,0.18),transparent_68%)] blur-3xl" />
        <div className="relative mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-ink-200">
              <Sparkles className="h-3 w-3 text-accent-300" />
              Character spotlight
            </div>
            <h1 className="mt-4 display text-3xl leading-tight text-ink-50 md:text-[3.4rem]">
              Geser roster di atas.
              <span className="text-gradient"> Biarkan satu karakter maju ke tengah.</span>
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink-400 md:text-base">
              Fokusnya saya pecah dua: karakter tetap jadi slide utama, sementara visual novel turun ke grid supaya lebih enak discan tanpa terasa copycat dari referensi.
            </p>
          </div>

          {spotlightChars.length > 0 ? (
            <>
              <div
                ref={spotlightStripRef}
                className="mt-8 flex items-end gap-3 overflow-x-auto px-[24vw] pb-6 pt-4 scrollbar-none snap-x snap-mandatory md:px-[16vw] xl:px-[12vw]"
                style={{ scrollPaddingInline: '24vw' }}
              >
                {spotlightChars.map((char, index) => (
                  <SpotlightPoster
                    key={`spotlight-${char.id}`}
                    char={char}
                    active={index === activeSpotlight}
                    distance={index - activeSpotlight}
                    onSelect={() => setActiveSpotlight(index)}
                    buttonRef={(node) => {
                      spotlightRefs.current[index] = node;
                    }}
                  />
                ))}
              </div>

              <div className="flex items-center justify-center gap-2">
                {spotlightChars.map((char, index) => (
                  <button
                    key={`dot-${char.id}`}
                    type="button"
                    onClick={() => setActiveSpotlight(index)}
                    aria-label={`Lihat ${char.name}`}
                    className={cn(
                      'h-2 rounded-full transition-all',
                      index === activeSpotlight ? 'w-6 bg-accent-300' : 'w-2 bg-white/[0.18] hover:bg-white/[0.32]',
                    )}
                  />
                ))}
              </div>

              {activeHero ? (
                <div className="mt-6 grid gap-3 rounded-[30px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(16,22,60,0.82),rgba(10,13,34,0.96))] p-4 md:p-5 lg:grid-cols-[minmax(0,1.2fr)_240px]">
                  <div className="flex flex-col justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-rose-300/25 bg-rose-300/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-rose-100">
                          {activeHeroMeta.mood}
                        </span>
                        {!hasActiveSearch ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-sky-100">
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
                            auto center hidup
                          </span>
                        ) : null}
                        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-ink-400">
                          Chapter {activeHero.chapter ?? 1}
                        </span>
                      </div>

                      <div className="mt-4 display text-2xl leading-tight text-ink-50 md:text-[2.35rem]">
                        {activeHero.name}
                      </div>
                      <p className="mt-1 text-sm text-rose-100/72 md:text-base">{activeHeroMeta.tagline}</p>
                      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-300 md:text-[15px]">
                        {activeHeroMeta.hook}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => openScene(activeHero.id)} className="btn-primary">
                        Buka adegan
                        <ArrowRight className="ml-1.5 h-4 w-4" />
                      </button>
                      <Link href="/stories" className="btn-ghost">
                        Turun ke grid novel
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-500">Slide aktif</div>
                      <div className="mt-1 inline-flex items-center gap-1 text-base text-ink-100">
                        <Radio className="h-4 w-4 text-ink-400" />
                        {activeSpotlight + 1} / {spotlightChars.length}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-500">Rak novel</div>
                      <div className="mt-1 text-base text-ink-100">{visibleStories.length > 0 ? `${visibleStories.length} judul tampil` : 'siap diisi'}</div>
                    </div>
                    <div className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-500">Nada malam ini</div>
                      <div className="mt-1 text-base text-ink-100">
                        {activeHeroMeta.mood}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-8 rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-6 text-center">
              <p className="display text-2xl text-ink-100">Belum ada yang cocok.</p>
              <p className="mt-2 text-sm text-ink-500">Coba longgarkan filter, lalu biarkan raknya hidup lagi.</p>
            </div>
          )}
        </div>
      </section>

      <section className="sticky top-0 z-20 border-y border-white/[0.04] bg-[rgba(10,13,36,0.78)] px-6 pb-3 backdrop-blur-xl md:px-12">
        <div className="mx-auto max-w-6xl space-y-3 py-2.5">
          {/* Search + gender + filter toggle + surprise */}
          <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama, vibe, atau kata kunci..."
                className="w-full pl-9 pr-9 py-2 rounded-full bg-white/[0.04] border border-white/[0.08] text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-accent-400/50 focus:bg-white/[0.06] transition-colors"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-500 hover:text-ink-200 rounded-full transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.03] p-1 backdrop-blur">
              {([
                { key: 'all', label: 'All' },
                { key: 'F', label: '彼女' },
                { key: 'M', label: '彼' },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => selectFilter(t.key)}
                  className={cn(
                    'px-3.5 py-1.5 rounded-full text-xs font-medium transition-all',
                    filter === t.key
                      ? 'bg-accent-500/20 text-accent-100 shadow-inner'
                      : 'text-ink-400 hover:text-ink-200',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowFilters((s) => !s)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all',
                showFilters || vibe || ageBucket !== 'all'
                  ? 'border-accent-400/40 bg-accent-500/10 text-accent-200'
                  : 'border-white/[0.08] bg-white/[0.03] text-ink-400 hover:text-ink-200',
              )}
              aria-expanded={showFilters}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filter
              {(vibe || ageBucket !== 'all') && (
                <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-accent-400" aria-hidden />
              )}
            </button>

            <button
              type="button"
              onClick={handleSurprise}
              disabled={surprise.isPending || chars.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-accent-500/90 hover:bg-accent-500 text-white text-xs font-medium transition-all shadow-lg shadow-accent-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Acak satu karakter dan langsung masuk scene"
            >
              <Dices className={cn('w-3.5 h-3.5', surprise.isPending && 'animate-spin')} />
              {surprise.isPending ? 'Summoning...' : 'Surprise me'}
            </button>
          </div>

          {/* Collapsible: vibe + age chips */}
          {showFilters && (
            <div className="flex flex-col gap-2 pt-1 animate-fade-in">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mr-1">Vibe</span>
                {VIBE_OPTIONS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setVibe(vibe === v.key ? null : v.key)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all',
                      vibe === v.key
                        ? 'border-accent-400/40 bg-accent-500/15 text-accent-200'
                        : 'border-white/[0.07] bg-white/[0.02] text-ink-400 hover:text-ink-200 hover:border-white/[0.12]',
                    )}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mr-1">Age</span>
                {AGE_BUCKETS.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setAgeBucket(b.key)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all',
                      ageBucket === b.key
                        ? 'border-accent-400/40 bg-accent-500/15 text-accent-200'
                        : 'border-white/[0.07] bg-white/[0.02] text-ink-400 hover:text-ink-200 hover:border-white/[0.12]',
                    )}
                  >
                    {b.label}
                  </button>
                ))}
                {(vibe || ageBucket !== 'all' || query) && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="ml-2 text-[11px] text-ink-500 hover:text-ink-200 transition-colors underline-offset-4 hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}

          {surpriseError && (
            <p className="text-xs text-rose-400">
              {surpriseError === 'tier_limit'
                ? 'Session limit tercapai. Cek account.'
                : 'Gagal bikin scene. Coba lagi.'}
            </p>
          )}
        </div>
      </section>

      {!hasActiveSearch && (
        <section className="px-6 pb-14 pt-8 md:px-12 md:pb-16 md:pt-10">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-rose-200/78">
                  <BookOpen className="h-4 w-4 text-rose-200/78" />
                  Visual novel grid
                </p>
                <h2 className="display text-2xl text-ink-50 md:text-[2.5rem]">Turun ke rak cerita yang siap dibuka.</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-400 md:text-base">
                  Karakter tetap jadi slide di atas. Di bawah, cerita tampil sebagai grid supaya judul, cover, dan premisnya bisa dibaca cepat tanpa kehilangan suasana malamnya.
                </p>
              </div>
              <Link href="/stories" className="inline-flex items-center gap-1 text-sm text-ink-300 transition-colors hover:text-ink-50">
                Lihat semua novel
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {storiesQuery.isLoading && visibleStories.length === 0 ? (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="card min-h-[230px] animate-pulse-soft rounded-[28px] border-white/[0.06] bg-white/[0.03]" />
                ))}
              </div>
            ) : visibleStories.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {visibleStories.map((story, index) => (
                  <VisualNovelGridCard key={story.id} story={story} index={index} />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {STORY_PLACEHOLDERS.map((item) => (
                  <VisualNovelPlaceholderCard
                    key={item.href}
                    href={item.href}
                    title={item.title}
                    description={item.description}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Flat search results (bypass chapters when any filter active) */}
      {hasActiveSearch && (
        <section className="px-6 pb-14 pt-8 md:px-12 md:pb-16 md:pt-10">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-end justify-between mb-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-accent-400 mb-2">
                  Hasil pencarian · {visibleChars.length}
                </p>
                <h2 className="display text-2xl md:text-3xl tracking-tight text-ink-50">
                  {query ? <>Hasil untuk <span className="display-italic">&ldquo;{query}&rdquo;</span></> : 'Karakter terfilter'}
                </h2>
              </div>
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-ink-500 hover:text-ink-200 transition-colors underline-offset-4 hover:underline"
              >
                Clear
              </button>
            </div>
            {visibleChars.length === 0 ? (
              <div className="glass rounded-2xl p-10 text-center">
                <p className="display-italic text-lg text-ink-300 mb-2">Tidak ada yang cocok.</p>
                <p className="text-sm text-ink-500">Coba reset filter, atau gunakan kata kunci yang lebih luas.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {visibleChars.map((c, i) => {
                  const meta = POSTURE_MAP[c.tonePreset] ?? DEFAULT_META;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => router.push(`/chat?newScene=${c.id}`)}
                      className="card card-hover card-glow group text-left aspect-[4/5] relative animate-fade-up"
                      style={{ animationDelay: `${Math.min(i, 10) * 60}ms` }}
                    >
                      <Image
                        src={posterFor(c.id)}
                        alt=""
                        fill
                        className="object-cover opacity-80 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-700"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-transparent" />
                      <div className="absolute inset-0 p-5 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="chip-pink">{meta.mood}</span>
                          {c.gender && (
                            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-mono">
                              {c.gender === 'F' ? '彼女' : '彼'}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="display text-xl md:text-2xl leading-snug text-ink-50 mb-1.5">
                            {meta.tagline}
                          </div>
                          <p className="display-italic text-sm text-ink-300 mb-4 leading-relaxed">
                            {meta.hook}
                          </p>
                          <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
                            <span className="text-xs text-ink-400">
                              with <span className="text-ink-100 font-medium">{c.name}</span>
                              {c.age != null && <span className="text-ink-500"> · {c.age}</span>}
                            </span>
                            <ArrowRight className="w-4 h-4 text-accent-300 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* First-run onboarding overlay */}
      {showOnboarding && <DiscoverOnboarding onDismiss={() => setShowOnboarding(false)} />}
    </div>
  );
}
