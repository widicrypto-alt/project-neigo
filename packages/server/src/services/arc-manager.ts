/**
 * Arc Manager Service — PLANCHATv3 Phase 4
 *
 * Handles arc checkpoint creation and retrieval using existing
 * context-compaction infrastructure. Arc data is stored in the
 * memories table as SUMMARY entries with arc metadata embedded
 * in the content field as JSON so no schema migration is required.
 */
import { and, eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { MemoryType } from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { compactSessionContext } from './context-compaction.js';
import { AiProxy } from './ai-proxy.js';
import { AI_MODEL_CONFIG, DEFAULT_AI_MODEL } from '@neigo/shared';

/**
 * Arc checkpoint — represents a saved story beat
 */
export interface ArcCheckpoint {
  id: string;
  sessionId: string;
  title: string;
  turnCount: number;
  summary: string;
  importance: number;
  createdAt: Date;
}

/**
 * Result of a context compaction pass.
 * Mirrored from context-compaction.ts so we don't need to import an unexported type.
 */
interface CompactionResult {
  nodesCreated: number;
  turnsCompacted: number;
}

/**
 * Auto-trigger threshold (turns between arc saves)
 */
const ARC_AUTO_TRIGGER_TURNS = 30;

/**
 * Arc summary generation — max tokens for the LLM call
 */
const ARC_SUMMARY_MAX_TOKENS = 350;

// Arc metadata prefix — stored at the start of content so the summary
// can be retrieved without parsing metadata fields that don't exist in the schema.
function embedArcMeta(title: string, turnCount: number): string {
  return JSON.stringify({ _arc: true, title, turnCount }) + '\n';
}

function extractArcMeta(content: string): { title: string; turnCount: number; summary: string } {
  const nl = content.indexOf('\n');
  let meta: { title: string; turnCount: number } = { title: '', turnCount: 0 };
  let body = content;
  try {
    const raw = JSON.parse(content.slice(0, nl));
    if (raw._arc) {
      meta = { title: raw.title ?? '', turnCount: raw.turnCount ?? 0 };
      body = content.slice(nl + 1);
    }
  } catch {
    // Not JSON-prefixed — treat whole content as summary
  }
  return { ...meta, summary: body.trim() };
}

/**
 * Save an arc checkpoint to the memories table.
 *
 * @param sessionId - The chat session
 * @param turnCount - Current turn number
 * @param summary - The arc summary text
 * @param importance - Narrative importance score 0..1 (default 0.5)
 * @param title - Optional arc title (defaults to "Arc at turn N")
 */
export async function saveArcCheckpoint(
  sessionId: string,
  turnCount: number,
  summary: string,
  importance: number = 0.5,
  title?: string,
): Promise<ArcCheckpoint> {
  const id = nanoid();
  const arcTitle = title ?? `Arc at turn ${turnCount}`;
  const createdAt = new Date();

  // Store arc metadata as a JSON prefix in the content field so the
  // existing schema (no metadata column) can persist this information.
  const content = embedArcMeta(arcTitle, turnCount) + summary;

  await db.insert(schema.memories).values({
    id,
    sessionId,
    userId: 'system',
    characterId: null,
    type: MemoryType.SUMMARY,
    content,
    category: 'GENERAL',
    importance,
  });

  return { id, sessionId, title: arcTitle, turnCount, summary, importance, createdAt };
}

/**
 * Get all arc checkpoints for a session, ordered by most recent.
 */
export async function getArcCheckpoints(sessionId: string): Promise<ArcCheckpoint[]> {
  const rows = await db.query.memories.findMany({
    where: (m, { eq, and }) => and(
      eq(m.sessionId, sessionId),
      eq(m.type, MemoryType.SUMMARY),
    ),
    orderBy: (m, { desc }) => [desc(m.createdAt)],
  });

  return rows.map((r) => {
    const { title, turnCount, summary } = extractArcMeta(r.content ?? '');
    return {
      id: r.id,
      sessionId: r.sessionId ?? sessionId,
      title: title || 'Untitled Arc',
      turnCount: turnCount ?? 0,
      summary,
      importance: r.importance ?? 0.5,
      createdAt: r.createdAt,
    };
  });
}

/**
 * Get the most recent arc checkpoint for a session.
 */
export async function getLatestArcCheckpoint(sessionId: string): Promise<ArcCheckpoint | null> {
  const checkpoints = await getArcCheckpoints(sessionId);
  return checkpoints[0] ?? null;
}

/**
 * Check if auto-arc trigger should fire based on turn count.
 * Call this after each turn completion.
 */
export function shouldAutoTriggerArc(turnCount: number): boolean {
  return turnCount > 0 && turnCount % ARC_AUTO_TRIGGER_TURNS === 0;
}

/**
 * Check whether an arc was already saved at the given turn to prevent double-save.
 * Used to avoid duplicate checkpoints when [ARC_SAVE] tag fires at the same turn
 * as the 30-turn auto-trigger.
 */
export async function hasArcAtTurn(sessionId: string, turnCount: number): Promise<boolean> {
  const arcs = await getArcCheckpoints(sessionId);
  return arcs.some((a) => a.turnCount === turnCount);
}

/**
 * Use an LLM to generate a narrative arc summary from the session transcript.
 *
 * @param sessionId - The chat session
 * @param fromTurn - Starting turn (inclusive)
 * @param toTurn - Ending turn (inclusive)
 * @returns Object with summary and importance (0..1), or null on failure
 */
export async function generateArcSummary(
  sessionId: string,
  fromTurn: number,
  toTurn: number,
): Promise<{ summary: string; importance: number } | null> {
  // Load messages in the turn range.
  // turnIndex encoding: USER messages are at even indices (N*2),
  // ASSISTANT at odd (N*2+1). We fetch a generous window covering fromTurn..toTurn.
  const fromIdx = fromTurn * 2 - 2; // start before the user msg of fromTurn
  const toIdx = toTurn * 2 + 6;     // cover all CAST offsets: N*2+0..N*2+5

  const messages = await db
    .select()
    .from(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.sessionId, sessionId),
        sql`${schema.chatMessages.turnIndex} >= ${fromIdx}`,
        sql`${schema.chatMessages.turnIndex} <= ${toIdx}`,
      ),
    )
    .orderBy((m) => m.turnIndex);

  if (messages.length < 2) return null;

  const transcript = messages
    .map((m) => {
      if (m.role === 'USER') return `User: ${m.content}`;
      const speaker =
        m.speakerType === 'NARRATOR' ? 'Narrator'
        : m.speakerType === 'REACTOR' ? 'Character'
        : m.speakerType === 'SILENT' ? 'Character'
        : m.speakerType === 'WHISPER' ? 'Character'
        : 'Character';
      return `${speaker}: ${m.content}`;
    })
    .join('\n');

  if (transcript.length < 50) return null;

  const systemPrompt = [
    'You are a narrative archivist. Given the following roleplay transcript segment, produce a story arc summary that preserves narrative continuity.',
    '',
    'RULES:',
    '1. Identify key events: conflicts, revelations, emotional shifts, decisions',
    '2. Note relationship state: trust level, tension, emotional dynamics between characters',
    '3. Identify unresolved threads that MUST continue in future turns',
    '4. Write 3-5 sentences maximum',
    '5. Write in third-person past tense narrative prose',
    '6. Do NOT include raw dialogue or direct quotes — summarize the beats',
    '7. Do NOT list speakers one by one — write it as a coherent story',
    '8. Capture emotional progression and tonal shifts',
    '9. Infer the arc title/nature if obvious from the content',
    '',
    'Write in the same language as the transcript.',
    '',
    'OUTPUT: Respond with a JSON object ONLY:',
    '{"summary": "3-5 sentences prose", "importance": 0.NN}',
    'Importance should be between 0.0 and 1.0 based on narrative impact.',
  ].join('\n');

  try {
    const result = await AiProxy.complete({
      model: AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcript },
      ],
      temperature: 0.35,
      maxTokens: ARC_SUMMARY_MAX_TOKENS,
    });

    const raw = result.content.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    let parsed: { summary: string; importance: number };
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Fallback: extract summary if JSON fails
      const match = raw.match(/"summary":\s*"([^"]+)"/);
      const impMatch = raw.match(/"importance":\s*([0-9.]+)/);
      parsed = {
        summary: match?.[1] ?? raw.slice(0, 500),
        importance: impMatch != null ? parseFloat(impMatch[1]!) : 0.5,
      };
    }

    if (parsed.summary.length < 40) return null;
    return {
      summary: parsed.summary,
      importance: Math.max(0, Math.min(1, parsed.importance || 0.5)),
    };
  } catch (err) {
    console.warn('[arc-manager] generateArcSummary failed:', (err as Error).message);
    return null;
  }
}

