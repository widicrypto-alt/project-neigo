'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { StoryStartModal } from '@/components/mc';
import type { McProfile } from '@/components/mc/McProfileEditor';
import type { CharacterAsMcOption } from '@/components/mc/McProfileSelector';

interface CastEntry {
  characterId: string;
  displayName: string;
  role: string;
  avatarUrl?: string | null;
}

interface Scenario {
  id: string;
  title: string;
  synopsis?: string | null;
}

interface Story {
  id: string;
  title: string;
  synopsis: string | null;
  hasMcSlot?: boolean;
  cast: CastEntry[];
  tags: string[];
  isAdult18plus?: boolean;
}

interface Props {
  story: Story;
  scenarios: Scenario[];
  mcProfiles: McProfile[];
  userCharacters: CharacterAsMcOption[];
  hasConfirmedAdult: boolean;
}

export function StoryInteractiveContent({ 
  story, 
  scenarios, 
  mcProfiles: initialMcProfiles, 
  userCharacters,
  hasConfirmedAdult 
}: Props) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [adultConfirmed, setAdultConfirmed] = useState(hasConfirmedAdult);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [mcProfiles, setMcProfiles] = useState<McProfile[]>(initialMcProfiles);

  const defaultScenario = scenarios[0];

  async function handleStart(scenarioId?: string) {
    if (!scenarioId) {
      setStartErr('Tidak ada skenario tersedia untuk cerita ini.');
      return;
    }
    setSelectedScenarioId(scenarioId);
    setModalOpen(true);
  }

  async function performStart(options: { 
    mcProfileId?: string | null; 
    characterId?: string | null;
    mode: 'use-mc-profile' | 'use-character' | 'anonymous' 
  }) {
    if (!selectedScenarioId) return;
    
    setStarting(true);
    setStartErr(null);
    try {
      const result = await api.post<{ sessionId: string }>(`/api/stories/${story.id}/start`, {
        scenarioId: selectedScenarioId,
        mode: 'play',
      });
      
      if (options.mode !== 'anonymous' || options.mcProfileId || options.characterId) {
        const mcType = options.mode === 'use-character' ? 'character' 
                     : options.mode === 'use-mc-profile' ? 'profile' 
                     : 'anonymous';
        const profileId = options.mode === 'use-character' ? options.characterId 
                        : options.mode === 'use-mc-profile' ? options.mcProfileId 
                        : null;
        
        await api.put(`/api/sessions/${result.sessionId}/mc`, {
          profileId,
          type: mcType
        });
      }

      router.push(`/chat/${result.sessionId}`);
    } catch (e) {
      const msg = userFacingApiMessage(e, 'Gagal memulai cerita.');
      if (msg.includes('401') || msg === 'unauthorized') {
        router.push('/login');
      } else {
        setStartErr(msg);
        setStarting(false);
      }
    }
  }

  function confirmAdult() {
    // Set cookie for persistence (30 days)
    document.cookie = `neigo_adult_confirmed=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    setAdultConfirmed(true);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Adult gate */}
      {story.isAdult18plus && !adultConfirmed && (
        <div className="rounded-xl border border-red-700/40 bg-red-900/20 p-4 flex flex-col gap-3">
          <p className="text-sm text-red-300 font-medium">Konten ini mengandung materi dewasa (18+).</p>
          <button
            onClick={confirmAdult}
            className="self-start rounded-lg bg-red-700 hover:bg-red-600 px-4 py-2 text-sm text-white font-medium transition-colors"
          >
            Saya 18+ — Tampilkan
          </button>
        </div>
      )}

      {/* Scenarios */}
      {scenarios.length > 1 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">Pilih Skenario</h2>
          <div className="flex flex-col gap-2">
            {scenarios.map((sc) => (
              <button
                key={sc.id}
                onClick={() => handleStart(sc.id)}
                disabled={starting}
                className="flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-900 hover:border-violet-500/50 hover:bg-ink-800 px-4 py-3 text-left transition-colors disabled:opacity-50"
              >
                <Play size={14} className="mt-0.5 shrink-0 text-violet-400" />
                <div>
                  <p className="text-sm font-medium text-ink-200">{sc.title}</p>
                  {sc.synopsis && <p className="mt-0.5 text-xs text-ink-500 line-clamp-2">{sc.synopsis}</p>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Start CTA */}
      {startErr && <p className="text-sm text-red-400">{startErr}</p>}

      {scenarios.length <= 1 && (
        <button
          onClick={() => handleStart(defaultScenario?.id)}
          disabled={starting}
          className={cn(
            'flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold transition-colors',
            starting
              ? 'bg-violet-700/50 text-violet-300 cursor-not-allowed'
              : 'bg-violet-600 hover:bg-violet-500 text-white',
          )}
        >
          <Play size={18} />
          {starting ? 'Memulai…' : 'Mulai Cerita'}
        </button>
      )}

      {scenarios.length > 1 && (
        <p className="text-center text-xs text-ink-600">Pilih skenario di atas untuk memulai</p>
      )}

      {modalOpen && (
        <StoryStartModal
          story={{
            id: story.id,
            title: story.title,
            synopsis: story.synopsis,
            hasMcSlot: story.hasMcSlot ?? (Array.isArray(story.cast) && story.cast.length > 0),
            discoveryMode: story.tags?.includes('discovery') || false,
          }}
          mcProfiles={mcProfiles}
          userCharacters={userCharacters}
          open={modalOpen}
          onOpenChange={setModalOpen}
          onStart={performStart}
          onCreateMcProfile={async (data) => {
            const profile = await api.post<McProfile>('/api/mc-profiles', data);
            setMcProfiles(prev => [profile, ...prev]);
            return profile;
          }}
        />
      )}
    </div>
  );
}
