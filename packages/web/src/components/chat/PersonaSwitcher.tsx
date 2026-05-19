'use client';

/**
 * Wk9 G1c — Persona quick-switcher.
 *
 * Small popover chip anchored to the composer (leading slot). Shows the
 * currently active persona name and lets the user switch to any of their
 * saved personas for THIS session only, without diving into Settings.
 *
 * Auth'd routes used:
 *   GET /api/personas                                  → list
 *   PUT /api/personas/sessions/:sessionId/active       → set/clear
 *
 * "None" clears the per-session pin, which makes the orchestrator fall
 * back to the user's default persona (or displayName if no default).
 */

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Check, ChevronDown, Loader2, UserCircle2 } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';

interface Persona {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  isDefault: boolean;
}

interface ListResponse {
  personas: Persona[];
}

export interface PersonaSwitcherProps {
  sessionId: string;
  activePersonaId: string | null;
  /** Called after a successful switch so the parent can invalidate session state. */
  onChanged?: () => void;
}

export function PersonaSwitcher({ sessionId, activePersonaId, onChanged }: PersonaSwitcherProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  const list = useQuery({
    queryKey: ['personas'],
    queryFn: () => api.get<ListResponse>('/api/personas'),
    staleTime: 60_000,
  });

  const mutate = useMutation({
    mutationFn: (personaId: string | null) =>
      api.put<{ ok: true; activePersonaId: string | null }>(
        `/api/personas/sessions/${sessionId}/active`,
        { personaId },
      ),
    onSuccess: () => {
      setOpen(false);
      setErr(null);
      qc.invalidateQueries({ queryKey: ['session', sessionId] });
      onChanged?.();
    },
    onError: (e) => setErr(userFacingApiMessage(e)),
  });

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!anchorRef.current) return;
      if (!anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const personas = list.data?.personas ?? [];
  const defaultPersona = personas.find((p) => p.isDefault) ?? null;
  const active = activePersonaId ? personas.find((p) => p.id === activePersonaId) ?? null : null;
  // Label rule: explicit session pin > user default > "Me".
  const chipLabel = active?.name ?? defaultPersona?.name ?? 'Me';
  const isDefaultFallback = !active && defaultPersona !== null;

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch persona for this session"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-colors',
          'border-white/[0.08] bg-white/[0.04] text-ink-200 hover:bg-white/[0.08]',
          mutate.isPending && 'opacity-60',
        )}
        disabled={mutate.isPending}
      >
        <UserCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span className="max-w-[7rem] truncate">{chipLabel}</span>
        <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={2} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-white/[0.08] bg-ink-900/95 p-1.5 shadow-lg backdrop-blur-sm z-50"
        >
          <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-ink-400">
            Persona for this chat
          </div>

          <button
            type="button"
            role="option"
            aria-selected={activePersonaId === null}
            onClick={() => mutate.mutate(null)}
            className={cn(
              'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm',
              'hover:bg-white/[0.05]',
              activePersonaId === null && 'bg-white/[0.04]',
            )}
          >
            <div className="min-w-0">
              <div className="truncate text-ink-100">None (use account default)</div>
              {isDefaultFallback && (
                <div className="truncate text-[11px] text-ink-400">
                  Falls back to {defaultPersona?.name}
                </div>
              )}
            </div>
            {activePersonaId === null && <Check className="h-3.5 w-3.5 text-accent-300" />}
          </button>

          {list.isLoading ? (
            <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-ink-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            personas.map((p) => {
              const selected = activePersonaId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => mutate.mutate(p.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm',
                    'hover:bg-white/[0.05]',
                    selected && 'bg-white/[0.04]',
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-ink-100">{p.name}</span>
                      {p.isDefault && (
                        <span className="rounded bg-warmth-500/15 px-1 text-[9px] font-semibold uppercase tracking-wide text-warmth-300">
                          Default
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <div className="truncate text-[11px] text-ink-400">{p.description}</div>
                    )}
                  </div>
                  {selected && <Check className="h-3.5 w-3.5 text-accent-300 shrink-0" />}
                </button>
              );
            })
          )}

          <div className="mt-1 border-t border-white/[0.06] pt-1">
            <Link
              href="/settings/personas"
              className="block rounded-lg px-2.5 py-1.5 text-xs text-ink-300 hover:bg-white/[0.05] hover:text-ink-100"
              onClick={() => setOpen(false)}
            >
              Manage personas →
            </Link>
          </div>
          {err && (
            <div className="px-2.5 py-1.5 text-xs text-warmth-300">{err}</div>
          )}
        </div>
      )}
    </div>
  );
}
