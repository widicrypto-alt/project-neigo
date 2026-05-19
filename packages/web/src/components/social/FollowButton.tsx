'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

type Props = {
  handle: string;
  initialFollowing: boolean;
  initialCount?: number;
  onChange?: (following: boolean) => void;
};

export function FollowButton({ handle, initialFollowing, initialCount, onChange }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount ?? 0);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const nextFollowing = !following;
    try {
      if (nextFollowing) {
        await api.post(`/api/creators/${handle}/follow`);
      } else {
        await api.post(`/api/creators/${handle}/unfollow`);
      }
      setFollowing(nextFollowing);
      setCount((n) => Math.max(0, n + (nextFollowing ? 1 : -1)));
      onChange?.(nextFollowing);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
        following
          ? 'bg-rose-950/40 border border-rose-700/50 text-rose-300 hover:bg-rose-900/40'
          : 'bg-rose-600 hover:bg-rose-500 text-white'
      } disabled:opacity-60`}
    >
      {following ? 'Mengikuti' : 'Ikuti'}
      {count > 0 && <span className="ml-2 text-xs opacity-80">{count}</span>}
    </button>
  );
}
