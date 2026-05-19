'use client';

/**
 * Wk8 G1a — Personas settings page.
 *
 * Users manage a collection of {{user}} profiles here (name + optional
 * description/avatar). The persona flagged as default is auto-used in new
 * sessions; per-session overrides happen via the chat UI (G1b, FE work).
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';

interface Persona {
  id: string;
  userId: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  personas: Persona[];
}

interface EditingDraft {
  name: string;
  description: string;
  avatarUrl: string;
  isDefault: boolean;
}

const EMPTY_DRAFT: EditingDraft = {
  name: '',
  description: '',
  avatarUrl: '',
  isDefault: false,
};

export default function PersonasSettingsPage() {
  const qc = useQueryClient();
  const listQuery = useQuery({
    queryKey: ['personas'],
    queryFn: () => api.get<ListResponse>('/api/personas'),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditingDraft>(EMPTY_DRAFT);
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const personas = useMemo(() => listQuery.data?.personas ?? [], [listQuery.data]);

  useEffect(() => {
    if (!editingId) return;
    const row = personas.find((p) => p.id === editingId);
    if (!row) {
      setEditingId(null);
      return;
    }
    setDraft({
      name: row.name,
      description: row.description,
      avatarUrl: row.avatarUrl ?? '',
      isDefault: row.isDefault,
    });
  }, [editingId, personas]);

  const create = useMutation({
    mutationFn: (body: EditingDraft) =>
      api.post<{ persona: Persona }>('/api/personas', {
        name: body.name.trim(),
        description: body.description,
        avatarUrl: body.avatarUrl.trim() || null,
        isDefault: body.isDefault,
      }),
    onSuccess: () => {
      setMsg('Persona created.');
      setShowNew(false);
      setDraft(EMPTY_DRAFT);
      qc.invalidateQueries({ queryKey: ['personas'] });
    },
    onError: (e) => setMsg(userFacingApiMessage(e)),
  });

  const update = useMutation({
    mutationFn: (args: { id: string; body: EditingDraft }) =>
      api.patch<{ persona: Persona }>(`/api/personas/${args.id}`, {
        name: args.body.name.trim(),
        description: args.body.description,
        avatarUrl: args.body.avatarUrl.trim() || null,
        isDefault: args.body.isDefault,
      }),
    onSuccess: () => {
      setMsg('Saved.');
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['personas'] });
    },
    onError: (e) => setMsg(userFacingApiMessage(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/api/personas/${id}`),
    onSuccess: () => {
      setMsg('Deleted.');
      qc.invalidateQueries({ queryKey: ['personas'] });
    },
    onError: (e) => setMsg(userFacingApiMessage(e)),
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 text-slate-100">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/settings"
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> Settings
        </Link>
      </div>

      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Personas</h1>
          <p className="mt-1 text-sm text-slate-400">
            Who you are in the scene. The default persona fills <code className="px-1">{'{{user}}'}</code>{' '}
            and <code className="px-1">{'{{persona}}'}</code> in every new session.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowNew((v) => !v);
            setDraft(EMPTY_DRAFT);
            setMsg(null);
          }}
          className="inline-flex items-center gap-2 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm font-medium text-violet-200 hover:bg-violet-500/20"
        >
          <Plus className="h-4 w-4" /> New persona
        </button>
      </div>

      {msg && (
        <div className="mb-4 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-300">
          {msg}
        </div>
      )}

      {showNew && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            New persona
          </h2>
          <PersonaForm
            draft={draft}
            onChange={setDraft}
            onSubmit={() => create.mutate(draft)}
            onCancel={() => {
              setShowNew(false);
              setDraft(EMPTY_DRAFT);
            }}
            busy={create.isPending}
            submitLabel="Create"
          />
        </div>
      )}

      {listQuery.isLoading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading personas…
        </div>
      ) : personas.length === 0 ? (
        <p className="text-sm text-slate-500">
          No personas yet. Create one to personalize <code>{'{{user}}'}</code> in your chats.
        </p>
      ) : (
        <ul className="space-y-3">
          {personas.map((p) => {
            const isEditing = editingId === p.id;
            return (
              <li
                key={p.id}
                className={cn(
                  'rounded-lg border bg-slate-900/60 p-4 transition-colors',
                  p.isDefault
                    ? 'border-amber-500/40 shadow-[0_0_0_1px_rgba(245,158,11,0.15)]'
                    : 'border-slate-700',
                )}
              >
                {isEditing ? (
                  <PersonaForm
                    draft={draft}
                    onChange={setDraft}
                    onSubmit={() => update.mutate({ id: p.id, body: draft })}
                    onCancel={() => setEditingId(null)}
                    busy={update.isPending}
                    submitLabel="Save"
                  />
                ) : (
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-medium text-slate-100">{p.name}</h3>
                        {p.isDefault && (
                          <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                            <Star className="h-3 w-3" /> Default
                          </span>
                        )}
                      </div>
                      {p.description && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">
                          {p.description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(p.id)}
                        className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete persona "${p.name}"?`)) del.mutate(p.id);
                        }}
                        className="rounded-md border border-rose-500/30 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/10"
                        aria-label="Delete persona"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PersonaForm(props: {
  draft: EditingDraft;
  onChange: (next: EditingDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  submitLabel: string;
}) {
  const { draft, onChange, onSubmit, onCancel, busy, submitLabel } = props;
  const disabled = busy || draft.name.trim().length === 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onSubmit();
      }}
      className="space-y-3"
    >
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Name
        </span>
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          maxLength={80}
          placeholder="Haruki"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-violet-400"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Description <span className="text-slate-500">(injected as user profile)</span>
        </span>
        <textarea
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          maxLength={2000}
          rows={4}
          placeholder="25, Tokyo-based UX designer; quiet, dry humor…"
          className="w-full resize-y rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-violet-400"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Avatar URL <span className="text-slate-500">(optional)</span>
        </span>
        <input
          value={draft.avatarUrl}
          onChange={(e) => onChange({ ...draft, avatarUrl: e.target.value })}
          maxLength={500}
          placeholder="https://…"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-violet-400"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={draft.isDefault}
          onChange={(e) => onChange({ ...draft, isDefault: e.target.checked })}
          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-violet-500 focus:ring-violet-500"
        />
        Use as default persona
      </label>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md border border-violet-500/40 bg-violet-500/20 px-3 py-2 text-sm font-medium text-violet-100 hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
