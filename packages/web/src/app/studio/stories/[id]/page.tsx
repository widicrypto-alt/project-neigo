'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, Eye, PenSquare } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { MarkdownEditor } from '@/components/editors/MarkdownEditor';
import { VnReadinessMeter } from '@/components/studio/VnReadinessMeter';
import { CastManager } from '@/components/studio/CastManager';
import { ImagePicker } from '@/components/uploads/ImagePicker';

interface CastEntry {
  characterId: string;
  displayName: string;
  role: string;
}

interface StoryBasic {
  id: string;
  title: string;
  synopsis: string | null;
  tagline: string | null;
  coverImageUrl: string | null;
  language: string;
  requiredTier: string;
  tags: string[];
  authorId: string;
  status: string;
  cast: CastEntry[];
  openingSceneId?: string | null;
  plotMd?: string | null;
  aiPlotMd?: string | null;
  aiGuidelinesMd?: string | null;
  aiReminderMd?: string | null;
  outputReminderMd?: string | null;
  isAdvancedMode?: boolean;
  isSecretMode?: boolean;
  isAdult18plus?: boolean;
  containsMinors?: boolean;
  dungeonMindEnabled?: boolean;
  openingQuote?: string | null;
  openingQuoteBy?: string | null;
  slug?: string | null;
  playAsCharacterId?: string | null;
  vnReadinessPct?: number;
  metadata?: { tags?: string[]; contentWarnings?: string[]; estimatedMinutes?: number };
}

type Tab = 'basics' | 'plot' | 'cast' | 'ai' | 'settings';

const LANG_OPTIONS = [
  { value: 'id', label: 'Bahasa Indonesia 🇮🇩' },
  { value: 'en', label: 'English 🇺🇸' },
  { value: 'ja', label: '日本語 🇯🇵' },
];
const TIER_OPTIONS = [
  { value: 'FREE', label: 'Free' },
  { value: 'PAID', label: 'Paid (Supporter)' },
  { value: 'FOUNDER', label: 'Founder only' },
];
const TAGS_SUGGESTIONS = ['fantasy', 'romance', 'thriller', 'slice-of-life', 'horror', 'comedy', 'mystery', 'sci-fi', 'historical', 'supernatural'];

