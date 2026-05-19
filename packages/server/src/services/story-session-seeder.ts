/**
 * PLANBv2 — Story session seeder.
 *
 * Bridges a story scenario to the chat runtime. Picking a scenario tile
 * on `/stories/:id` calls POST /api/stories/:id/start which uses this
 * service to create (or resume) a chat_sessions row and seed its
 * metadata so the prompt builder can append the scenario persona prompt.
 *
 * Conventions on chat_sessions.metadata for story-seeded sessions:
 *   metadata.storyId         — UUID of the story
 *   metadata.storyRunId      — UUID of the story_runs row
 *   metadata.scenarioId      — UUID of the active story_scenes row
 *   metadata.scenarioTitle   — display name
 *   metadata.scenarioIndex   — { current: 1, total: 7 }
 *   metadata.personaPrompt   — text to append to system prompt
 *   metadata.openingHint     — composer placeholder text
 *   metadata.authorTest      — boolean (only for owner test runs)
 */
import { and, asc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, schema } from '../db/client.js';

export interface ScenarioRow {
  id: string;
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
  openingMd: string | null;
  tokenCount: number;
  nextSceneId: string | null;
  sceneType: string;
  endingSlug: string | null;
}

export interface StorySeedResult {
  sessionId: string;
  runId: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioIndex: { current: number; total: number };
  alreadyStarted: boolean;
}

/** Aggregate scenario list for a story, ordered for the picker. */
export async function listScenarios(storyId: string): Promise<ScenarioRow[]> {
  const rows = await db
    .select()
    .from(schema.storyScenes)
    .where(eq(schema.storyScenes.storyId, storyId))
    .orderBy(asc(schema.storyScenes.tileOrder), asc(schema.storyScenes.orderIndex));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    tileSubtitle: r.tileSubtitle,
    tileImageUrl: r.tileImageUrl,
    tileOrder: r.tileOrder,
    personaPrompt: r.personaPrompt,
    openingNarration: r.openingNarration,
    openingInputHint: r.openingInputHint,
    castSubset: Array.isArray(r.castSubset) ? (r.castSubset as string[]) : [],
    backgroundImageUrl: r.backgroundImageUrl,
    bgmUrl: r.bgmUrl,
    openingMd: r.openingMd ?? null,
    tokenCount: r.tokenCount ?? 0,
    nextSceneId: r.nextSceneId ?? null,
    sceneType: r.sceneType ?? 'dialogue',
    endingSlug: r.endingSlug ?? null,
  }));
}

/**
 * PLANVNv2 BV1 — Write scene state into an existing chat session.
 * Called on start (new or resume) and after every advance so the FE
 * always sees fresh `sceneCard.*` via query invalidation.
 *
 * Only touches `scene_card`. Never mutates trackers, castDynamicStates,
 * or metadata.sceneState (managed by the orchestrator [STATE:] pipeline).
 */
export async function seedSceneIntoSession(
  sessionId: string,
  scenario: ScenarioRow,
): Promise<void> {
  const sceneCard = {
    sceneId: scenario.id,
    background: scenario.backgroundImageUrl ?? null,
    location: null,
    weather: null,
    nextSceneId: scenario.nextSceneId ?? null,
    castSubset: scenario.castSubset,
  };
  await db
    .update(schema.chatSessions)
    .set({ sceneCard })
    .where(eq(schema.chatSessions.id, sessionId));
}

interface StartStoryArgs {
  storyId: string;
  userId: string;
  scenarioId: string;
  /** When true, marks session as author-test (no public-stat increment). */
  authorTest?: boolean;
}

/**
 * Start (or resume) a story-seeded chat session for a given scenario.
 *
 * Behaviour:
 *  - Validates scenario belongs to story.
 *  - Picks a "main" character for the session (first cast_subset member,
 *    falling back to the story's cast). chat_sessions requires one.
 *  - If a story_runs row exists with the same active_scenario_id and a
 *    seeded_session_id that still exists, returns it (resume).
 *  - Otherwise creates a fresh chat_sessions row in ROLEPLAY mode with
 *    metadata describing the scenario, then seeds an opening
 *    NARRATOR message from `opening_narration`.
 */
