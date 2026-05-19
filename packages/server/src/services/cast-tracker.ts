/**
 * Cast Tracker Service - manages story cast discovery progress
 * 
 * Features:
 * - Track which cast members have been met
 * - Update encounter records
 * - Generate discovery hints for unmet cast
 * - Soft completion tracking
 */

import { eq, and, sql, inArray } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { nanoid } from 'nanoid';
const { storyCastProgress, storyCastEncounters, stories, characters } = schema;
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface CastMember {
  characterId: string;
  displayName: string;
  role: 'mc' | 'harem' | 'npc' | 'supporting';
  avatarUrl?: string | null;
  tagline?: string | null;
}

export interface CastProgress {
  id: string;
  storyId: string;
  userId: string;
  mcProfileId: string | null;
  metCharacterIds: string[];
  totalCastCount: number;
  metCount: number;
  firstMetAt: Date | null;
  lastActivityAt: Date;
  metadata: {
    favoriteCast?: string | null;
    discoveryPace?: 'fast' | 'slow' | 'balanced';
    notes?: string;
    encounterOrder?: string[];
    totalTurns?: number;
    avgTurnsPerEncounter?: number;
  };
  isComplete: boolean;
  completedAt: Date | null;
}

export interface EncounterRecord {
  id: string;
  progressId: string;
  characterId: string;
  firstMetAt: Date;
  encounterCount: number;
  lastInteractionAt: Date;
  firstImpression: string | null;
  trustDelta: number;
  affectionDelta: number;
  tensionDelta: number;
  firstMeetingScene: string | null;
  firstMeetingMood: string | null;
  userNotes: string | null;
}

export interface DiscoveryHint {
  characterId: string;
  displayName: string;
  hint: string;
  confidence: 'high' | 'medium' | 'low';
}

// ============================================================================
// Cast Progress Management
// ============================================================================

/**
 * Initialize cast progress for a new story session
 */
export async function initializeCastProgress(
  userId: string,
  storyId: string,
  mcProfileId: string | null,
  sessionId: string | null
): Promise<CastProgress> {
  // Get story cast
  const [story] = await db
    .select({ cast: stories.cast })
    .from(stories)
    .where(eq(stories.id, storyId));

  if (!story) {
    throw new Error('Story not found');
  }

  const cast = (story.cast ?? []) as Array<{ characterId: string; displayName: string; role: string }>;
  const totalCount = cast.length;

  // Check if progress already exists
  const [existing] = await db
    .select()
    .from(storyCastProgress)
    .where(and(
      eq(storyCastProgress.storyId, storyId),
      eq(storyCastProgress.userId, userId)
    ));

  if (existing) {
    // Update session and mc profile
    const rows = await db
      .update(storyCastProgress)
      .set({
        sessionId,
        mcProfileId,
        lastActivityAt: new Date(),
      })
      .where(eq(storyCastProgress.id, existing.id))
      .returning();
    const updated = rows[0]!;

    return {
      ...updated,
      metCharacterIds: (updated.metCharacterIds ?? []) as string[],
      metadata: (updated.metadata ?? {}) as CastProgress['metadata'],
    } as CastProgress;
  }

  // Create new progress record
  const rows = await db
    .insert(storyCastProgress)
    .values({
      id: nanoid(),
      storyId,
      userId,
      mcProfileId,
      sessionId,
      totalCastCount: totalCount,
      metCount: 0,
      metCharacterIds: [] as string[],
    })
    .returning();
  const progress = rows[0]!;

  return {
    ...progress,
    metCharacterIds: (progress.metCharacterIds ?? []) as string[],
    metadata: (progress.metadata ?? {}) as CastProgress['metadata'],
  } as CastProgress;
}

/**
 * Get cast progress for a user and story
 */
export async function getCastProgress(
  userId: string,
  storyId: string
): Promise<CastProgress | null> {
  const [progress] = await db
    .select()
    .from(storyCastProgress)
    .where(and(
      eq(storyCastProgress.storyId, storyId),
      eq(storyCastProgress.userId, userId)
    ));

  if (!progress) {
    return null;
  }

  return {
    ...progress,
    metCharacterIds: (progress.metCharacterIds ?? []) as string[],
    metadata: (progress.metadata ?? {}) as CastProgress['metadata'],
  };
}

