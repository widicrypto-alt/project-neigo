'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { X, Upload, ImageIcon, Link } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';

interface ImagePickerProps {
  value: string | null;
  onSelect: (url: string) => void;
  label?: string;
  kind: 'story_cover' | 'story_hero' | 'scene_bg' | 'scene_tile' | 'character_avatar';
  className?: string;
}

type Tab = 'upload' | 'gallery' | 'url';

interface GalleryImage {
  id: string;
  publicUrl: string;
  kind?: string;
  createdAt?: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

export function ImagePicker({ value, onSelect, label, kind, className }: ImagePickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Gallery state
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState(false);

  // URL tab state
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  // Reset state on open/close
  useEffect(() => {
    if (!open) {
      setTab('upload');
      setPreview(null);
      setUploadError(null);
      setUrlInput('');
      setUrlError(null);
    }
  }, [open]);

  // Lazy-load gallery when tab opens
  useEffect(() => {
    if (tab !== 'gallery' || !open) return;
    setGalleryLoading(true);
    setGalleryError(false);
    api
      .get<{ images: GalleryImage[] }>(`/api/uploads/mine?kind=${kind}&limit=50`)
      .then((r) => setGallery(r.images ?? []))
      .catch(() => {
        setGalleryError(true);
        setGallery([]);
      })
      .finally(() => setGalleryLoading(false));
  }, [tab, open, kind]);

  async function handleFile(file: File) {
    if (!ALLOWED_MIME.includes(file.type)) {
      setUploadError('Only JPEG, PNG, WebP supported.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError('File too large (max 5 MB).');
      return;
    }

    // Generate preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    setUploadError(null);
    try {
      const { uploadUrl, r2Key, publicUrl } = await api.post<{
        uploadUrl: string;
        r2Key: string;
        publicUrl: string;
      }>('/api/uploads/intent', { mime: file.type, size: file.size, kind });

      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      await api.post('/api/uploads/commit', { r2Key });
      onSelect(publicUrl);
      setOpen(false);
    } catch (e) {
      setUploadError(userFacingApiMessage(e, 'Upload failed.'));
      setPreview(null);
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleUrlConfirm() {
    const trimmed = urlInput.trim();
    if (!trimmed.startsWith('https://')) {
      setUrlError('URL must start with https://');
      return;
    }
    onSelect(trimmed);
    setOpen(false);
  }

  function handleGallerySelect(image: GalleryImage) {
    onSelect(image.publicUrl);
    setOpen(false);
  }

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
      >
        {value ? (
          <Image
            src={value}
            alt=""
            className="h-10 w-10 rounded-lg object-cover ring-1 ring-ink-700"
            unoptimized
            width={40}
            height={40}
          />
        ) : (
          <div className="h-10 w-10 rounded-lg border-2 border-dashed border-ink-700 flex items-center justify-center hover:border-violet-500/50 transition-colors">
            <Upload className="w-4 h-4 text-ink-500" />
          </div>
        )}
        <span className="text-xs text-ink-400 ml-2">
          {value ? 'Change image' : 'Upload or paste URL'}
        </span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-ink-950 p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              {label ? (
                <span className="text-sm font-semibold text-ink-200">{label}</span>
              ) : (
                <span className="text-sm font-semibold text-ink-200">Select Image</span>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-ink-600 hover:text-ink-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-ink-800 mb-4 -mt-2">
              {(['upload', 'gallery', 'url'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px capitalize transition-colors ${
                    tab === t
                      ? 'border-violet-500 text-violet-300'
                      : 'border-transparent text-ink-500 hover:text-ink-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* ── Upload tab ── */}
            {tab === 'upload' && (
              <div className="space-y-3">
                {/* Drop zone */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-700 p-8 cursor-pointer hover:border-violet-500/50 transition-colors"
                >
                  {preview ? (
                    <Image src={preview} alt="Preview" className="h-32 w-auto rounded-lg object-contain" unoptimized width={128} height={128} />
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-ink-600" />
                      <p className="text-sm text-ink-400 text-center">
                        Drag & drop an image, or click to browse
                      </p>
                      <p className="text-xs text-ink-600">JPEG, PNG, WebP · max 5 MB</p>
                    </>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_MIME.join(',')}
                  onChange={handleFileChange}
                  className="hidden"
                />

                {uploadError && (
                  <p className="text-xs text-red-400">{uploadError}</p>
                )}

                {uploading && (
                  <div className="flex items-center gap-2 text-xs text-ink-400">
                    <div className="w-4 h-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                    Uploading…
                  </div>
                )}
              </div>
            )}

            {/* ── Gallery tab ── */}
            {tab === 'gallery' && (
              <div className="space-y-3">
                {galleryLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                  </div>
                ) : galleryError ? (
                  <p className="text-xs text-red-400 text-center py-4">Failed to load gallery.</p>
                ) : gallery.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-ink-500">
                    <ImageIcon className="w-8 h-8" />
                    <p className="text-sm">No images yet.</p>
                    <p className="text-xs text-ink-600">Upload an image to see it here.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                    {gallery.map((img) => (
                      <button
                        key={img.id}
                        onClick={() => handleGallerySelect(img)}
                        className="rounded-lg overflow-hidden hover:ring-2 hover:ring-violet-500 transition-all"
                      >
                        <Image
                          src={img.publicUrl}
                          alt=""
                          className="h-16 w-full object-cover"
                          unoptimized
                          width={64}
                          height={64}
                        />
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-ink-600 text-center">Your character gallery images.</p>
              </div>
            )}

            {/* ── URL tab ── */}
            {tab === 'url' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Link className="w-4 h-4 text-ink-500 shrink-0" />
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      setUrlError(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleUrlConfirm()}
                    placeholder="https://example.com/image.jpg"
                    className="flex-1 rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2 text-sm text-ink-100 placeholder-ink-600 focus:outline-none"
                  />
                </div>
                {urlError && <p className="text-xs text-red-400">{urlError}</p>}
                <button
                  onClick={handleUrlConfirm}
                  disabled={!urlInput.trim()}
                  className="w-full rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 px-4 py-2 text-sm text-white transition-colors"
                >
                  Use this URL
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