/**
 * Trigger arc compaction and save.
 * This is async and should NOT block the response.
 */
export async function triggerAutoArcSave(
  sessionId: string,
  currentTurn: number,
  arcTitle?: string,
): Promise<{ compaction: CompactionResult; checkpoint: ArcCheckpoint | null }> {
  // Deduplicate: skip if we already have an arc at this exact turn
  if (await hasArcAtTurn(sessionId, currentTurn)) {
    console.info(`[arc] skipped auto-save — arc already exists at turn ${currentTurn}`);
    return { compaction: { nodesCreated: 0, turnsCompacted: 0 }, checkpoint: null };
  }

  // Run context compaction first (this also produces D0 leaf nodes)
  const compaction = await compactSessionContext(sessionId, currentTurn);

  let checkpoint: ArcCheckpoint | null = null;

  if (compaction.turnsCompacted > 0) {
    const ARC_SUMMARY_WINDOW = 30;
    const fromTurn = Math.max(0, currentTurn - ARC_SUMMARY_WINDOW);

    const result = await generateArcSummary(sessionId, fromTurn, currentTurn);

    if (result) {
      checkpoint = await saveArcCheckpoint(
        sessionId,
        currentTurn,
        result.summary,
        result.importance,
        arcTitle,
      );
      console.info(`[arc] auto-checkpoint saved at turn ${currentTurn}: ${arcTitle ?? '(no title)'}`);
    } else {
      console.warn(`[arc] generateArcSummary returned null at turn ${currentTurn} — checkpoint skipped`);
    }
  }

  return { compaction, checkpoint };
}

