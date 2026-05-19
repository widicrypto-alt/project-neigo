'use client';
/**
 * BACKLOG B0.1 — Agent pipeline debug panel.
 *
 * Collapsible panel shown in the chat page footer (dev / founding-reader
 * accounts only). Displays agent run outcomes per turn and, when both
 * shadow=true and shadow=false runs exist, shows a live/shadow agreement
 * indicator.
 *
 * Visibility: gated by `?agentDebug=1` search param so it never renders
 * for normal users even if the component is mounted. No extra API calls
 * unless the panel is opened.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ChevronDown, ChevronUp, Bot } from 'lucide-react';

interface AgentRunItem {
  id: string;
  turnIndex: number;
  agentType: string;
  agentName: string;
  outcome: string;
  shadow: boolean;
  latencyMs: number | null;
}

interface CompareItem {
  turnIndex: number;
  agentType: string;
  agentName: string;
  shadowOutcome: string | null;
  liveOutcome: string | null;
  agree: boolean | null;
  shadowLatencyMs: number | null;
  liveLatencyMs: number | null;
}

const OUTCOME_COLOR: Record<string, string> = {
  pass: 'text-emerald-400',
  retry: 'text-warmth-400',
  block: 'text-rose-400',
  error: 'text-rose-600',
};

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-ink-500">—</span>;
  const color = OUTCOME_COLOR[outcome] ?? 'text-ink-300';
  return <span className={`font-mono text-[10px] uppercase ${color}`}>{outcome}</span>;
}

interface Props {
  sessionId: string;
}

export default function AgentDebugPanel({ sessionId }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'runs' | 'compare' | 'stats'>('runs');

  // Check opt-in flag AFTER hooks (rules of hooks — hooks must be unconditional).
  const [debugEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return new URL(window.location.href).searchParams.get('agentDebug') === '1';
    } catch {
      return false;
    }
  });

  const runs = useQuery({
    queryKey: ['agent-runs', sessionId],
    queryFn: () => api.get<{ turns: Array<{ turnIndex: number; agents: AgentRunItem[] }> }>(`/api/agent-configs/runs?sessionId=${sessionId}&limit=100`),
    enabled: debugEnabled && open && view === 'runs',
    staleTime: 10_000,
  });

  const compare = useQuery({
    queryKey: ['agent-compare', sessionId],
    queryFn: () => api.get<{ comparisons: CompareItem[]; agreementRate: number | null; agreed: number; paired: number }>(`/api/agent-configs/compare?sessionId=${sessionId}`),
    enabled: debugEnabled && open && view === 'compare',
    staleTime: 10_000,
  });

  const stats = useQuery({
    queryKey: ['agent-stats', sessionId],
    queryFn: () => api.get<{ byAgent: Array<Record<string, unknown>> }>(`/api/agent-configs/stats?sessionId=${sessionId}`),
    enabled: debugEnabled && open && view === 'stats',
    staleTime: 10_000,
  });

  if (!debugEnabled) return null;

  return (
    <div className="border-t border-white/[0.06] bg-ink-950/80 text-[11px]">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-ink-400 hover:text-ink-200 transition"
        onClick={() => setOpen((v) => !v)}
      >
        <Bot size={12} className="text-violet-400" />
        <span className="font-mono uppercase tracking-wider text-[9px]">Agent Debug</span>
        {open ? <ChevronUp size={12} className="ml-auto" /> : <ChevronDown size={12} className="ml-auto" />}
      </button>

      {open && (
        <div className="px-4 pb-4">
          {/* View tabs */}
          <div className="flex gap-1 mb-3">
            {(['runs', 'compare', 'stats'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded px-2 py-0.5 text-[9px] uppercase tracking-wider transition ${
                  view === v
                    ? 'bg-violet-500/20 text-violet-200 border border-violet-500/30'
                    : 'text-ink-500 hover:text-ink-300'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* RUNS view */}
          {view === 'runs' && (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {runs.isPending && <p className="text-ink-500">Loading…</p>}
              {runs.data?.turns.map((turn) => (
                <div key={turn.turnIndex} className="border border-white/[0.06] rounded p-2">
                  <div className="text-ink-400 mb-1">Turn {turn.turnIndex}</div>
                  <div className="space-y-0.5">
                    {turn.agents.map((a) => (
                      <div key={a.id} className="flex items-center gap-2">
                        <span className={`shrink-0 text-[8px] px-1 rounded ${a.shadow ? 'text-iris-400 bg-iris-500/10' : 'text-emerald-400 bg-emerald-500/10'}`}>
                          {a.shadow ? 'shadow' : 'live'}
                        </span>
                        <span className="text-ink-300 flex-1 truncate">{a.agentName ?? a.agentType}</span>
                        <OutcomeBadge outcome={a.outcome} />
                        {a.latencyMs != null && (
                          <span className="text-ink-600 font-mono">{a.latencyMs}ms</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* COMPARE view */}
          {view === 'compare' && (
            <div>
              {compare.isPending && <p className="text-ink-500">Loading…</p>}
              {compare.data && (
                <>
                  <div className="mb-2 text-ink-400">
                    Agreement:{' '}
                    <span className="font-mono text-violet-300">
                      {compare.data.agreementRate != null
                        ? `${(compare.data.agreementRate * 100).toFixed(0)}%`
                        : 'N/A'}{' '}
                      ({compare.data.agreed}/{compare.data.paired})
                    </span>
                  </div>
                  <div className="space-y-0.5 max-h-52 overflow-y-auto pr-1">
                    {compare.data.comparisons.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 py-0.5">
                        <span className="text-ink-600 font-mono w-6 text-right">{c.turnIndex}</span>
                        <span className="text-ink-300 flex-1 truncate">{c.agentName}</span>
                        <OutcomeBadge outcome={c.shadowOutcome} />
                        <span className="text-ink-600">→</span>
                        <OutcomeBadge outcome={c.liveOutcome} />
                        {c.agree === true && <span className="text-emerald-500">✓</span>}
                        {c.agree === false && <span className="text-rose-500">✗</span>}
                        {c.agree === null && <span className="text-ink-600">?</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* STATS view */}
          {view === 'stats' && (
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {stats.isPending && <p className="text-ink-500">Loading…</p>}
              {stats.data?.byAgent.map((row, i) => {
                const avgMs = row['avg_latency_ms'] != null ? Number(row['avg_latency_ms']) : null;
                return (
                <div key={i} className="border border-white/[0.06] rounded p-2">
                  <div className="font-medium text-ink-300 mb-0.5">{String(row['agent_name'] ?? row['agent_type'])}</div>
                  <div className="flex gap-3 text-ink-500">
                    <span>turns: <span className="text-ink-300">{String(row['turns_ran'])}</span></span>
                    <span>pass: <span className="text-emerald-400">{String(row['pass_count'])}</span></span>
                    <span>retry: <span className="text-warmth-400">{String(row['retry_count'])}</span></span>
                    <span>block: <span className="text-rose-400">{String(row['block_count'])}</span></span>
                    {avgMs != null && (
                      <span>avg: <span className="text-ink-300">{avgMs.toFixed(0)}ms</span></span>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