export default function StudioStoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [story, setStory] = useState<StoryBasic | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>('basics');

  // ── Basics tab state ────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [tagline, setTagline] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [language, setLanguage] = useState('id');
  const [requiredTier, setRequiredTier] = useState('FREE');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | ''>('');

  // ── Plot tab state ───────────────────────────────────────────────────────────
  const [plotMd, setPlotMd] = useState('');
  const [openingQuote, setOpeningQuote] = useState('');
  const [openingQuoteBy, setOpeningQuoteBy] = useState('');

  // ── AI tab state ─────────────────────────────────────────────────────────────
  const [aiPlotMd, setAiPlotMd] = useState('');
  const [aiGuidelinesMd, setAiGuidelinesMd] = useState('');
  const [aiReminderMd, setAiReminderMd] = useState('');
  const [outputReminderMd, setOutputReminderMd] = useState('');
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);

  // ── Settings tab state ───────────────────────────────────────────────────────
  const [isSecretMode, setIsSecretMode] = useState(false);
  const [isAdult18plus, setIsAdult18plus] = useState(false);
  const [containsMinors, setContainsMinors] = useState(false);
  const [dungeonMindEnabled, setDungeonMindEnabled] = useState(false);
  const [slug, setSlug] = useState('');
  const [playAsCharacterId, setPlayAsCharacterId] = useState<string>('');

  // XOR handlers for mature / minors flags
  function handleIsAdult18plus(v: boolean) {
    setIsAdult18plus(v);
    if (v) setContainsMinors(false);
  }
  function handleContainsMinors(v: boolean) {
    setContainsMinors(v);
    if (v) setIsAdult18plus(false);
  }

  function toggleTag(t: string) {
    setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  }
  function addTagInput() {
    const t = tagInput.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    setTags((p) => [...p, t]);
    setTagInput('');
  }

  useEffect(() => {
    api
      .get<{ story: StoryBasic }>(`/api/stories/${id}`)
      .then((r) => {
        const s = r.story;
        setStory(s);
        setTitle(s.title ?? '');
        setSynopsis(s.synopsis ?? '');
        setTagline(s.tagline ?? '');
        setCoverImageUrl(s.coverImageUrl ?? '');
        setLanguage(s.language ?? 'id');
        setRequiredTier(s.requiredTier ?? 'FREE');
        setTags(s.tags ?? s.metadata?.tags ?? []);
        setEstimatedMinutes(s.metadata?.estimatedMinutes ?? '');
        setPlotMd(s.plotMd ?? '');
        setAiPlotMd(s.aiPlotMd ?? '');
        setAiGuidelinesMd(s.aiGuidelinesMd ?? '');
        setAiReminderMd(s.aiReminderMd ?? '');
        setOutputReminderMd(s.outputReminderMd ?? '');
        setIsAdvancedMode(s.isAdvancedMode ?? false);
        setIsSecretMode(s.isSecretMode ?? false);
        setIsAdult18plus(s.isAdult18plus ?? false);
        setContainsMinors(s.containsMinors ?? false);
        setDungeonMindEnabled(s.dungeonMindEnabled ?? false);
        setOpeningQuote(s.openingQuote ?? '');
        setOpeningQuoteBy(s.openingQuoteBy ?? '');
        setSlug(s.slug ?? '');
        setPlayAsCharacterId(s.playAsCharacterId ?? '');
      })
      .catch((e) => setErr(userFacingApiMessage(e, 'Failed to load story.')));
  }, [id]);

  async function saveBasics() {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch(`/api/stories/${id}`, {
        title: title.trim() || undefined,
        synopsis: synopsis.trim() || null,
        tagline: tagline.trim() || null,
        coverImageUrl: coverImageUrl.trim() || null,
        language,
        requiredTier,
        tags,
        metadata: estimatedMinutes !== '' ? { estimatedMinutes: Number(estimatedMinutes) } : undefined,
      });
      setStory((prev) => prev ? { ...prev, title: title.trim(), status: prev.status } : prev);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Failed to save basics.'));
    } finally {
      setSaving(false);
    }
  }

  async function savePlot() {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch(`/api/stories/${id}/detail`, {
        plotMd: plotMd || null,
        openingQuote: openingQuote || null,
        openingQuoteBy: openingQuoteBy || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Failed to save plot.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveAi() {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch(`/api/stories/${id}/detail`, {
        aiPlotMd: aiPlotMd || null,
        aiGuidelinesMd: aiGuidelinesMd || null,
        aiReminderMd: aiReminderMd || null,
        outputReminderMd: outputReminderMd || null,
        isAdvancedMode,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Failed to save AI guide.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch(`/api/stories/${id}/detail`, {
        slug: slug || null,
        isAdult18plus,
        containsMinors,
        dungeonMindEnabled,
        isSecretMode,
        playAsCharacterId: playAsCharacterId || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Failed to save settings.'));
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (tab === 'basics') return saveBasics();
    if (tab === 'plot') return savePlot();
    if (tab === 'ai') return saveAi();
    if (tab === 'settings') return saveSettings();
  }

  async function publish() {
    try {
      await api.post(`/api/stories/${id}/publish`, {});
      setStory((prev) => (prev ? { ...prev, status: 'published' } : prev));
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Failed to publish.'));
    }
  }

  if (!story && !err) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (err && !story) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-4">
        <p className="text-red-400">{err}</p>
        <Link href="/studio/stories" className="text-violet-400 hover:underline text-sm">
          Back to Studio
        </Link>
      </div>
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'basics', label: 'Basics' },
    { key: 'plot', label: 'Plot & world' },
    { key: 'cast', label: 'Cast' },
    { key: 'ai', label: 'AI guide' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-ink-950">
      {/* TopBar */}
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-ink-950/90 backdrop-blur border-b border-ink-800">
        <Link href="/studio/stories" className="text-ink-400 hover:text-ink-200 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <span className="font-semibold text-ink-100 truncate">{story?.title}</span>
        <span
          className={cn(
            'ml-2 text-xs rounded-full px-2 py-0.5',
            story?.status === 'published'
              ? 'bg-emerald-900/50 text-emerald-400'
              : 'bg-ink-800 text-ink-500',
          )}
        >
          {story?.status === 'published' ? 'Published' : 'Draft'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/studio/stories/${id}/edit`}
            className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-violet-300 transition-colors"
          >
            <PenSquare size={12} /> Scenes
          </Link>
          <Link
            href={`/stories/${id}`}
            target="_blank"
            className="flex items-center gap-1 text-xs text-ink-400 hover:text-ink-200 transition-colors"
          >
            <Eye size={12} /> Preview
          </Link>
          {tab !== 'cast' && (
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-sm text-white transition-colors disabled:opacity-50"
            >
              <Save size={13} />
              {saved ? 'Saved!' : saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-ink-800 px-4 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === key
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-ink-500 hover:text-ink-300',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-6">
        {/* VN readiness */}
        {(story?.vnReadinessPct ?? 0) < 100 && (
          <VnReadinessMeter pct={story?.vnReadinessPct ?? 0} showChecklist />
        )}

        {/* ── BASICS TAB ─────────────────────────────────────────────────────── */}
        {tab === 'basics' && (
          <div className="flex flex-col gap-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Story title…"
                className="w-full rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Tagline</label>
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                maxLength={200}
                placeholder="One-line pitch or hook…"
                className="w-full rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Synopsis</label>
              <textarea
                value={synopsis}
                onChange={(e) => setSynopsis(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Short summary visible on the catalog page…"
                className="w-full resize-y rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Cover image</label>
              <ImagePicker
                value={coverImageUrl || null}
                onSelect={(url) => setCoverImageUrl(url)}
                kind="story_cover"
                label="Cover image"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2.5 text-sm text-ink-100 focus:outline-none"
                >
                  {LANG_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Access tier</label>
                <select
                  value={requiredTier}
                  onChange={(e) => setRequiredTier(e.target.value)}
                  className="w-full rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2.5 text-sm text-ink-100 focus:outline-none"
                >
                  {TIER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Estimated read time (minutes)</label>
              <input
                type="number"
                min={1}
                max={600}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value ? Number(e.target.value) : '')}
                placeholder="e.g. 30"
                className="w-full rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:outline-none"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Tags</label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {TAGS_SUGGESTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] border transition-colors',
                      tags.includes(t)
                        ? 'bg-violet-accent/20 border-violet-accent/60 text-violet-300'
                        : 'border-night-line text-ink-500 hover:border-ink-600',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTagInput())}
                  placeholder="Custom tag…"
                  maxLength={30}
                  className="flex-1 rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2 text-sm text-ink-100 placeholder-ink-600 focus:outline-none"
                />
                <button
                  onClick={addTagInput}
                  className="rounded-lg border border-ink-700 px-3 py-2 text-xs text-ink-400 hover:text-ink-200 hover:border-ink-500 transition-colors"
                >
                  Add
                </button>
              </div>
              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="flex items-center gap-1 rounded-full border border-violet-accent/40 bg-violet-accent/10 px-2.5 py-0.5 text-[11px] text-violet-300"
                    >
                      {t}
                      <button onClick={() => toggleTag(t)} className="opacity-60 hover:opacity-100">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {err && <p className="text-sm text-red-400">{err}</p>}
          </div>
        )}

        {/* ── PLOT TAB ──────────────────────────────────────────────────────── */}
        {tab === 'plot' && (
          <>
            <MarkdownEditor
              label="Story plot (public description)"
              value={plotMd}
              onChange={setPlotMd}
              placeholder="Write a plot summary displayed on the public story page…"
              maxChars={32_000}
              warnTokens={3000}
              minRows={8}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-300">Opening Quote</label>
              <textarea
                value={openingQuote}
                onChange={(e) => setOpeningQuote(e.target.value)}
                placeholder="Opening quote displayed in the story page hero section…"
                rows={3}
                maxLength={500}
                className="w-full rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2 text-sm text-ink-200 placeholder-ink-600 resize-none focus:outline-none"
              />
              <input
                value={openingQuoteBy}
                onChange={(e) => setOpeningQuoteBy(e.target.value)}
                placeholder="— Character name (optional)"
                maxLength={120}
                className="w-full rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2 text-sm text-ink-200 placeholder-ink-600 focus:outline-none"
              />
            </div>
          </>
        )}

        {/* ── CAST TAB ──────────────────────────────────────────────────────── */}
        {tab === 'cast' && <CastManager storyId={id} />}

        {/* ── AI TAB ────────────────────────────────────────────────────────── */}
        {tab === 'ai' && (
          <>
            <div className="rounded-xl bg-amber-900/20 border border-amber-700/30 p-3 text-xs text-amber-300">
              AI guide is only visible to you. Used to control how the AI processes this story.
            </div>

            <MarkdownEditor
              label="AI secret plot"
              value={aiPlotMd}
              onChange={setAiPlotMd}
              placeholder="Detailed plot injected into the AI system prompt…"
              maxChars={32_000}
              warnTokens={4000}
              minRows={6}
            />

            <MarkdownEditor
              label="AI guidelines"
              value={aiGuidelinesMd}
              onChange={setAiGuidelinesMd}
              placeholder="Rules the AI must follow when playing this story…"
              maxChars={16_000}
              warnTokens={2000}
              minRows={5}
            />

            <MarkdownEditor
              label="System reminder"
              value={aiReminderMd}
              onChange={setAiReminderMd}
              placeholder="Short message repeated at the end of every context window…"
              maxChars={8_000}
              warnTokens={500}
              minRows={3}
            />

            <MarkdownEditor
              label="Output Reminder"
              value={outputReminderMd}
              onChange={setOutputReminderMd}
              placeholder="Output format instructions repeated before each AI response…"
              maxChars={8_000}
              warnTokens={500}
              minRows={3}
            />

            <div className="flex items-start gap-3 p-4 rounded-xl bg-ink-900 border border-ink-700">
              <input
                type="checkbox"
                id="advanced-mode"
                checked={isAdvancedMode}
                onChange={(e) => setIsAdvancedMode(e.target.checked)}
                className="mt-0.5 accent-violet-500"
              />
              <div>
                <label htmlFor="advanced-mode" className="text-sm font-medium text-ink-200 cursor-pointer">
                  Advanced mode
                </label>
                <p className="text-xs text-ink-500 mt-0.5">Enable additional AI fields and more detailed output format controls.</p>
              </div>
            </div>
          </>
        )}

        {/* ── SETTINGS TAB ──────────────────────────────────────────────────── */}
        {tab === 'settings' && (
          <div className="flex flex-col gap-5">
            {/* URL Slug */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-300">URL Slug</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-500 shrink-0">neigo.my.id/s/</span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  maxLength={120}
                  placeholder="your-story-slug"
                  className="flex-1 rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2 text-sm font-mono text-ink-200 placeholder-ink-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Play-as character */}
            {(story?.cast?.length ?? 0) > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-ink-300">Play as character</label>
                <p className="text-xs text-ink-500">When set, the player inhabits this character in the story.</p>
                <select
                  value={playAsCharacterId}
                  onChange={(e) => setPlayAsCharacterId(e.target.value)}
                  className="w-full rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2.5 text-sm text-ink-100 focus:outline-none"
                >
                  <option value="">— None (narrator perspective) —</option>
                  {story?.cast?.map((c) => (
                    <option key={c.characterId} value={c.characterId}>{c.displayName}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Mature / minor flags */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-ink-900 border border-ink-700">
              <input
                type="checkbox"
                id="adult18"
                checked={isAdult18plus}
                onChange={(e) => handleIsAdult18plus(e.target.checked)}
                disabled={containsMinors}
                className="mt-0.5 accent-violet-500 disabled:opacity-40"
              />
              <div>
                <label htmlFor="adult18" className="text-sm font-medium text-ink-200 cursor-pointer">
                  Mature content (18+)
                </label>
                <p className="text-xs text-ink-500 mt-0.5">
                  Story contains adult content.{containsMinors ? ' Disabled when "Contains minor characters" is on.' : ''}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl bg-ink-900 border border-ink-700">
              <input
                type="checkbox"
                id="minors"
                checked={containsMinors}
                onChange={(e) => handleContainsMinors(e.target.checked)}
                disabled={isAdult18plus}
                className="mt-0.5 accent-amber-500 disabled:opacity-40"
              />
              <div>
                <label htmlFor="minors" className="text-sm font-medium text-ink-200 cursor-pointer">
                  Contains minor characters
                </label>
                <p className="text-xs text-ink-500 mt-0.5">
                  Enables additional content guardrails.{isAdult18plus ? ' Disabled when "Mature content (18+)" is on.' : ''}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl bg-ink-900 border border-ink-700">
              <input
                type="checkbox"
                id="dungeon"
                checked={dungeonMindEnabled}
                onChange={(e) => setDungeonMindEnabled(e.target.checked)}
                className="mt-0.5 accent-violet-500"
              />
              <div>
                <label htmlFor="dungeon" className="text-sm font-medium text-ink-200 cursor-pointer">
                  Dungeon Mind
                </label>
                <p className="text-xs text-ink-500 mt-0.5">Enable Dungeon Master mode — AI reacts to player choices more dynamically.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl bg-ink-900 border border-ink-700">
              <input
                type="checkbox"
                id="secret"
                checked={isSecretMode}
                onChange={(e) => setIsSecretMode(e.target.checked)}
                className="mt-0.5 accent-violet-500"
              />
              <div>
                <label htmlFor="secret" className="text-sm font-medium text-ink-200 cursor-pointer">
                  Secret mode
                </label>
                <p className="text-xs text-ink-500 mt-0.5">Hide AI plot and guidelines from the public.</p>
              </div>
            </div>

            {/* Publish */}
            {story?.status !== 'published' && (
              <div className="rounded-xl border border-emerald-700/50 bg-emerald-900/10 p-4">
                <p className="text-sm text-emerald-300 mb-3">This story is still a draft. Ready to publish?</p>
                <button
                  onClick={publish}
                  className="rounded-lg bg-emerald-700 hover:bg-emerald-600 px-4 py-2 text-sm text-white font-medium transition-colors"
                >
                  Publish now
                </button>
              </div>
            )}

            {err && <p className="text-sm text-red-400">{err}</p>}
          </div>
        )}

        {tab !== 'cast' && (
          <div className="flex items-center justify-between pt-4 border-t border-ink-800">
            <Link href={`/stories/${id}`} target="_blank" className="text-sm text-violet-400 hover:underline">
              View public page →
            </Link>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-violet-600 hover:bg-violet-500 px-5 py-2 text-sm text-white font-medium transition-colors disabled:opacity-50"
            >
              {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
