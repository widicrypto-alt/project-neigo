'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, GitBranch, Heart, Sparkles, CloudSun, X } from 'lucide-react';
import { api } from '@/lib/api';
import { MoodBadge } from '@/components/ui/MoodBadge';
import { EmptyState } from '@/components/ui/EmptyState';

interface TimelineEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  turnIndex: number | null;
  characterId: string | null;
  createdAt: string;
}

const STAGE_LABEL: Record<string, string> = {
  STRANGER: 'Stranger',
  ACQUAINTANCE: 'Acquaintance',
  FRIEND: 'Friend',
  CLOSE: 'Close',
  INTIMATE: 'Intimate',
  BONDED: 'Bonded',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function EventRow({ event }: { event: TimelineEvent }) {
  const { eventType, payload } = event;
  let Icon = Sparkles;
  let title = eventType;
  let detail: string | null = null;
  let accent = 'text-accent-200 border-accent-400/25 bg-accent-500/[0.08]';

  if (eventType === 'relationship') {
    Icon = Heart;
    const newStage = String(payload.newStage ?? '');
    const newTrust = Number(payload.newTrust ?? 0);
    title = `Stage → ${STAGE_LABEL[newStage] ?? newStage}`;
    detail = `Trust: ${newTrust}`;
    accent = 'text-rose-200 border-rose-400/25 bg-rose-500/[0.08]';
  } else if (eventType === 'milestone') {
    Icon = Sparkles;
    title = String(payload.event ?? 'Milestone');
    detail = payload.message ? String(payload.message) : null;
    accent = 'text-amber-200 border-amber-400/25 bg-amber-500/[0.08]';
  } else if (eventType === 'mood') {
    Icon = CloudSun;
    const newMood = String(payload.newMood ?? '');
    title = 'Mood shift';
    detail = payload.previousMood ? `was ${String(payload.previousMood)}` : null;
    accent = 'text-iris-200 border-iris-400/25 bg-iris-500/[0.08]';
    return (
      <li className="relative pl-8 py-3">
        <span className={'absolute left-0 top-3.5 flex h-6 w-6 items-center justify-center rounded-full border backdrop-blur ' + accent}>
          <Icon className="h-3 w-3" strokeWidth={2} />
        </span>
        <div className="flex items-center gap-2 text-[13px] text-ink-100 font-medium">
          <span>{title}</span>
          <MoodBadge mood={newMood} />
        </div>
        {detail && <div className="text-[11px] text-ink-400 mt-0.5">{detail}</div>}
        <div className="text-[10px] text-ink-600 mt-0.5 uppercase tracking-[0.14em]">
          {formatTime(event.createdAt)}
          {event.turnIndex !== null && (
            <span className="ml-2">turn {Math.floor(event.turnIndex / 2) + 1}</span>
          )}
        </div>
      </li>
    );
  } else if (eventType === 'branch') {
    Icon = GitBranch;
    title = 'Branched from here';
    detail = payload.atTurnIndex !== undefined ? `at turn ${Math.floor(Number(payload.atTurnIndex) / 2) + 1}` : null;
    accent = 'text-emerald-200 border-emerald-400/25 bg-emerald-500/[0.08]';
  }

  return (
    <li className="relative pl-8 py-3">
      <span className={'absolute left-0 top-3.5 flex h-6 w-6 items-center justify-center rounded-full border backdrop-blur ' + accent}>
        <Icon className="h-3 w-3" strokeWidth={2} />
      </span>
      <div className="text-[13px] text-ink-100 font-medium">{title}</div>
      {detail && <div className="text-[11px] text-ink-400 mt-0.5">{detail}</div>}
      <div className="text-[10px] text-ink-600 mt-0.5 uppercase tracking-[0.14em]">
        {formatTime(event.createdAt)}
        {event.turnIndex !== null && (
          <span className="ml-2">turn {Math.floor(event.turnIndex / 2) + 1}</span>
        )}
      </div>
    </li>
  );
}

export function TimelinePanel({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener('neigo:toggle-timeline', handler);
    return () => window.removeEventListener('neigo:toggle-timeline', handler);
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open]);

  const events = useQuery({
    queryKey: ['timeline', sessionId],
    queryFn: () => api.get<{ events: TimelineEvent[] }>(`/api/sessions/${sessionId}/timeline`),
    enabled: open,
    staleTime: 10_000,
  });

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={() => setOpen(false)}
      />
      <aside className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-md border-l border-white/[0.08] bg-ink-950/95 backdrop-blur-xl animate-fade-in flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-accent-300" strokeWidth={1.9} />
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-100">
              Relationship timeline
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-ink-500 hover:text-ink-100 hover:bg-white/[0.05] transition-colors"
            aria-label="Close timeline"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {events.isLoading && <p className="text-[12px] text-ink-500">Loading…</p>}
          {events.data && events.data.events.length === 0 && (
            <EmptyState
              icon={<Sparkles className="h-5 w-5" strokeWidth={1.6} />}
              title="Belum ada momen"
              description="Terus mengobrol — perubahan tahap, mood, dan cabang cerita akan muncul di sini."
            />
          )}
          {events.data && events.data.events.length > 0 && (
            <ol className="relative border-l border-white/[0.08] ml-3">
              {events.data.events.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </ol>
          )}
        </div>
      </aside>
    </>
  );
}
