'use client';
/**
 * BACKLOG B2.3 — Token chip in composer trailing slot.
 *
 * Shows a real-time estimate of how many tokens the current input will
 * consume. Uses the server's `POST /api/chat/estimate-tokens` for an
 * authoritative estimate (server uses the same estimateTokensFast
 * baseline as the orchestrator window-sizing). Debounced 400ms so it
 * doesn't fire on every keystroke.
 *
 * Also shows the last-turn context size when available so the user can
 * see how full the context window is.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  input: string;
  sessionId: string | null;
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function TokenChip({ input, sessionId }: Props) {
  const [tokens, setTokens] = useState<number | null>(null);
  const [contextTokens, setContextTokens] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef('');

  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed === last.current) return;
    last.current = trimmed;

    if (!trimmed) {
      setTokens(null);
      return;
    }

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void api
        .post<{ tokens: number; contextTokens: number | null }>('/api/chat/estimate-tokens', {
          sessionId,
          content: trimmed,
        })
        .then((r) => {
          setTokens(r.tokens);
          setContextTokens(r.contextTokens ?? null);
        })
        .catch(() => {
          // Best-effort: silent on failure.
        });
    }, 400);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [input, sessionId]);

  if (tokens === null) return null;

  const title =
    contextTokens != null
      ? `~${tokens} token input · konteks terakhir ${fmtK(contextTokens)} token`
      : `~${tokens} token`;

  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-mono text-ink-400 select-none"
    >
      {fmtK(tokens)}T
      {contextTokens != null && (
        <span className="text-ink-500">/ {fmtK(contextTokens)}</span>
      )}
    </span>
  );
}
