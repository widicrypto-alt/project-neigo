'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TierConfig, Tier } from '@neigo/shared';

interface TierResponse {
  tier: Tier;
  expiresAt: string | null;
  config: TierConfig;
  all: Record<Tier, TierConfig>;
  usage?: {
    sessions5h: number;
    turns5h: number;
    turnsWeek: number;
    resetAt5h: string;
    resetAtWeek: string;
  };
}

const TIER_LABEL: Record<Tier, string> = {
  FREE: 'Free',
  PREMIUM: 'Premium',
  PREMIUM_PLUS: 'Premium+',
  ENTERPRISE: 'Beta',
};

export default function AccountPage() {
  const tier = useQuery({ queryKey: ['tier'], queryFn: () => api.get<TierResponse>('/api/tier') });

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Account & Usage</h1>
        <p className="mt-2 text-ink-400">Your plan, usage, and limits.</p>
      </div>

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Usage & Limits</h2>
        {tier.isLoading && <div className="text-ink-400 text-sm">Loading...</div>}
        {tier.data && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-300">Current tier</span>
              <span className="font-mono text-accent-300">{TIER_LABEL[tier.data.tier] ?? 'Beta'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-300">Sessions / 5h</span>
              <span>
                {tier.data.usage?.sessions5h ?? 0}/{tier.data.config.maxSessionsPer5Hours === -1 ? '∞' : tier.data.config.maxSessionsPer5Hours}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-300">Turns / 5h</span>
              <span>
                {tier.data.usage?.turns5h ?? 0}/{tier.data.config.maxTurnsPer5Hours === -1 ? '∞' : tier.data.config.maxTurnsPer5Hours}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-300">Turns / week</span>
              <span>
                {tier.data.usage?.turnsWeek ?? 0}/{tier.data.config.maxTurnsPerWeek === -1 ? '∞' : tier.data.config.maxTurnsPerWeek}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-300">Turns/session</span>
              <span>{tier.data.config.maxTurnsPerSession === -1 ? '∞' : tier.data.config.maxTurnsPerSession}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-300">Max characters</span>
              <span>{tier.data.config.maxCharacters === -1 ? '∞' : tier.data.config.maxCharacters}</span>
            </div>
          </div>
        )}
      </section>

      <section className="card p-5">
        <div>
          <h2 className="font-semibold">Info</h2>
          <p className="mt-1 text-sm text-ink-400">
            Usage dihitung per jendela waktu. Angka di halaman ini sinkron dengan badge usage di Top bar.
          </p>
        </div>
      </section>
    </div>
  );
}
