'use client';

import { useCallback, useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Trash2, CheckCircle2, Loader2, ImageOff } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { SPRITE_EMOTION_LABELS, type SpriteEmotion, SPRITE_EMOTIONS } from '@/lib/content-detect';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlotDef {
  slot: 'expressions' | 'poses' | 'outfits';
  name: string;
  label: string;
  url: string | null;
}

interface ManifestResponse {
  manifest: {
    expressions: Record<string, string>;
    poses: Record<string, string>;
    outfits: Record<string, string>;
  };
  slots: SlotDef[];
}

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

const POSE_LABELS: Record<string, string> = {
  standing: 'Standing', sitting: 'Sitting', leaning: 'Leaning',
  action: 'Action / Combat', intimate: 'Intimate / Close',
};

const OUTFIT_LABELS: Record<string, string> = {
  default: 'Default Outfit', casual: 'Casual / Off-duty', formal: 'Formal / Special',
};

const SLOT_SECTION_LABELS: Record<string, string> = {
  expressions: 'Expressions',
  poses: 'Poses',
  outfits: 'Outfits',
};

// ─── Slot card ────────────────────────────────────────────────────────────────

function SlotCard({
  slot,
  characterId,
  onUploaded,
  onDeleted,
}: {
  slot: SlotDef;
  characterId: string;
  onUploaded: (s: SlotDef, url: string) => void;
  onDeleted: (s: SlotDef) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setUploadState] = useState<UploadState>('idle');
  const [preview, setPreview] = useState<string | null>(slot.url);
  const [error, setError] = useState('');

  useEffect(() => { setPreview(slot.url); }, [slot.url]);

  const handleFile = useCallback(async (file: File) => {
    if (file.type !== 'image/webp') {
      setError('Only WEBP files are accepted.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Max 5 MB per sprite.');
      return;
    }
    setError('');
    setUploadState('uploading');

    // Local preview
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    try {
      // 1. Get presigned URL
      const { uploadUrl, key, publicUrl } = await api.post<{
        uploadUrl: string; key: string; publicUrl: string;
      }>(`/api/characters/${characterId}/sprite-manifest/presign`, {
        slot: slot.slot,
        name: slot.name,
        size: file.size,
      });

      // 2. Upload directly to R2
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'image/webp' },
      });
      if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`);

      // 3. Commit
      await api.post(`/api/characters/${characterId}/sprite-manifest/commit`, {
        slot: slot.slot,
        name: slot.name,
        key,
      });

      setPreview(publicUrl);
      setUploadState('done');
      onUploaded(slot, publicUrl);
      setTimeout(() => setUploadState('idle'), 2000);
    } catch (e) {
      setError('Upload failed. Try again.');
      setUploadState('error');
      setPreview(slot.url);
    }
  }, [characterId, slot, onUploaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const handleDelete = useCallback(async () => {
    if (!slot.url) return;
    try {
      await api.del(`/api/characters/${characterId}/sprite-manifest/${slot.slot}/${slot.name}`);
      setPreview(null);
      onDeleted(slot);
    } catch {
      setError('Delete failed.');
    }
  }, [characterId, slot, onDeleted]);

  const isEmpty = !preview;
  const isUploading = state === 'uploading';

  return (
    <div className="flex flex-col gap-2">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Upload ${slot.label} sprite`}
        onClick={() => !isUploading && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={cn(
          'relative aspect-[3/4] w-full overflow-hidden rounded-2xl border-2 cursor-pointer transition-all duration-200 group',
          isEmpty
            ? 'border-dashed border-white/[0.12] bg-white/[0.03] hover:border-amber-400/50 hover:bg-amber-400/[0.04]'
            : 'border-white/[0.08] bg-ink-900',
          isUploading && 'pointer-events-none opacity-70',
        )}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt={slot.label}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent" />
            {/* Overlay on hover */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-ink-950/60 gap-3">
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
                <Upload className="h-3.5 w-3.5" /> Replace
              </span>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-500">
            <ImageOff className="h-7 w-7 opacity-40" />
            <span className="text-[11px] tracking-wide">Drop WEBP here</span>
          </div>
        )}

        {/* Upload spinner */}
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-950/70">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
          </div>
        )}

        {/* Success flash */}
        {state === 'done' && (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20">
            <CheckCircle2 className="h-7 w-7 text-emerald-400" />
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/webp"
        className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
      />

      {/* Label row */}
      <div className="flex items-center justify-between gap-1 px-0.5">
        <span className="text-[11px] text-ink-300 truncate leading-tight">{slot.label}</span>
        {preview && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleDelete(); }}
            className="shrink-0 text-ink-500 hover:text-rose-400 transition-colors"
            aria-label={`Remove ${slot.label}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {error && <p className="text-[10px] text-rose-400 px-0.5">{error}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SpritesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: characterId } = use(params);
  const router = useRouter();
  const [slots, setSlots] = useState<SlotDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<ManifestResponse>(`/api/characters/${characterId}/sprite-manifest`)
      .then((data) => { setSlots(data.slots); setLoading(false); })
      .catch(() => { setError('Failed to load sprite manifest.'); setLoading(false); });
  }, [characterId]);

  const handleUploaded = useCallback((slot: SlotDef, url: string) => {
    setSlots((prev) => prev.map((s) => s.slot === slot.slot && s.name === slot.name ? { ...s, url } : s));
  }, []);

  const handleDeleted = useCallback((slot: SlotDef) => {
    setSlots((prev) => prev.map((s) => s.slot === slot.slot && s.name === slot.name ? { ...s, url: null } : s));
  }, []);

  const sections = (['expressions', 'poses', 'outfits'] as const).map((cat) => ({
    key: cat,
    label: SLOT_SECTION_LABELS[cat],
    slots: slots.filter((s) => s.slot === cat),
  }));

  const expressionsWithUrl = slots.filter((s) => s.slot === 'expressions' && s.url).length;
  const totalExpressions = slots.filter((s) => s.slot === 'expressions').length;

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/[0.07] bg-ink-950/90 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-400 hover:bg-white/[0.07] hover:text-ink-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-white">Sprite Upload Studio</h1>
            <p className="text-[11px] text-ink-400">WEBP only · max 5 MB per slot · CDN-served</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/[0.10] px-3 py-1.5">
          <span className="text-[11px] text-ink-300">
            {expressionsWithUrl} / {totalExpressions} expressions
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 space-y-12">
        {/* Tips banner */}
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] px-5 py-4 text-sm text-ink-300 space-y-1">
          <p className="font-medium text-amber-300">Sprite recommendations</p>
          <ul className="text-[12px] space-y-0.5 text-ink-400 list-disc list-inside">
            <li><strong className="text-ink-300">Expressions (12 slots)</strong> — auto-detected from LLM text. Upload WEBP at 512×768 or 1024×1536px.</li>
            <li><strong className="text-ink-300">Poses (5 slots)</strong> — full-body variants. Requires expression overlay or separate artwork.</li>
            <li><strong className="text-ink-300">Outfits (3 slots)</strong> — default outfit should be uploaded first as CDN fallback.</li>
            <li>All images are served via Cloudflare R2 CDN. Preloaded: <code className="text-amber-300">neutral</code>, <code className="text-amber-300">happy</code>, <code className="text-amber-300">surprised</code>.</li>
          </ul>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-ink-500" />
          </div>
        )}

        {error && <p className="text-rose-400 text-sm">{error}</p>}

        {/* Sections */}
        {!loading && sections.map(({ key, label, slots: sectionSlots }) => (
          <section key={key}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white tracking-tight">{label}</h2>
              <span className="text-[11px] text-ink-500">
                {sectionSlots.filter((s) => s.url).length} / {sectionSlots.length} uploaded
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
              {sectionSlots.map((slot) => (
                <SlotCard
                  key={`${slot.slot}-${slot.name}`}
                  slot={slot}
                  characterId={characterId}
                  onUploaded={handleUploaded}
                  onDeleted={handleDeleted}
                />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