/**
 * Save an arc checkpoint triggered by the [ARC_SAVE] model tag.
 */
export async function saveModelTriggeredArc(
  sessionId: string,
  turnCount: number,
  arcTitle?: string,
): Promise<{ checkpoint: ArcCheckpoint | null }> {
  // Deduplicate against existing arc at this turn
  if (await hasArcAtTurn(sessionId, turnCount)) {
    console.info(`[arc] skipped model-triggered save — arc already exists at turn ${turnCount}`);
    return { checkpoint: null };
  }

  const ARC_SUMMARY_WINDOW = 30;
  const fromTurn = Math.max(0, turnCount - ARC_SUMMARY_WINDOW);
  const result = await generateArcSummary(sessionId, fromTurn, turnCount);

  if (!result) {
    console.warn(`[arc] model-triggered arc save failed at turn ${turnCount}`);
    return { checkpoint: null };
  }

  const checkpoint = await saveArcCheckpoint(
    sessionId,
    turnCount,
    result.summary,
    result.importance,
    arcTitle,
  );
  console.info(`[arc] model-triggered checkpoint saved at turn ${turnCount}${arcTitle ? `: ${arcTitle}` : ''}`);

  return { checkpoint };
}

/**
 * Delete an arc checkpoint by ID.
 */
export async function deleteArcCheckpoint(checkpointId: string): Promise<void> {
  await db.delete(schema.memories).where(eq(schema.memories.id, checkpointId));
}

/**
 * Count arc checkpoints for a session.
 */
export async function countArcCheckpoints(sessionId: string): Promise<number> {
  const checkpoints = await getArcCheckpoints(sessionId);
  return checkpoints.length;
}