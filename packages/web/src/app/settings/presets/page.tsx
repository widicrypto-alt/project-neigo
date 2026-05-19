'use client';

/**
 * Wk11 G2 — Prompt presets settings page.
 *
 * CRUD for user-authored prompt presets. Each preset carries a system
 * prelude, an authors-note, and optional sampling overrides (temperature
 * + top_p). The preset flagged as default is auto-applied to new
 * sessions; per-session pinning is done from the chat composer (G2 FE).
 *
 * Mirrors the personas page layout for visual consistency.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';

interface Preset {
  id: string;
  userId: string;
  name: string;
  description: string;
  systemPrelude: string;
  authorsNote: string;
  temperature: number | null;
  topP: number | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  presets: Preset[];
}

interface Draft {
  name: string;
  description: string;
  systemPrelude: string;
  authorsNote: string;
  temperature: string;
  topP: string;
  isDefault: boolean;
}

const EMPTY_DRAFT: Draft = {
  name: '',
  description: '',
  systemPrelude: '',
  authorsNote: '',
  temperature: '',
  topP: '',
  isDefault: false,
};

function presetToDraft(p: Preset): Draft {
  return {
    name: p.name,
    description: p.description,
    systemPrelude: p.systemPrelude,
    authorsNote: p.authorsNote,
    temperature: p.temperature == null ? '' : String(p.temperature),
    topP: p.topP == null ? '' : String(p.topP),
    isDefault: p.isDefault,
  };
}

function parseNumOrNull(s: string): number | null {
  const v = s.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function draftToPayload(d: Draft) {
  return {
    name: d.name.trim(),
    description: d.description,
    systemPrelude: d.systemPrelude,
    authorsNote: d.authorsNote,
    temperature: parseNumOrNull(d.temperature),
    topP: parseNumOrNull(d.topP),
    isDefault: d.isDefault,
  };
}

export default function PresetsSettingsPage() {
  const qc = useQueryClient();
  const listQuery = useQuery({
    queryKey: ['presets'],
    queryFn: () => api.get<ListResponse>('/api/presets'),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const presets = useMemo(() => listQuery.data?.presets ?? [], [listQuery.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['presets'] });

  const createMut = useMutation({
    mutationFn: (d: Draft) => api.post<{ preset: Preset }>('/api/presets', draftToPayload(d)),
    onSuccess: () => {
      setShowNew(false);
      setDraft(EMPTY_DRAFT);
      setMsg('Preset created.');
      invalidate();
    },
    onError: (e) => setMsg(userFacingApiMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Draft }) =>
      api.patch<{ preset: Preset }>(`/api/presets/${id}`, draftToPayload(d)),
    onSuccess: () => {
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
      setMsg('Preset saved.');
      invalidate();
    },
    onError: (e) => setMsg(userFacingApiMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.del(`/api/presets/${id}`),
    onSuccess: () => {
      setMsg('Preset deleted.');
      invalidate();
    },
    onError: (e) => setMsg(userFacingApiMessage(e)),
  });

  const startEdit = (p: Preset) => {
    setShowNew(false);
    setEditingId(p.id);
    setDraft(presetToDraft(p));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowNew(false);
    setDraft(EMPTY_DRAFT);
  };

  const busy = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <h1 className="text-2xl font-semibold text-zinc-100">Prompt presets</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Reusable system-prompt overrides. Attach per session from the chat composer, or flag one
        as default to auto-apply to new sessions.
      </p>
      {msg && (
        <div className="mt-4 rounded border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
          {msg}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-300">Your presets</h2>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-40"
          disabled={busy || showNew}
          onClick={() => {
            setEditingId(null);
            setDraft(EMPTY_DRAFT);
            setShowNew(true);
          }}
        >
          <Plus className="size-4" /> New
        </button>
      </div>

      {listQuery.isLoading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      )}

      <div className="mt-3 space-y-3">
        {showNew && (
          <PresetForm
            draft={draft}
            onChange={setDraft}
            onSubmit={() => createMut.mutate(draft)}
            onCancel={cancelEdit}
            submitting={createMut.isPending}
            submitLabel="Create"
          />
        )}

        {presets.map((p) =>
          editingId === p.id ? (
            <PresetForm
              key={p.id}
              draft={draft}
              onChange={setDraft}
              onSubmit={() => updateMut.mutate({ id: p.id, d: draft })}
              onCancel={cancelEdit}
              submitting={updateMut.isPending}
              submitLabel="Save"
            />
          ) : (
            <div
              key={p.id}
              className="rounded border border-zinc-800 bg-zinc-950/50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base font-medium text-zinc-100">{p.name}</h3>
                    {p.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-300">
                        <Star className="size-3" /> default
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="mt-1 text-sm text-zinc-400">{p.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                    <span>Prelude: {p.systemPrelude.length} chars</span>
                    <span>Author&apos;s note: {p.authorsNote.length} chars</span>
                    {p.temperature != null && <span>temp={p.temperature}</span>}
                    {p.topP != null && <span>top_p={p.topP}</span>}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
                    disabled={busy}
                    onClick={() => startEdit(p)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'rounded border border-rose-900 px-2 py-1 text-xs text-rose-300 hover:bg-rose-950/40',
                    )}
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Delete preset "${p.name}"?`)) deleteMut.mutate(p.id);
                    }}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            </div>
          ),
        )}

        {!listQuery.isLoading && presets.length === 0 && !showNew && (
          <p className="mt-8 text-center text-sm text-zinc-500">
            No presets yet. Create one to override the default system prompt.
          </p>
        )}
      </div>
    </div>
  );
}

interface FormProps {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
}

function PresetForm({ draft, onChange, onSubmit, onCancel, submitting, submitLabel }: FormProps) {
  const update = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.name.trim()) return;
        onSubmit();
      }}
      className="rounded border border-zinc-700 bg-zinc-950 p-4 space-y-3"
    >
      <label className="block text-sm">
        <span className="text-zinc-300">Name</span>
        <input
          type="text"
          required
          maxLength={80}
          value={draft.name}
          onChange={(e) => update('name', e.target.value)}
          className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
          placeholder="e.g. NSFW roleplay"
        />
      </label>
      <label className="block text-sm">
        <span className="text-zinc-300">Description (optional)</span>
        <input
          type="text"
          maxLength={2000}
          value={draft.description}
          onChange={(e) => update('description', e.target.value)}
          className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
        />
      </label>
      <label className="block text-sm">
        <span className="text-zinc-300">System prelude</span>
        <textarea
          rows={7}
          maxLength={16000}
          value={draft.systemPrelude}
          onChange={(e) => update('systemPrelude', e.target.value)}
          className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
          placeholder="Instructions appended to the system prompt."
        />
      </label>
      <label className="block text-sm">
        <span className="text-zinc-300">Author&apos;s note (injected near latest user turn)</span>
        <textarea
          rows={4}
          maxLength={4000}
          value={draft.authorsNote}
          onChange={(e) => update('authorsNote', e.target.value)}
          className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-zinc-300">Temperature (blank = default)</span>
          <input
            type="text"
            value={draft.temperature}
            onChange={(e) => update('temperature', e.target.value)}
            className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
            placeholder="0.0 – 2.0"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-300">Top-P (blank = default)</span>
          <input
            type="text"
            value={draft.topP}
            onChange={(e) => update('topP', e.target.value)}
            className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
            placeholder="0.0 – 1.0"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={draft.isDefault}
          onChange={(e) => update('isDefault', e.target.checked)}
        />
        Set as default (auto-applied to new sessions)
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !draft.name.trim()}
          className="inline-flex items-center gap-1 rounded bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-40"
        >
          {submitting && <Loader2 className="size-3 animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
