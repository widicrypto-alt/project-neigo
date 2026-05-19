'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Save, Eye, Globe, Lock, Plus, Trash2, ImagePlay } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';
import type { Character } from '@neigo/shared';
import { cn } from '@/lib/cn';
import { MarkdownEditor } from '@/components/editors/MarkdownEditor';
import { ImagePicker } from '@/components/uploads/ImagePicker';

interface CharacterDetail {
  slug: string | null;
  tagline: string | null;
  descriptionMd: string | null;
  loreSectionsMd: Array<{ title: string; bodyMd: string; order: number }>;
  exampleDialogMd: string | null;
  isSecretPromptHidden: boolean;
  publishedAt: string | null;
}

interface LoreSection {
  title: string;
  bodyMd: string;
  order: number;
}

type Tab = 'description' | 'lore' | 'dialog' | 'settings';

export default function CharacterStudioPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);

  const [character, setCharacter] = useState<Character | null>(null);
  const [detail, setDetail] = useState<CharacterDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>('description');

  // Form state.
  const [avatarUrl, setAvatarUrl] = useState('');
  const [tagline, setTagline] = useState('');
  const [descriptionMd, setDescriptionMd] = useState('');
  const [exampleDialogMd, setExampleDialogMd] = useState('');
  const [loreSections, setLoreSections] = useState<LoreSection[]>([]);
  const [isSecretPromptHidden, setIsSecretPromptHidden] = useState(false);
  const [slug, setSlug] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  useEffect(() => {
    api.get<{ character: Character; detail: CharacterDetail; isOwner: boolean }>(`/api/characters/${id}`)
      .then((r) => {
        if (!r.isOwner) {
          setErr('You do not have access to this studio.');
          return;
        }
        setCharacter(r.character);
        setDetail(r.detail);
        setTagline(r.detail.tagline ?? '');
        setDescriptionMd(r.detail.descriptionMd ?? '');
        setExampleDialogMd(r.detail.exampleDialogMd ?? '');
        setLoreSections(r.detail.loreSectionsMd ?? []);
        setIsSecretPromptHidden(r.detail.isSecretPromptHidden ?? false);
        setSlug(r.detail.slug ?? '');
        setIsPublic(r.character.isPublic ?? false);
        setAvatarUrl(r.character.avatarUrl ?? '');
      })
      .catch((e) => setErr(userFacingApiMessage(e, 'Failed to load character.')));
  }, [id]);

  async function saveDetail() {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch(`/api/characters/${id}/detail`, {
        tagline: tagline || null,
        descriptionMd: descriptionMd || null,
        exampleDialogMd: exampleDialogMd || null,
        loreSectionsMd: loreSections,
        isSecretPromptHidden,
        slug: slug || null,
        isPublic,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Failed to save.'));
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    try {
      await api.post(`/api/characters/${id}/publish`, {});
      setIsPublic(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Failed to publish.'));
    }
  }

  function addLoreSection() {
    setLoreSections((prev) => [...prev, { title: '', bodyMd: '', order: prev.length }]);
  }

  function updateLoreSection(index: number, patch: Partial<LoreSection>) {
    setLoreSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeLoreSection(index: number) {
    setLoreSections((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })));
  }

  if (err) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-4">
        <p className="text-red-400">{err}</p>
        <Link href="/studio" className="text-violet-400 hover:underline text-sm">Back to Studio</Link>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'description', label: 'Description' },
    { key: 'lore', label: 'Lore' },
    { key: 'dialog', label: 'Dialogue' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-ink-950">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-ink-950/90 backdrop-blur border-b border-ink-800">
        <Link href="/studio" className="text-ink-400 hover:text-ink-200 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          {character.avatarUrl && (
            <Image src={character.avatarUrl} alt="" width={28} height={28} className="rounded-full object-cover" />
          )}
          <span className="font-semibold text-ink-100 truncate">{character.name}</span>
        </div>
        <span className={cn(
          'ml-auto text-xs rounded-full px-2 py-0.5 flex items-center gap-1',
          isPublic ? 'bg-emerald-900/50 text-emerald-400' : 'bg-ink-800 text-ink-500',
        )}>
          {isPublic ? <Globe size={10} /> : <Lock size={10} />}
          {isPublic ? 'Public' : 'Private'}
        </span>
        <div className="flex items-center gap-2 ml-2">
          <Link
            href={`/studio/characters/${id}/sprites`}
            className="flex items-center gap-1 text-xs text-ink-500 hover:text-amber-400 transition-colors"
          >
            <ImagePlay size={12} /> Sprites
          </Link>
          <Link
            href={`/characters/${id}`}
            target="_blank"
            className="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-300 transition-colors"
          >
            <Eye size={12} /> Preview
          </Link>
          <button
            onClick={saveDetail}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-sm text-white transition-colors disabled:opacity-50"
          >
            <Save size={13} />
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-ink-800 px-4">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key ? 'border-violet-500 text-violet-300' : 'border-transparent text-ink-500 hover:text-ink-300',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-6">
        {tab === 'description' && (
          <div className="flex flex-col gap-4">
            {/* Avatar */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-300">Avatar</label>
              <ImagePicker
                value={avatarUrl || null}
                onSelect={(url) => setAvatarUrl(url)}
                kind="character_avatar"
                label="Avatar"
              />
            </div>

            {/* Tagline */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-300">Tagline</label>
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                maxLength={200}
                placeholder="Short line describing the character…"
                className="w-full rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2 text-sm text-ink-200 placeholder-ink-600 focus:outline-none"
              />
              <span className="text-xs text-ink-600">{tagline.length}/200</span>
            </div>

            {/* Description */}
            <MarkdownEditor
              label="Public description"
              value={descriptionMd}
              onChange={setDescriptionMd}
              placeholder="Write the character's backstory, their world, and what makes them unique…"
              maxChars={32_000}
              warnTokens={3000}
              minRows={8}
            />
          </div>
        )}

        {tab === 'lore' && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-ink-500">
              Lore sections appear in a separate tab on the character detail page. Useful for world facts, mythology, or deeper character information.
            </p>
            {loreSections.map((sec, i) => (
              <div key={i} className="rounded-xl border border-ink-700 p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <input
                    value={sec.title}
                    onChange={(e) => updateLoreSection(i, { title: e.target.value })}
                    placeholder="Section title…"
                    maxLength={120}
                    className="flex-1 rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-1.5 text-sm text-ink-200 placeholder-ink-600 focus:outline-none"
                  />
                  <button onClick={() => removeLoreSection(i)} className="text-ink-600 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
                <MarkdownEditor
                  value={sec.bodyMd}
                  onChange={(v) => updateLoreSection(i, { bodyMd: v })}
                  placeholder="Lore content…"
                  maxChars={8000}
                  warnTokens={1000}
                  minRows={4}
                />
              </div>
            ))}
            {loreSections.length < 6 && (
              <button
                onClick={addLoreSection}
                className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                <Plus size={14} /> Add lore section
              </button>
            )}
          </div>
        )}

        {tab === 'dialog' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-500">
              Example dialogue is shown on the character detail page as a speaking-style guide. Suggested format: <code className="text-xs bg-ink-800 px-1 rounded">You: ...\n{character.name}: ...</code>
            </p>
            <MarkdownEditor
              label="Example dialogue"
              value={exampleDialogMd}
              onChange={setExampleDialogMd}
              placeholder={'You: Hey, how are you?\nCharacter: ...'}
              maxChars={16_000}
              warnTokens={2000}
              minRows={8}
            />
          </div>
        )}

        {tab === 'settings' && (
          <div className="flex flex-col gap-6">
            {/* Slug */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-300">URL Slug</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-500 shrink-0">neigo.my.id/c/</span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  maxLength={120}
                  placeholder="your-character-slug"
                  className="flex-1 rounded-lg bg-ink-900 border border-ink-700 focus:border-violet-500 px-3 py-2 text-sm font-mono text-ink-200 placeholder-ink-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Secret prompt */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-ink-900 border border-ink-700">
              <input
                type="checkbox"
                id="secret-prompt"
                checked={isSecretPromptHidden}
                onChange={(e) => setIsSecretPromptHidden(e.target.checked)}
                className="mt-0.5 accent-violet-500"
              />
              <div>
                <label htmlFor="secret-prompt" className="text-sm font-medium text-ink-200 cursor-pointer">
                  Hide system prompt
                </label>
                <p className="text-xs text-ink-500 mt-0.5">
                  When enabled, visitors cannot see this character&apos;s system prompt content on the detail page.
                </p>
              </div>
            </div>

            {/* Visibility */}
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium text-ink-300">Visibility</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsPublic(false)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 rounded-lg py-3 text-sm border transition-colors',
                    !isPublic ? 'border-violet-500 bg-violet-900/20 text-violet-300' : 'border-ink-700 text-ink-500 hover:border-ink-600',
                  )}
                >
                  <Lock size={14} /> Private
                </button>
                <button
                  onClick={() => setIsPublic(true)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 rounded-lg py-3 text-sm border transition-colors',
                    isPublic ? 'border-emerald-500 bg-emerald-900/20 text-emerald-300' : 'border-ink-700 text-ink-500 hover:border-ink-600',
                  )}
                >
                  <Globe size={14} /> Public
                </button>
              </div>
              {!isPublic && (
                <button
                  onClick={publish}
                  className="rounded-lg bg-emerald-700 hover:bg-emerald-600 py-2.5 text-sm text-white font-medium transition-colors"
                >
                  Publish now
                </button>
              )}
            </div>

            {err && <p className="text-sm text-red-400">{err}</p>}
          </div>
        )}

        {/* Save bar */}
        <div className="flex items-center justify-between pt-4 border-t border-ink-800">
          <Link href={`/characters/${id}`} target="_blank" className="text-sm text-violet-400 hover:underline">
            View public page →
          </Link>
          <button
            onClick={saveDetail}
            disabled={saving}
            className="rounded-lg bg-violet-600 hover:bg-violet-500 px-5 py-2 text-sm text-white font-medium transition-colors disabled:opacity-50"
          >
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
