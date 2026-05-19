'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PresenceActivity, PresenceAffect } from '@/lib/presence';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AFFECT_GLOW: Record<PresenceAffect, string> = {
  neutral: '',
  curious: 'shadow-[0_0_28px_4px_rgba(139,92,246,0.35)]',
  empathetic: 'shadow-[0_0_28px_4px_rgba(236,72,153,0.35)]',
  confident: 'shadow-[0_0_28px_4px_rgba(251,191,36,0.30)]',
  vulnerable: 'shadow-[0_0_28px_4px_rgba(251,113,133,0.30)]',
  conflicted: 'shadow-[0_0_28px_4px_rgba(249,115,22,0.30)]',
  playful: 'shadow-[0_0_28px_4px_rgba(250,204,21,0.28)]',
  guarded: 'shadow-[0_0_28px_4px_rgba(148,163,184,0.15)]',
};

const DOT_COLOR: Record<PresenceActivity, string> = {
  idle: 'bg-emerald-400/80',
  listening: 'bg-sky-400/80',
  speaking: 'bg-pink-400 animate-pulse',
  thinking: 'bg-violet-400 animate-pulse',
  typing: 'bg-violet-300',
  success: 'bg-emerald-400',
  alert: 'bg-amber-400 animate-pulse',
  error: 'bg-rose-400',
};

const ACTIVITY_LABEL: Record<PresenceActivity, string> = {
  idle: 'Idle',
  listening: 'Listening',
  speaking: 'Replying',
  thinking: 'Thinking',
  typing: 'Typing…',
  success: 'Done',
  alert: 'Alert',
  error: 'Error',
};

// ---------------------------------------------------------------------------
// Spritesheet layout (kept for characters using 4x3 sheets like Kaia)
// ---------------------------------------------------------------------------

const BASE_FRAME: Record<PresenceActivity, number> = {
  idle: 0,
  listening: 1,
  speaking: 2,
  thinking: 6,
  typing: 7,
  success: 8,
  alert: 9,
  error: 10,
};

function resolveFrame(activity: PresenceActivity, affect: PresenceAffect): number {
  if (activity === 'speaking') {
    if (affect === 'confident' || affect === 'conflicted' || affect === 'guarded') return 5;
    return 2;
  }
  if (activity === 'thinking') {
    if (affect === 'vulnerable' || affect === 'conflicted') return 4;
    return 6;
  }
  if (activity === 'idle' && (affect === 'guarded' || affect === 'conflicted')) return 3;
  return BASE_FRAME[activity] ?? 0;
}

const ACTIVITY_MOTION: Record<PresenceActivity, string> = {
  idle: 'sprite-motion-breathe',
  listening: 'sprite-motion-breathe',
  speaking: 'sprite-motion-speak',
  thinking: 'sprite-motion-thinking',
  typing: 'sprite-motion-typing',
  success: 'sprite-motion-success',
  alert: 'sprite-motion-alert',
  error: 'sprite-motion-error',
};

// ---------------------------------------------------------------------------
// FSM Types & Image Loading
//
// Asset set (FIXED): idle.png, speaking.png, thinking.png,
//                     blink_half.png, blink_closed.png
// ---------------------------------------------------------------------------

type MainState = 'idle' | 'speaking' | 'thinking';
type BlinkPhase = 'none' | 'half' | 'closed';
type FsmImageKey = 'idle' | 'speaking' | 'thinking' | 'blink_half' | 'blink_closed';
type FsmImages = Record<FsmImageKey, string>;

const FSM_IMAGE_KEYS: FsmImageKey[] = [
  'idle',
  'speaking',
  'thinking',
  'blink_half',
  'blink_closed',
];

function activityToMainState(activity: PresenceActivity): MainState {
  if (activity === 'speaking') return 'speaking';
  if (activity === 'thinking') return 'thinking';
  return 'idle';
}

function getSpriteBaseDir(spriteSheetUrl?: string | null): string | null {
  if (!spriteSheetUrl) return null;
  const normalized = spriteSheetUrl.replace(/\?.*$/, '');
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? null : normalized.slice(0, idx);
}

// Negative cache: prevents re-checking URLs that already 404'd.
const _imageNotFoundCache = new Set<string>();

