'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, ExternalLink, Info, Key, Loader2, MessageCircle, ShieldAlert, Sparkles, ThumbsDown, ThumbsUp, Trash2, User as UserIcon, XCircle } from 'lucide-react';
import { BYOK_MODEL_CATALOG, type ByokModelEntry } from '@neigo/shared';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';

interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    profileAge?: number | null;
    profileGender?: string | null;
    profilePronouns?: string | null;
    profileBio?: string | null;
    metadata?: Record<string, unknown>;
  };
}

interface ByokLatencyEntry {
  model: string;
  count: number;
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  errors: number;
  lastError: { code: string; at: number } | null;
}

interface ByokStatus {
  hasKey: boolean;
  model: string | null;
  encryptionAvailable: boolean;
  catalog: ByokModelEntry[];
  byokTurnsToday?: number;
  latency?: ByokLatencyEntry[];
}

type Tab = 'persona' | 'preferences' | 'apikey';

const TIER_BADGE: Record<ByokModelEntry['tier'], string> = {
  free: 'Free',
  fast: 'Fast',
  smart: 'Smart',
  premium: 'Premium',
};

const TIER_COLOR: Record<ByokModelEntry['tier'], string> = {
  free: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  fast: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  smart: 'text-violet-400 border-violet-500/30 bg-violet-500/10',
  premium: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get('tab') === 'apikey' ? 'apikey' : 'persona',
  );

  // ── Persona ──────────────────────────────────────────────────────
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<MeResponse>('/api/auth/me') });
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [bio, setBio] = useState('');
  const [personaMsg, setPersonaMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!me.data?.user) return;
    setDisplayName(me.data.user.displayName ?? '');
    setAge(me.data.user.profileAge ? String(me.data.user.profileAge) : '');
    setGender(me.data.user.profileGender ?? '');
    setPronouns(me.data.user.profilePronouns ?? '');
    setBio(me.data.user.profileBio ?? '');
  }, [me.data]);

  const savePersona = useMutation({
    mutationFn: async () => {
      setPersonaMsg(null);
      return api.patch<MeResponse>('/api/auth/profile', {
        displayName: displayName.trim(),
        profileAge: age.trim() ? Number(age.trim()) : null,
        profileGender: gender.trim() || null,
        profilePronouns: pronouns.trim() || null,
        profileBio: bio.trim() || null,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      setPersonaMsg('Saved.');
    },
    onError: (err: unknown) => setPersonaMsg(userFacingApiMessage(err, 'Could not save persona.')),
  });

  // ── BYOK ─────────────────────────────────────────────────────────
  const byok = useQuery({
    queryKey: ['byok'],
    queryFn: () => api.get<ByokStatus>('/api/byok'),
  });

  const [byokKey, setByokKey] = useState('');
  const [byokModel, setByokModel] = useState('');
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [customSlug, setCustomSlug] = useState('');
  const [validateState, setValidateState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [validateError, setValidateError] = useState<string | null>(null);
  const [modelTab, setModelTab] = useState<'paid' | 'free'>('paid');
  const [orStatus, setOrStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');

  // Section C: BYOK fallback preference. Stored in users.metadata.byokFallback.
  // 'server' = fall back to server's default Hermes key (default)
  // 'free-hermes' = fall back to a free catalog Hermes via server key
  // 'off'    = surface the error to the user, no auto-retry
  type FallbackMode = 'server' | 'free-hermes' | 'off';
  const [fallbackMode, setFallbackMode] = useState<FallbackMode>('server');

  useEffect(() => {
    const raw = me.data?.user?.metadata?.byokFallback;
    if (raw === 'server' || raw === 'free-hermes' || raw === 'off') {
      setFallbackMode(raw);
    }
  }, [me.data]);

  const saveFallback = useMutation({
    mutationFn: (mode: FallbackMode) =>
      api.patch('/api/auth/metadata', { byokFallback: mode }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  // OpenRouter health ping — lightweight HEAD every 60 s
  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        await fetch('https://openrouter.ai/api/v1/models', { method: 'HEAD', signal: ctrl.signal });
        clearTimeout(timer);
        if (!cancelled) setOrStatus('ok');
      } catch {
        if (!cancelled) setOrStatus('error');
      }
    };
    void ping();
    const id = setInterval(() => void ping(), 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Pre-select model when status loads; sync tab to saved model's tier
  useEffect(() => {
    if (byok.data?.model) {
      setByokModel(byok.data.model);
      const saved = BYOK_MODEL_CATALOG.find((m) => m.id === byok.data?.model);
      setModelTab(saved?.tier === 'free' ? 'free' : 'paid');
    } else if (BYOK_MODEL_CATALOG[0]) {
      setByokModel(BYOK_MODEL_CATALOG[0].id);
    }
  }, [byok.data]);

  const saveByok = useMutation({
    mutationFn: () => {
      const model = customSlug.trim() || byokModel;
      return api.patch('/api/byok', { key: byokKey.trim(), model });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['byok'] });
      setByokKey('');
      setValidateState('idle');
    },
  });

  const removeByok = useMutation({
    mutationFn: () => api.del('/api/byok'),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['byok'] });
      setByokKey('');
      setValidateState('idle');
    },
  });

  // PLANv3 X2.2 — test the saved BYOK key (1-token ping, 5-min Redis cache).
  type ByokTestResult =
    | { ok: true; latencyMs: number; model: string; testedAt: string }
    | { ok: false; reason: 'invalid_key' | 'invalid_model' | 'timeout' | 'network_error' | 'openrouter_error'; message: string; testedAt: string };
  const [byokTestResult, setByokTestResult] = useState<ByokTestResult | null>(null);
  const byokTestMutation = useMutation({
    mutationFn: () => api.post<ByokTestResult>('/api/byok/test', {}),
    onSuccess: (data) => setByokTestResult(data),
    onError: (err: unknown) => {
      setByokTestResult({
        ok: false,
        reason: 'network_error',
        message: userFacingApiMessage(err, 'Test gagal.'),
        testedAt: new Date().toISOString(),
      });
    },
  });
  const BYOK_TEST_REASON_LABEL: Record<
    Exclude<ByokTestResult, { ok: true }>['reason'],
    string
  > = {
    invalid_key: 'Key rejected',
    invalid_model: 'Model unavailable',
    timeout: 'Timeout (>10s)',
    network_error: 'Connection failed',
    openrouter_error: 'OpenRouter error',
  };

  async function handleValidateAndSave() {
    const key = byokKey.trim();
    if (!key) return;
    setValidateState('loading');
    setValidateError(null);
    try {
      const res = await api.post<{ valid: boolean; error?: string }>('/api/byok/validate', { key });
      if (!res.valid) {
        setValidateState('error');
        setValidateError(res.error === 'invalid_key' ? 'Invalid or expired key.' : (res.error ?? 'Validation failed.'));
        return;
      }
      setValidateState('ok');
      setModelTab('paid'); // credits confirmed — show paid models
      // Auto-save after successful validation
      await saveByok.mutateAsync();
    } catch {
      setValidateState('error');
      setValidateError('Failed to connect to OpenRouter. Check your connection.');
    }
  }

  const selectedModelEntry = BYOK_MODEL_CATALOG.find((m) => m.id === byokModel);
  const visibleModels = BYOK_MODEL_CATALOG.filter((m) =>
    modelTab === 'paid' ? m.tier !== 'free' : m.tier === 'free',
  );

  // PLANDESIGNv1 §3.F — dirty detection drives the sticky save dock.
  const personaDirty =
    !!me.data?.user &&
    (displayName !== (me.data.user.displayName ?? '') ||
      age !== (me.data.user.profileAge ? String(me.data.user.profileAge) : '') ||
      gender !== (me.data.user.profileGender ?? '') ||
      pronouns !== (me.data.user.profilePronouns ?? '') ||
      bio !== (me.data.user.profileBio ?? ''));

  function resetPersona() {
    if (!me.data?.user) return;
    setDisplayName(me.data.user.displayName ?? '');
    setAge(me.data.user.profileAge ? String(me.data.user.profileAge) : '');
    setGender(me.data.user.profileGender ?? '');
    setPronouns(me.data.user.profilePronouns ?? '');
    setBio(me.data.user.profileBio ?? '');
    setPersonaMsg(null);
  }

  // Auto-summary line for the hero — a one-glance read of who you are to the model.
  const heroSummary = (() => {
    const parts: string[] = [];
    if (age) parts.push(`${age} ·`);
    if (gender) parts.push(gender);
    if (pronouns) parts.push(`(${pronouns})`);
    const head = parts.join(' ').trim();
    const tail = bio.trim().split(/\s+/).slice(0, 14).join(' ');
    if (!head && !tail) return 'Tell characters who you are — they’ll remember.';
    return [head, tail].filter(Boolean).join(' — ');
  })();

  return (
    <div className="p-6 md:p-10 max-w-3xl pb-32">
      {/* PLANDESIGNv1 §3.F — hero header with avatar + auto-summary. */}
      <div className="mb-7 flex items-start gap-4">
        <div className="relative h-16 w-16 shrink-0 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-accent-500/30 to-iris-500/20 grid place-items-center text-ink-50 font-display text-2xl uppercase">
          {me.data?.user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.data.user.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover rounded-2xl" />
          ) : (
            <span>{(displayName || me.data?.user?.email || '?').slice(0, 1)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent-400 font-medium">Persona</p>
          <h1 className="font-display text-2xl text-ink-50 mt-0.5">{displayName || me.data?.user?.email || 'You'}</h1>
          <p className="text-sm text-ink-400 mt-1 line-clamp-2">{heroSummary}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08] w-fit">
        {([['persona', 'You'], ['preferences', 'Preferences'], ['apikey', 'API & models']] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              tab === id
                ? 'bg-white/[0.1] text-ink-50 shadow-sm'
                : 'text-ink-400 hover:text-ink-200',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Persona tab ─────────────────────────────────────────── */}
      {tab === 'persona' && (
        <section className="card p-5 md:p-6 space-y-4">
          <div>
            <h2 className="font-semibold">You</h2>
            <p className="mt-1 text-xs text-ink-500">How characters address and remember you.</p>
          </div>

          <label className="block">
            <span className="text-sm text-ink-300">Name</span>
            <input className="input mt-1" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} placeholder="What should we call you?" />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm text-ink-300">Age <span className="text-ink-500">(optional)</span></span>
              <input className="input mt-1" value={age} onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="e.g. 24" />
            </label>
            <label className="block">
              <span className="text-sm text-ink-300">Gender <span className="text-ink-500">(optional)</span></span>
              <input className="input mt-1" value={gender} onChange={(e) => setGender(e.target.value)} maxLength={30} placeholder="Female / Male / Non-binary / your own" />
            </label>
          </div>

          <label className="block">
            <span className="text-sm text-ink-300">Pronouns</span>
            <input className="input mt-1" value={pronouns} onChange={(e) => setPronouns(e.target.value)} maxLength={40} placeholder="she/her, he/him, they/them, or your own" />
          </label>

          <label className="block">
            <span className="text-sm text-ink-300">Short bio</span>
            <textarea className="input mt-1 min-h-[120px] resize-y" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} placeholder="What you sound like, what you're here for, anything you want characters to remember." />
            <p className="mt-1 text-xs text-ink-500">{bio.length}/500</p>
          </label>

          {personaMsg && (
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-ink-200">{personaMsg}</div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button className="btn-primary" onClick={() => savePersona.mutate()} disabled={savePersona.isPending || !displayName.trim() || !personaDirty}>
              {savePersona.isPending ? 'Saving…' : 'Save changes'}
            </button>
            {personaDirty && (
              <button type="button" onClick={resetPersona} className="text-xs text-ink-500 hover:text-ink-300">
                Discard
              </button>
            )}
          </div>
        </section>
      )}

      {/* PLANDESIGNv1 §3.F — Preferences placeholder card. */}
      {tab === 'preferences' && (
        <section className="card p-5 md:p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-ink-50">Preferences</h2>
            <p className="mt-1 text-xs text-ink-500">Tone, content, and how the app behaves.</p>
          </div>

          <div className="rounded-xl border border-warmth-500/20 bg-warmth-500/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-warmth-300 shrink-0 mt-0.5" strokeWidth={1.8} />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink-100">Mature content</h3>
                <p className="mt-1 text-xs text-ink-400">
                  Adult themes are off by default. Age-gated controls are coming back in a future update — for now the toggle is locked while the moderation pass ships.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-night-surface2 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-600" /> Disabled in beta
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-iris-300 shrink-0 mt-0.5" strokeWidth={1.8} />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink-100">More controls coming</h3>
                <p className="mt-1 text-xs text-ink-400">
                  Reading speed, language preference, sound, and notification controls land here in a future release.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── API Key tab ─────────────────────────────────────────── */}
      {tab === 'apikey' && (
        <div className="space-y-5">
          {/* Hero card */}
          <div className="card p-5 md:p-6 border-accent-500/20 bg-gradient-to-br from-accent-500/5 to-iris-500/5">
            <div className="flex items-center gap-2.5 mb-3">
              <Key className="w-5 h-5 text-accent-300" />
              <h2 className="font-semibold text-ink-50">Bring your own key</h2>
            </div>
            <p className="text-sm text-ink-300 leading-relaxed">
              Connect your OpenRouter API key. Every request goes straight to OpenRouter on your
              key and your credits — limits follow OpenRouter’s policy, not ours.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-400">
              <span>✓ Pick from 300+ models (Claude, GPT, Gemini, Llama…)</span>
              <span>✓ Key stored encrypted (AES-256-GCM)</span>
              <span>✓ Never shared with any third party</span>
            </div>
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 text-xs text-accent-300 hover:text-accent-200 transition-colors"
            >
              No key yet? Create one at openrouter.ai <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* OR limit transparency card */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-4 space-y-2.5">
            <p className="text-xs font-medium text-ink-300 uppercase tracking-wide">Informasi Limit (OpenRouter)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
                <p className="text-xs text-ink-500 mb-0.5">Tanpa top-up kredit</p>
                <p className="text-sm font-semibold text-ink-100">~50 request / hari</p>
                <p className="text-xs text-ink-500 mt-0.5">untuk model gratis</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
                <p className="text-xs text-ink-500 mb-0.5">Dengan kredit ≥ $10 di OR</p>
                <p className="text-sm font-semibold text-emerald-300">~1000 request / hari</p>
                <p className="text-xs text-ink-500 mt-0.5">untuk model gratis</p>
              </div>
            </div>
            <p className="text-xs text-ink-600">
              These rates follow OpenRouter&apos;s policy and may change.
              Top up at{' '}
              <a href="https://openrouter.ai/credits" target="_blank" rel="noopener noreferrer" className="text-ink-400 hover:text-ink-200 underline underline-offset-2">
                openrouter.ai/credits
              </a>
              , not here.
            </p>
          </div>

          {/* Active key indicator */}
            {byok.data?.hasKey && (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-ink-100">Connected ✅ · Mode: BYOK (OpenRouter)</p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    Model:{' '}
                    <span className="text-ink-200">
                      {BYOK_MODEL_CATALOG.find((m) => m.id === byok.data?.model)?.label ?? byok.data?.model ?? '—'}
                    </span>
                    {' · '}
                    {typeof byok.data?.byokTurnsToday === 'number' && (
                      <span className="text-accent-300 font-medium">{byok.data.byokTurnsToday} turn hari ini</span>
                    )}
                    {typeof byok.data?.byokTurnsToday !== 'number' && (
                      <span className="text-ink-500">Limit mengikuti kebijakan OpenRouter</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeByok.mutate()}
                disabled={removeByok.isPending}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/25 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
              >
                <Trash2 className="w-3 h-3" />
                {removeByok.isPending ? 'Removing...' : 'Remove'}
              </button>
            </div>
          )}

          {/* PLANv3 X2.2 — Test saved BYOK key (1-token ping) */}
          {byok.data?.hasKey && (
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
              <button
                onClick={() => byokTestMutation.mutate()}
                disabled={byokTestMutation.isPending}
                className="flex items-center gap-1.5 text-xs text-ink-200 hover:text-accent-200 border border-white/[0.1] bg-white/[0.03] rounded-lg px-2.5 py-1.5 transition-colors shrink-0 disabled:opacity-50"
                title="Ping OpenRouter with max_tokens=1 to verify the saved key still works"
              >
                {byokTestMutation.isPending ? 'Testing…' : 'Test connection'}
              </button>
              {byokTestResult?.ok === true && (
                <span className="text-xs text-emerald-300">
                  ✓ {byokTestResult.latencyMs}ms ·{' '}
                  <span className="text-ink-400">
                    {new Date(byokTestResult.testedAt).toLocaleTimeString()}
                  </span>
                </span>
              )}
              {byokTestResult?.ok === false && (
                <span className="text-xs text-red-300">
                  ✗ {BYOK_TEST_REASON_LABEL[byokTestResult.reason]}
                  {byokTestResult.message && (
                    <span className="text-ink-500"> · {byokTestResult.message.slice(0, 80)}</span>
                  )}
                </span>
              )}
              {!byokTestResult && !byokTestMutation.isPending && (
                <span className="text-xs text-ink-500">
                  Kirim 1 token ke OpenRouter untuk verifikasi key masih aktif.
                </span>
              )}
            </div>
          )}

          {/* Key input + model picker */}
          {!byok.data?.encryptionAvailable && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-300">
              ⚠ BYOK belum dikonfigurasi di server. Hubungi admin untuk menambahkan <code className="font-mono text-xs">BYOK_ENCRYPTION_KEY</code>.
            </div>
          )}

          {byok.data?.encryptionAvailable && (
            <div className="card p-5 md:p-6 space-y-5">
              <div>
                <label className="block text-sm text-ink-300 mb-1.5">
                  {byok.data.hasKey ? 'Ganti API Key' : 'Masukkan API Key'}
                </label>
                <div className="relative">
                  <input
                    type="password"
                    className="input w-full pr-10 font-mono text-sm"
                    value={byokKey}
                    onChange={(e) => { setByokKey(e.target.value); setValidateState('idle'); }}
                    placeholder="sk-or-v1-••••••••••••••••••••••••••••••"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {validateState === 'ok' && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />}
                  {validateState === 'error' && <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />}
                  {validateState === 'loading' && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 animate-spin" />}
                </div>
                {validateState === 'error' && validateError && (
                  <p className="mt-1.5 text-xs text-red-400">{validateError}</p>
                )}
                <p className="mt-1.5 text-xs text-ink-500">
                  Format: <span className="font-mono">sk-or-v1-</span>... · Get yours at{' '}
                  <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-accent-400 hover:underline">
                    openrouter.ai/keys
                  </a>
                </p>
              </div>

              {/* Model picker */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <p className="text-sm text-ink-300">Select model</p>
                  <div className="flex rounded-lg border border-white/[0.07] overflow-hidden ml-2">
                    {(['paid', 'free'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setModelTab(t)}
                        className={cn(
                          'px-3 py-1 text-xs font-medium transition-colors',
                          modelTab === t ? 'bg-white/[0.1] text-ink-100' : 'text-ink-500 hover:text-ink-300',
                        )}
                      >
                        {t === 'paid' ? 'Berbayar' : 'Gratis'}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full transition-colors',
                        orStatus === 'ok' ? 'bg-emerald-400' :
                        orStatus === 'error' ? 'bg-red-400 animate-pulse' : 'bg-ink-700',
                      )}
                    />
                    <span className="text-[10px] text-ink-600">
                      {orStatus === 'ok' ? 'OR online' : orStatus === 'error' ? 'OR down?' : '…'}
                    </span>
                  </div>
                </div>
                <div className="grid gap-2">
                  {visibleModels.map((m) => {
                    const isSelected = byokModel === m.id;
                    const isExpanded = expandedModel === m.id;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          'rounded-xl border transition-all',
                          isSelected
                            ? 'border-accent-400/40 bg-accent-500/10'
                            : 'border-white/[0.07] bg-white/[0.02]',
                        )}
                      >
                        {/* Selectable row */}
                        <div
                          className="flex items-start gap-3 px-3.5 py-3 cursor-pointer"
                          onClick={() => setByokModel(m.id)}
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setByokModel(m.id); }}
                        >
                          <div
                            className={cn(
                              'mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 transition-colors',
                              isSelected ? 'border-accent-400 bg-accent-400' : 'border-ink-600',
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-ink-100">{m.label}</span>
                              {m.tier === 'free' ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-medium">Gratis</span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 font-medium">Berbayar</span>
                              )}
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium', TIER_COLOR[m.tier])}>
                                {TIER_BADGE[m.tier]}
                              </span>
                              {m.tags?.includes('recommended') && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-accent-400/40 bg-accent-500/15 text-accent-300 font-medium">Recommended</span>
                              )}
                              {m.tags?.includes('lenient') && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 font-medium">Lenient</span>
                              )}
                              {m.tags?.includes('uncensored') && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300 font-medium">Uncensored</span>
                              )}
                              {m.tags?.includes('nsfw-native') && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-300 font-medium">NSFW native</span>
                              )}
                              {m.tags?.includes('rp-trained') && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 font-medium">RP trained</span>
                              )}
                              <span className="text-[10px] text-ink-600">{m.contextK}K ctx</span>
                              {m.priceHint && (
                                <span className="text-[10px] text-ink-600">{m.priceHint}</span>
                              )}
                              {(() => {
                                const lat = byok.data?.latency?.find((l) => l.model === m.id);
                                if (!lat) return null;
                                const sec = (lat.avgMs / 1000).toFixed(1);
                                return (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded-full border border-ink-700/60 bg-ink-800/30 text-ink-400"
                                    title={`avg of last ${lat.count} calls · p90 ${(lat.p90Ms / 1000).toFixed(1)}s${lat.errors ? ` · ${lat.errors} errors` : ''}`}
                                  >
                                    ~{sec}s
                                  </span>
                                );
                              })()}
                            </div>
                            <p className="text-xs text-ink-500 mt-0.5 leading-relaxed line-clamp-2">{m.description}</p>
                          </div>
                          {/* Info toggle — separate from radio select */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedModel(isExpanded ? null : m.id);
                            }}
                            className={cn(
                              'shrink-0 p-1.5 rounded-lg transition-colors',
                              isExpanded
                                ? 'bg-white/[0.1] text-ink-200'
                                : 'text-ink-600 hover:text-ink-300 hover:bg-white/[0.05]',
                            )}
                            aria-label="Lihat pros & cons"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Expandable pros/cons */}
                        {isExpanded && (
                          <div className="px-3.5 pb-3.5 border-t border-white/[0.06] pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <ThumbsUp className="w-3 h-3 text-emerald-400" />
                                <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wide">Pros</span>
                              </div>
                              <ul className="space-y-1">
                                {m.pros.map((p, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-xs text-ink-400">
                                    <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                                    {p}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <ThumbsDown className="w-3 h-3 text-rose-400" />
                                <span className="text-[10px] font-medium text-rose-400 uppercase tracking-wide">Cons</span>
                              </div>
                              <ul className="space-y-1">
                                {m.cons.map((c, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-xs text-ink-400">
                                    <span className="text-rose-500 mt-0.5 shrink-0">✗</span>
                                    {c}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            {m.vibePreview && (
                              <div className="sm:col-span-2 mt-0.5 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <MessageCircle className="w-3 h-3 text-accent-400" />
                                  <span className="text-[10px] font-medium text-accent-400 uppercase tracking-wide">Vibe Preview</span>
                                </div>
                                {m.vibePreview.split('\n').map((line, i) => (
                                  <p key={i} className={cn('text-xs text-ink-400 leading-relaxed italic', i > 0 && 'mt-1')}>{line}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Advanced: Custom model slug */}
              <details className="group">
                <summary className="cursor-pointer text-xs text-ink-500 hover:text-ink-300 select-none transition-colors list-none flex items-center gap-1.5">
                  <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                  Model kustom (advanced)
                </summary>
                <div className="mt-3 space-y-3 pl-4 border-l border-white/[0.07]">
                  <p className="text-xs text-ink-500 leading-relaxed">
                    Gunakan slug model OpenRouter apa pun yang tidak ada di daftar di atas.
                    Cek slug yang valid di{' '}
                    <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="text-accent-400 hover:underline">openrouter.ai/models</a>.
                    Prompt style otomatis menggunakan default (Hermes-style).
                  </p>
                  <div>
                    <label className="block text-xs text-ink-400 mb-1">Model slug (leave empty to use the selection above)</label>
                    <input
                      className="input w-full font-mono text-sm"
                      value={customSlug}
                      onChange={(e) => setCustomSlug(e.target.value.trim())}
                      placeholder="provider/model-name:variant"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                  {customSlug && (
                    <p className="text-xs text-amber-400">⚠ Custom model: <span className="font-mono">{customSlug}</span> — make sure the slug is valid.</p>
                  )}
                </div>
              </details>

              {/* Save button */}
              <div className="pt-1 flex items-center gap-3">
                <button
                  className="btn-primary"
                  onClick={handleValidateAndSave}
                  disabled={!byokKey.trim() || validateState === 'loading' || saveByok.isPending || !byokModel}
                >
                  {validateState === 'loading' ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Validating...</>
                  ) : saveByok.isPending ? (
                    'Saving…'
                  ) : (
                    'Validate & Save'
                  )}
                </button>
                {selectedModelEntry && byokKey && (
                  <p className="text-xs text-ink-500">→ {selectedModelEntry.label}</p>
                )}
              </div>

              {/* Guide */}
              <details className="group">
                <summary className="cursor-pointer text-xs text-ink-500 hover:text-ink-300 select-none transition-colors list-none flex items-center gap-1.5">
                  <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                  How to get an OpenRouter key
                </summary>
                <ol className="mt-3 space-y-2 text-xs text-ink-400 pl-4 border-l border-white/[0.07]">
                  <li>1. Go to <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-accent-400 hover:underline">openrouter.ai</a> → sign up / log in</li>
                  <li>2. Click <strong className="text-ink-300">Keys</strong> in the navbar → <strong className="text-ink-300">Create Key</strong></li>
                  <li>3. Copy the key starting with <code className="font-mono bg-white/[0.05] px-1 rounded">sk-or-v1-...</code></li>
                  <li>4. (Optional) Top up ≥ $10 at OpenRouter for ~1000 req/day on free models</li>
                  <li>5. Paste it above → pick a model → click Connect</li>
                  <li>6. Done — requests go directly to OpenRouter using your own credits ✓</li>
                </ol>
              </details>
            </div>
          )}

          {/* Section C: Fallback chain — what to do if BYOK call fails */}
          {byok.data?.hasKey && (
            <div className="card p-5 md:p-6">
              <div className="flex items-start gap-2.5 mb-1.5">
                <Info className="w-4 h-4 text-ink-400 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-ink-100">Fallback otomatis</h3>
                  <p className="text-xs text-ink-500 leading-relaxed mt-0.5">
                    Kalau BYOK mu gagal (timeout / 401 / rate-limit), server bisa coba kirim ulang pakai jalur alternatif.
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {([
                  { id: 'server', label: 'Server default (Hermes)', desc: 'Pakai key server — tidak menghabiskan credit kamu. Transparan.' },
                  { id: 'free-hermes', label: 'Hermes :free', desc: 'Coba fallback ke model free tier lewat key server.' },
                  { id: 'off', label: 'Off', desc: 'Jangan retry — tampilkan error langsung.' },
                ] as const).map((opt) => {
                  const selected = fallbackMode === opt.id;
                  return (
                    <label
                      key={opt.id}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border px-3.5 py-2.5 cursor-pointer transition-colors',
                        selected
                          ? 'border-accent-400/40 bg-accent-500/10'
                          : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]',
                      )}
                    >
                      <input
                        type="radio"
                        name="byok-fallback"
                        className="mt-1 accent-accent-400"
                        checked={selected}
                        onChange={() => {
                          setFallbackMode(opt.id);
                          saveFallback.mutate(opt.id);
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink-100">{opt.label}</div>
                        <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Disclaimer footer */}
          <p className="text-xs text-ink-600 leading-relaxed pt-1">
            This app uses a third-party service (
            <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink-400">OpenRouter</a>
            ). Usage, limits, and billing follow OpenRouter’s policy in full. Top up credits directly
            at openrouter.ai — not here.
          </p>
        </div>
      )}

      {/* PLANDESIGNv1 §3.F — sticky save dock when persona is dirty. */}
      {tab === 'persona' && personaDirty && (
        <div className="fixed bottom-4 inset-x-0 z-30 flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-night-surface/95 backdrop-blur px-4 py-2.5 shadow-glow-soft">
            <UserIcon className="w-4 h-4 text-accent-300" />
            <span className="text-sm text-ink-200">Unsaved persona changes</span>
            <button
              type="button"
              onClick={resetPersona}
              className="text-xs text-ink-400 hover:text-ink-200 px-2"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => savePersona.mutate()}
              disabled={savePersona.isPending || !displayName.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-accent-500 to-iris-500 px-3 py-1.5 text-sm font-medium text-white shadow-glow-soft hover:shadow-glow disabled:opacity-50 transition-all"
            >
              {savePersona.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {savePersona.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
