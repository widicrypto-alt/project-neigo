'use client';

/**
 * Wk13 PLANv2 H1 — Chat folders settings page.
 *
 * Minimal CRUD. Moving sessions into a folder happens from the chat
 * screen (future: a folder picker in the session header). Server-side
 * filtering is via GET /api/sessions?folderId=<id|none>.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';

interface Folder {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  folders: Folder[];
}

interface Draft {
  name: string;
  color: string;
}

const EMPTY_DRAFT: Draft = { name: '', color: '' };

const PALETTE = ['#64748b', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'];

export default function FoldersSettingsPage() {
  const qc = useQueryClient();
  const listQuery = useQuery({
    queryKey: ['folders'],
    queryFn: () => api.get<ListResponse>('/api/folders'),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const folders = useMemo(() => listQuery.data?.folders ?? [], [listQuery.data]);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['folders'] });

  const createMut = useMutation({
    mutationFn: (d: Draft) =>
      api.post<{ folder: Folder }>('/api/folders', {
        name: d.name.trim(),
        color: d.color || null,
      }),
    onSuccess: () => {
      setShowNew(false);
      setDraft(EMPTY_DRAFT);
      setMsg('Folder created.');
      invalidate();
    },
    onError: (e) => setMsg(userFacingApiMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Draft }) =>
      api.patch<{ folder: Folder }>(`/api/folders/${id}`, {
        name: d.name.trim(),
        color: d.color || null,
      }),
    onSuccess: () => {
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
      setMsg('Folder saved.');
      invalidate();
    },
    onError: (e) => setMsg(userFacingApiMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.del(`/api/folders/${id}`),
    onSuccess: () => {
      setMsg('Folder deleted. Sessions unassigned.');
      invalidate();
    },
    onError: (e) => setMsg(userFacingApiMessage(e)),
  });

  const startEdit = (f: Folder) => {
    setShowNew(false);
    setEditingId(f.id);
    setDraft({ name: f.name, color: f.color ?? '' });
  };

  const busy = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <h1 className="text-2xl font-semibold text-zinc-100">Chat folders</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Group chats into custom folders. Filter the chat list from the sidebar (soon) or by
        appending <code className="rounded bg-zinc-900 px-1">?folderId=…</code> in URLs.
      </p>
      {msg && (
        <div className="mt-4 rounded border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
          {msg}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-300">Your folders</h2>
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

      <div className="mt-3 space-y-2">
        {showNew && (
          <FolderForm
            draft={draft}
            onChange={setDraft}
            onSubmit={() => createMut.mutate(draft)}
            onCancel={() => {
              setShowNew(false);
              setDraft(EMPTY_DRAFT);
            }}
            submitting={createMut.isPending}
            submitLabel="Create"
          />
        )}
        {folders.map((f) =>
          editingId === f.id ? (
            <FolderForm
              key={f.id}
              draft={draft}
              onChange={setDraft}
              onSubmit={() => updateMut.mutate({ id: f.id, d: draft })}
              onCancel={() => {
                setEditingId(null);
                setDraft(EMPTY_DRAFT);
              }}
              submitting={updateMut.isPending}
              submitLabel="Save"
            />
          ) : (
            <div
              key={f.id}
              className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-block size-3 rounded-full"
                  style={{ backgroundColor: f.color ?? '#52525b' }}
                />
                <span className="text-sm text-zinc-100">{f.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
                  disabled={busy}
                  onClick={() => startEdit(f)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="rounded border border-rose-900 px-2 py-1 text-xs text-rose-300 hover:bg-rose-950/40"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        `Delete folder "${f.name}"? Sessions inside will be unassigned (not deleted).`,
                      )
                    ) {
                      deleteMut.mutate(f.id);
                    }
                  }}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ),
        )}
        {!listQuery.isLoading && folders.length === 0 && !showNew && (
          <p className="mt-6 text-center text-sm text-zinc-500">
            No folders yet. Create one to group chats.
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

function FolderForm({ draft, onChange, onSubmit, onCancel, submitting, submitLabel }: FormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.name.trim()) return;
        onSubmit();
      }}
      className="rounded border border-zinc-700 bg-zinc-950 p-3 space-y-3"
    >
      <label className="block text-sm">
        <span className="text-zinc-300">Name</span>
        <input
          type="text"
          required
          maxLength={80}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
          placeholder="e.g. Rei notes"
        />
      </label>
      <div>
        <div className="text-sm text-zinc-300">Color</div>
        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...draft, color: '' })}
            className={`size-6 rounded-full border ${draft.color === '' ? 'border-zinc-100' : 'border-zinc-700'} bg-zinc-700`}
            aria-label="No color"
          />
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ ...draft, color: c })}
              className={`size-6 rounded-full border ${draft.color === c ? 'border-zinc-100' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>
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
