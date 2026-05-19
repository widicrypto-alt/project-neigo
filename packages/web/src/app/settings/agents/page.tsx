'use client';

/**
 * PLANv3 X2.7 — Agents settings page.
 *
 * Lists the user's configured pipeline agents (pre_generation, parallel,
 * post_processing). Supports toggling enabled/disabled. Builtin agents'
 * prompts are read-only; custom agents can have their prompt template
 * edited inline.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

type Phase = 'pre_generation' | 'parallel' | 'post_processing';

interface AgentConfig {
  id: string;
  userId: string;
  type: string;
  name: string;
  phase: Phase;
  enabled: boolean;
  isBuiltin: boolean;
  promptTemplate: string;
}

interface ListResponse {
  agents: AgentConfig[];
}

const PHASE_LABELS: Record<Phase, string> = {
  pre_generation: 'Sebelum generasi',
  parallel: 'Paralel',
  post_processing: 'Sesudah generasi',
};

export default function AgentsSettingsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['agent-configs'],
    queryFn: () => api.get<ListResponse>('/api/agent-configs'),
  });

  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/api/agent-configs/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-configs'] }),
  });

  const saveTemplateMut = useMutation({
    mutationFn: ({ id, promptTemplate }: { id: string; promptTemplate: string }) =>
      api.patch(`/api/agent-configs/${id}`, { promptTemplate }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-configs'] }),
  });

  const agents = list.data?.agents ?? [];
  const byPhase: Record<Phase, AgentConfig[]> = {
    pre_generation: [],
    parallel: [],
    post_processing: [],
  };
  for (const a of agents) {
    if (byPhase[a.phase]) byPhase[a.phase].push(a);
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 text-sm text-ink-400 hover:text-ink-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">Agent pipeline</h1>
      <p className="mt-1 text-sm text-ink-400">
        Aktifkan / nonaktifkan agent yang berjalan pada setiap fase generasi.
      </p>

      {list.isLoading && (
        <div className="mt-6 flex items-center gap-2 text-sm text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memuat…
        </div>
      )}

      {(Object.keys(byPhase) as Phase[]).map((phase) => (
        <section key={phase} className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
            {PHASE_LABELS[phase]}
          </h2>
          {byPhase[phase].length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-ink-500">
              No agents in this phase yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {byPhase[phase].map((a) => {
                const isOpen = expanded === a.id;
                const draft = drafts[a.id] ?? a.promptTemplate;
                return (
                  <li
                    key={a.id}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-3 p-3">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={a.enabled}
                          onChange={(e) =>
                            toggleMut.mutate({ id: a.id, enabled: e.target.checked })
                          }
                          className="h-4 w-4 accent-accent"
                        />
                      </label>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-medium text-ink-100">
                          {a.name}
                          {a.isBuiltin && (
                            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-400">
                              builtin
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[11px] text-ink-400">{a.type}</p>
                      </div>
                      <button
                        onClick={() => setExpanded(isOpen ? null : a.id)}
                        className="text-ink-400 hover:text-ink-200"
                        aria-label="Toggle detail"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {isOpen && (
                      <div className="border-t border-white/[0.06] p-3">
                        <label className="block text-xs text-ink-400">Prompt template</label>
                        <textarea
                          value={draft}
                          disabled={a.isBuiltin}
                          onChange={(e) => setDrafts({ ...drafts, [a.id]: e.target.value })}
                          rows={6}
                          className="mt-1 w-full rounded-lg border border-white/[0.08] bg-transparent px-3 py-2 font-mono text-xs disabled:opacity-60"
                        />
                        {!a.isBuiltin && (
                          <button
                            disabled={saveTemplateMut.isPending || draft === a.promptTemplate}
                            onClick={() =>
                              saveTemplateMut.mutate({ id: a.id, promptTemplate: draft })
                            }
                            className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink-950 disabled:opacity-50"
                          >
                            Simpan template
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
