/**
 * detail-extensions.ts — PLANIMPv2/v3 cached computations.
 *
 * - computeCharacterTokenCache: estimates tokens for character text fields.
 * - computeStoryTokenCache: estimates tokens for story plot + cast + per-scenario.
 * - derivePersonaFromFlat: maps flat Character persona fields → semantic 4-row.
 */
import type { characters as CharactersTable, stories as StoriesTable, storyScenes as ScenesTable } from '../db/schema.js';
import { estimateTokensFast } from './tokenizer.js';

type CharacterRow = typeof CharactersTable.$inferSelect;
type StoryRow = typeof StoriesTable.$inferSelect;
type SceneRow = typeof ScenesTable.$inferSelect;

export interface CharacterTokenCache {
  description: number;
  exampleDialog: number;
  total: number;
  computedAt: string;
}

export interface StoryTokenCache {
  plot: number;
  characters: number;
  scenarios: number;
  total: number;
  computedAt: string;
}

export function computeCharacterTokenCache(row: Pick<CharacterRow, 'descriptionMd' | 'exampleDialogMd' | 'persona'>): CharacterTokenCache {
  const desc = estimateTokensFast(row.descriptionMd ?? '');
  const dialog = estimateTokensFast(row.exampleDialogMd ?? '');
  // Persona block adds ~persona field text (rough upper bound).
  const persona = row.persona && typeof row.persona === 'object'
    ? Object.values(row.persona as Record<string, unknown>).reduce<number>(
        (acc, v) => acc + (typeof v === 'string' ? estimateTokensFast(v) : 0),
        0,
      )
    : 0;
  return {
    description: desc,
    exampleDialog: dialog,
    total: desc + dialog + persona,
    computedAt: new Date().toISOString(),
  };
}

export function computeStoryTokenCache(
  row: Pick<StoryRow, 'plotMd' | 'cast'>,
  scenes: Array<Pick<SceneRow, 'id' | 'tokenCount' | 'openingMd'>>,
): StoryTokenCache {
  const plot = estimateTokensFast(row.plotMd ?? '');
  // Cast rough estimate: 150 tokens per member (display name + role + refs).
  const castCount = Array.isArray(row.cast) ? row.cast.length : 0;
  const characters = castCount * 150;
  const scenarios = scenes.reduce((sum, s) => {
    if (typeof s.tokenCount === 'number' && s.tokenCount > 0) return sum + s.tokenCount;
    return sum + estimateTokensFast(s.openingMd ?? '');
  }, 0);
  return {
    plot,
    characters,
    scenarios,
    total: plot + characters + scenarios,
    computedAt: new Date().toISOString(),
  };
}

export interface DerivedPersona {
  physicalDescription: string | null;
  coreIdentity: string | null;
  mannerisms: string | null;
  history: string | null;
  role: string | null;
  classRole: string | null;
}

export function derivePersonaFromFlat(persona: Record<string, unknown> | null | undefined): DerivedPersona {
  const p = persona ?? {};
  const str = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    return trimmed || null;
  };
  const join = (parts: Array<string | null>): string | null => {
    const filtered = parts.filter((x): x is string => Boolean(x));
    return filtered.length ? filtered.join(' · ') : null;
  };
  const physical =
    str((p as Record<string, unknown>).physicalDescription) ??
    join([str((p as Record<string, unknown>).age), str((p as Record<string, unknown>).gender)]);
  const identity =
    str((p as Record<string, unknown>).coreIdentity) ??
    str((p as Record<string, unknown>).personality) ??
    str((p as Record<string, unknown>).coreTraits);
  const mannerisms =
    str((p as Record<string, unknown>).mannerisms) ??
    join([
      str((p as Record<string, unknown>).speechStyle),
      str((p as Record<string, unknown>).verbalHabits),
      str((p as Record<string, unknown>).conflictStyle),
    ]);
  const history =
    str((p as Record<string, unknown>).history) ??
    str((p as Record<string, unknown>).background);
  const role = str((p as Record<string, unknown>).role);
  const classRole = str((p as Record<string, unknown>).classRole);
  return { physicalDescription: physical, coreIdentity: identity, mannerisms, history, role, classRole };
}

/** Merge personaMd (structured override) with flat derive. personaMd takes precedence per field. */
export function mergePersona(
  personaMd: Partial<DerivedPersona> | null | undefined,
  flat: Record<string, unknown> | null | undefined,
): DerivedPersona {
  const derived = derivePersonaFromFlat(flat);
  if (!personaMd) return derived;
  return {
    physicalDescription: personaMd.physicalDescription ?? derived.physicalDescription,
    coreIdentity: personaMd.coreIdentity ?? derived.coreIdentity,
    mannerisms: personaMd.mannerisms ?? derived.mannerisms,
    history: personaMd.history ?? derived.history,
    role: personaMd.role ?? derived.role,
    classRole: personaMd.classRole ?? derived.classRole,
  };
}

/**
 * BACKLOG B1.3 — VN readiness heuristic.
 *
 * Weighted score (0–100) across five concerns. Each component contributes
 * up to its cap; totals are summed and clamped. Designed to surface gaps
 * that block a story from being "VN-ready" (playable) without dictating
 * any single required field — author can still publish a minimal story.
 */
