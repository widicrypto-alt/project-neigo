'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';

interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    profileBio?: string | null;
    handle?: string | null;
    profileIsPublic?: boolean;
    profileAge?: number | null;
    profileGender?: string | null;
    profilePronouns?: string | null;
  };
}

const HANDLE_RE = /^[a-z0-9_]{3,40}$/;

export default function CreatorProfilePage() {
  const qc = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/api/auth/me'),
  });
  const me = meQuery.data?.user;

  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!me || hydrated) return;
    setHandle(me.handle ?? '');
    setBio(me.profileBio ?? '');
    setIsPublic(Boolean(me.profileIsPublic));
    setHydrated(true);
  }, [me, hydrated]);

  const save = useMutation({
    mutationFn: async () => {
      if (!me) throw new Error('not_authed');
      const normalized = handle.trim().toLowerCase();
      if (normalized && !HANDLE_RE.test(normalized)) {
        throw new Error('Handle harus 3–40 karakter huruf kecil, angka, atau garis bawah.');
      }
      return api.patch('/api/auth/profile', {
        displayName: me.displayName,
        profileAge: me.profileAge ?? null,
        profileGender: me.profileGender ?? null,
        profilePronouns: me.profilePronouns ?? null,
        profileBio: bio.trim() || null,
        handle: normalized || null,
        profileIsPublic: isPublic,
      });
    },
    onSuccess: async () => {
      setSaved(true);
      setHandleError(null);
      await qc.invalidateQueries({ queryKey: ['me'] });
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: unknown) => {
      setHandleError(userFacingApiMessage(err) ?? (err instanceof Error ? err.message : 'gagal'));
    },
  });

  const handlePreview = handle.trim().toLowerCase();
  const handleValid = handlePreview === '' || HANDLE_RE.test(handlePreview);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-400 hover:text-ink-100"
      >
        <ArrowLeft size={14} /> Back to settings
      </Link>

      <h1 className="font-display text-2xl text-ink-50">Creator profile</h1>
      <p className="mt-1 text-sm text-ink-400">
        Shown on character cards and your public page.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="mt-6 flex flex-col gap-5"
      >
        {/* Handle */}
        <div>
          <label className="block text-sm font-medium text-ink-200">Handle</label>
          <div
            className={cn(
              'mt-1 flex items-center rounded-token-md border bg-night-surface px-3',
              handleValid ? 'border-night-line' : 'border-red-500/60',
              'focus-within:border-violet-accent/70',
            )}
          >
            <span className="pr-1 text-ink-400">@</span>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="your_handle_no_spaces"
              className="flex-1 bg-transparent py-2 text-sm text-ink-50 outline-none placeholder:text-ink-500"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <p className="mt-1 text-xs text-ink-400">
            3–40 characters, lowercase letters, numbers, or <code>_</code>. Leave empty to remove.
          </p>
          {handlePreview && handleValid ? (
            <p className="mt-1 text-xs text-ink-300">
              URL publik: <span className="text-violet-hot">/creators/{handlePreview}</span>
            </p>
          ) : null}
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-ink-200">Short bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={280}
            placeholder="Two sentences about your writing style."
            className="mt-1 w-full rounded-token-md border border-night-line bg-night-surface px-3 py-2 text-sm text-ink-50 placeholder:text-ink-500 focus:border-violet-accent/70 focus:outline-none"
          />
          <div className="mt-1 text-right text-[11px] text-ink-500">{bio.length}/280</div>
        </div>

        {/* Visibility toggle */}
        <label
          className={cn(
            'flex cursor-pointer items-center justify-between gap-3 rounded-token-md border p-3',
            isPublic ? 'border-violet-accent/60 bg-violet-accent/5' : 'border-night-line bg-night-surface',
          )}
        >
          <div className="flex items-center gap-3">
            {isPublic ? (
              <Eye size={16} className="text-violet-hot" />
            ) : (
              <EyeOff size={16} className="text-ink-400" />
            )}
            <div>
              <div className="text-sm font-medium text-ink-100">
                {isPublic ? 'Public creator profile' : 'Private profile'}
              </div>
              <div className="text-xs text-ink-400">
                When enabled, your public characters appear on <code>/creators/{handlePreview || 'handle'}</code>.
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5 accent-violet-hot"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
        </label>

        {handleError ? (
          <div className="rounded-token-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {handleError}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={save.isPending || !handleValid}
            className="inline-flex items-center gap-2 rounded-full bg-violet-accent px-5 py-2 text-sm font-medium text-ink-50 transition-fast ease-standard hover:bg-violet-hot disabled:opacity-60"
          >
            {save.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            Save
          </button>
          {saved ? (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-300">
              <CheckCircle2 size={14} /> Saved
            </span>
          ) : null}
          {me?.handle && me?.profileIsPublic ? (
            <Link
              href={`/creators/${me.handle}`}
              className="ml-auto text-sm text-ink-300 hover:text-ink-100"
            >
              View public page →
            </Link>
          ) : null}
        </div>
      </form>
    </div>
  );
}