function imageExists(url: string): Promise<boolean> {
  if (_imageNotFoundCache.has(url)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => {
      _imageNotFoundCache.add(url);
      resolve(false);
    };
    img.src = url;
  });
}

async function loadFsmImages(baseDir: string): Promise<FsmImages | null> {
  const results = await Promise.all(
    FSM_IMAGE_KEYS.map(async (key) => {
      // Prefer WebP (~90% smaller than source PNG) with PNG fallback.
      // See ops/scripts/sprite-budget.sh + FRONTEND.md §10.3.
      const webp = `${baseDir}/${key}.webp`;
      if (await imageExists(webp)) return [key, webp] as const;
      const png = `${baseDir}/${key}.png`;
      return (await imageExists(png)) ? ([key, png] as const) : null;
    }),
  );
  const entries = results.filter(Boolean) as [FsmImageKey, string][];
  if (!entries.find(([k]) => k === 'idle')) return null;
  const partial = Object.fromEntries(entries) as Partial<FsmImages>;
  return {
    idle: partial.idle!,
    speaking: partial.speaking ?? partial.idle!,
    thinking: partial.thinking ?? partial.idle!,
    blink_half: partial.blink_half ?? partial.idle!,
    blink_closed: partial.blink_closed ?? partial.idle!,
  };
}

// ---------------------------------------------------------------------------
// Sprite Engine Hook
//
// FSM: MAIN_STATE in { idle, speaking, thinking }
//      OVERLAY    in { none, blink_half, blink_closed }
//
// Render rule:  OVERLAY != none -> render(OVERLAY)
//               else            -> render(MAIN_STATE)
//
// Priority: overlay (blink) > main transition > micro-interrupt > idle timers
// ---------------------------------------------------------------------------

interface SpriteEngineOutput {
  imageUrl: string;
  mainState: MainState;
  blinkPhase: BlinkPhase;
  /** Toggles 0/1 to force a subtle CSS re-trigger on fake-refresh */
  refreshTick: number;
}

