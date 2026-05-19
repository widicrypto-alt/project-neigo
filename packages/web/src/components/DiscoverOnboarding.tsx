'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Heart, Search, Sparkles, Users, X } from 'lucide-react';
import { api } from '@/lib/api';

interface Step {
  icon: typeof Sparkles;
  titleJp: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    titleJp: 'はじめまして',
    title: 'Selamat datang.',
    body: 'Project Neigo bukan chatbot. Setiap karakter punya suara, ingatan, dan cara diam yang beda. Pilih seseorang yang bikin kamu penasaran.',
  },
  {
    icon: Search,
    titleJp: '探す',
    title: 'Cari siapa yang cocok.',
    body: 'Pakai kolom pencarian di atas: nama, vibe, umur, atau gender. Kalau belum tahu mau apa, scroll aja pelan-pelan — mereka nggak kemana-mana.',
  },
  {
    icon: Users,
    titleJp: '誰かがいる',
    title: 'Ada yang lagi "hadir".',
    body: 'Bar kecil di atas menampilkan karakter yang vibe-nya lagi aktif jam ini. Rotasinya setiap 10 menit — kalau kelihatan, berarti dia ada.',
  },
  {
    icon: Heart,
    titleJp: '任せる',
    title: 'Atau biarkan takdir pilih.',
    body: 'Tombol "Surprise me" — acak satu karakter, langsung masuk scene tanpa setup. Cocok kalau kamu lagi males mikir.',
  },
];

interface DiscoverOnboardingProps {
  onDismiss: () => void;
}

export function DiscoverOnboarding({ onDismiss }: DiscoverOnboardingProps) {
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step]!;
  const Icon = current.icon;

  // Esc to dismiss
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss();
      if (e.key === 'ArrowRight' && !isLast) setStep((s) => s + 1);
      if (e.key === 'ArrowLeft' && step > 0) setStep((s) => s - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isLast]);

  async function dismiss() {
    setClosing(true);
    // Fire and forget — UI doesn't need to wait.
    api.patch('/api/auth/metadata', { onboardingCompleted: true }).catch(() => {});
    setTimeout(onDismiss, 180);
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink-950/80 backdrop-blur-md transition-opacity duration-200 ${
        closing ? 'opacity-0' : 'opacity-100 animate-fade-in'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="First-time tour"
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-5 right-5 p-2 rounded-full text-ink-400 hover:text-ink-100 hover:bg-white/[0.06] transition-colors"
        aria-label="Skip tour"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="max-w-md w-full glass rounded-3xl p-7 md:p-9 relative">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-xl bg-accent-500/15 text-accent-300 flex items-center justify-center">
            <Icon className="w-4 h-4" strokeWidth={1.8} />
          </div>
          <span className="text-[11px] uppercase tracking-[0.22em] text-ink-500 font-mono">
            {current.titleJp}
          </span>
        </div>

        <h2 className="display text-3xl md:text-4xl text-ink-50 leading-tight mb-3">
          {current.title}
        </h2>
        <p className="text-base text-ink-300 leading-relaxed mb-8">{current.body}</p>

        {/* Step dots */}
        <div className="flex items-center gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-6 bg-accent-400' : 'w-1.5 bg-white/[0.15] hover:bg-white/[0.25]'
              }`}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-ink-500 hover:text-ink-300 transition-colors"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="btn-outline text-sm"
              >
                Back
              </button>
            )}
            {isLast ? (
              <button type="button" onClick={dismiss} className="btn-primary text-sm">
                Let&apos;s start <ArrowRight className="w-4 h-4 ml-1.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="btn-primary text-sm"
              >
                Next <ArrowRight className="w-4 h-4 ml-1.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
