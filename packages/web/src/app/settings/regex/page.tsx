'use client';

/**
 * PLANv3 X2.5 — Regex scripts settings page.
 *
 * Minimal CRUD surface over the `/api/regex-scripts` endpoints.
 * Lists user-scoped scripts, supports create + patch (enabled toggle) + delete.
 * Per-character / preset scope scripts are managed from their respective
 * editors; this page shows USER-scope only so the list stays readable.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';

const PLACEMENTS = ['edit_input', 'edit_output', 'edit_process', 'edit_display'] as const;
type Placement = (typeof PLACEMENTS)[number];

interface RegexScript {
  id: string;
  userId: string;
  scope: 'character' | 'preset' | 'user';
  scopeId: string | null;
  name: string;
  findRegex: string;
  replaceString: string;
  placement: Placement;
  flags: string;
  enabled: boolean;
  orderIndex: number;
  createdAt: string;
}

interface ListResponse {
  scripts: RegexScript[];
}

const EMPTY_DRAFT = {
  name: '',
  findRegex: '',
  replaceString: '',
  placement: 'edit_output' as Placement,
  flags: 'g',
};

export default function RegexSettingsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['regex-scripts', 'user'],
    queryFn: () => api.get<ListResponse>('/api/regex-scripts?scope=user'),
  });
  const userScripts = useMemo(
    () => (list.data?.scripts ?? []).filter((s) => s.scope === 'user'),
    [list.data],
  );

  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (payload: typeof EMPTY_DRAFT) =>
      api.post('/api/regex-scripts', { ...payload, scope: 'user' }),
    onSuccess: () => {
      setShowNew(false);
      setDraft(EMPTY_DRAFT);
      setErrMsg(null);
      qc.invalidateQueries({ queryKey: ['regex-scripts', 'user'] });
    },
    onError: (err) => setErrMsg(userFacingApiMessage(err, 'Failed to create script.')),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/api/regex-scripts/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['regex-scripts', 'user'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.del(`/api/regex-scripts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['regex-scripts', 'user'] }),
  });

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 text-sm text-ink-400 hover:text-ink-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">Regex scripts</h1>
      <p className="mt-1 text-sm text-ink-400">
        Transform user input or character output with regex. Executed in order by placement.
      </p>

      <div className="mt-6 flex items-center justify-between">
        <span className="text-sm text-ink-300">
          {userScripts.length} active scripts for your account
        </span>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-ink-950 hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" />
          New script
        </button>
      </div>

      {showNew && (
        <div className="mt-4 space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name (e.g. Strip thinking tags)"
            className="w-full rounded-lg border border-white/[0.08] bg-transparent px-3 py-2 text-sm"
          />
          <input
            value={draft.findRegex}
            onChange={(e) => setDraft({ ...draft, findRegex: e.target.value })}
            placeholder="Regex (mis. <think>[\\s\\S]*?</think>)"
            className="w-full rounded-lg border border-white/[0.08] bg-transparent px-3 py-2 font-mono text-xs"
          />
          <input
            value={draft.replaceString}
            onChange={(e) => setDraft({ ...draft, replaceString: e.target.value })}
            placeholder="Replacement string (empty to delete matches)"
            className="w-full rounded-lg border border-white/[0.08] bg-transparent px-3 py-2 font-mono text-xs"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={draft.placement}
              onChange={(e) =>
                setDraft({ ...draft, placement: e.target.value as Placement })
              }
              className="rounded-lg border border-white/[0.08] bg-transparent px-3 py-2 text-sm"
            >
              {PLACEMENTS.map((p) => (
                <option key={p} value={p} className="bg-ink-950">
                  {p}
                </option>
              ))}
            </select>
            <input
              value={draft.flags}
              onChange={(e) => setDraft({ ...draft, flags: e.target.value })}
              placeholder="flags (g, gi, …)"
              className="rounded-lg border border-white/[0.08] bg-transparent px-3 py-2 text-sm font-mono"
            />
          </div>
          {errMsg && <p className="text-xs text-rose-300">{errMsg}</p>}
          <div className="flex gap-2">
            <button
              disabled={createMut.isPending || !draft.name || !draft.findRegex}
              onClick={() => createMut.mutate(draft)}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-ink-950 disabled:opacity-50"
            >
              {createMut.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setShowNew(false);
                setDraft(EMPTY_DRAFT);
                setErrMsg(null);
              }}
              className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-sm text-ink-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {list.isLoading && (
        <div className="mt-6 flex items-center gap-2 text-sm text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      <ul className="mt-6 space-y-2">
        {userScripts.map((s) => (
          <li
            key={s.id}
            className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
          >
            <label className="mt-0.5 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => toggleMut.mutate({ id: s.id, enabled: e.target.checked })}
                className="h-4 w-4 accent-accent"
              />
            </label>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-100">{s.name}</p>
              <p className="truncate font-mono text-[11px] text-ink-400">
                /{s.findRegex}/{s.flags} → &ldquo;{s.replaceString}&rdquo;
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-500">
                {s.placement}
              </p>
            </div>
            <button
              onClick={() => {
                if (confirm('Delete this script?')) deleteMut.mutate(s.id);
              }}
              className="text-ink-400 hover:text-rose-300"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