export async function startStorySession(
  args: StartStoryArgs,
): Promise<StorySeedResult | { error: string }> {
  const { storyId, userId, scenarioId, authorTest = false } = args;

  const story = await db.query.stories.findFirst({
    where: eq(schema.stories.id, storyId),
  });
  if (!story) return { error: 'story_not_found' };

  // Author-test only allowed for owner; public play needs published.
  if (authorTest) {
    if (story.authorId !== userId) return { error: 'forbidden' };
  } else if (story.status !== 'published' && story.status !== 'featured') {
    return { error: 'story_not_published' };
  }

  const scenarios = await listScenarios(storyId);
  if (scenarios.length === 0) return { error: 'no_scenarios' };
  const scenarioIndex = scenarios.findIndex((s) => s.id === scenarioId);
  if (scenarioIndex < 0) return { error: 'scenario_not_found' };
  const scenario = scenarios[scenarioIndex]!;

  // Determine the character that anchors the chat_session row.
  const cast = (story.cast as Array<{ characterId: string; displayName: string; role: string }>) ?? [];
  const subsetIds = scenario.castSubset.length > 0
    ? scenario.castSubset
    : cast.map((c) => c.characterId);
  const mainCharacterId = subsetIds[0] ?? cast[0]?.characterId;
  if (!mainCharacterId) return { error: 'no_cast' };

  // Resolve display name for character
  const mainChar = await db.query.characters.findFirst({
    where: eq(schema.characters.id, mainCharacterId),
    columns: { id: true, name: true },
  });
  if (!mainChar) return { error: 'character_not_found' };

  // Upsert story_runs row.
  const existingRun = await db.query.storyRuns.findFirst({
    where: and(eq(schema.storyRuns.userId, userId), eq(schema.storyRuns.storyId, storyId)),
  });

  // Resume path: same scenario + session still exists.
  if (existingRun?.activeScenarioId === scenarioId && existingRun.seededSessionId) {
    const existingSession = await db.query.chatSessions.findFirst({
      where: and(
        eq(schema.chatSessions.id, existingRun.seededSessionId),
        eq(schema.chatSessions.userId, userId),
      ),
      columns: { id: true },
    });
    if (existingSession) {
      // Touch lastReadAt
      await db
        .update(schema.storyRuns)
        .set({ lastReadAt: new Date() })
        .where(eq(schema.storyRuns.id, existingRun.id));
      return {
        sessionId: existingSession.id,
        runId: existingRun.id,
        scenarioId,
        scenarioTitle: scenario.title ?? `Skenario ${scenarioIndex + 1}`,
        scenarioIndex: { current: scenarioIndex + 1, total: scenarios.length },
        alreadyStarted: true,
      };
    }
  }

  // Create fresh chat_session.
  const sessionId = nanoid();
  const runId = existingRun?.id ?? nanoid();
  const now = new Date();

  const sceneCard = {
    sceneId: scenario.id,
    background: scenario.backgroundImageUrl ?? null,
    location: null,
    weather: null,
    nextSceneId: scenario.nextSceneId ?? null,
    castSubset: subsetIds,
  };

  const metadata: Record<string, unknown> = {
    storyId,
    storyTitle: story.title,
    storyRunId: runId,
    scenarioId,
    scenarioTitle: scenario.title ?? `Skenario ${scenarioIndex + 1}`,
    scenarioIndex: { current: scenarioIndex + 1, total: scenarios.length },
    personaPrompt: scenario.personaPrompt ?? '',
    openingHint: scenario.openingInputHint ?? '',
    authorTest,
    storyPlayAsCharacterId: (story as Record<string, unknown>).playAsCharacterId ?? null,
  };

  await db.insert(schema.chatSessions).values({
    id: sessionId,
    userId,
    characterId: mainCharacterId,
    mode: 'ROLEPLAY',
    title: scenario.title ?? story.title,
    sceneCard,
    castCharacterIds: subsetIds.filter((cid) => cid !== mainCharacterId),
    aiModel: 'HERMES_4_405B',
    metadata,
    createdAt: now,
    lastMessageAt: now,
  });

  // Seed opening narration as NARRATOR message at turnIndex 0 (if any).
  if (scenario.openingNarration && scenario.openingNarration.trim().length > 0) {
    await db.insert(schema.chatMessages).values({
      id: nanoid(),
      sessionId,
      turnIndex: 0,
      role: 'assistant',
      speakerType: 'NARRATOR',
      content: scenario.openingNarration.trim(),
      metadata: { storySeed: true, scenarioId },
      createdAt: now,
    });
    await db
      .update(schema.chatSessions)
      .set({ turnCount: 1 })
      .where(eq(schema.chatSessions.id, sessionId));
  }

  // Upsert story_runs row.
  if (existingRun) {
    await db
      .update(schema.storyRuns)
      .set({
        activeScenarioId: scenarioId,
        seededSessionId: sessionId,
        lastReadAt: now,
      })
      .where(eq(schema.storyRuns.id, existingRun.id));
  } else {
    await db.insert(schema.storyRuns).values({
      id: runId,
      userId,
      storyId,
      currentSceneId: scenarioId,
      activeScenarioId: scenarioId,
      seededSessionId: sessionId,
      startedAt: now,
      lastReadAt: now,
    });
  }

  // Bump total_plays unless this is an author test run.
  if (!authorTest) {
    await db
      .update(schema.stories)
      .set({ totalPlays: (story.totalPlays ?? 0) + 1, updatedAt: now })
      .where(eq(schema.stories.id, storyId));
  }

  return {
    sessionId,
    runId,
    scenarioId,
    scenarioTitle: scenario.title ?? `Skenario ${scenarioIndex + 1}`,
    scenarioIndex: { current: scenarioIndex + 1, total: scenarios.length },
    alreadyStarted: false,
  };
}

