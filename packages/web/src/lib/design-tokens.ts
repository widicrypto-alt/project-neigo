/**
 * PLANBv5 D2 — Discover/home design tokens.
 *
 * Single source of truth for poster sizes and rail spacing. All poster
 * components and rails on /, /discover/*, and /stories/* should consume
 * these tokens instead of ad-hoc `w-[...]` / `h-[...]` Tailwind literals.
 *
 * Consumers can read the numeric values for inline styles or the Tailwind
 * utility strings for className composition.
 */

export type PosterSize = 'sm' | 'md' | 'lg' | 'xl';

export const POSTER_SIZES: Record<PosterSize, { w: number; h: number; className: string; sizesAttr: string }> = {
  // 2:3 portraits. Heights = w * 1.5.
  sm: { w: 120, h: 180, className: 'w-[120px] h-[180px]', sizesAttr: '120px' },
  md: { w: 152, h: 228, className: 'w-[152px] h-[228px]', sizesAttr: '(max-width: 640px) 45vw, 152px' },
  lg: { w: 200, h: 300, className: 'w-[200px] h-[300px]', sizesAttr: '(max-width: 640px) 60vw, 200px' },
  xl: { w: 280, h: 420, className: 'w-[280px] h-[420px]', sizesAttr: '(max-width: 640px) 78vw, 280px' },
};

export const RAIL_GAP = { tight: 'gap-2', normal: 'gap-3', loose: 'gap-4' } as const;
export type RailGap = keyof typeof RAIL_GAP;

export const RAIL_SNAP = 'snap-x snap-mandatory';

export const CARD_RADIUS = 'rounded-[12px]';
export const CARD_STROKE = 'border border-white/[0.08]';
export const CARD_GRADIENT_OVERLAY =
  'after:absolute after:inset-0 after:pointer-events-none after:bg-[linear-gradient(180deg,transparent_55%,rgba(7,8,15,0.82)_100%)]';
