'use client';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import Image from 'next/image';
import { posterFor } from '@/lib/poster';
import { useTypewriter } from '@/lib/useTypewriter';

export interface AdaptiveHeroPayload {
  // Featured character (primary mode).
  character?: {
    id: string;
    name: string;
    avatarUrl: string | null;
    tonePreset?: string;
  };
  // Literary line (from character_diary, schedule note, or static chapter).
  kicker?: string;
  title: string;
  subtitle?: string;
  jp?: string; // optional JP accent line
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
}

/**
 * Three-mode adaptive hero:
 *   guest         — chapter teaser + "Mulai baca"
 *   has-session   — last character + diary quote + "Lanjutkan" / "Baca diary"
 *   no-session    — featured story/character + "Mulai cerita baru"
 *
 * Consumers pass the resolved payload; selection logic lives in useAdaptiveHero.
 * D6: kicker renders with a typewriter effect (first-load only).
 */
export function AdaptiveHero({ payload }: { payload: AdaptiveHeroPayload }) {
  const reduce = useReducedMotion();
  const portraitSrc = payload.character?.avatarUrl ?? posterFor(payload.character?.id ?? payload.title);
  // D6: typewriter on kicker — one-shot, first mount only
  const typedKicker = useTypewriter(payload.kicker ?? '', 30, 300);

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative overflow-hidden rounded-token-xl border border-night-line bg-night-surface"
    >
      <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_220px] sm:gap-6 sm:p-7">
        <div className="flex flex-col justify-center gap-3">
          {payload.kicker ? (
            <span className="font-jp text-sm text-iris-300/90" aria-label={payload.kicker}>
              {typedKicker}
              {/* blinking cursor while typing */}
              {!reduce && typedKicker.length < payload.kicker.length && (
                <span aria-hidden className="animate-pulse-soft ml-0.5 inline-block h-3.5 w-px bg-iris-300/70 align-middle" />
              )}
            </span>
          ) : null}
          <h1 className="font-display text-3xl leading-tight text-ink-50 sm:text-4xl">
            {payload.title}
          </h1>
          {payload.jp ? (
            <div className="font-jp text-base italic text-ink-300">{payload.jp}</div>
          ) : null}
          {payload.subtitle ? (
            <p className="max-w-prose text-sm leading-relaxed text-ink-300 sm:text-base">
              {payload.subtitle}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={payload.primaryCta.href}
              className="rounded-full bg-violet-accent px-5 py-2.5 text-sm font-medium text-ink-50 transition-fast ease-standard hover:bg-violet-hot focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-hot"
            >
              {payload.primaryCta.label}
            </Link>
            {payload.secondaryCta ? (
              <Link
                href={payload.secondaryCta.href}
                className="rounded-full border border-night-line px-5 py-2.5 text-sm text-ink-200 transition-fast ease-standard hover:border-violet-accent/60 hover:text-ink-50"
              >
                {payload.secondaryCta.label}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="relative hidden aspect-[3/4] overflow-hidden rounded-token-lg border border-night-line bg-night-canvas sm:block">
          <Image
            src={portraitSrc}
            alt={payload.character?.name ?? payload.title}
            fill
            sizes="220px"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-night-surface/90 via-transparent to-transparent" />
          {payload.character ? (
            <div className="absolute inset-x-0 bottom-0 px-3 pb-3">
              <div className="font-display text-base text-ink-50">{payload.character.name}</div>
            </div>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}
