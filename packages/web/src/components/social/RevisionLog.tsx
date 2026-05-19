'use client';
import { useState } from 'react';
import { Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface RevisionEntry {
  id: string;
  version: number;
  fieldKey: string;
  authorId: string;
  summary: string | null;
  contentMd: string;
  createdAt: string;
}

interface Props {
  revisions: RevisionEntry[];
  loading?: boolean;
}

export function RevisionLog({ revisions, loading }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) return <p className="text-sm text-ink-500">Memuat riwayat…</p>;
  if (!revisions.length) return <p className="text-sm text-ink-500 italic">Belum ada riwayat revisi.</p>;

  return (
    <div className="flex flex-col gap-2">
      {revisions.map((rev) => (
        <div key={rev.id} className="rounded-lg border border-ink-800 overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded(expanded === rev.id ? null : rev.id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-ink-800/50 transition-colors"
          >
            {expanded === rev.id ? (
              <ChevronDown size={14} className="text-ink-500 shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-ink-500 shrink-0" />
            )}
            <Clock size={13} className="text-ink-600 shrink-0" />
            <span className="text-xs text-ink-500 font-mono shrink-0">v{rev.version}</span>
            <span className="text-sm text-ink-300 truncate">{rev.summary ?? `Update ${rev.fieldKey}`}</span>
            <span className="ml-auto text-xs text-ink-600 shrink-0">
              {new Date(rev.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </button>
          {expanded === rev.id && (
            <div className="px-3 pb-3 border-t border-ink-800">
              <pre className="mt-2 text-xs font-mono text-ink-400 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                {rev.contentMd}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
