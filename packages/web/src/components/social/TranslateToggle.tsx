'use client';
import { useState } from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';

interface TranslateToggleProps {
  entityType: 'character' | 'story';
  entityId: string;
  fieldKey: string;
  /** Current field language code */
  sourceLang?: string;
  /** Target language (default: 'id') */
  targetLang?: string;
  /** Called when translation is done; receives translated text */
  onTranslated: (html: string) => void;
  className?: string;
}

export function TranslateToggle({
  entityType,
  entityId,
  fieldKey,
  sourceLang = 'en',
  targetLang = 'id',
  onTranslated,
  className,
}: TranslateToggleProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (sourceLang === targetLang) return null;
  if (done) return (
    <span className={cn('flex items-center gap-1 text-[11px] text-ink-500', className)}>
      <Languages size={11} /> Terjemahan ditampilkan
    </span>
  );

  async function handleTranslate() {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.post<{ translatedHtml: string }>('/api/translate', {
        entityType,
        entityId,
        fieldKey,
        target: targetLang,
      });
      onTranslated(r.translatedHtml);
      setDone(true);
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Gagal menerjemahkan.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        onClick={handleTranslate}
        disabled={loading}
        className="flex items-center gap-1.5 text-[11px] text-ink-500 hover:text-ink-300 disabled:opacity-60"
      >
        {loading ? <Loader2 size={11} className="animate-spin" /> : <Languages size={11} />}
        Terjemahkan ke Bahasa Indonesia
      </button>
      {err && <span className="text-[10px] text-red-400">{err}</span>}
    </div>
  );
}
