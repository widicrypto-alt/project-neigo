'use client';

import { useState } from 'react';

interface DepthEntry {
  depth: number;
  count: number;
  avgSalience: number;
  totalTokens: number;
}

interface Overview {
  sessionId: string;
  title: string;
  turnCount: number;
  totalNodes: number;
  freshTailSize: number;
  depthDistribution: DepthEntry[];
}

interface NodeHit {
  id: string;
  depth: number;
  turnStart: number;
  turnEnd: number;
  summary: string;
  salience: number;
}

interface MessageHit {
  id: string;
  turnIndex: number;
  role: string;
  speakerType: string;
  content: string;
}

interface GrepResult {
  query: string;
  nodes: NodeHit[];
  messages: MessageHit[];
}

interface NodeDetail {
  node: {
    id: string;
    depth: number;
    turnStart: number;
    turnEnd: number;
    summary: string;
    salience: number;
    tokenCount: number;
    parentId: string | null;
    createdAt: string;
  };
  children: Array<{
    id: string;
    depth: number;
    turnStart: number;
    turnEnd: number;
    salience: number;
    tokenCount: number;
  }>;
  sourceMessages: Array<{
    id: string;
    turnIndex: number;
    role: string;
    speakerType: string;
    content: string;
    createdAt: string;
  }>;
}

// Wk2 F4 Prompt Inspection types
interface PromptSnapshotRow {
  id: string;
  turnId: string;
  turnIndex: number | null;
  modelSlug: string;
  totalChars: number;
  messageCount: number;
  retryCount: number;
  createdAt: string;
}

interface PromptSnapshotList {
  sessionId: string;
  count: number;
  snapshots: PromptSnapshotRow[];
}

interface PromptSnapshotDetail extends PromptSnapshotRow {
  sessionId: string;
  userId: string;
  characterId: string | null;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  sampling: Record<string, unknown>;
}

