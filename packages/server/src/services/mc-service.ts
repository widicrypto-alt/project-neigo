/**
 * MC Profile Service - manages user protagonist personas for story discovery mode
 * 
 * Features:
 * - CRUD operations for MC profiles
 * - Default profile management
 * - Profile validation
 */

import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { nanoid } from 'nanoid';
const { userMcProfiles } = schema;
import { z } from 'zod';

// ============================================================================
// Validation Schemas
// ============================================================================

export const McPersonaSchema = z.object({
  age: z.number().int().positive().optional().nullable(),
  gender: z.string().max(50).optional().nullable(),
  personality: z.string().min(1).max(2000),
  appearance: z.string().max(2000).optional().nullable(),
  background: z.string().max(2000).optional().nullable(),
  speechStyle: z.string().max(1000).optional().nullable(),
  customFields: z.record(z.unknown()).optional(),
});

export const CreateMcProfileSchema = z.object({
  name: z.string().min(1).max(100),
  avatarUrl: z.string().url().optional().nullable(),
  persona: McPersonaSchema,
  isDefault: z.boolean().optional().default(false),
});

export const UpdateMcProfileSchema = CreateMcProfileSchema.partial();

// ============================================================================
// Types
// ============================================================================

export interface McProfile {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  persona: {
    age?: number | null;
    gender?: string | null;
    personality: string;
    appearance?: string | null;
    background?: string | null;
    speechStyle?: string | null;
    customFields?: Record<string, unknown>;
  };
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoryStartOptions {
  mcProfileId?: string | null;
  mode: 'create-new' | 'use-existing' | 'use-default' | 'anonymous';
  newProfile?: z.infer<typeof CreateMcProfileSchema>;
}

// ============================================================================
// MC Profile CRUD
// ============================================================================

/**
 * Create a new MC profile for a user
 */
export async function createMcProfile(
  userId: string,
  data: z.infer<typeof CreateMcProfileSchema>
): Promise<McProfile> {
  // If this is set as default, unset other defaults
  if (data.isDefault) {
    await db
      .update(userMcProfiles)
      .set({ isDefault: false })
      .where(eq(userMcProfiles.userId, userId));
  }

  const rows = await db
    .insert(userMcProfiles)
    .values({
      id: nanoid(),
      userId,
      name: data.name,
      avatarUrl: data.avatarUrl ?? null,
      persona: data.persona,
      isDefault: data.isDefault ?? false,
    })
    .returning();

  return rows[0] as McProfile;
}

/**
 * Get all MC profiles for a user
 */
export async function getUserMcProfiles(userId: string): Promise<McProfile[]> {
  const profiles = await db
    .select()
    .from(userMcProfiles)
    .where(eq(userMcProfiles.userId, userId))
    .orderBy(desc(userMcProfiles.isDefault), desc(userMcProfiles.createdAt));

  return profiles;
}

/**
 * Get a specific MC profile by ID
 */
export async function getMcProfileById(id: string): Promise<McProfile | null> {
  const [profile] = await db
    .select()
    .from(userMcProfiles)
    .where(eq(userMcProfiles.id, id));

  return profile ?? null;
}

/**
 * Get user's default MC profile
 */
export async function getDefaultMcProfile(userId: string): Promise<McProfile | null> {
  const [profile] = await db
    .select()
    .from(userMcProfiles)
    .where(and(
      eq(userMcProfiles.userId, userId),
      eq(userMcProfiles.isDefault, true)
    ));

  return profile ?? null;
}

/**
 * Update an MC profile
 */
export async function updateMcProfile(
  id: string,
  userId: string,
  data: z.infer<typeof UpdateMcProfileSchema>
): Promise<McProfile | null> {
  // If setting as default, unset other defaults first
  if (data.isDefault === true) {
    await db
      .update(userMcProfiles)
      .set({ isDefault: false })
      .where(and(
        eq(userMcProfiles.userId, userId),
        eq(userMcProfiles.isDefault, true)
      ));
  }

  const [profile] = await db
    .update(userMcProfiles)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(
      eq(userMcProfiles.id, id),
      eq(userMcProfiles.userId, userId)
    ))
    .returning();

  return profile ?? null;
}

/**
 * Delete an MC profile
 */
export async function deleteMcProfile(id: string, userId: string): Promise<boolean> {
  const [deleted] = await db
    .delete(userMcProfiles)
    .where(and(
      eq(userMcProfiles.id, id),
      eq(userMcProfiles.userId, userId)
    ))
    .returning({ id: userMcProfiles.id });

  return !!deleted;
}

/**
 * Set a profile as default
 */
export async function setDefaultMcProfile(id: string, userId: string): Promise<McProfile | null> {
  // Unset all defaults
  await db
    .update(userMcProfiles)
    .set({ isDefault: false })
    .where(eq(userMcProfiles.userId, userId));

  // Set the new default
  const [profile] = await db
    .update(userMcProfiles)
    .set({
      isDefault: true,
      updatedAt: new Date(),
    })
    .where(and(
      eq(userMcProfiles.id, id),
      eq(userMcProfiles.userId, userId)
    ))
    .returning();

  return profile ?? null;
}

/**
 * Resolve MC profile for story start
 * Returns the appropriate profile based on mode
 */
export async function resolveMcProfileForStory(
  userId: string,
  options: StoryStartOptions
): Promise<McProfile | null> {
  switch (options.mode) {
    case 'anonymous':
      return null; // No profile, use anonymous MC

    case 'use-default':
      return getDefaultMcProfile(userId);

    case 'use-existing':
      if (!options.mcProfileId) {
        return getDefaultMcProfile(userId);
      }
      return getMcProfileById(options.mcProfileId);

    case 'create-new':
      if (!options.newProfile) {
        return getDefaultMcProfile(userId);
      }
      return createMcProfile(userId, {
        ...options.newProfile,
        isDefault: options.newProfile.isDefault ?? false,
      });

    default:
      return getDefaultMcProfile(userId);
  }
}

// ============================================================================
// MC Context for Prompt Injection
// ============================================================================

export interface McContext {
  name: string;
  personality: string;
  appearance?: string | null;
  background?: string | null;
  speechStyle?: string | null;
  isAnonymous: boolean;
}

/**
 * Build MC context for prompt injection
 * Used in story discovery mode to tell AI who the user is playing as
 */
export function buildMcContext(profile: McProfile | null): McContext {
  if (!profile) {
    return {
      name: '???',
      personality: 'A mysterious newcomer whose background is unknown.',
      isAnonymous: true,
    };
  }

  const persona = profile.persona;

  return {
    name: profile.name,
    personality: persona.personality,
    appearance: persona.appearance ?? null,
    background: persona.background ?? null,
    speechStyle: persona.speechStyle ?? null,
    isAnonymous: false,
  };
}

/**
 * Generate anonymous MC persona for quick start
 * Used when user doesn't want to create a full profile
 */
export function generateAnonymousPersona(userName?: string): McContext {
  return {
    name: userName ?? 'Traveler',
    personality: 'An curious and adaptable individual exploring new experiences.',
    isAnonymous: true,
  };
}