/**
 * Record that a cast member has been met for the first time
 */
export async function recordCastMet(
  progressId: string,
  characterId: string,
  sceneContext?: string,
  mood?: string
): Promise<EncounterRecord> {
  const now = new Date();

  // Check if encounter already exists
  const [existing] = await db
    .select()
    .from(storyCastEncounters)
    .where(and(
      eq(storyCastEncounters.progressId, progressId),
      eq(storyCastEncounters.characterId, characterId)
    ));

  if (existing) {
    // Update encounter count and last interaction
    const rows = await db
      .update(storyCastEncounters)
      .set({
        encounterCount: existing.encounterCount + 1,
        lastInteractionAt: now,
      })
      .where(eq(storyCastEncounters.id, existing.id))
      .returning();

    return rows[0] as EncounterRecord;
  }

  // Create new encounter record
  const eRows = await db
    .insert(storyCastEncounters)
    .values({
      id: nanoid(),
      progressId,
      characterId,
      firstMetAt: now,
      firstMeetingScene: sceneContext ?? null,
      firstMeetingMood: mood ?? null,
      firstImpression: 'neutral',
    })
    .returning();
  const encounter = eRows[0] as EncounterRecord;

  // Update progress - add to met list
  const [progress] = await db
    .select()
    .from(storyCastProgress)
    .where(eq(storyCastProgress.id, progressId));

  if (progress) {
    const currentMet = (progress.metCharacterIds ?? []) as string[];
    if (!currentMet.includes(characterId)) {
      const newMet = [...currentMet, characterId];
      const newMetCount = newMet.length;
      const isComplete = newMetCount >= progress.totalCastCount;

      await db
        .update(storyCastProgress)
        .set({
          metCharacterIds: newMet,
          metCount: newMetCount,
          firstMetAt: progress.firstMetAt ?? now,
          lastActivityAt: now,
          isComplete,
          completedAt: isComplete ? now : null,
          metadata: {
            ...(progress.metadata ?? {}),
            encounterOrder: [
              ...((progress.metadata ?? {}).encounterOrder ?? []),
              characterId,
            ],
          },
        })
        .where(eq(storyCastProgress.id, progressId));
    }
  }

  return encounter;
}

/**
 * Update relationship stats for an encounter
 */
export async function updateEncounterStats(
  progressId: string,
  characterId: string,
  stats: {
    trustDelta?: number;
    affectionDelta?: number;
    tensionDelta?: number;
  }
): Promise<void> {
  await db
    .update(storyCastEncounters)
    .set({
      trustDelta: sql`${storyCastEncounters.trustDelta} + ${stats.trustDelta ?? 0}`,
      affectionDelta: sql`${storyCastEncounters.affectionDelta} + ${stats.affectionDelta ?? 0}`,
      tensionDelta: sql`${storyCastEncounters.tensionDelta} + ${stats.tensionDelta ?? 0}`,
      lastInteractionAt: new Date(),
    })
    .where(and(
      eq(storyCastEncounters.progressId, progressId),
      eq(storyCastEncounters.characterId, characterId)
    ));
}

/**
 * Add user notes to an encounter
 */
export async function setEncounterNotes(
  progressId: string,
  characterId: string,
  notes: string
): Promise<void> {
  await db
    .update(storyCastEncounters)
    .set({ userNotes: notes })
    .where(and(
      eq(storyCastEncounters.progressId, progressId),
      eq(storyCastEncounters.characterId, characterId)
    ));
}

/**
 * Get all encounters for a progress record
 */
export async function getEncounters(progressId: string): Promise<EncounterRecord[]> {
  const encounters = await db
    .select()
    .from(storyCastEncounters)
    .where(eq(storyCastEncounters.progressId, progressId));

  return encounters;
}

// ============================================================================
// Discovery Hints
// ============================================================================

/**
 * Get discovery hints for unmet cast members
 * This could be AI-generated in the future, for now returns static hints
 */
