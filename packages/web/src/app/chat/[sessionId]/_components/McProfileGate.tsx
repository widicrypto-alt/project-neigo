'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, userFacingApiMessage } from '@/lib/api';
import { McProfileSelector } from '@/components/mc/McProfileSelector';
import type { McProfile, McProfileFormData } from '@/components/mc/McProfileEditor';
import type { CharacterAsMcOption } from '@/components/mc/McProfileSelector';
import { Loader2, AlertTriangle } from 'lucide-react';

interface McProfileGateProps {
  sessionId: string;
  storyHasMc: boolean;
  onComplete: (mcProfileId: string | null, mcType: 'profile' | 'character' | 'anonymous') => void;
}

interface StoryMcInfo {
  hasPredefinedMc: boolean;
  predefinedMcName?: string;
  requiresReplacement: boolean;
}

export function McProfileGate({ sessionId, storyHasMc, onComplete }: McProfileGateProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'profile' | 'character' | 'anonymous'>('anonymous');

  // Fetch story MC info
  const { data: storyMcInfo, isLoading: loadingStory } = useQuery({
    queryKey: ['session-story-mc', sessionId],
    queryFn: () => api.get<StoryMcInfo>(`/api/sessions/${sessionId}/story-mc`),
    enabled: storyHasMc,
  });

  // Fetch MC profiles
  const { data: profilesData, isLoading: loadingProfiles } = useQuery({
    queryKey: ['mc-profiles'],
    queryFn: () => api.get<{ profiles: McProfile[] }>('/api/mc-profiles'),
  });

  // Fetch characters as MC options
  const { data: charactersData, isLoading: loadingCharacters } = useQuery({
    queryKey: ['mc-character-options'],
    queryFn: () => api.get<{ characters: CharacterAsMcOption[] }>('/api/mc-profiles/character-options'),
  });

  // Set default MC mutation
  const setDefaultMutation = useMutation({
    mutationFn: (profileId: string) =>
      api.put('/api/mc-profiles/set-default', { profileId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mc-profiles'] });
    },
  });

  // Delete MC profile mutation
  const deleteMutation = useMutation({
    mutationFn: (profileId: string) =>
      api.del(`/api/mc-profiles/${profileId}`),
    onSuccess: (_data, deletedProfileId) => {
      queryClient.invalidateQueries({ queryKey: ['mc-profiles'] });
      if (selectedId === deletedProfileId) {
        setSelectedId(null);
        setSelectedType('anonymous');
      }
    },
  });

  // Create MC profile mutation
  const createMutation = useMutation({
    mutationFn: (data: McProfileFormData) =>
      api.post<McProfile>('/api/mc-profiles', data),
    onSuccess: (newProfile) => {
      queryClient.invalidateQueries({ queryKey: ['mc-profiles'] });
      setSelectedId(newProfile.id);
      setSelectedType('profile');
    },
  });

  // Apply MC to session mutation
  const applyMutation = useMutation({
    mutationFn: ({ profileId, type }: { profileId: string | null; type: string }) =>
      api.put(`/api/sessions/${sessionId}/mc`, { profileId, type }),
    onSuccess: () => {
      setIsOpen(false);
      onComplete(selectedId, selectedType);
    },
    onError: (err) => {
      alert(userFacingApiMessage(err, 'Failed to apply MC profile'));
    },
  });

  const isLoading = loadingStory || loadingProfiles || loadingCharacters;

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-ink-400">Loading MC setup...</p>
        </div>
      </div>
    );
  }

  // If story has predefined MC and requires replacement, show warning
  if (storyMcInfo?.requiresReplacement) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="mx-4 max-w-md rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-950/40 to-ink-950 p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-full bg-amber-500/20 p-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <h2 className="text-lg font-semibold text-ink-50">
              MC Replacement Required
            </h2>
          </div>
          
          <p className="text-ink-300 mb-2">
            This storyline has a predefined Main Character:
          </p>
          <p className="text-amber-400 font-medium mb-4">
            &ldquo;{storyMcInfo.predefinedMcName || 'Character'}&rdquo;
          </p>
          <p className="text-ink-400 mb-6">
            You need to take over this role or provide your own MC persona to continue.
          </p>

          <McProfileSelector
            profiles={profilesData?.profiles ?? []}
            characters={charactersData?.characters ?? []}
            selectedId={selectedId}
            selectedType={selectedType}
            onSelect={(id, type) => {
              setSelectedId(id);
              setSelectedType(type);
            }}
            onCreate={async (data) => {
              const result = await createMutation.mutateAsync(data);
              return result;
            }}
            onSetDefault={async (profileId) => {
              await setDefaultMutation.mutateAsync(profileId);
            }}
            onDelete={async (profileId) => {
              await deleteMutation.mutateAsync(profileId);
            }}
          />

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => applyMutation.mutate({ profileId: selectedId, type: selectedType })}
              disabled={applyMutation.isPending}
              className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 font-medium text-ink-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
            >
              {applyMutation.isPending ? 'Applying...' : 'Take Over MC Role'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Standard MC selection (even for stories without predefined MC)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="mx-4 max-w-lg rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-transparent p-6 shadow-2xl">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-semibold text-ink-50">
            Welcome, Traveler
          </h2>
          <p className="text-ink-400 mt-1">
            Choose your Main Character persona for this story
          </p>
        </div>

        <McProfileSelector
          profiles={profilesData?.profiles ?? []}
          characters={charactersData?.characters ?? []}
          selectedId={selectedId}
          selectedType={selectedType}
          onSelect={(id, type) => {
            setSelectedId(id);
            setSelectedType(type);
          }}
          onCreate={async (data) => {
            const result = await createMutation.mutateAsync(data);
            return result;
          }}
          onSetDefault={async (profileId) => {
            await setDefaultMutation.mutateAsync(profileId);
          }}
          onDelete={async (profileId) => {
            await deleteMutation.mutateAsync(profileId);
          }}
        />

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => applyMutation.mutate({ profileId: selectedId, type: selectedType })}
            disabled={applyMutation.isPending}
            className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 font-medium text-ink-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            {applyMutation.isPending ? 'Starting...' : 'Enter Story'}
          </button>
        </div>
      </div>
    </div>
  );
}