export interface VnReadinessBreakdown {
  pct: number;
  components: {
    plot: { score: number; max: number; reason: string };
    scenarios: { score: number; max: number; reason: string };
    cast: { score: number; max: number; reason: string };
    openingQuote: { score: number; max: number; reason: string };
    playAs: { score: number; max: number; reason: string };
    /** PLANVNv2 BV8 — ≥1 scene has nextSceneId set or sceneType='ending'. */
    sceneChain: { score: number; max: number; reason: string };
    /** PLANVNv2 BV8 — ≥1 scene has backgroundImageUrl non-null. */
    authoredBg: { score: number; max: number; reason: string };
  };
  suggestions: string[];
}

/**
 * PLANVNv2 BV8 — rebalanced weights (total = 100):
 *   plot 25 + scenarios 20 + cast 20 + openingQuote 10 + playAs 5
 *   + sceneChain 10 + authoredBg 10
 */
export function computeVnReadiness(input: {
  plotMd: string | null;
  cast: unknown[] | null;
  openingQuote: string | null;
  playAsCharacterId: string | null;
  scenarios: Array<{ openingMd: string | null; nextSceneId?: string | null; sceneType?: string | null; backgroundImageUrl?: string | null }>;
}): VnReadinessBreakdown {
  const suggestions: string[] = [];

  const plotLen = (input.plotMd ?? '').trim().length;
  const plotTokens = estimateTokensFast(input.plotMd ?? '');
  const plotScore = plotLen === 0 ? 0 : plotTokens >= 400 ? 25 : plotTokens >= 150 ? 15 : 8;
  if (plotScore < 25) {
    suggestions.push(
      plotLen === 0
        ? 'Write a plot of at least 400 tokens so the AI has enough world context.'
        : 'Expand the plot (target ≥400 tokens) for a richer AI context.',
    );
  }

  const scenarioCount = input.scenarios.length;
  const scenariosWithOpening = input.scenarios.filter((s) => (s.openingMd ?? '').trim().length >= 40).length;
  const scenScore = scenariosWithOpening >= 3 ? 20 : scenariosWithOpening * 7;
  if (scenScore < 20) {
    suggestions.push(
      scenarioCount === 0
        ? 'Add at least 3 scenarios with a full opening message.'
        : `${scenariosWithOpening}/${scenarioCount} scenarios have an opening. Target at least 3.`,
    );
  }

  const castCount = Array.isArray(input.cast) ? input.cast.length : 0;
  const castScore = castCount === 0 ? 0 : castCount >= 2 ? 20 : 10;
  if (castScore < 20) {
    suggestions.push(
      castCount === 0 ? 'Link at least one character to the cast.' : 'Add at least 2 characters to the cast.',
    );
  }

  const quoteLen = (input.openingQuote ?? '').trim().length;
  const quoteScore = quoteLen >= 20 ? 10 : quoteLen > 0 ? 5 : 0;
  if (quoteScore < 10) {
    suggestions.push('Add an opening quote (tagline ≥20 characters).');
  }

  const playAsScore = input.playAsCharacterId ? 5 : 0;
  if (playAsScore < 5) {
    suggestions.push('Choose a "Play As" character to set the player\'s POV.');
  }

  // Scene chain: at least one scene links to a next scene OR is marked as an ending.
  const hasChain = input.scenarios.some(
    (s) => s.nextSceneId != null || s.sceneType === 'ending',
  );
  const sceneChainScore = hasChain ? 10 : 0;
  if (!hasChain) {
    suggestions.push('Set "Next scene" on at least one scenario to create a scene chain.');
  }

  // Authored BG: at least one scene has a background image.
  const hasBg = input.scenarios.some((s) => s.backgroundImageUrl != null);
  const authoredBgScore = hasBg ? 10 : 0;
  if (!hasBg) {
    suggestions.push('Add a background image URL to at least one scenario.');
  }

  const total = plotScore + scenScore + castScore + quoteScore + playAsScore + sceneChainScore + authoredBgScore;
  return {
    pct: Math.max(0, Math.min(100, total)),
    components: {
      plot: { score: plotScore, max: 25, reason: plotLen === 0 ? 'Empty' : `${plotTokens} tokens` },
      scenarios: { score: scenScore, max: 20, reason: `${scenariosWithOpening}/${scenarioCount} with opening` },
      cast: { score: castScore, max: 20, reason: `${castCount} character(s) in cast` },
      openingQuote: { score: quoteScore, max: 10, reason: quoteLen > 0 ? `${quoteLen} chars` : 'Empty' },
      playAs: { score: playAsScore, max: 5, reason: input.playAsCharacterId ? 'Set' : 'Not set' },
      sceneChain: { score: sceneChainScore, max: 10, reason: hasChain ? 'Scene chain present' : 'No chain' },
      authoredBg: { score: authoredBgScore, max: 10, reason: hasBg ? 'Background set' : 'No background' },
    },
    suggestions,
  };
}