async function opsGet<T>(path: string, key: string): Promise<T> {
  const headers = key ? { 'x-ops-key': key } : undefined;
  const res = await fetch(`/api/ops${path}`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function OpsContextPage({ params }: { params: Promise<{ id: string }> }) {
  const [sessionId, setSessionId] = useState('');
  const [opsKey, setOpsKey] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [grep, setGrep] = useState<GrepResult | null>(null);
  const [grepQuery, setGrepQuery] = useState('');
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Wk2 F4
  const [tab, setTab] = useState<'context' | 'prompts'>('context');
  const [snapshots, setSnapshots] = useState<PromptSnapshotList | null>(null);
  const [snapshotDetail, setSnapshotDetail] = useState<PromptSnapshotDetail | null>(null);

  // Resolve params (Next.js 15 async params)
  void params.then((p) => {
    if (p.id !== sessionId) setSessionId(p.id);
  });

  async function fetchOverview() {
    if (!sessionId) return;
    setError('');
    setLoading(true);
    try {
      const data = await opsGet<Overview>(`/sessions/${sessionId}/context/overview`, opsKey);
      setOverview(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchGrep() {
    if (!sessionId || !grepQuery) return;
    setError('');
    setLoading(true);
    try {
      const data = await opsGet<GrepResult>(
        `/sessions/${sessionId}/context/grep?q=${encodeURIComponent(grepQuery)}`,
        opsKey,
      );
      setGrep(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchNode(nodeId: string) {
    if (!sessionId) return;
    setError('');
    setLoading(true);
    try {
      const data = await opsGet<NodeDetail>(
        `/sessions/${sessionId}/context/node/${nodeId}`,
        opsKey,
      );
      setNodeDetail(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Wk2 F4 — prompt snapshot inspection
  async function fetchSnapshots() {
    if (!sessionId) return;
    setError('');
    setLoading(true);
    try {
      const data = await opsGet<PromptSnapshotList>(
        `/sessions/${sessionId}/prompt-snapshots?limit=30`,
        opsKey,
      );
      setSnapshots(data);
      setSnapshotDetail(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSnapshotDetail(snapshotId: string) {
    if (!sessionId) return;
    setError('');
    setLoading(true);
    try {
      const data = await opsGet<PromptSnapshotDetail>(
        `/sessions/${sessionId}/prompt-snapshots/${snapshotId}`,
        opsKey,
      );
      setSnapshotDetail(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">Session Inspector</h1>

      {/* Auth */}
      <div className="flex gap-2 mb-4">
        <input
          type="password"
          placeholder="OPS API Key (opsional jika founder login)"
          value={opsKey}
          onChange={(e) => setOpsKey(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 w-64"
        />
        <button
          onClick={fetchOverview}
          disabled={loading || !sessionId}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded px-4 py-1.5"
        >
          Load Context DAG
        </button>
        <button
          onClick={() => {
            setTab('prompts');
            void fetchSnapshots();
          }}
          disabled={loading || !sessionId}
          className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded px-4 py-1.5"
        >
          Load Prompt Snapshots
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-zinc-800">
        {(['context', 'prompts'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-xs uppercase tracking-wider rounded-t ${
              tab === t
                ? 'bg-zinc-900 border border-zinc-800 border-b-zinc-900 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t === 'context' ? 'Context DAG' : 'Prompt Snapshots'}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {tab === 'context' && (<>
      {/* Overview */}
      {overview && (
        <section className="mb-8 border border-zinc-800 rounded p-4">
          <h2 className="text-lg font-semibold mb-2">
            Overview — {overview.title || 'Untitled'} ({overview.turnCount} turns)
          </h2>
          <div className="grid grid-cols-3 gap-4 mb-3 text-zinc-300">
            <div>
              <span className="text-zinc-500">Total Nodes:</span> {overview.totalNodes}
            </div>
            <div>
              <span className="text-zinc-500">Fresh Tail:</span> {overview.freshTailSize} turns
            </div>
          </div>
          <table className="w-full text-left">
            <thead className="text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="py-1">Depth</th>
                <th>Count</th>
                <th>Avg Salience</th>
                <th>Total Tokens</th>
              </tr>
            </thead>
            <tbody>
              {overview.depthDistribution.map((d) => (
                <tr key={d.depth} className="border-b border-zinc-900">
                  <td className="py-1">D{d.depth}</td>
                  <td>{d.count}</td>
                  <td>{d.avgSalience}</td>
                  <td>{d.totalTokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Grep */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Search (grep)</h2>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Search query..."
            value={grepQuery}
            onChange={(e) => setGrepQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchGrep()}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 flex-1"
          />
          <button
            onClick={fetchGrep}
            disabled={loading || !grepQuery}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded px-4 py-1.5"
          >
            Grep
          </button>
        </div>

        {grep && (
          <div className="space-y-4">
            {grep.nodes.length > 0 && (
              <div>
                <h3 className="text-zinc-400 mb-1">Context Nodes ({grep.nodes.length})</h3>
                {grep.nodes.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => fetchNode(n.id)}
                    className="bg-zinc-900 border border-zinc-800 rounded p-2 mb-1 cursor-pointer hover:border-indigo-600"
                  >
                    <span className="text-indigo-400">D{n.depth}</span>{' '}
                    <span className="text-zinc-500">t{n.turnStart}–{n.turnEnd}</span>{' '}
                    <span className="text-zinc-400">sal={n.salience}</span>
                    <p className="text-zinc-300 mt-1 line-clamp-2">{n.summary}</p>
                  </div>
                ))}
              </div>
            )}
            {grep.messages.length > 0 && (
              <div>
                <h3 className="text-zinc-400 mb-1">Raw Messages ({grep.messages.length})</h3>
                {grep.messages.map((m) => (
                  <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded p-2 mb-1">
                    <span className="text-emerald-400">t{m.turnIndex}</span>{' '}
                    <span className="text-zinc-500">[{m.speakerType}]</span>
                    <p className="text-zinc-300 mt-1 line-clamp-2">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
            {grep.nodes.length === 0 && grep.messages.length === 0 && (
              <p className="text-zinc-500">No results for &quot;{grep.query}&quot;</p>
            )}
          </div>
        )}
      </section>

      {/* Node Detail */}
      {nodeDetail && (
        <section className="mb-8 border border-zinc-800 rounded p-4">
          <h2 className="text-lg font-semibold mb-2">
            Node {nodeDetail.node.id.slice(0, 8)}… (D{nodeDetail.node.depth})
          </h2>
          <div className="grid grid-cols-2 gap-2 mb-3 text-zinc-300 text-xs">
            <div>Turns: {nodeDetail.node.turnStart}–{nodeDetail.node.turnEnd}</div>
            <div>Salience: {nodeDetail.node.salience}</div>
            <div>Tokens: {nodeDetail.node.tokenCount}</div>
            <div>Parent: {nodeDetail.node.parentId ?? 'none'}</div>
          </div>
          <p className="text-zinc-200 bg-zinc-900 rounded p-3 mb-3 whitespace-pre-wrap">
            {nodeDetail.node.summary}
          </p>

          {nodeDetail.children.length > 0 && (
            <div className="mb-3">
              <h3 className="text-zinc-400 mb-1">Children ({nodeDetail.children.length})</h3>
              {nodeDetail.children.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => fetchNode(ch.id)}
                  className="block bg-zinc-900 border border-zinc-800 rounded px-2 py-1 mb-1 hover:border-indigo-600 text-left w-full"
                >
                  D{ch.depth} t{ch.turnStart}–{ch.turnEnd} sal={ch.salience} ({ch.tokenCount}tok)
                </button>
              ))}
            </div>
          )}

          <details>
            <summary className="text-zinc-400 cursor-pointer">
              Source Messages ({nodeDetail.sourceMessages.length})
            </summary>
            <div className="mt-2 space-y-1 max-h-96 overflow-y-auto">
              {nodeDetail.sourceMessages.map((m) => (
                <div key={m.id} className="bg-zinc-900 rounded p-2 text-xs">
                  <span className="text-emerald-400">t{m.turnIndex}</span>{' '}
                  <span className="text-zinc-500">[{m.speakerType}]</span>
                  <p className="text-zinc-300 mt-0.5">{m.content}</p>
                </div>
              ))}
            </div>
          </details>
        </section>
      )}
      </>)}

      {tab === 'prompts' && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">
            Prompt Snapshots{' '}
            {snapshots && (
              <span className="text-zinc-500 text-sm font-normal">
                ({snapshots.count} captured)
              </span>
            )}
          </h2>
          {!snapshots && (
            <p className="text-zinc-500 mb-3">
              Klik tombol <span className="text-amber-400">Load Prompt Snapshots</span> di
              atas untuk ngeliat setiap prompt persis yang dikirim ke model.
            </p>
          )}
          {snapshots && snapshots.snapshots.length === 0 && (
            <p className="text-zinc-500">
              Belum ada snapshot. Aktifkan <code>PROMPT_SNAPSHOTS_ENABLED=true</code> lalu
              kirim pesan baru.
            </p>
          )}
          {snapshots && snapshots.snapshots.length > 0 && (
            <div className="grid grid-cols-[minmax(0,360px)_1fr] gap-4">
              <div className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
                {snapshots.snapshots.map((s) => {
                  const selected = snapshotDetail?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => fetchSnapshotDetail(s.id)}
                      className={`block w-full text-left rounded border px-3 py-2 ${
                        selected
                          ? 'border-amber-500 bg-zinc-900'
                          : 'border-zinc-800 bg-zinc-900 hover:border-amber-700'
                      }`}
                    >
                      <div className="flex justify-between text-xs">
                        <span className="text-amber-400">
                          t{s.turnIndex ?? '?'} · {s.modelSlug}
                        </span>
                        <span className="text-zinc-500">
                          {new Date(s.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        {s.messageCount} msgs · {s.totalChars.toLocaleString()} chars
                        {s.retryCount > 0 && (
                          <span className="text-rose-400"> · retry×{s.retryCount}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-600 font-mono mt-0.5 truncate">
                        turn {s.turnId.slice(0, 12)}…
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="min-w-0">
                {!snapshotDetail && (
                  <p className="text-zinc-500">Pilih satu snapshot buat liat detail.</p>
                )}
                {snapshotDetail && (
                  <div>
                    <div className="border border-zinc-800 rounded p-3 mb-3 bg-zinc-900">
                      <div className="text-xs text-zinc-400 mb-1">
                        <span className="text-amber-400">{snapshotDetail.modelSlug}</span>
                        {' · '}
                        turn {snapshotDetail.turnId}
                        {' · '}
                        {snapshotDetail.messageCount} messages
                        {' · '}
                        {snapshotDetail.totalChars.toLocaleString()} chars
                        {snapshotDetail.retryCount > 0 && (
                          <span className="text-rose-400">
                            {' · retry×'}
                            {snapshotDetail.retryCount}
                          </span>
                        )}
                      </div>
                      <details>
                        <summary className="text-zinc-500 cursor-pointer text-xs">
                          Sampling params
                        </summary>
                        <pre className="text-[11px] text-zinc-300 mt-2 overflow-x-auto">
                          {JSON.stringify(snapshotDetail.sampling, null, 2)}
                        </pre>
                      </details>
                    </div>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                      {snapshotDetail.messages.map((m, idx) => {
                        const tone =
                          m.role === 'system'
                            ? 'border-zinc-700 text-zinc-300'
                            : m.role === 'user'
                              ? 'border-emerald-700 text-emerald-100'
                              : 'border-indigo-700 text-indigo-100';
                        return (
                          <details
                            key={idx}
                            open={idx >= snapshotDetail.messages.length - 2}
                            className={`border-l-2 ${tone} bg-zinc-900 rounded-r px-3 py-2`}
                          >
                            <summary className="cursor-pointer text-xs uppercase tracking-wider text-zinc-400">
                              #{idx} {m.role} · {m.content.length.toLocaleString()} chars
                            </summary>
                            <pre className="whitespace-pre-wrap text-xs mt-2 font-mono">
                              {m.content}
                            </pre>
                          </details>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
