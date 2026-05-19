'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, Users } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ImagePicker } from '@/components/uploads/ImagePicker';

const LANGUAGE_OPTIONS = [
  { value: 'id', label: 'Bahasa Indonesia 🇮🇩' },
  { value: 'en', label: 'English 🇺🇸' },
  { value: 'ja', label: '日本語 🇯🇵' },
];

const TAGS_SUGGESTIONS = [
  'fantasy', 'romance', 'thriller', 'slice-of-life', 'horror',
  'comedy', 'mystery', 'sci-fi', 'historical', 'supernatural',
  'isekai', 'adventure', 'drama',
];

const TIER_OPTIONS = [
  { value: 'FREE', label: 'Free' },
  { value: 'PAID', label: 'Paid (Supporter)' },
  { value: 'FOUNDER', label: 'Founder only' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-violet-400 mb-4 pb-2 border-b border-night-line">
      {children}
    </h2>
  );
}

export default function NewStoryPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basics
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('id');
  const [tagline, setTagline] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [requiredTier, setRequiredTier] = useState('FREE');

  // Plot & World
  const [plotMd, setPlotMd] = useState('');
  const [openingQuote, setOpeningQuote] = useState('');
  const [openingQuoteBy, setOpeningQuoteBy] = useState('');

  // Settings
  const [isAdult18plus, setIsAdult18plus] = useState(false);
  const [containsMinors, setContainsMinors] = useState(false);
  const [isPublish, setIsPublish] = useState(false);

  function toggleTag(tag: string) {
    setSelectedTags((p) => p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag]);
  }
  function addCustomTag() {
    const t = tagInput.trim().toLowerCase();
    if (!t || selectedTags.includes(t)) return;
    setSelectedTags((p) => [...p, t]);
    setTagInput('');
  }
  function handleIsAdult(v: boolean) { setIsAdult18plus(v); if (v) setContainsMinors(false); }
  function handleMinors(v: boolean) { setContainsMinors(v); if (v) setIsAdult18plus(false); }

  async function handleSubmit() {
    if (title.trim().length < 3) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<{ story: { id: string } }>('/api/stories', {
        title: title.trim(),
        language,
        tagline: tagline.trim() || null,
        synopsis: synopsis.trim() || null,
        tags: selectedTags,
        plotMd: plotMd.trim() || null,
        openingQuote: openingQuote.trim() || null,
        openingQuoteBy: openingQuoteBy.trim() || null,
        coverImageUrl: coverImageUrl.trim() || null,
        requiredTier,
        isAdult18plus,
        containsMinors,
        status: isPublish ? 'published' : 'draft',
      });
      const newId = r.story?.id;
      if (!newId) throw new Error('Server did not return story id');
      router.push(`/studio/stories/${newId}`);
    } catch (e) {
      setError(userFacingApiMessage(e, 'Failed to create story.'));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-20 pt-6 sm:px-6">
      <div className="mb-6 flex items-center gap-2">
        <Link href="/studio/stories" className="text-ink-500 hover:text-ink-200">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-bold text-ink-50">New Story</h1>
      </div>

      <div className="space-y-10">

        {/* ── Basics ── */}
        <section>
          <SectionLabel>Basics</SectionLabel>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                Cover Image
              </label>
              <ImagePicker
                value={coverImageUrl || null}
                onSelect={(url) => setCoverImageUrl(url)}
                kind="story_cover"
                label="Cover image"
                className="flex items-center gap-2"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Your story title…"
                maxLength={200}
                className="w-full rounded-lg border border-night-line bg-night-surface px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:border-violet-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="A one-line hook for your story…"
                maxLength={200}
                className="w-full rounded-lg border border-night-line bg-night-surface px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:border-violet-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Language</label>
              <div className="flex gap-2 flex-wrap">
                {LANGUAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLanguage(opt.value)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs transition-colors',
                      language === opt.value
                        ? 'border-violet-accent bg-violet-accent/15 text-violet-300'
                        : 'border-night-line text-ink-400 hover:border-ink-600',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Synopsis</label>
              <textarea
                value={synopsis}
                onChange={(e) => setSynopsis(e.target.value)}
                placeholder="A short summary shown on the story card…"
                maxLength={1000}
                rows={3}
                className="w-full resize-y rounded-lg border border-night-line bg-night-surface px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:border-violet-accent focus:outline-none"
              />
              <span className="text-xs text-ink-600">{synopsis.length}/1000</span>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Tags</label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {TAGS_SUGGESTIONS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                      selectedTags.includes(tag)
                        ? 'border-violet-accent bg-violet-accent/15 text-violet-300'
                        : 'border-night-line text-ink-500 hover:border-ink-600',
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
                  placeholder="Custom tag…"
                  className="flex-1 rounded-lg border border-night-line bg-night-surface px-3 py-1.5 text-xs text-ink-100 placeholder-ink-600 focus:border-violet-accent focus:outline-none"
                />
                <button type="button" onClick={addCustomTag} className="rounded-lg border border-night-line px-3 py-1.5 text-xs text-ink-400 hover:text-ink-100">
                  Add
                </button>
              </div>
              {selectedTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedTags.map((t) => (
                    <span key={t} className="flex items-center gap-1 rounded-full border border-violet-accent/40 bg-violet-accent/10 px-2.5 py-0.5 text-[11px] text-violet-300">
                      {t}
                      <button type="button" onClick={() => toggleTag(t)} className="opacity-60 hover:opacity-100">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Access tier</label>
              <div className="flex gap-2 flex-wrap">
                {TIER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRequiredTier(opt.value)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs transition-colors',
                      requiredTier === opt.value
                        ? 'border-violet-accent bg-violet-accent/15 text-violet-300'
                        : 'border-night-line text-ink-400 hover:border-ink-600',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Plot & World ── */}
        <section>
          <SectionLabel>Plot & World</SectionLabel>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                Full plot <span className="text-ink-600">(Markdown)</span>
              </label>
              <textarea
                value={plotMd}
                onChange={(e) => setPlotMd(e.target.value)}
                placeholder="Write the full story outline, world rules, and plot arcs…"
                rows={8}
                className="w-full resize-y rounded-lg border border-night-line bg-night-surface px-3 py-2.5 font-mono text-sm text-ink-100 placeholder-ink-600 focus:border-violet-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Opening quote</label>
              <input
                type="text"
                value={openingQuote}
                onChange={(e) => setOpeningQuote(e.target.value)}
                placeholder='"A dramatic line that opens the curtain…"'
                maxLength={500}
                className="w-full rounded-lg border border-night-line bg-night-surface px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:border-violet-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Quote attribution</label>
              <input
                type="text"
                value={openingQuoteBy}
                onChange={(e) => setOpeningQuoteBy(e.target.value)}
                placeholder="Character or narrator name"
                maxLength={120}
                className="w-full rounded-lg border border-night-line bg-night-surface px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:border-violet-accent focus:outline-none"
              />
            </div>
          </div>
        </section>

        {/* ── Cast ── */}
        <section>
          <SectionLabel>Cast</SectionLabel>
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-night-line bg-night-surface/40 p-5">
            <Users size={18} className="mt-0.5 shrink-0 text-ink-600" />
            <div>
              <p className="text-sm font-medium text-ink-300">Add cast after creation</p>
              <p className="mt-1 text-xs text-ink-500">
                Characters are linked from the Cast tab once the story is created. You&apos;ll be taken there right after saving.
              </p>
            </div>
          </div>
        </section>

        {/* ── Settings ── */}
        <section>
          <SectionLabel>Settings</SectionLabel>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-night-line bg-night-surface/60 p-4">
              <input
                type="checkbox"
                checked={isAdult18plus}
                onChange={(e) => handleIsAdult(e.target.checked)}
                disabled={containsMinors}
                className="h-4 w-4 accent-violet-500 disabled:opacity-40"
              />
              <div>
                <div className="text-sm font-medium text-ink-100">Mature content (18+)</div>
                <div className="text-xs text-ink-500">Story contains adult content. Disabled when &quot;Contains minor characters&quot; is on.</div>
              </div>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-night-line bg-night-surface/60 p-4">
              <input
                type="checkbox"
                checked={containsMinors}
                onChange={(e) => handleMinors(e.target.checked)}
                disabled={isAdult18plus}
                className="h-4 w-4 accent-amber-500 disabled:opacity-40"
              />
              <div>
                <div className="text-sm font-medium text-ink-100">Contains minor characters</div>
                <div className="text-xs text-ink-500">Enables additional guardrails. Disables the 18+ flag.</div>
              </div>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-night-line bg-night-surface/60 p-4">
              <input
                type="checkbox"
                checked={isPublish}
                onChange={(e) => setIsPublish(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              <div>
                <div className="text-sm font-medium text-ink-100">Publish immediately</div>
                <div className="text-xs text-ink-500">Make visible to readers now. You can change this in Settings later.</div>
              </div>
            </label>
          </div>
        </section>

      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={saving || title.trim().length < 3}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-accent to-iris-500 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Creating…' : 'Create story'}
        </button>
      </div>
    </div>
  );
}