/**
 * Mark current scenario complete; if more scenarios remain, swap the active
 * scenario in-place on the same chat session (persona prompt & metadata).
 */
export async function completeScenario(args: {
  runId: string;
  userId: string;
  /** When provided, advance to this specific next scenario. */
  nextScenarioId?: string;
}): Promise<
  | { ok: true; advancedTo: ScenarioRow | null; scenarioIndex: { current: number; total: number } | null }
  | { error: string }
> {
  const run = await db.query.storyRuns.findFirst({
    where: and(eq(schema.storyRuns.id, args.runId), eq(schema.storyRuns.userId, args.userId)),
  });
  if (!run) return { error: 'run_not_found' };
  if (!run.activeScenarioId || !run.seededSessionId) return { error: 'no_active_scenario' };

  const scenarios = await listScenarios(run.storyId);
  const completedSlug = run.activeScenarioId;
  const completed = Array.from(new Set([...(run.scenariosCompleted ?? []), completedSlug]));

  // Pick next scenario: explicit or the next non-completed in tile order.
  let next: ScenarioRow | null = null;
  if (args.nextScenarioId) {
    next = scenarios.find((s) => s.id === args.nextScenarioId) ?? null;
  } else {
    next = scenarios.find((s) => !completed.includes(s.id)) ?? null;
  }

  const now = new Date();

  if (!next) {
    // All scenarios done — mark run complete, leave session as-is.
    await db
      .update(schema.storyRuns)
      .set({
        scenariosCompleted: completed,
        completedAt: now,
        lastReadAt: now,
      })
      .where(eq(schema.storyRuns.id, run.id));
    return { ok: true, advancedTo: null, scenarioIndex: null };
  }

  const idx = scenarios.findIndex((s) => s.id === next.id);

  // Update chat session metadata + insert a soft-divider NARRATOR message.
  const session = await db.query.chatSessions.findFirst({
    where: eq(schema.chatSessions.id, run.seededSessionId),
  });
  if (!session) return { error: 'session_not_found' };

  const metadata = (session.metadata ?? {}) as Record<string, unknown>;
  metadata.scenarioId = next.id;
  metadata.scenarioTitle = next.title ?? `Skenario ${idx + 1}`;
  metadata.scenarioIndex = { current: idx + 1, total: scenarios.length };
  metadata.personaPrompt = next.personaPrompt ?? '';
  metadata.openingHint = next.openingInputHint ?? '';

  await db
    .update(schema.chatSessions)
    .set({ metadata, lastMessageAt: now })
    .where(eq(schema.chatSessions.id, session.id));

  // Append a divider message at the next turnIndex.
  if (next.openingNarration && next.openingNarration.trim().length > 0) {
    const lastTurn = await db.query.chatMessages.findFirst({
      where: eq(schema.chatMessages.sessionId, session.id),
      orderBy: (m, { desc }) => [desc(m.turnIndex)],
      columns: { turnIndex: true },
    });
    const nextTurn = (lastTurn?.turnIndex ?? -1) + 1;
    await db.insert(schema.chatMessages).values({
      id: nanoid(),
      sessionId: session.id,
      turnIndex: nextTurn,
      role: 'assistant',
      speakerType: 'NARRATOR',
      content: `— ${next.title ?? 'Skenario berikutnya'} —\n\n${next.openingNarration.trim()}`,
      metadata: { storySeed: true, scenarioId: next.id, scenarioTransition: true },
      createdAt: now,
    });
  }

  await db
    .update(schema.storyRuns)
    .set({
      scenariosCompleted: completed,
      activeScenarioId: next.id,
      currentSceneId: next.id,
      lastReadAt: now,
    })
    .where(eq(schema.storyRuns.id, run.id));

  return {
    ok: true,
    advancedTo: next,
    scenarioIndex: { current: idx + 1, total: scenarios.length },
  };
}

