'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ImagePicker } from '@/components/uploads/ImagePicker';
import { MarkdownEditor } from '@/components/editors/MarkdownEditor';

const TONE_OPTIONS = [
  { value: 'NONE', label: 'Default' },
  { value: 'TSUNDERE', label: 'Tsundere' },
  { value: 'STOIC', label: 'Cold & Calm' },
  { value: 'PLAYFUL', label: 'Cheerful & Lively' },
  { value: 'NURTURING', label: 'Gentle & Sweet' },
  { value: 'MYSTERIOUS', label: 'Mysterious' },
  { value: 'ENERGETIC', label: 'Energetic' },
  { value: 'MELANCHOLIC', label: 'Melancholic' },
  { value: 'FORMAL', label: 'Formal' },
  { value: 'VILLAIN', label: 'Villain' },
];

const LANG_OPTIONS = [
  { value: 'id', label: 'Indonesia 🇮🇩' },
  { value: 'en', label: 'English 🇺🇸' },
  { value: 'ja', label: '日本語 🇯🇵' },
];

interface LoreSection { title: string; bodyMd: string }

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-violet-400 mb-4 pb-2 border-b border-night-line">
      {children}
    </h2>
  );
}

export default function NewCharacterPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Identity
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [language, setLanguage] = useState('id');

  // Personality
  const [tonePreset, setTonePreset] = useState('NONE');
  const [personality, setPersonality] = useState('');
  const [speechStyle, setSpeechStyle] = useState('');

  // Description
  const [descriptionMd, setDescriptionMd] = useState('');

  // Lore
  const [loreSections, setLoreSections] = useState<LoreSection[]>([]);

  // Dialogue
  const [exampleDialogMd, setExampleDialogMd] = useState('');

  // Settings
  const [isPublic, setIsPublic] = useState(true);

  function addLoreSection() {
    setLoreSections((p) => [...p, { title: '', bodyMd: '' }]);
  }
  function updateLore(i: number, patch: Partial<LoreSection>) {
    setLoreSections((p) => p.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }
  function removeLore(i: number) {
    setLoreSections((p) => p.filter((_, idx) => idx !== i));
  }

  async function handleSubmit() {
    if (name.trim().length < 2) {
      setError('Character name must be at least 2 characters.');
      return;
    }
    if (personality.trim().length < 10) {
      setError('Personality description must be at least 10 characters.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<{ character: { id: string } }>('/api/characters', {
        name: name.trim(),
        tagline: tagline.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
        language,
        tonePreset,
        personality: personality.trim() || '',
        speechStyle: speechStyle.trim() || '',
        descriptionMd: descriptionMd.trim() || null,
        isPublic,
      });
      const newId = r.character?.id;
      if (!newId) throw new Error('Server did not return character id');

      // Save lore + dialogue in detail patch if provided
      if (loreSections.some((s) => s.bodyMd.trim()) || exampleDialogMd.trim()) {
        await api.patch(`/api/characters/${newId}/detail`, {
          loreSectionsMd: loreSections.map((s, i) => ({ ...s, order: i })),
          exampleDialogMd: exampleDialogMd.trim() || null,
        });
      }

      router.push(`/studio/characters/${newId}`);
    } catch (e) {
      setError(userFacingApiMessage(e, 'Failed to create character.'));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-20 pt-6 sm:px-6">
      <div className="mb-6 flex items-center gap-2">
        <Link href="/studio/characters" className="text-ink-500 hover:text-ink-200">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-bold text-ink-50">New Character</h1>
      </div>

      <div className="space-y-10">

        {/* ── Identity ── */}
        <section>
          <SectionLabel>Identity</SectionLabel>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                Avatar
              </label>
              <ImagePicker
                value={avatarUrl || null}
                onSelect={setAvatarUrl}
                label="Character Avatar"
                kind="character_avatar"
                className="flex items-center gap-2"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Character name…"
                maxLength={80}
                className="w-full rounded-lg border border-night-line bg-night-surface px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:border-violet-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Short character description…"
                maxLength={200}
                className="w-full rounded-lg border border-night-line bg-night-surface px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:border-violet-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Language</label>
              <div className="flex gap-2 flex-wrap">
                {LANG_OPTIONS.map((opt) => (
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
          </div>
        </section>

        {/* ── Personality ── */}
        <section>
          <SectionLabel>Personality</SectionLabel>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Tone Preset</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TONE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTonePreset(opt.value)}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-left text-xs transition-colors',
                      tonePreset === opt.value
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
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                Personality
              </label>
              <textarea
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="Describe the character's personality, traits, and core values…"
                rows={5}
                maxLength={3000}
                className="w-full resize-y rounded-lg border border-night-line bg-night-surface px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:border-violet-accent focus:outline-none"
              />
              <span className="text-xs text-ink-600">{personality.length}/3000</span>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                Speech Style
              </label>
              <textarea
                value={speechStyle}
                onChange={(e) => setSpeechStyle(e.target.value)}
                placeholder="How does this character speak? Formal, casual, poetic, uses slang…"
                rows={3}
                maxLength={1500}
                className="w-full resize-y rounded-lg border border-night-line bg-night-surface px-3 py-2.5 text-sm text-ink-100 placeholder-ink-600 focus:border-violet-accent focus:outline-none"
              />
              <span className="text-xs text-ink-600">{speechStyle.length}/1500</span>
            </div>
          </div>
        </section>

        {/* ── Description ── */}
        <section>
          <SectionLabel>Description</SectionLabel>
          <MarkdownEditor
            label="Public description"
            value={descriptionMd}
            onChange={setDescriptionMd}
            placeholder="Write the character's backstory, their world, and what makes them unique…"
            maxChars={32_000}
            warnTokens={3000}
            minRows={6}
          />
        </section>

        {/* ── Lore ── */}
        <section>
          <SectionLabel>Lore</SectionLabel>
          <p className="mb-4 text-xs text-ink-500">
            Optional extra sections — world facts, mythology, or deeper character lore.
          </p>
          <div className="space-y-4">
            {loreSections.map((sec, i) => (
              <div key={i} className="rounded-xl border border-ink-700 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    value={sec.title}
                    onChange={(e) => updateLore(i, { title: e.target.value })}
                    placeholder="Section title…"
                    maxLength={120}
                    className="flex-1 rounded-lg bg-night-surface border border-night-line focus:border-violet-accent px-3 py-1.5 text-sm text-ink-200 placeholder-ink-600 focus:outline-none"
                  />
                  <button type="button" onClick={() => removeLore(i)} className="text-ink-600 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
                <MarkdownEditor
                  value={sec.bodyMd}
                  onChange={(v) => updateLore(i, { bodyMd: v })}
                  placeholder="Lore content…"
                  maxChars={8000}
                  warnTokens={1000}
                  minRows={4}
                />
              </div>
            ))}
            {loreSections.length < 6 && (
              <button
                type="button"
                onClick={addLoreSection}
                className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                <Plus size={14} /> Add lore section
              </button>
            )}
          </div>
        </section>

        {/* ── Dialogue ── */}
        <section>
          <SectionLabel>Dialogue Examples</SectionLabel>
          <p className="mb-4 text-xs text-ink-500">
            Show how this character speaks. Format: <code className="text-xs bg-ink-800 px-1 rounded">You: ...\nCharacter: ...</code>
          </p>
          <MarkdownEditor
            label="Example dialogue"
            value={exampleDialogMd}
            onChange={setExampleDialogMd}
            placeholder={'You: Hey, how are you?\nCharacter: ...'}
            maxChars={16_000}
            warnTokens={2000}
            minRows={5}
          />
        </section>

        {/* ── Settings ── */}
        <section>
          <SectionLabel>Settings</SectionLabel>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-night-line bg-night-surface/60 p-4">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 accent-violet-500"
            />
            <div>
              <div className="text-sm font-medium text-ink-100">Public character</div>
              <div className="text-xs text-ink-500">Can be discovered and chatted with by all users</div>
            </div>
          </label>
        </section>

      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={saving || name.trim().length < 2}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-accent to-iris-500 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Creating…' : 'Create character'}
        </button>
      </div>
    </div>
  );
}