function useSpriteEngine(
  activity: PresenceActivity,
  images: FsmImages | null,
): SpriteEngineOutput {
  const targetMain = activityToMainState(activity);

  const [mainState, setMainState] = useState<MainState>('idle');
  const [blinkPhase, setBlinkPhase] = useState<BlinkPhase>('none');
  const [frozen, setFrozen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const mainRef = useRef(mainState);
  const frozenRef = useRef(frozen);
  const targetRef = useRef(targetMain);

  useEffect(() => { mainRef.current = mainState; }, [mainState]);
  useEffect(() => { frozenRef.current = frozen; }, [frozen]);
  useEffect(() => { targetRef.current = targetMain; }, [targetMain]);

  // -- Main State Transitions (event-driven, strict) ----------------------
  useEffect(() => {
    if (frozen) return;
    if (targetMain === mainState) return;

    // 25% chance to skip thinking (stay idle until speaking arrives)
    if (targetMain === 'thinking' && mainState === 'idle' && Math.random() < 0.25) {
      return;
    }

    setMainState(targetMain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMain, frozen]);

  // -- Blink Scheduler (independent, highest-priority overlay) ------------
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      const delay = 3000 + Math.random() * 3000; // 3-6s
      timer = setTimeout(runBlink, delay);
    }

    function runBlink() {
      if (cancelled) return;

      // 40% skip during speaking
      if (mainRef.current === 'speaking' && Math.random() < 0.4) {
        scheduleNext();
        return;
      }

      // Atomic sequence: half -> closed -> half -> restore
      setBlinkPhase('half');
      timer = setTimeout(() => {
        if (cancelled) return;
        setBlinkPhase('closed');
        timer = setTimeout(() => {
          if (cancelled) return;
          setBlinkPhase('half');
          timer = setTimeout(() => {
            if (cancelled) return;
            setBlinkPhase('none');
            scheduleNext();
          }, 70 + Math.random() * 20); // 70-90ms
        }, 90 + Math.random() * 30); // 90-120ms
      }, 70 + Math.random() * 20); // 70-90ms
    }

    scheduleNext();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []); // stable -- uses refs

  // -- Idle Hold Micro-Interrupt (freeze 1-2s every 5-10s) ----------------
  useEffect(() => {
    if (mainState !== 'idle') {
      setFrozen(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    function scheduleFreeze() {
      const delay = 5000 + Math.random() * 5000; // 5-10s
      timer = setTimeout(() => {
        if (cancelled) return;
        setFrozen(true);
        const hold = 1000 + Math.random() * 1000; // 1-2s
        timer = setTimeout(() => {
          if (cancelled) return;
          setFrozen(false);
          scheduleFreeze();
        }, hold);
      }, delay);
    }

    scheduleFreeze();
    return () => { cancelled = true; clearTimeout(timer); setFrozen(false); };
  }, [mainState]);

  // -- Fake Refresh Micro-Interrupt (15% re-render idle, no state change) -
  useEffect(() => {
    if (mainState !== 'idle') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    function schedule() {
      const delay = 6000 + Math.random() * 8000; // 6-14s
      timer = setTimeout(() => {
        if (cancelled) return;
        if (mainRef.current === 'idle' && Math.random() < 0.15) {
          setRefreshTick((t) => (t === 0 ? 1 : 0));
        }
        schedule();
      }, delay);
    }

    schedule();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mainState]);

  // -- Speaking Cut Micro-Interrupt (20% brief flash to idle) -------------
  useEffect(() => {
    if (mainState !== 'speaking') return;
    if (Math.random() >= 0.2) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const cutDelay = 800 + Math.random() * 2000; // 0.8-2.8s

    timer = setTimeout(() => {
      if (cancelled || mainRef.current !== 'speaking') return;
      setMainState('idle');
      timer = setTimeout(() => {
        if (cancelled) return;
        if (targetRef.current === 'speaking') setMainState('speaking');
      }, 150 + Math.random() * 200); // 150-350ms
    }, cutDelay);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [mainState]);

  // -- Resolve current image ----------------------------------------------
  const fallback = images?.idle ?? '';
  let imageUrl: string;
  if (blinkPhase === 'half') {
    imageUrl = images?.blink_half ?? fallback;
  } else if (blinkPhase === 'closed') {
    imageUrl = images?.blink_closed ?? fallback;
  } else {
    imageUrl = images?.[mainState] ?? fallback;
  }

  return { imageUrl, mainState, blinkPhase, refreshTick };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type SpriteRenderMode = 'manifest' | 'fsm' | 'spritesheet' | 'avatar' | 'placeholder';

export interface WaifuSpriteProps {
  activity: PresenceActivity;
  affect: PresenceAffect;
  spriteSheetUrl?: string | null;
  avatarUrl?: string | null;
  characterName?: string | null;
  compact?: boolean;
  fill?: boolean;
  className?: string;
  /** Emotion→URL map from sprite-manifest API (expressions slot). */
  spriteManifest?: Record<string, string> | null;
  /** Currently detected emotion from LLM output (content-detect). */
  detectedEmotion?: string | null;
}

function spritesheetStyle(frame: number, url: string): React.CSSProperties {
  const col = frame % 4;
  const row = Math.floor(frame / 4);
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: '400% 300%',
    backgroundPosition: `${(col / 3) * 100}% ${row * 50}%`,
    imageRendering: 'pixelated',
  };
}

export default function WaifuSprite({
  activity,
  affect,
  spriteSheetUrl,
  avatarUrl,
  characterName,
  compact = false,
  fill = false,
  className = '',
  spriteManifest,
  detectedEmotion,
}: WaifuSpriteProps) {
  const spriteBaseDir = useMemo(() => getSpriteBaseDir(spriteSheetUrl), [spriteSheetUrl]);

  // -- Spritesheet validation (for characters that still use sheets) ------
  const [resolvedSpriteSheetUrl, setResolvedSpriteSheetUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!spriteSheetUrl) {
      setResolvedSpriteSheetUrl(null);
      return;
    }
    let cancelled = false;
    const baseDir = spriteBaseDir;
    const tryLoad = (url: string, onFail: () => void) => {
      const img = new Image();
      img.onload = () => { if (!cancelled) setResolvedSpriteSheetUrl(url); };
      img.onerror = () => { if (!cancelled) onFail(); };
      img.src = url;
    };

    void (async () => {
      if (baseDir) {
        const hasFsmIdle =
          (await imageExists(`${baseDir}/idle.webp`)) ||
          (await imageExists(`${baseDir}/idle.png`));
        if (hasFsmIdle) {
          if (!cancelled) setResolvedSpriteSheetUrl(null);
          return;
        }
      }

      // Prefer WebP sibling (e.g. sheet.webp) to cut bandwidth ~90% vs source PNG.
      const webpCandidate = spriteSheetUrl.replace(/\.(png|jpg|jpeg)(\?.*)?$/i, '.webp$2');
      if (webpCandidate !== spriteSheetUrl) {
        tryLoad(webpCandidate, () => tryLoad(spriteSheetUrl, () => setResolvedSpriteSheetUrl(null)));
      } else {
        tryLoad(spriteSheetUrl, () => setResolvedSpriteSheetUrl(null));
      }
    })();

    return () => { cancelled = true; };
  }, [spriteBaseDir, spriteSheetUrl]);

  // -- FSM image loading --------------------------------------------------
  const [fsmImages, setFsmImages] = useState<FsmImages | null>(null);

  useEffect(() => {
    if (!spriteBaseDir) { setFsmImages(null); return; }
    let cancelled = false;
    loadFsmImages(spriteBaseDir).then((loaded) => {
      if (!cancelled) setFsmImages(loaded);
    });
    return () => { cancelled = true; };
  }, [spriteBaseDir]);

  // -- Avatar fallback ----------------------------------------------------
  const normalizedName = (characterName ?? '').trim().toLowerCase();
  const effectiveAvatarUrl =
    avatarUrl ?? (normalizedName === 'changli' ? '/live2d/changli/icon.png' : null);

  // -- Manifest sprite resolution -----------------------------------------
  // Priority: detectedEmotion → 'neutral' fallback → skip manifest mode
  const manifestUrl = useMemo(() => {
    if (!spriteManifest || Object.keys(spriteManifest).length === 0) return null;
    const key = detectedEmotion && spriteManifest[detectedEmotion]
      ? detectedEmotion
      : spriteManifest['neutral']
        ? 'neutral'
        : null;
    return key ? spriteManifest[key] ?? null : null;
  }, [spriteManifest, detectedEmotion]);

  // Preload idle (neutral) and speaking (happy/smug) from manifest on mount
  useEffect(() => {
    if (!spriteManifest) return;
    const critical = ['neutral', 'happy', 'surprised'].flatMap((k) => spriteManifest[k] ? [spriteManifest[k]] : []);
    for (const url of critical.slice(0, 3)) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      document.head.appendChild(link);
    }
  // Only run once per manifest reference
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spriteManifest]);

  // Manifest crossfade state
  const [manifestFront, setManifestFront] = useState('');
  const [manifestBack, setManifestBack] = useState('');
  const [showManifestFront, setShowManifestFront] = useState(true);

  useEffect(() => {
    if (!manifestUrl) return;
    if (!manifestFront && !manifestBack) {
      setManifestFront(manifestUrl);
      setShowManifestFront(true);
      return;
    }
    const visible = showManifestFront ? manifestFront : manifestBack;
    if (visible === manifestUrl) return;
    if (showManifestFront) {
      setManifestBack(manifestUrl);
      requestAnimationFrame(() => setShowManifestFront(false));
    } else {
      setManifestFront(manifestUrl);
      requestAnimationFrame(() => setShowManifestFront(true));
    }
  }, [manifestUrl, showManifestFront, manifestFront, manifestBack]);

  // -- Render mode (manifest > FSM > spritesheet > avatar > placeholder) --
  const renderMode: SpriteRenderMode = manifestUrl
    ? 'manifest'
    : fsmImages
      ? 'fsm'
      : resolvedSpriteSheetUrl
        ? 'spritesheet'
        : effectiveAvatarUrl
          ? 'avatar'
          : 'placeholder';

  // -- FSM engine ---------------------------------------------------------
  const engine = useSpriteEngine(activity, fsmImages);

  // -- Spritesheet frame (for sheet mode) ---------------------------------
  const frame = resolveFrame(activity, affect);

  // -- Emotion smoothing (for glow) ---------------------------------------
  const [emotionState, setEmotionState] = useState<PresenceAffect>(affect);
  useEffect(() => {
    if (affect === emotionState) return;
    const timer = setTimeout(() => setEmotionState(affect), 600);
    return () => clearTimeout(timer);
  }, [affect, emotionState]);

  // -- Visual tokens ------------------------------------------------------
  const glow = AFFECT_GLOW[emotionState] ?? '';
  const dotColor = DOT_COLOR[activity] ?? 'bg-emerald-400/80';
  const label = ACTIVITY_LABEL[activity];

  const motionClass =
    renderMode === 'fsm'
      ? engine.mainState === 'speaking'
        ? 'sprite-fsm-speak'
        : engine.mainState === 'thinking'
          ? 'sprite-fsm-think'
          : 'sprite-fsm-breathe'
      : ACTIVITY_MOTION[activity] ?? 'sprite-motion-breathe';

  const containerClass = compact
    ? ''
    : fill
      ? 'w-full h-full flex items-start justify-center'
      : '';
  const frameSizeClass = compact
    ? 'w-10 h-10 rounded-xl'
    : fill
      ? 'w-full max-w-[19rem] aspect-[3/4] rounded-[2rem]'
      : 'w-44 aspect-[3/4] rounded-2xl';
  const frameTransformClass = fill ? 'scale-100' : '';

  // -- Crossfade layers for FSM -------------------------------------------
  const [fsmFront, setFsmFront] = useState('');
  const [fsmBack, setFsmBack] = useState('');
  const [showFsmFront, setShowFsmFront] = useState(true);

  useEffect(() => {
    if (renderMode !== 'fsm' || !engine.imageUrl) return;

    if (!fsmFront && !fsmBack) {
      setFsmFront(engine.imageUrl);
      setShowFsmFront(true);
      return;
    }

    const visible = showFsmFront ? fsmFront : fsmBack;
    if (visible === engine.imageUrl) return;

    if (showFsmFront) {
      setFsmBack(engine.imageUrl);
      requestAnimationFrame(() => setShowFsmFront(false));
    } else {
      setFsmFront(engine.imageUrl);
      requestAnimationFrame(() => setShowFsmFront(true));
    }
  }, [engine.imageUrl, renderMode, showFsmFront, fsmFront, fsmBack]);

  return (
    <div
      className={`flex flex-col items-center ${compact ? 'gap-0' : fill ? 'gap-0' : 'gap-2'} ${fill ? 'w-full h-full' : ''} ${className}`}
    >
      {/* -- Sprite frame -- */}
      <div className={containerClass}>
        <div
          className={`relative overflow-hidden border-0 bg-ink-900 transition-shadow duration-500 ${frameSizeClass} ${fill ? 'mx-auto shadow-[0_30px_80px_-40px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.06]' : ''} ${!fill ? 'border border-white/[0.07]' : ''} ${glow}`}
        >
          {/* -- Manifest mode (emotion-keyed CDN sprite) -- */}
          {renderMode === 'manifest' && (
            <div
              className={`absolute inset-0 transition-[transform,filter] duration-300 will-change-transform ${motionClass} ${frameTransformClass}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={manifestFront || manifestUrl || ''}
                alt={characterName ?? 'Character'}
                fetchPriority="high"
                className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-180 ${showManifestFront ? 'opacity-100' : 'opacity-0'}`}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={manifestBack || ''}
                alt={characterName ?? 'Character'}
                loading="lazy"
                className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-180 ${showManifestFront ? 'opacity-0' : 'opacity-100'}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/70 via-transparent to-transparent pointer-events-none" />
            </div>
          )}

          {/* -- FSM mode -- */}
          {renderMode === 'fsm' && (
            <div
              key={engine.refreshTick}
              className={`absolute inset-0 transition-[transform,filter] duration-300 will-change-transform ${motionClass} ${frameTransformClass}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fsmFront || engine.imageUrl}
                alt={characterName ?? 'Character'}
                fetchPriority="high"
                className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-200 ${showFsmFront ? 'opacity-100' : 'opacity-0'}`}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fsmBack || engine.imageUrl}
                alt={characterName ?? 'Character'}
                loading="lazy"
                className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-200 ${showFsmFront ? 'opacity-0' : 'opacity-100'}`}
              />
            </div>
          )}

          {/* -- Spritesheet mode -- */}
          {renderMode === 'spritesheet' && resolvedSpriteSheetUrl && (
            <div
              className={`absolute inset-0 transition-[background-position,transform,filter] duration-300 will-change-transform ${ACTIVITY_MOTION[activity] ?? 'sprite-motion-breathe'} ${frameTransformClass}`}
              style={spritesheetStyle(frame, resolvedSpriteSheetUrl)}
            />
          )}

          {/* -- Avatar mode -- */}
          {renderMode === 'avatar' && effectiveAvatarUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={effectiveAvatarUrl}
                alt={characterName ?? 'Character'}
                loading="lazy"
                className={`absolute inset-0 w-full h-full object-cover object-top transition-[opacity,transform,filter] duration-500 will-change-transform ${ACTIVITY_MOTION[activity] ?? 'sprite-motion-breathe'} ${frameTransformClass}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/78 via-transparent to-white/[0.02] pointer-events-none" />
            </>
          )}

          {/* -- Placeholder mode -- */}
          {renderMode === 'placeholder' && (
            <PlaceholderFrame activity={activity} compact={compact} />
          )}

          {/* -- Dev overlay -- */}
          {process.env.NODE_ENV === 'development' && (
            <div className="absolute top-1.5 left-1.5 rounded-md border border-white/10 bg-ink-950/80 px-1.5 py-0.5 font-mono text-[9px] text-ink-300 backdrop-blur-sm">
              {renderMode === 'manifest'
                ? `${detectedEmotion ?? 'neutral'} · manifest`
                : renderMode === 'fsm'
                  ? `${engine.mainState}${engine.blinkPhase !== 'none' ? ` [${engine.blinkPhase}]` : ''} · fsm`
                  : `f${frame + 1} · ${renderMode}`}
            </div>
          )}

          {/* -- Activity badge -- */}
          {!compact && !fill && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-ink-950/80 backdrop-blur-sm px-2.5 py-[3px] border border-white/[0.06]">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
              <span className="text-[10px] text-ink-200 tracking-wide whitespace-nowrap">{label}</span>
            </div>
          )}
        </div>
      </div>

      {/* -- Affect label -- */}
      {!compact && !fill && emotionState !== 'neutral' && (
        <p className="text-[10px] tracking-[0.15em] uppercase text-ink-500">{emotionState}</p>
      )}

      {/* -- Character name -- */}
      {!compact && !fill && characterName && (
        <p className="text-xs font-medium text-ink-300 tracking-wide">{characterName}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder (no asset)
// ---------------------------------------------------------------------------

function PlaceholderFrame({ activity, compact = false }: { activity: PresenceActivity; compact?: boolean }) {
  const isActive = activity === 'thinking' || activity === 'speaking' || activity === 'typing';
  const isError = activity === 'error';
  const isSuccess = activity === 'success';

  const borderColor = isActive
    ? 'border-violet-400/50'
    : isError
      ? 'border-rose-400/50'
      : isSuccess
        ? 'border-emerald-400/50'
        : 'border-ink-600/40';
  const bgColor = isActive
    ? 'bg-violet-500/8'
    : isError
      ? 'bg-rose-500/8'
      : isSuccess
        ? 'bg-emerald-500/8'
        : 'bg-ink-800/20';

  return (
    <div className={`absolute inset-0 flex flex-col items-center justify-center select-none ${compact ? 'gap-1.5' : 'gap-3'}`}>
      <div
        className={`${compact ? 'w-3.5 h-3.5 border' : 'w-12 h-12 border-2'} rounded-full transition-colors duration-500 ${borderColor} ${bgColor}`}
      />
      <div
        className={`${compact ? 'w-6 h-3 rounded-md' : 'w-20 h-9 rounded-xl'} border transition-colors duration-500 ${borderColor} ${bgColor}`}
      />
      {!compact && (
        <p className="text-[9px] text-ink-600 tracking-[0.2em] uppercase mt-1">No sprite</p>
      )}
    </div>
  );
}
