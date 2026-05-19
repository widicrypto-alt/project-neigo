'use client';

/**
 * BACKLOG B2.10 / MARINARA H2 — World Info Inspector page.
 *
 * Shows which lorebook entries matched this session's recent scan window,
 * grouped by lorebook, with matched keyword highlighting inline in the
 * entry body, depth/token badges per row, and a dedicated pane for
 * budget-skipped entries. Read-only; creators edit entries in
 * /settings/lorebooks.
 */

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface ActiveLoreEntry {
  id: string;
  lorebookId: string;
  title: string;
  content: string;
  depth: number;
  priority: number;
  tokenEstimate: number;
  matchedKeywords: string[];
}

interface ActiveLoreResult {
  entries: ActiveLoreEntry[];
  usedTokens: number;
  lorebookIds: string[];
  skipped: number;
}

interface Lorebook {
  id: string;
  name: string;
}

export default function WorldInfoPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const query = useQuery({
    queryKey: ['active-lore', sessionId],
    queryFn: () => api.get<ActiveLoreResult>(`/api/sessions/${sessionId}/active-lore`),
    staleTime: 10_000,
  });

  const booksQuery = useQuery({
    queryKey: ['lorebooks-lite'],
    queryFn: () => api.get<{ items: Lorebook[] }>(`/api/lorebooks`),
    staleTime: 60_000,
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of booksQuery.data?.items ?? []) m.set(b.id, b.name);
    return m;
  }, [booksQuery.data]);

  const grouped = useMemo(() => {
    const g = new Map<string, ActiveLoreEntry[]>();
    for (const e of query.data?.entries ?? []) {
      const bucket = g.get(e.lorebookId);
      if (bucket) bucket.push(e);
      else g.set(e.lorebookId, [e]);
    }
    return Array.from(g.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [query.data]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <Link
        href={`/chat/${sessionId}`}
        className="inline-flex items-center gap-2 text-sm text-ink-400 hover:text-ink-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to chat
      </Link>

      <h1 className="mt-4 flex items-center gap-2 text-2xl font-semibold">
        <BookOpen className="h-6 w-6 text-accent" />
        World info aktif
      </h1>
      <p className="mt-1 text-sm text-ink-400">
        Entri lorebook yang akan di-inject ke prompt berdasarkan 8 pesan terakhir.
      </p>

      {query.isLoading && (
        <div className="mt-6 flex items-center gap-2 text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Memuat…</span>
        </div>
      )}

      {query.isError && (
        <div className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          Failed to load world info.
        </div>
      )}

      {query.data && (
        <>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-400">
            <Badge>{query.data.entries.length} entri aktif</Badge>
            <Badge>{query.data.usedTokens} token terpakai</Badge>
            <Badge>{query.data.lorebookIds.length} lorebook</Badge>
            {query.data.skipped > 0 && (
              <Badge tone="warn">{query.data.skipped} entri di-skip (budget)</Badge>
            )}
          </div>

          {query.data.entries.length === 0 ? (
            <div className="mt-8 rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center text-sm text-ink-400">
              Tidak ada entri yang cocok dengan scan window saat ini.
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {grouped.map(([lorebookId, entries]) => (
                <LorebookGroup
                  key={lorebookId}
                  name={nameById.get(lorebookId) ?? `Lorebook ${lorebookId.slice(0, 8)}`}
                  entries={entries}
                />
              ))}
            </div>
          )}

          {query.data.skipped > 0 && (
            <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200/90">
              <strong>{query.data.skipped}</strong> entri dilewati karena token budget
              habis. Turunkan <em>priority</em> atau pecah entri panjang di{' '}
              <Link href="/settings/lorebooks" className="underline">
                Settings → Lorebooks
              </Link>
              .
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LorebookGroup({ name, entries }: { name: string; entries: ActiveLoreEntry[] }) {
  const [open, setOpen] = useState(true);
  const totalTokens = entries.reduce((s, e) => s + (e.tokenEstimate ?? 0), 0);
  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-ink-100">
          {open ? (
            <ChevronDown className="h-4 w-4 text-ink-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-ink-400" />
          )}
          {name}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-ink-400">
          <Badge>{entries.length} entri</Badge>
          <Badge>{totalTokens}t</Badge>
        </span>
      </button>
      {open && (
        <ul className="space-y-3 border-t border-white/[0.06] p-3">
          {entries.map((e) => (
            <li key={e.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-ink-100">{e.title}</h3>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Badge>depth {e.depth}</Badge>
                  <Badge>prio {e.priority}</Badge>
                  <Badge>{e.tokenEstimate}t</Badge>
                </div>
              </div>
              {e.matchedKeywords.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="text-ink-500">matched:</span>
                  {e.matchedKeywords.map((k) => (
                    <span key={k} className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">
                      {k}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-ink-300">
                <Highlighted text={e.content} needles={e.matchedKeywords} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Highlighted({ text, needles }: { text: string; needles: string[] }) {
  if (!needles.length) return <>{text}</>;
  const escaped = needles
    .filter((n) => n && n.length > 0)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return <>{text}</>;
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-accent/20 px-0.5 text-accent">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'warn';
}) {
  return (
    <span
      className={
        tone === 'warn'
          ? 'rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200'
          : 'rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-ink-300'
      }
    >
      {children}
    </span>
  );
}
