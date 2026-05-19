'use client';

import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import WaifuSprite from '@/components/WaifuSprite';
import { api, userFacingApiMessage } from '@/lib/api';
import type { PresenceAffect, PresenceActivity } from '@/lib/presence';
import type { Character } from '@neigo/shared';

interface CharactersResponse {
  characters: Character[];
  ownedCount: number;
  maxCharacters: number;
}

const FRAME_ORDER: Array<{ activity: PresenceActivity; index: number }> = [
  { activity: 'idle', index: 1 },
  { activity: 'listening', index: 2 },
  { activity: 'speaking', index: 3 },
  { activity: 'thinking', index: 4 },
  { activity: 'typing', index: 5 },
  { activity: 'typing', index: 6 },
  { activity: 'thinking', index: 7 },
  { activity: 'thinking', index: 8 },
  { activity: 'success', index: 9 },
  { activity: 'error', index: 10 },
  { activity: 'alert', index: 11 },
  { activity: 'idle', index: 12 },
];

const BETA_PRIORITY: PresenceActivity[] = [
  'idle',
  'listening',
  'thinking',
  'typing',
  'speaking',
  'success',
  'error',
  'alert',
];

const AFFECTS: PresenceAffect[] = [
  'neutral',
  'curious',
  'empathetic',
  'confident',
  'vulnerable',
  'conflicted',
  'playful',
  'guarded',
];

export default function SpriteDebugPage() {
  return (
    <Suspense fallback={<div className="p-6 md:p-10 text-sm text-ink-400">Loading sprite debugger...</div>}>
      <SpriteDebugPageContent />
    </Suspense>
  );
}

function SpriteDebugPageContent() {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');
  const [affect, setAffect] = useState<PresenceAffect>('neutral');
  const [showGrid, setShowGrid] = useState(true);

  const chars = useQuery({
    queryKey: ['characters', 'sprite-debug'],
    queryFn: () => api.get<CharactersResponse>('/api/characters'),
  });

  const characters = chars.data?.characters ?? [];
  const selectedCharacter =
    characters.find((character) => character.id === selectedCharacterId) ?? characters[0] ?? null;

  const builtIns = characters.filter((character) => character.isBuiltIn);

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div className="max-w-6xl mx-auto">
        <p className="text-[11px] uppercase tracking-[0.18em] text-accent-400 mb-2">Debug only</p>
        <h1 className="display text-3xl md:text-4xl tracking-tight text-ink-50">Sprite QA</h1>
        <p className="mt-3 text-sm text-ink-400 max-w-3xl">
          Preview all 12 waifu-sprites slots without opening chat. Dev overlay shows active frame index and whether the renderer is using the spritesheet, avatar fallback, or placeholder.
        </p>
      </div>

      <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-xl space-y-4">
          <div>
            <h2 className="text-sm font-medium text-ink-100">Character</h2>
            <p className="mt-1 text-xs text-ink-500">Built-ins default to /sprites/&lt;slug&gt;/sheet.png.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.16em] text-ink-500">Select character</label>
            <select
              className="input"
              value={selectedCharacter?.id ?? ''}
              onChange={(event) => setSelectedCharacterId(event.target.value)}
            >
              {builtIns.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.16em] text-ink-500">Affect overlay</label>
            <select
              className="input"
              value={affect}
              onChange={(event) => setAffect(event.target.value as PresenceAffect)}
            >
              {AFFECTS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(event) => setShowGrid(event.target.checked)}
            />
            Show 4x3 guide overlay
          </label>

          {selectedCharacter && (
            <div className="rounded-2xl border border-white/[0.05] bg-ink-950/50 p-4">
              <div className="relative flex justify-center">
                <WaifuSprite
                  activity="thinking"
                  affect={affect}
                  spriteSheetUrl={selectedCharacter.spriteSheetUrl}
                  avatarUrl={selectedCharacter.avatarUrl}
                  characterName={selectedCharacter.name}
                />
                {showGrid && <SpriteGridGuide />}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-white/[0.05] bg-ink-950/50 p-4 space-y-3">
            <h3 className="text-sm font-medium text-ink-100">4×3 checklist</h3>
            <div className="grid grid-cols-1 gap-1.5 text-xs text-ink-400">
              {FRAME_ORDER.map((entry) => (
                <div key={entry.index} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2">
                  <span>Frame {entry.index}</span>
                  <span className="text-ink-200">{entry.activity}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.05] bg-ink-950/50 p-4 space-y-2">
            <h3 className="text-sm font-medium text-ink-100">Beta priority</h3>
            <p className="text-xs text-ink-500">Fill these first if you are not drawing all 12 states yet.</p>
            <div className="flex flex-wrap gap-2">
              {BETA_PRIORITY.map((activity) => (
                <span
                  key={activity}
                  className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[11px] text-ink-300"
                >
                  {activity}
                </span>
              ))}
            </div>
          </div>

          {chars.error && (
            <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">
              {userFacingApiMessage(chars.error, 'Failed to load characters.')}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-xl">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {selectedCharacter &&
              FRAME_ORDER.map((entry) => (
                <div key={entry.index} className="rounded-2xl border border-white/[0.05] bg-ink-950/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-ink-500">Frame {entry.index}</p>
                      <p className="text-sm text-ink-100 mt-1">{entry.activity}</p>
                    </div>
                  </div>
                  <div className="relative flex justify-center">
                    <WaifuSprite
                      activity={entry.activity}
                      affect={affect}
                      spriteSheetUrl={selectedCharacter.spriteSheetUrl}
                      avatarUrl={selectedCharacter.avatarUrl}
                      characterName={selectedCharacter.name}
                    />
                    {showGrid && <SpriteGridGuide />}
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SpriteGridGuide() {
  return (
    <div className="pointer-events-none absolute top-0 left-1/2 h-44 w-44 -translate-x-1/2 rounded-2xl border border-accent-400/20">
      <div className="absolute inset-y-0 left-1/4 border-l border-accent-400/20" />
      <div className="absolute inset-y-0 left-2/4 border-l border-accent-400/20" />
      <div className="absolute inset-y-0 left-3/4 border-l border-accent-400/20" />
      <div className="absolute inset-x-0 top-1/3 border-t border-accent-400/20" />
      <div className="absolute inset-x-0 top-2/3 border-t border-accent-400/20" />
    </div>
  );
}