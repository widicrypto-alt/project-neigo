'use client';
import { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, userFacingApiMessage } from '@/lib/api';

export interface OwnerMenuProps {
  entityType: 'character' | 'story';
  entityId: string;
  isPublic: boolean;
  onChanged?: () => void;
}

export function OwnerMenu({ entityType, entityId, isPublic, onChanged }: OwnerMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const base = entityType === 'character' ? '/api/characters' : '/api/stories';

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function withBusy(fn: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChanged?.();
    } catch (e) {
      setErr(userFacingApiMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    await withBusy(async () => {
      await api.post(`${base}/${entityId}/unpublish`);
    }, 'Gagal unpublish.');
    setOpen(false);
  }

  async function clone() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ id: string }>(`${base}/${entityId}/clone`, {});
      router.push(entityType === 'character' ? `/characters/${r.id}/edit` : `/studio/stories/${r.id}/edit`);
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Gagal clone.'));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function remove() {
    if (!confirm(`Hapus ${entityType === 'character' ? 'karakter' : 'cerita'} ini? Tindakan tidak dapat diurungkan.`)) return;
    setBusy(true);
    setErr(null);
    try {
      await api.del(`${base}/${entityId}`);
      router.push(entityType === 'character' ? '/discover' : '/stories');
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Gagal hapus.'));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title="Menu pemilik"
        className="text-ink-400 hover:text-violet-300 transition-colors p-1"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-md border border-ink-700 bg-ink-900 shadow-lg z-50 py-1">
          {isPublic && (
            <button
              onClick={unpublish}
              disabled={busy}
              className="w-full text-left px-3 py-2 text-sm text-ink-200 hover:bg-ink-800 disabled:opacity-60"
            >
              Unpublish
            </button>
          )}
          <button
            onClick={clone}
            disabled={busy}
            className="w-full text-left px-3 py-2 text-sm text-ink-200 hover:bg-ink-800 disabled:opacity-60"
          >
            Salin (Clone)
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-950 disabled:opacity-60"
          >
            Hapus
          </button>
        </div>
      )}
      {err && <div className="absolute right-0 mt-1 text-xs text-red-400 whitespace-nowrap">{err}</div>}
    </div>
  );
}
