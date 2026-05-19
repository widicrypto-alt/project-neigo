'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <LoginPageContent />
    </Suspense>
  );
}

interface AuthMeUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  isFoundingReader?: boolean;
}

interface AuthResponse {
  user: AuthMeUser;
}

function LoginPageContent() {
  const params = useSearchParams();
  const charId = params.get('char');
  const nextPath = params.get('next');
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      let auth: AuthResponse;
      if (mode === 'login') {
        auth = await api.post<AuthResponse>('/api/auth/login', { email, password });
      } else {
        auth = await api.post<AuthResponse>('/api/auth/register', { email, password, displayName });
      }
      queryClient.setQueryData(['me'], { user: auth.user });
      await queryClient.invalidateQueries({ queryKey: ['me'] });

      const target = nextPath && nextPath.startsWith('/')
        ? nextPath
        : (charId ? `/chat?char=${charId}` : '/chat');

      // Use full navigation once after auth so middleware/server sees fresh cookie immediately.
      window.location.assign(target);
      return;
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Authentication failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6 relative">
      <Link
        href="/"
        className="absolute top-6 left-6 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-100 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="w-full max-w-md animate-fade-up">
        {/* Brand glyph */}
        <div className="flex justify-center mb-6">
          <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 via-accent-600 to-iris-500 shadow-glow flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" strokeWidth={2} />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="display text-3xl md:text-4xl tracking-tight text-ink-50">
            {mode === 'login' ? 'Welcome back' : 'Step inside'}
          </h1>
          <p className="display-italic text-sm text-ink-500 mt-2">
            {mode === 'login'
              ? 'Someone has been waiting.'
              : 'Your presence is about to arrive.'}
          </p>
        </div>

        <div className="card card-glow p-7">
          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && (
              <div>
                <label className="text-[11px] uppercase tracking-[0.14em] text-ink-500 font-medium mb-1.5 block">
                  Display name
                </label>
                <input
                  className="input"
                  placeholder="What should they call you?"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  minLength={1}
                />
              </div>
            )}
            <div>
              <label className="text-[11px] uppercase tracking-[0.14em] text-ink-500 font-medium mb-1.5 block">
                Email
              </label>
              <input
                type="email"
                className="input"
                placeholder="you@somewhere.still"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.14em] text-ink-500 font-medium mb-1.5 block">
                Password
              </label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 8 : 1}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
            {err && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-3 py-2">
                {err}
              </div>
            )}
            <button className="btn-primary w-full mt-2" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </span>
              ) : mode === 'login' ? (
                'Sign in'
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-white/[0.06] text-center">
            <button
              type="button"
              className="text-sm text-ink-400 hover:text-accent-300 transition-colors"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login'
                ? "New here? Create an account →"
                : "Already know the way? Sign in →"}
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-ink-600 mt-6 display-italic">
          By continuing you agree to respect the fiction.
        </p>
      </div>
    </div>
  );
}
