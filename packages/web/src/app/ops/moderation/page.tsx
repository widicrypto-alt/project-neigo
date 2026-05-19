'use client';
import { useEffect, useState } from 'react';

type FlaggedChar = {
  id: string;
  name: string;
  ownerId: string;
  isPublic: boolean;
  createdAt: string;
};
type FlaggedStory = {
  id: string;
  title: string;
  authorId: string;
  status: string;
  createdAt: string;
};
type RecentReport = {
  entity_type: string;
  entity_id: string;
  reports: string | number;
};
type ActionKind = 'clear_flag' | 'hide' | 'restore' | 'soft_delete' | 'ban_author';

export default function ModerationPage() {
  const [key, setKey] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [chars, setChars] = useState<FlaggedChar[]>([]);
  const [stories, setStories] = useState<FlaggedStory[]>([]);
  const [reports, setReports] = useState<RecentReport[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr(null);
    setBusy(true);
    try {
      const headers = key ? { 'x-ops-key': key } : undefined;
      const res = await fetch('/api/ops/moderation/flagged', { headers, credentials: 'include' });
      if (!res.ok) {
        setErr(`HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      const data = await res.json();
      setChars(data.characters ?? []);
      setStories(data.stories ?? []);
      setReports(data.recentReports ?? []);
      setLoaded(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(entityType: 'character' | 'story', entityId: string, action: ActionKind) {
    const reason = action === 'ban_author' ? (prompt('Alasan ban author:') ?? undefined) : undefined;
    setBusy(true);
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (key) headers['x-ops-key'] = key;
      const res = await fetch('/api/ops/moderation/action', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ entityType, entityId, action, reason }),
      });
      if (!res.ok) setErr(`Action HTTP ${res.status}`);
      else await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-rose-50 mb-2">Moderation · Ops</h1>
      <p className="text-sm text-rose-300/70 mb-6">
        Halaman internal untuk meninjau konten yang ditandai. Bisa pakai founder login atau `OPS_API_KEY`.
      </p>

      {!loaded && (
        <div className="flex gap-2 mb-6">
          <input
            type="password"
            placeholder="Ops API key (opsional jika founder login)"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="flex-1 px-3 py-2 rounded-md bg-black/30 border border-rose-900/40 text-rose-50"
          />
          <button
            onClick={load}
            disabled={busy}
            className="px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-60"
          >
            {busy ? 'Memuat…' : 'Muat'}
          </button>
        </div>
      )}

      {err && <div className="text-red-400 mb-4">{err}</div>}

      {loaded && (
        <div className="space-y-8">
          <section>
            <h2 className="text-lg text-rose-100 mb-3">Karakter ditandai ({chars.length})</h2>
            {chars.length === 0 ? (
              <p className="text-rose-300/70 text-sm">Tidak ada.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-rose-300/70 text-xs">
                  <tr>
                    <th className="text-left py-1">Nama</th>
                    <th className="text-left">Owner</th>
                    <th className="text-left">Public</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {chars.map((c) => (
                    <tr key={c.id} className="border-t border-rose-900/30">
                      <td className="py-2">
                        <a href={`/characters/${c.id}`} className="text-rose-200 hover:underline">{c.name}</a>
                      </td>
                      <td className="text-rose-300/70 text-xs">{c.ownerId.slice(0, 8)}…</td>
                      <td>{c.isPublic ? 'ya' : 'tidak'}</td>
                      <td className="flex gap-2 py-2 justify-end">
                        <ActionButtons onAct={(a) => act('character', c.id, a)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h2 className="text-lg text-rose-100 mb-3">Cerita ditandai ({stories.length})</h2>
            {stories.length === 0 ? (
              <p className="text-rose-300/70 text-sm">Tidak ada.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-rose-300/70 text-xs">
                  <tr>
                    <th className="text-left py-1">Judul</th>
                    <th className="text-left">Author</th>
                    <th className="text-left">Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stories.map((s) => (
                    <tr key={s.id} className="border-t border-rose-900/30">
                      <td className="py-2">
                        <a href={`/stories/${s.id}`} className="text-rose-200 hover:underline">{s.title}</a>
                      </td>
                      <td className="text-rose-300/70 text-xs">{s.authorId.slice(0, 8)}…</td>
                      <td>{s.status}</td>
                      <td className="flex gap-2 py-2 justify-end">
                        <ActionButtons onAct={(a) => act('story', s.id, a)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h2 className="text-lg text-rose-100 mb-3">Laporan terbaru (7 hari)</h2>
            {reports.length === 0 ? (
              <p className="text-rose-300/70 text-sm">Tidak ada.</p>
            ) : (
              <ul className="text-sm text-rose-100/80 space-y-1">
                {reports.map((r, i) => (
                  <li key={i}>
                    <span className="text-rose-300/70">{r.entity_type}</span>{' '}
                    <a className="underline" href={`/${r.entity_type === 'character' ? 'characters' : 'stories'}/${r.entity_id}`}>
                      {r.entity_id.slice(0, 8)}…
                    </a>{' '}
                    <span className="text-rose-400">— {r.reports} laporan</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ActionButtons({ onAct }: { onAct: (a: ActionKind) => void }) {
  const btn = 'text-xs px-2 py-1 rounded border border-rose-900/40 hover:bg-rose-900/30';
  return (
    <>
      <button className={btn} onClick={() => onAct('clear_flag')}>Tutup laporan</button>
      <button className={btn} onClick={() => onAct('hide')}>Sembunyikan</button>
      <button className={btn} onClick={() => onAct('restore')}>Pulihkan</button>
      <button className={btn} onClick={() => onAct('soft_delete')}>Hapus 14h</button>
      <button className={`${btn} text-red-400`} onClick={() => onAct('ban_author')}>Ban author</button>
    </>
  );
}
