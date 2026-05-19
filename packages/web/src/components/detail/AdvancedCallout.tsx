'use client';
/**
 * AdvancedCallout — expandable "Mode Lanjutan" panel.
 * Visible when: isOwner OR (viewer.advancedMode && !story.isSecretMode).
 * Lazy fetches /api/stories/:id/advanced on first expand.
 */
import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { RichContent } from '@/components/ui/RichContent';

export interface AdvancedCalloutProps {
  storyId: string;
  isOwner: boolean;
  advancedMode: boolean;
  isSecretMode: boolean;
}

interface AdvancedBundle {
  aiPlotHtml?: string | null;
  aiGuidelinesMd?: string | null;
  aiReminderMd?: string | null;
  outputReminderMd?: string | null;
}

export function AdvancedCallout({ storyId, isOwner, advancedMode, isSecretMode }: AdvancedCalloutProps) {
  const visible = isOwner || (advancedMode && !isSecretMode);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<AdvancedBundle | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!visible) return null;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      try {
        const r = await api.get<AdvancedBundle>(`/api/stories/${storyId}/advanced`);
        setData(r);
      } catch {
        setErr('Gagal memuat mode lanjutan.');
      } finally {
        setLoaded(true);
      }
    }
  }

  return (
    <div className="rounded-xl border border-amber-600/30 bg-amber-950/10 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-amber-950/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-amber-400" />
          <span className="text-sm font-medium text-amber-200">Mode Lanjutan</span>
          <span className="text-[10px] text-amber-500/70 uppercase tracking-wider">AI tuning</span>
        </div>
        <ChevronDown
          size={16}
          className={`text-amber-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 py-4 space-y-4 border-t border-amber-600/20 text-sm">
          {err && <p className="text-red-400 text-xs">{err}</p>}
          {!loaded && !err && <p className="text-ink-500 text-xs">Memuat…</p>}
          {data?.aiPlotHtml && (
            <Section title="Plot AI">
              <RichContent html={data.aiPlotHtml} />
            </Section>
          )}
          {data?.aiGuidelinesMd && (
            <Section title="Panduan AI">
              <pre className="whitespace-pre-wrap text-ink-300 text-xs font-mono">
                {data.aiGuidelinesMd}
              </pre>
            </Section>
          )}
          {data?.aiReminderMd && (
            <Section title="Pengingat AI">
              <pre className="whitespace-pre-wrap text-ink-300 text-xs font-mono">
                {data.aiReminderMd}
              </pre>
            </Section>
          )}
          {data?.outputReminderMd && (
            <Section title="Pengingat Output">
              <pre className="whitespace-pre-wrap text-ink-300 text-xs font-mono">
                {data.outputReminderMd}
              </pre>
            </Section>
          )}
          {loaded && !err && data && !data.aiPlotHtml && !data.aiGuidelinesMd && !data.aiReminderMd && !data.outputReminderMd && (
            <p className="text-ink-500 text-xs">Belum ada konten mode lanjutan.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-amber-500/80 mb-1.5">{title}</p>
      {children}
    </div>
  );
}