export async function getDiscoveryHints(
  progressId: string,
  storyId: string,
  limit: number = 3
): Promise<DiscoveryHint[]> {
  const [progress] = await db
    .select()
    .from(storyCastProgress)
    .where(eq(storyCastProgress.id, progressId));

  if (!progress) {
    return [];
  }

  const metIds = (progress.metCharacterIds ?? []) as string[];
  const [story] = await db
    .select({ cast: stories.cast })
    .from(stories)
    .where(eq(stories.id, storyId));

  if (!story) return [];
  const cast = (story.cast ?? []) as Array<{ characterId: string; displayName: string; role: string }>;
  const unmetCast = cast.filter(c => !metIds.includes(c.characterId)).slice(0, limit);

  // Get character info for hints
  if (unmetCast.length === 0) {
    return [];
  }

  const characterIds = unmetCast.map(c => c.characterId);
  const characterInfos: Array<{ id: string; name: string | null; tagline: string | null }> = await db
    .select({
      id: characters.id,
      name: characters.name,
      tagline: characters.tagline,
    })
    .from(characters)
    .where(inArray(characters.id, characterIds));

  const charMap = new Map(characterInfos.map(c => [c.id, c] as const));

  return unmetCast.map(c => {
    const char = charMap.get(c.characterId);
    return {
      characterId: c.characterId,
      displayName: c.displayName,
      hint: char?.tagline ?? `A mysterious figure known as ${c.displayName}`,
      confidence: 'medium' as const,
    };
  });
}

// ============================================================================
// Cast Status for UI
// ============================================================================

export interface CastStatus {
  total: number;
  met: number;
  remaining: number;
  percentage: number;
  isComplete: boolean;
  favoriteCast?: string | null;
}

export interface CastMemberStatus extends CastMember {
  met: boolean;
  firstMetAt?: Date | null;
  encounterCount: number;
  trustDelta: number;
  affectionDelta: number;
}

/**
 * Get full cast status for UI display
 */
export async function getFullCastStatus(
  userId: string,
  storyId: string
): Promise<{
  progress: CastStatus;
  members: CastMemberStatus[];
}> {
  const [story] = await db
    .select({ cast: stories.cast })
    .from(stories)
    .where(eq(stories.id, storyId));

  const cast = (story?.cast ?? []) as Array<{ characterId: string; displayName: string; role: string }>;
  
  const progress = await getCastProgress(userId, storyId);
  const metIds = progress?.metCharacterIds ?? [];

  // Get character info
  const characterIds = cast.map(c => c.characterId);
  const characterInfos: Array<{ id: string; name: string | null; avatarUrl: string | null; tagline: string | null }> = await db
    .select({
      id: characters.id,
      name: characters.name,
      avatarUrl: characters.avatarUrl,
      tagline: characters.tagline,
    })
    .from(characters)
    .where(inArray(characters.id, characterIds));

  const charMap = new Map(characterInfos.map(c => [c.id, c] as const));

  // Get encounters if progress exists
  let encounters: EncounterRecord[] = [];
  if (progress) {
    encounters = await getEncounters(progress.id);
  }
  const encounterMap = new Map(encounters.map(e => [e.characterId, e]));

  const members: CastMemberStatus[] = cast.map(c => {
    const char = charMap.get(c.characterId);
    const encounter = encounterMap.get(c.characterId);

    return {
      characterId: c.characterId,
      displayName: c.displayName,
      role: c.role as CastMember['role'],
      avatarUrl: char?.avatarUrl,
      tagline: char?.tagline,
      met: metIds.includes(c.characterId),
      firstMetAt: encounter?.firstMetAt ?? null,
      encounterCount: encounter?.encounterCount ?? 0,
      trustDelta: encounter?.trustDelta ?? 0,
      affectionDelta: encounter?.affectionDelta ?? 0,
    };
  });

  return {
    progress: {
      total: cast.length,
      met: metIds.length,
      remaining: cast.length - metIds.length,
      percentage: cast.length > 0 ? Math.round((metIds.length / cast.length) * 100) : 0,
      isComplete: progress?.isComplete ?? false,
      favoriteCast: progress?.metadata?.favoriteCast ?? null,
    },
    members,
  };
}
