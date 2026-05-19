'use client';
import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

const STORAGE_KEY = 'neigo:advancedMode';

export function AdvancedModeToggle({ className }: { className?: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setActive(stored === 'true');
  }, []);

  async function toggle() {
    const next = !active;
    setActive(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    try {
      await api.patch('/api/auth/metadata', { advancedMode: next });
    } catch {
      // best-effort
    }
  }

  return (
    <button
      onClick={toggle}
      title={active ? 'Mode Lanjutan aktif — klik untuk nonaktifkan' : 'Aktifkan Mode Lanjutan (tampilkan info AI)'}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors',
        active
          ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
          : 'border-night-line bg-night-surface/60 text-ink-500 hover:text-ink-300',
        className,
      )}
    >
      <Zap size={11} />
      Mode Lanjutan{active ? ': ON' : ''}
    </button>
  );
}

/** Hook to read current advancedMode state from localStorage */
export function useAdvancedMode(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    setActive(localStorage.getItem(STORAGE_KEY) === 'true');
    const handler = () => setActive(localStorage.getItem(STORAGE_KEY) === 'true');
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);
  return active;
}