/**
 * PLANBv7 W-F — orchestrator-invoked auto-advance.
 *
 * Called fire-and-forget from runSinglePass when the model emits
 * `[STATE: scenario_complete=true]`. Resolves the storyRunId from the
 * session metadata, then delegates to completeScenario with the
 * session's owning user.
 *
 * On successful advance we:
 *   - clear `sceneState.scenario_complete` so the flag does not re-fire
 *   - best-effort write a session_events row (kind='scenario.advanced')
 *
 * Errors are logged; this function never throws to the caller.
 */
export async function advanceScenarioFromSession(sessionId: string): Promise<void> {
  try {
    const session = await db.query.chatSessions.findFirst({
      where: eq(schema.chatSessions.id, sessionId),
    });
    if (!session) return;
    const meta = (session.metadata ?? {}) as Record<string, unknown>;
    const runId = typeof meta.storyRunId === 'string' ? meta.storyRunId : null;
    if (!runId) return;

    const result = await completeScenario({
      runId,
      userId: session.userId,
    });
    if ('error' in result) {
      console.warn('[scenario-advance]', sessionId, result.error);
      return;
    }

    // Clear the sentinel so it cannot retrigger on later turns.
    const sceneState = (meta.sceneState ?? {}) as Record<string, unknown>;
    if (sceneState && 'scenario_complete' in sceneState) {
      delete sceneState.scenario_complete;
      await db
        .update(schema.chatSessions)
        .set({
          metadata: { ...meta, sceneState },
        })
        .where(eq(schema.chatSessions.id, sessionId));
    }

    // Fire-and-forget analytics event. sessionEvents is best-effort
    // (table may be absent in tests). We import lazily to avoid a
    // circular boot path via orchestrator → seeder → events.
    try {
      const { db: dbRef, schema: schemaRef } = await import('../db/client.js');
      await dbRef.insert(schemaRef.sessionEvents).values({
        id: nanoid(),
        sessionId,
        userId: session.userId,
        eventType: 'scenario.advanced',
        payload: {
          advancedToId: result.advancedTo?.id ?? null,
          scenarioIndex: result.scenarioIndex,
        },
      });
    } catch {
      // ignore
    }
  } catch (err) {
    console.warn('[scenario-advance] unexpected error', sessionId, err);
  }
}
