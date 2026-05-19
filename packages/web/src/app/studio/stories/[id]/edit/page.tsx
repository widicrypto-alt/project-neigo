'use client';
import { use, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Play,
  Save,
  Trash2,
} from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ScenarioListPanel } from '@/components/studio/ScenarioListPanel';
import { CharacterLinker } from '@/components/studio/CharacterLinker';

interface Scenario {
  id: string;
  storyId: string;
  title: string | null;
  tileSubtitle: string | null;
  tileImageUrl: string | null;
  tileOrder: number;
  personaPrompt: string | null;
  openingNarration: string | null;
  openingInputHint: string | null;
  castSubset: string[];
  backgroundImageUrl: string | null;
  bgmUrl: string | null;
  // PLANVNv2 BV7 — VN scene-chain fields.
  nextSceneId: string | null;
  sceneType: 'narration' | 'dialogue' | 'ending';
  endingSlug: string | null;
}

interface StoryDetail {
  id: string;
  title: string;
  authorId: string;
  cast: Array<{ characterId: string; displayName: string; role: string }>;
  scenarios: Array<{ id: string; index: number; title: string; subtitle: string | null }>;
}

export default function StudioStoryEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: storyId } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Scenario>>({});

  const storyQ = useQuery({
    queryKey: ['story', storyId],
    queryFn: () => api.get<{ story: StoryDetail }>(`/api/stories/${storyId}`),
  });
  const scenariosQ = useQuery({
    queryKey: ['story-scenarios', storyId],
    queryFn: () => api.get<{ scenarios: Scenario[] }>(`/api/stories/${storyId}/scenarios`),
  });

  const scenarios = useMemo(() => scenariosQ.data?.scenarios ?? [], [scenariosQ.data?.scenarios]);
  const active = useMemo(
    () => scenarios.find((s) => s.id === activeId) ?? scenarios[0] ?? null,
    [scenarios, activeId],
  );

  // Reset draft when the selected scenario changes (not during render)
  useEffect(() => {
    if (active) setDraft({ ...active });
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cast = storyQ.data?.story.cast ?? [];

  const createMut = useMutation({
    mutationFn: () =>
      api.post<{ scenarios: Scenario[] }>(`/api/stories/${storyId}/scenarios`, {
        title: 'New scenario',
        personaPrompt: '',
        openingNarration: '',
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['story-scenarios', storyId], data);
      const last = data.scenarios[data.scenarios.length - 1];
      if (last) setActiveId(last.id);
    },
  });

  const saveMut = useMutation({
    mutationFn: (patch: Partial<Scenario>) =>
      api.patch<{ scenarios: Scenario[] }>(
        `/api/stories/${storyId}/scenarios/${active!.id}`,
        patch,
      ),
    onSuccess: (data) =>
      queryClient.setQueryData(['story-scenarios', storyId], data),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.del<{ ok: true }>(`/api/stories/${storyId}/scenarios/${active!.id}`),
    onSuccess: () => {
      setActiveId(null);
      scenariosQ.refetch();
    },
  });

  const reorderMut = useMutation({
    mutationFn: (order: string[]) =>
      api.post<{ scenarios: Scenario[] }>(`/api/stories/${storyId}/scenarios/reorder`, { order }),
    onSuccess: (data) =>
      queryClient.setQueryData(['story-scenarios', storyId], data),
  });

  const startTestMut = useMutation({
    mutationFn: () =>
      api.post<{ sessionId: string }>(`/api/stories/${storyId}/start`, {
        scenarioId: active!.id,
        mode: 'author_test',
      }),
    onSuccess: (data) => router.push(`/chat/${data.sessionId}`),
  });

  function move(dir: -1 | 1) {
    if (!active) return;
    const idx = scenarios.findIndex((s) => s.id === active.id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= scenarios.length) return;
    const order = scenarios.map((s) => s.id);
    [order[idx], order[newIdx]] = [order[newIdx]!, order[idx]!];
    reorderMut.mutate(order);
  }

  function applyDraft<K extends keyof Scenario>(k: K, v: Scenario[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  const dirty = useMemo(() => {
    if (!active) return false;
    const keys: (keyof Scenario)[] = [
      'title',
      'tileSubtitle',
      'tileImageUrl',
      'personaPrompt',
      'openingNarration',
      'openingInputHint',
      'castSubset',
      'backgroundImageUrl',
      'bgmUrl',
      'nextSceneId',
      'sceneType',
      'endingSlug',
    ];
    return keys.some((k) => JSON.stringify(active[k]) !== JSON.stringify(draft[k]));
  }, [active, draft]);

  function handleSave() {
    if (!active) return;
    const patch: Partial<Scenario> = {};
    (
      [
        'title',
        'tileSubtitle',
        'tileImageUrl',
        'personaPrompt',
        'openingNarration',
        'openingInputHint',
        'castSubset',
        'backgroundImageUrl',
        'bgmUrl',
        'nextSceneId',
        'sceneType',
        'endingSlug',
      ] as const
    ).forEach((k) => {
      if (JSON.stringify(active[k]) !== JSON.stringify(draft[k])) {
        (patch as Record<string, unknown>)[k] = draft[k];
      }
    });
    saveMut.mutate(patch);
  }

  if (storyQ.isLoading || scenariosQ.isLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-ink-400">Loading…</div>;
  }
  const story = storyQ.data?.story;
  if (!story) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-4 sm:px-6">
      <Link
        href="/studio/stories"
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-400 hover:text-ink-100"
      >
        <ArrowLeft size={14} /> Studio
      </Link>

      <div className="mb-5">
        <h1 className="font-display text-xl font-semibold text-ink-50">{story.title}</h1>
        <p className="text-xs text-ink-500">Scenario editor</p>
      </div>

      <div className="grid gap-5 md:grid-cols-[280px_1fr]">
        {/* List */}
        <ScenarioListPanel
          scenarios={scenarios}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={() => createMut.mutate()}
          creating={createMut.isPending}
        />

        {/* Editor */}
        <div>
          {active ? (
            <div className="space-y-4 rounded-token-xl border border-night-line bg-night-surface p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => move(-1)}
                    disabled={reorderMut.isPending}
                    className="rounded-token-sm border border-night-line p-1.5 text-ink-400 hover:text-ink-100"
                    aria-label="Move up"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => move(1)}
                    disabled={reorderMut.isPending}
                    className="rounded-token-sm border border-night-line p-1.5 text-ink-400 hover:text-ink-100"
                    aria-label="Move down"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                <button
                  onClick={() => {
                    if (confirm('Delete this scenario?')) deleteMut.mutate();
                  }}
                  className="inline-flex items-center gap-1 rounded-token-sm border border-rose-500/40 px-2 py-1 text-xs text-rose-300 transition-fast hover:bg-rose-500/10"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>

              <Field label="Title">
                <input
                  type="text"
                  value={draft.title ?? ''}
                  onChange={(e) => applyDraft('title', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Subtitle (on tile)">
                <input
                  type="text"
                  value={draft.tileSubtitle ?? ''}
                  onChange={(e) => applyDraft('tileSubtitle', e.target.value || null)}
                  className={inputCls}
                  placeholder="e.g. First day at the office"
                />
              </Field>
              <Field label="Tile image URL">
                <input
                  type="url"
                  value={draft.tileImageUrl ?? ''}
                  onChange={(e) => applyDraft('tileImageUrl', e.target.value || null)}
                  className={inputCls}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Persona prompt (scenario system prompt)">
                <textarea
                  value={draft.personaPrompt ?? ''}
                  onChange={(e) => applyDraft('personaPrompt', e.target.value || null)}
                  rows={6}
                  className={inputCls}
                  placeholder="You are Lysandra on your first day as an assistant… (role instructions)"
                />
              </Field>
              <Field label="Opening narration (shown as the first NARRATOR message)">
                <textarea
                  value={draft.openingNarration ?? ''}
                  onChange={(e) => applyDraft('openingNarration', e.target.value || null)}
                  rows={5}
                  className={inputCls}
                  placeholder="The office door opens. Lysandra stares at you stiffly…"
                />
              </Field>
              <Field label="First input hint (composer placeholder)">
                <input
                  type="text"
                  value={draft.openingInputHint ?? ''}
                  onChange={(e) => applyDraft('openingInputHint', e.target.value || null)}
                  className={inputCls}
                  placeholder="e.g. 'Greet her first…'"
                />
              </Field>
              <Field label="Cast appearing in this scenario">
                <CharacterLinker
                  cast={cast}
                  selected={draft.castSubset ?? []}
                  onChange={(sel) => applyDraft('castSubset', sel)}
                  allowSelectAll
                />
              </Field>

              {/* PLANVNv2 BV7 — VN scene-chain fields (desktop only). */}
              <Field label="Background image URL">
                <input
                  type="url"
                  value={draft.backgroundImageUrl ?? ''}
                  onChange={(e) => applyDraft('backgroundImageUrl', e.target.value || null)}
                  className={inputCls}
                  placeholder="https://…"
                />
                {draft.backgroundImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draft.backgroundImageUrl}
                    alt="Background preview"
                    className="mt-2 h-[120px] w-full rounded-token-sm object-cover opacity-80"
                  />
                )}
              </Field>

              <Field label="Next scene (leave empty for open-ended)">
                <select
                  value={draft.nextSceneId ?? ''}
                  onChange={(e) => applyDraft('nextSceneId', e.target.value || null)}
                  className={inputCls}
                >
                  <option value="">— open-ended —</option>
                  {scenarios
                    .filter((s) => s.id !== active.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title ?? s.id}
                      </option>
                    ))}
                </select>
              </Field>

              <Field label="Scene type">
                <select
                  value={draft.sceneType ?? 'dialogue'}
                  onChange={(e) =>
                    applyDraft('sceneType', e.target.value as Scenario['sceneType'])
                  }
                  className={inputCls}
                >
                  <option value="narration">Narration</option>
                  <option value="dialogue">Dialogue</option>
                  <option value="ending">Ending</option>
                </select>
              </Field>

              {draft.sceneType === 'ending' && (
                <Field label="Ending slug (e.g. good-end, true-end)">
                  <input
                    type="text"
                    value={draft.endingSlug ?? ''}
                    onChange={(e) => applyDraft('endingSlug', e.target.value || null)}
                    className={inputCls}
                    placeholder="good-end"
                    maxLength={40}
                  />
                </Field>
              )}

              {saveMut.isError ? (
                <p className="text-xs text-red-400">{userFacingApiMessage(saveMut.error)}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-night-line pt-4">
                <button
                  onClick={handleSave}
                  disabled={!dirty || saveMut.isPending}
                  className="inline-flex items-center gap-2 rounded-token-md bg-violet-accent px-4 py-2 text-sm font-semibold text-white transition-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={14} /> {saveMut.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => startTestMut.mutate()}
                  disabled={dirty || startTestMut.isPending}
                  title={dirty ? 'Save before testing' : ''}
                  className="inline-flex items-center gap-2 rounded-token-md border border-violet-accent/60 bg-violet-accent/10 px-4 py-2 text-sm font-semibold text-violet-hot transition-fast hover:bg-violet-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play size={14} /> Test scenario
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-token-xl border border-dashed border-night-line bg-night-surface/40 p-10 text-center text-sm text-ink-500">
              Select or add a scenario to start editing.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-token-md border border-night-line bg-night-surface2 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600 focus:border-violet-accent focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-ink-500">{label}</div>
      {children}
    </label>
  );
}
