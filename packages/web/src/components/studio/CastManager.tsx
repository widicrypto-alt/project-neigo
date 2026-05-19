'use client';
import { useEffect, useState, useCallback } from 'react';
import { Loader2, UserPlus, X, Search } from 'lucide-react';
import { api, userFacingApiMessage } from '@/lib/api';
import { cn } from '@/lib/cn';

interface CastEntry {
  characterId: string;
  displayName: string;
  role: string;
}

interface CharacterCandidate {
  id: string;
  name: string;
  avatarUrl?: string | null;
  language?: string | null;
  tonePreset?: string | null;
  allowInStories?: boolean;
  tagline?: string | null;
  source: 'owned' | 'public' | 'builtin';
}

interface CandidatesResponse {
  candidates: {
    owned: CharacterCandidate[];
    public: CharacterCandidate[];
    builtin: CharacterCandidate[];
  };
}

interface Props {
  storyId: string;
}

export function CastManager({ storyId }: Props) {
  const [cast, setCast] = useState<CastEntry[]>([]);
  const [candidates, setCandidates] = useState<CharacterCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const fetchCast = useCallback(async () => {
    try {
      const r = await api.get<{ story: { cast: CastEntry[] } }>(`/api/stories/${storyId}`);
      setCast(r.story?.cast ?? []);
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Failed to load cast.'));
    }
  }, [storyId]);

  const fetchCandidates = useCallback(async () => {
    try {
      const r = await api.get<CandidatesResponse>(
        `/api/stories/${storyId}/cast/candidates`,
      );
      setCandidates([
        ...(r.candidates?.owned ?? []),
        ...(r.candidates?.builtin ?? []),
        ...(r.candidates?.public ?? []),
      ]);
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Failed to load cast candidates.'));
    }
  }, [storyId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchCast(), fetchCandidates()]).finally(() => setLoading(false));
  }, [fetchCast, fetchCandidates]);

  async function addCharacter(c: CharacterCandidate) {
    setAdding(true);
    try {
      await api.post(`/api/stories/${storyId}/cast`, {
        characterId: c.id,
        source: c.source,
        displayName: c.name,
      });
      await fetchCast();
      setShowPicker(false);
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Failed to add character.'));
    } finally {
      setAdding(false);
    }
  }

  async function removeCharacter(characterId: string) {
    setRemoving(characterId);
    try {
      await api.del(`/api/stories/${storyId}/cast/${characterId}`);
      setCast((prev) => prev.filter((c) => c.characterId !== characterId));
    } catch (e) {
      setErr(userFacingApiMessage(e, 'Failed to remove character.'));
    } finally {
      setRemoving(null);
    }
  }

  const castIds = new Set(cast.map((c) => c.characterId));
  const filteredCandidates = candidates.filter(
    (c) =>
      !castIds.has(c.id) &&
      (search === '' || c.name.toLowerCase().includes(search.toLowerCase())),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {err && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          {err}
        </div>
      )}

      {/* Current cast */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-200">
            Cast members <span className="text-ink-500">({cast.length})</span>
          </h3>
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-violet-600/40 bg-violet-600/10 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-600/20 transition-colors"
          >
            <UserPlus size={13} />
            Add character
          </button>
        </div>

        {cast.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-700 p-8 text-center">
            <p className="text-sm text-ink-500">No characters yet. Add at least one to publish this story.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {cast.map((c) => (
              <div
                key={c.characterId}
                className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-100 truncate">{c.displayName}</p>
                  {c.role && <p className="text-xs text-ink-500 truncate">{c.role}</p>}
                </div>
                <button
                  onClick={() => removeCharacter(c.characterId)}
                  disabled={removing === c.characterId}
                  className="rounded-lg p-1.5 text-ink-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                  title="Remove from cast"
                >
                  {removing === c.characterId ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <X size={14} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Character picker */}
      {showPicker && (
        <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Search size={14} className="text-ink-500 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search characters…"
              className="flex-1 bg-transparent text-sm text-ink-100 placeholder-ink-600 focus:outline-none"
              autoFocus
            />
          </div>

          {filteredCandidates.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-500">
              {candidates.length === 0
                ? 'No characters available. Create one in Studio → Characters.'
                : 'No matching characters.'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
              {filteredCandidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => addCharacter(c)}
                  disabled={adding}
                  className={cn(
                    'flex items-center gap-3 rounded-lg p-2.5 text-left transition-colors',
                    'hover:bg-ink-800 disabled:opacity-50',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-100 truncate">{c.name}</p>
                    {c.tagline && (
                      <p className="text-xs text-ink-500 truncate">{c.tagline}</p>
                    )}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                      c.source === 'owned'
                        ? 'bg-violet-900/50 text-violet-400'
                        : c.source === 'builtin'
                        ? 'bg-amber-900/50 text-amber-400'
                        : 'bg-ink-800 text-ink-400',
                    )}
                  >
                    {c.source}
                  </span>
                  {adding && <Loader2 size={13} className="animate-spin text-violet-400" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
