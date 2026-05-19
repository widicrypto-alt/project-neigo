/**
 * MARINARA H3 — Per-scene backgrounds.
 *
 * Fixed-position layer with two sub-layers:
 *   1. Authored image (<img>) when backgroundUrl prop is set — PLANVNv2 BV3.
 *   2. CSS gradient driven by session.metadata.sceneState.location (always mounted).
 *
 * The gradient is the fallback when no image is set; when an image is set
 * the gradient acts as a vignette base so the text stays readable.
 * Whitelist-based so an untrusted location string can't punch through with
 * arbitrary CSS.
 */
'use client';

type Palette = { from: string; via: string; to: string };

const BG_MAP: Record<string, Palette> = {
  bedroom: { from: 'from-rose-950/25', via: 'via-rose-900/10', to: 'to-transparent' },
  kamar: { from: 'from-rose-950/25', via: 'via-rose-900/10', to: 'to-transparent' },
  cafe: { from: 'from-amber-950/25', via: 'via-amber-900/10', to: 'to-transparent' },
  'café': { from: 'from-amber-950/25', via: 'via-amber-900/10', to: 'to-transparent' },
  kafe: { from: 'from-amber-950/25', via: 'via-amber-900/10', to: 'to-transparent' },
  restaurant: { from: 'from-amber-950/25', via: 'via-amber-900/10', to: 'to-transparent' },
  park: { from: 'from-emerald-950/25', via: 'via-emerald-900/10', to: 'to-transparent' },
  taman: { from: 'from-emerald-950/25', via: 'via-emerald-900/10', to: 'to-transparent' },
  forest: { from: 'from-emerald-950/30', via: 'via-emerald-900/15', to: 'to-transparent' },
  beach: { from: 'from-sky-950/25', via: 'via-cyan-900/10', to: 'to-transparent' },
  pantai: { from: 'from-sky-950/25', via: 'via-cyan-900/10', to: 'to-transparent' },
  ocean: { from: 'from-sky-950/25', via: 'via-cyan-900/10', to: 'to-transparent' },
  street: { from: 'from-slate-950/25', via: 'via-slate-900/10', to: 'to-transparent' },
  jalan: { from: 'from-slate-950/25', via: 'via-slate-900/10', to: 'to-transparent' },
  school: { from: 'from-indigo-950/25', via: 'via-indigo-900/10', to: 'to-transparent' },
  sekolah: { from: 'from-indigo-950/25', via: 'via-indigo-900/10', to: 'to-transparent' },
  classroom: { from: 'from-indigo-950/25', via: 'via-indigo-900/10', to: 'to-transparent' },
  office: { from: 'from-slate-950/30', via: 'via-slate-900/10', to: 'to-transparent' },
  kantor: { from: 'from-slate-950/30', via: 'via-slate-900/10', to: 'to-transparent' },
  station: { from: 'from-zinc-950/30', via: 'via-zinc-900/10', to: 'to-transparent' },
  stasiun: { from: 'from-zinc-950/30', via: 'via-zinc-900/10', to: 'to-transparent' },
  shrine: { from: 'from-red-950/25', via: 'via-red-900/10', to: 'to-transparent' },
  kuil: { from: 'from-red-950/25', via: 'via-red-900/10', to: 'to-transparent' },
  rooftop: { from: 'from-violet-950/25', via: 'via-violet-900/10', to: 'to-transparent' },
  bar: { from: 'from-fuchsia-950/25', via: 'via-fuchsia-900/10', to: 'to-transparent' },
  club: { from: 'from-fuchsia-950/30', via: 'via-fuchsia-900/15', to: 'to-transparent' },
  hospital: { from: 'from-cyan-950/25', via: 'via-cyan-900/10', to: 'to-transparent' },
  rumahsakit: { from: 'from-cyan-950/25', via: 'via-cyan-900/10', to: 'to-transparent' },
};

/** Resolve palette by fuzzy-matching keyword tokens in the location string. */
export function resolveBg(location: string | undefined): Palette | null {
  if (!location) return null;
  const norm = location.toLowerCase().replace(/\s+/g, '');
  if (BG_MAP[norm]) return BG_MAP[norm]!;
  for (const key of Object.keys(BG_MAP)) {
    if (norm.includes(key)) return BG_MAP[key]!;
  }
  return null;
}

export interface SceneBackgroundProps {
  location: string | undefined;
  /** PLANVNv2 BV3 — authored background image URL from scene_card.background. */
  backgroundUrl?: string | null;
  /** True only for the first scene load; enables fetchpriority="high" on the image. */
  isOpening?: boolean;
}

export function SceneBackground({ location, backgroundUrl, isOpening }: SceneBackgroundProps) {
  const palette = resolveBg(location);

  // Honour prefers-reduced-data: skip image, gradient only.
  const saveData =
    typeof navigator !== 'undefined' &&
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

  const showImage = !!backgroundUrl && !saveData;

  if (!palette && !showImage) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      {/* Authored image layer */}
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={backgroundUrl!}
          alt=""
          fetchPriority={isOpening ? 'high' : 'auto'}
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
        />
      )}
      {/* Gradient layer — vignette when image present, full palette when absent */}
      {palette && (
        <div
          className={`absolute inset-0 bg-gradient-to-b ${palette.from} ${palette.via} ${palette.to} transition-opacity duration-1000${showImage ? ' opacity-60' : ''}`}
        />
      )}
      {/* Bottom scrim — keeps text readable regardless of image lightness */}
      {showImage && (
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-ink-950/80 to-transparent" />
      )}
    </div>
  );
}
