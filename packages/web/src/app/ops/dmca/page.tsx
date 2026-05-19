'use client';
/**
 * Ops DMCA / Legal Takedown console (BACKLOG B2.9).
 *
 * Thin admin form that calls `POST /api/ops/dmca/takedown`. Restores and
 * the audit log are listed inline so operators can sanity-check their own
 * actions. Auth is bearer-ed via OPS_API_KEY (stored only in component
 * state, never persisted).
 */
import { useState } from 'react';

type Action = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export default function DmcaOpsPage() {
  const [key, setKey] = useState('');
  const [entityType, setEntityType] = useState<'character' | 'story'>('character');
  const [entityId, setEntityId] = useState('');
  const [reason, setReason] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [reporter, setReporter] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [history, setHistory] = useState<Action[]>([]);

  async function loadHistory() {
    setErr(null);
    try {
      const headers = key ? { 'x-ops-key': key } : undefined;
      const res = await fetch('/api/ops/dmca?limit=100', { headers });
      if (!res.ok) {
        setErr(`HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setHistory(data.takedowns ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function submit() {
    setErr(null);
    setOk(null);
    if (!entityId || !reason) {
      setErr('entityId dan reason wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (key) headers['x-ops-key'] = key;
      const res = await fetch('/api/ops/dmca/takedown', {
        method: 'POST',
        headers,
        body: JSON.stringify({ entityType, entityId, reason, sourceUrl: sourceUrl || undefined, reporter: reporter || undefined }),
      });
      if (!res.ok) {
        setErr(`HTTP ${res.status}`);
      } else {
        setOk(`Takedown ${entityType}:${entityId} ok.`);
        setEntityId('');
        setReason('');
        setSourceUrl('');
        setReporter('');
        await loadHistory();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restore(t: Action) {
    if (!confirm(`Restore ${t.entityType}:${t.entityId}?`)) return;
    setBusy(true);
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (key) headers['x-ops-key'] = key;
      const res = await fetch('/api/ops/dmca/restore', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ entityType: t.entityType, entityId: t.entityId, reason: 'counter-notice' }),
      });
      if (!res.ok) setErr(`Restore HTTP ${res.status}`);
      else await loadHistory();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 text-rose-50">
      <h1 className="text-2xl font-semibold mb-2">DMCA · Ops</h1>
      <p className="text-sm text-rose-300/70 mb-6">
        Halaman internal untuk takedown legal/DMCA. Tindakan soft-delete konten
        dan mencatat audit log. Bisa pakai founder login atau `OPS_API_KEY`.
      </p>

      <div className="rounded-lg border border-rose-300/20 bg-rose-950/40 p-4 mb-6">
        <label className="block text-xs uppercase tracking-wide text-rose-300/70 mb-1">OPS_API_KEY (opsional)</label>
        <input
          type="password"
          className="w-full rounded bg-black/40 border border-rose-300/20 px-2 py-1 text-sm"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Isi jika tidak login sebagai founder"
        />
        <button
          className="mt-2 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-50 px-3 py-1 text-xs"
          disabled={busy}
          onClick={loadHistory}
        >
          Muat audit log
        </button>
      </div>

      <div className="rounded-lg border border-rose-300/20 bg-rose-950/40 p-4 mb-6 space-y-3">
        <h2 className="text-lg font-semibold">Takedown baru</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-rose-300/70 mb-1">Entity type</label>
            <select
              className="w-full rounded bg-black/40 border border-rose-300/20 px-2 py-1 text-sm"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as 'character' | 'story')}
            >
              <option value="character">character</option>
              <option value="story">story</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-rose-300/70 mb-1">Entity ID</label>
            <input
              className="w-full rounded bg-black/40 border border-rose-300/20 px-2 py-1 text-sm font-mono"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="uuid"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-rose-300/70 mb-1">Reason (required)</label>
          <textarea
            className="w-full rounded bg-black/40 border border-rose-300/20 px-2 py-1 text-sm"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="DMCA §512(c) — copyright X by Y ..."
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-rose-300/70 mb-1">Source URL</label>
            <input
              className="w-full rounded bg-black/40 border border-rose-300/20 px-2 py-1 text-sm"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="block text-xs text-rose-300/70 mb-1">Reporter</label>
            <input
              className="w-full rounded bg-black/40 border border-rose-300/20 px-2 py-1 text-sm"
              value={reporter}
              onChange={(e) => setReporter(e.target.value)}
              placeholder="name / email / agent"
            />
          </div>
        </div>
        <button
          className="rounded bg-red-700 hover:bg-red-600 disabled:opacity-50 px-4 py-2 text-sm font-semibold"
          disabled={!entityId || !reason || busy}
          onClick={submit}
        >
          {busy ? 'Memproses…' : 'Execute takedown'}
        </button>
        {err && <p className="text-sm text-red-300">{err}</p>}
        {ok && <p className="text-sm text-emerald-300">{ok}</p>}
      </div>

      <div className="rounded-lg border border-rose-300/20 bg-rose-950/40 p-4">
        <h2 className="text-lg font-semibold mb-3">Audit log ({history.length})</h2>
        {history.length === 0 ? (
          <p className="text-sm text-rose-300/60">Belum ada riwayat. Muat dengan tombol di atas.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((t) => (
              <li key={t.id} className="rounded border border-rose-300/10 bg-black/30 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-rose-300/80">
                    {new Date(t.createdAt).toLocaleString()}
                  </span>
                  <button
                    className="rounded bg-emerald-800/70 hover:bg-emerald-700 px-2 py-0.5 text-xs"
                    disabled={busy}
                    onClick={() => restore(t)}
                  >
                    Restore
                  </button>
                </div>
                <div className="mt-1">
                  <span className="rounded bg-rose-800/60 px-1.5 py-0.5 text-xs mr-2">{t.entityType}</span>
                  <span className="font-mono text-xs">{t.entityId}</span>
                </div>
                {t.reason && <p className="mt-1 text-rose-100/80">{t.reason}</p>}
                {t.metadata && Object.keys(t.metadata).length > 0 && (
                  <pre className="mt-1 text-xs text-rose-300/60 whitespace-pre-wrap break-all">
                    {JSON.stringify(t.metadata, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
