'use client';
/**
 * SecretCallout — owner-only "Mode Rahasia" panel.
 * Completely hidden from non-owners (not just empty).
 */
import { Lock } from 'lucide-react';

export interface SecretCalloutProps {
  isOwner: boolean;
  isSecretMode: boolean;
}

export function SecretCallout({ isOwner, isSecretMode }: SecretCalloutProps) {
  if (!isOwner || !isSecretMode) return null;
  return (
    <div className="rounded-xl border border-fuchsia-600/30 bg-fuchsia-950/10 px-4 py-3 flex items-start gap-3">
      <Lock size={16} className="text-fuchsia-400 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-fuchsia-200">Mode Rahasia aktif</p>
        <p className="text-xs text-fuchsia-400/80 mt-1 leading-relaxed">
          Hanya kamu (pemilik) yang melihat panel ini. Viewer biasa tidak tahu mode lanjutan dipakai.
          Edit di Studio untuk mengatur konten AI privat.
        </p>
      </div>
    </div>
  );
}
