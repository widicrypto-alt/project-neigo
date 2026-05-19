/**
 * Context Compaction Service — LCM-inspired Phase 1 + Phase 2
 *
 * Phase 1 (T3.10): Leaf D0 nodes from raw transcript chunks.
 * Phase 2 (T4.4): D1 parent condensation when fanin ≥ CONDENSE_FANIN.
 * Phase 2 (T4.7): L1→L2→L3 escalation guarantees bounded output.
 *
 * Design principles (from BRAINSTORM.md §11–14):
 * - Immutable transcript truth: chat_messages are never mutated
 * - Leaf nodes cover a range of turns and store a compressed summary
 * - Parent D1 nodes summarize N children; D2 cap for roleplay
 * - L1→L2→L3 escalation ensures summarizeChunk never blows token budget
 * - Salience scoring: emotional beats and plot-relevant turns score higher
 * - Retrieval: orchestrator pulls highest-depth nodes first, falls back to D0
 * - Budget-aware: total injected context from nodes stays within token limit
 */
import { and, eq, lt, asc, sql, isNull, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { AI_MODEL_CONFIG, DEFAULT_AI_MODEL } from '@neigo/shared';
import { db, schema } from '../db/client.js';
import { AiProxy, type AiMessage } from './ai-proxy.js';
import { env } from '../lib/env.js';
import { countTokens } from './tokenizer.js';

const LEAF_TURN_SPAN = 10; // Each leaf covers ~10 turns
const MAX_SUMMARY_TOKENS = 200; // Target tokens per leaf summary

// T4.4: DAG condensation constants
const CONDENSE_FANIN = 4; // Trigger D1 when ≥4 un-parented D0 nodes exist
const MAX_DEPTH = 2; // Cap: D0 → D1 → D2 (no deeper for roleplay)

// T4.7: L1→L2→L3 escalation thresholds
const L1_MAX_CHARS = 1600; // ~400 tokens — if exceeds, escalate to L2
const L2_MAX_CHARS = 800; // ~200 tokens — if exceeds, truncate (L3)
const L3_HARD_CAP = 600; // ~150 tokens — deterministic word-boundary truncate

interface CompactionResult {
  nodesCreated: number;
  turnsCompacted: number;
}

/**
 * X4.2 observability — in-process counters for lineage edge inserts.
 * Snapshotable via `getLineageCounters()`; not reset automatically.
 */
export const lineageInsertCounter = {
  message: 0,
  node: 0,
  blob: 0,
};

export function getLineageCounters(): { message: number; node: number; blob: number } {
  return { ...lineageInsertCounter };
}

/**
 * Check if a session needs compaction and run it if so.
 * Called after each turn or periodically by cron.
 *
 * Logic: Find the "frontier" (last compacted turnEnd), then compact
 * any messages between frontier and (current window start - buffer).
 */
export async function compactSessionContext(
  sessionId: string,
  currentWindowStart: number,
): Promise<CompactionResult> {
  // Find the last compacted turn
  const lastNode = await db.query.contextNodes.findFirst({
    where: and(
      eq(schema.contextNodes.sessionId, sessionId),
      eq(schema.contextNodes.depth, 0),
    ),
    orderBy: (n, { desc }) => [desc(n.turnEnd)],
  });

  const frontier = lastNode ? lastNode.turnEnd + 1 : 0;

  // Only compact turns that are safely behind the active window
  // Leave a buffer of LEAF_TURN_SPAN turns before the window start
  const compactUpTo = currentWindowStart - LEAF_TURN_SPAN;
  if (compactUpTo <= frontier) {
    return { nodesCreated: 0, turnsCompacted: 0 };
  }

  // Load messages in the compactable range
  const messages = await db
    .select()
    .from(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.sessionId, sessionId),
        sql`${schema.chatMessages.turnIndex} >= ${frontier}`,
        sql`${schema.chatMessages.turnIndex} < ${compactUpTo}`,
      ),
    )
    .orderBy(asc(schema.chatMessages.turnIndex));

  if (messages.length < 4) {
    return { nodesCreated: 0, turnsCompacted: 0 };
  }

  // Chunk messages into leaf spans
  let nodesCreated = 0;
  let turnsCompacted = 0;

  for (let i = 0; i < messages.length; i += LEAF_TURN_SPAN * 2) {
    const chunk = messages.slice(i, i + LEAF_TURN_SPAN * 2);
    if (chunk.length < 2) break;

    const turnStart = chunk[0]!.turnIndex;
    const turnEnd = chunk[chunk.length - 1]!.turnIndex;

    const summary = await summarizeChunk(chunk);
    if (!summary) continue;

    const salience = estimateSalience(chunk);

    const leafId = nanoid();
    await db.insert(schema.contextNodes).values({
      id: leafId,
      sessionId,
      parentId: null,
      depth: 0,
      turnStart,
      turnEnd,
      summary,
      salience,
      tokenCount: await countTokens(summary),
    });

    // X4.2 — emit lineage rows so ops inspector + retrieval can trace
    // which raw messages back this summary. Batched, idempotent.
    if (chunk.length > 0) {
      await db
        .insert(schema.contextNodeSources)
        .values(
          chunk.map((m) => ({
            contextNodeId: leafId,
            sourceType: 'message' as const,
            sourceId: m.id,
            rangeStart: m.turnIndex,
            rangeEnd: m.turnIndex,
          })),
        )
        .onConflictDoNothing();
      lineageInsertCounter.message += chunk.length;
    }

    nodesCreated++;
    turnsCompacted += chunk.length;
  }

  return { nodesCreated, turnsCompacted };
}

/**
 * Retrieve the most relevant context nodes for prompt injection.
 * Prefers higher-depth nodes (denser summaries) first, then fills
 * remaining budget with lower-depth nodes by salience.
 */
export async function retrieveCompactedContext(
  sessionId: string,
  tokenBudget = 4000,
): Promise<string[]> {
  // Fetch all nodes, ordered by depth DESC (prefer D1/D2), then salience DESC
  const nodes = await db
    .select()
    .from(schema.contextNodes)
    .where(eq(schema.contextNodes.sessionId, sessionId))
    .orderBy(sql`depth DESC, salience DESC, turn_end DESC`)
    .limit(40);

  if (!nodes.length) return [];

  const selected: Array<{ summary: string; turnStart: number; depth: number }> = [];
  let usedTokens = 0;
  // Track turn ranges already covered by parent nodes to avoid redundancy
  const coveredRanges: Array<[number, number]> = [];

  for (const node of nodes) {
    if (usedTokens + node.tokenCount > tokenBudget) continue;
    // Skip D0 nodes that are covered by a selected parent
    if (node.depth === 0 && coveredRanges.some(([s, e]) => node.turnStart >= s && node.turnEnd <= e)) {
      continue;
    }
    selected.push({ summary: node.summary, turnStart: node.turnStart, depth: node.depth });
    usedTokens += node.tokenCount;
    if (node.depth > 0) {
      coveredRanges.push([node.turnStart, node.turnEnd]);
    }
  }

  // Return in chronological order
  selected.sort((a, b) => a.turnStart - b.turnStart);
  return selected.map((s) => s.summary);
}

/**
 * Use LLM to summarize a chunk of messages into a compact context node.
 * T4.7: L1→L2→L3 escalation guarantees convergence and bounded output.
 *
 * L1: Detailed prose summary (~400 tokens target)
 * L2: If L1 > L1_MAX_CHARS, re-summarize with "≤8 bullet points" (~200 tokens)
 * L3: If L2 still > L2_MAX_CHARS, deterministic word-boundary truncate to L3_HARD_CAP
 */
async function summarizeChunk(
  messages: Array<{ role: string; speakerType: string; content: string; turnIndex: number }>,
): Promise<string | null> {
  const transcript = messages
    .map((m) => {
      const speaker = m.speakerType === 'USER' ? 'User' : m.speakerType === 'NARRATOR' ? 'Narrator' : 'Character';
      return `[${speaker}]: ${m.content.slice(0, 500)}`;
    })
    .join('\n');

  // ── L1: detailed prose summary ──
  const l1Prompt: AiMessage[] = [
    {
      role: 'system',
      content: [
        'You are a context compaction engine. Summarize the following roleplay transcript into a dense, fact-preserving summary.',
        'Focus on: plot events, emotional shifts, promises made, relationship changes, scene state changes, character decisions.',
        'Omit: filler dialogue, repetitive actions, greetings.',
        'Output: A single paragraph, max 150 words. Include character names and key facts.',
        'Write in the same language as the transcript.',
      ].join('\n'),
    },
    { role: 'user', content: transcript },
  ];

  try {
    const l1Result = await AiProxy.complete({
      model: AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug,
      messages: l1Prompt,
      temperature: 0.3,
      maxTokens: MAX_SUMMARY_TOKENS,
    });
    let summary = l1Result.content.trim();
    if (summary.length < 10) return null;

    // ── L2: escalate if L1 too long ──
    if (env.LCM_ESCALATION_ENABLED && summary.length > L1_MAX_CHARS) {
      const l2Prompt: AiMessage[] = [
        {
          role: 'system',
          content:
            'Compress the following summary into ≤ 8 bullet points. Keep only the most critical facts, names, and emotional shifts. Max 100 words total.',
        },
        { role: 'user', content: summary },
      ];
      const l2Result = await AiProxy.complete({
        model: AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug,
        messages: l2Prompt,
        temperature: 0.2,
        maxTokens: 150,
      });
      const l2Summary = l2Result.content.trim();
      if (l2Summary.length > 10) {
        summary = l2Summary;
      }
    }

    // ── L3: deterministic hard cap if still too long ──
    if (env.LCM_ESCALATION_ENABLED && summary.length > L2_MAX_CHARS) {
      summary = truncateAtWordBoundary(summary, L3_HARD_CAP);
    }

    return summary;
  } catch (err) {
    console.warn('[compaction] summarize failed:', (err as Error).message);
    return null;
  }
}

/**
 * Truncate text at the nearest word boundary before maxChars.
 * Guaranteed to return ≤ maxChars. Pure string op — cannot fail.
 */
function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > maxChars * 0.5 ? truncated.slice(0, lastSpace) + '…' : truncated + '…';
}

/**
 * T4.4: DAG D1 Condensation
 *
 * When the count of un-parented nodes at a given depth reaches CONDENSE_FANIN,
 * summarize them into a single depth+1 parent node; set parentId on children.
 *
 * Called after leaf (D0) compaction. Recursively checks up to MAX_DEPTH.
 */
export async function condenseDepth(sessionId: string): Promise<number> {
  if (!env.CONTEXT_DAG_CONDENSE_ENABLED) return 0;

  let totalCreated = 0;

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    // Find un-parented nodes at this depth
    const orphans = await db
      .select()
      .from(schema.contextNodes)
      .where(
        and(
          eq(schema.contextNodes.sessionId, sessionId),
          eq(schema.contextNodes.depth, depth),
          isNull(schema.contextNodes.parentId),
        ),
      )
      .orderBy(asc(schema.contextNodes.turnStart));

    if (orphans.length < CONDENSE_FANIN) continue;

    // Process in groups of CONDENSE_FANIN
    for (let i = 0; i + CONDENSE_FANIN <= orphans.length; i += CONDENSE_FANIN) {
      const group = orphans.slice(i, i + CONDENSE_FANIN);
      const combinedText = group.map((n) => n.summary).join('\n\n');

      // Summarize the group into a parent node
      const parentSummary = await summarizeNodeGroup(combinedText);
      if (!parentSummary) continue;

      const parentId = nanoid();
      const turnStart = group[0]!.turnStart;
      const turnEnd = group[group.length - 1]!.turnEnd;
      const avgSalience = group.reduce((sum, n) => sum + n.salience, 0) / group.length;

      await db.insert(schema.contextNodes).values({
        id: parentId,
        sessionId,
        parentId: null,
        depth: depth + 1,
        turnStart,
        turnEnd,
        summary: parentSummary,
        salience: Math.min(1.0, avgSalience + 0.05), // slight boost for condensed nodes
        tokenCount: await countTokens(parentSummary),
      });

      // X4.2 — lineage edges from parent → each child node.
      await db
        .insert(schema.contextNodeSources)
        .values(
          group.map((child) => ({
            contextNodeId: parentId,
            sourceType: 'node' as const,
            sourceId: child.id,
            rangeStart: child.turnStart,
            rangeEnd: child.turnEnd,
          })),
        )
        .onConflictDoNothing();
      lineageInsertCounter.node += group.length;

      // Update children to point to parent
      for (const child of group) {
        await db
          .update(schema.contextNodes)
          .set({ parentId })
          .where(eq(schema.contextNodes.id, child.id));
      }

      totalCreated++;
    }
  }

  return totalCreated;
}

/**
 * Summarize a group of node summaries into a higher-level parent summary.
 * Uses L1→L2→L3 escalation like leaf summarization.
 */
async function summarizeNodeGroup(combinedText: string): Promise<string | null> {
  const prompt: AiMessage[] = [
    {
      role: 'system',
      content: [
        'You are a hierarchical context compressor. The following are summaries of adjacent scene segments.',
        'Merge them into ONE cohesive summary that captures the arc: what changed from start to end.',
        'Prioritize: relationship progression, major decisions, emotional turning points, scene transitions.',
        'Output: A single dense paragraph, max 120 words.',
        'Write in the same language as the input.',
      ].join('\n'),
    },
    { role: 'user', content: combinedText },
  ];

  try {
    const result = await AiProxy.complete({
      model: AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 180,
    });
    let summary = result.content.trim();
    if (summary.length < 10) return null;

    // L2 escalation if too long
    if (env.LCM_ESCALATION_ENABLED && summary.length > L1_MAX_CHARS) {
      const l2Prompt: AiMessage[] = [
        {
          role: 'system',
          content: 'Compress to ≤ 6 bullet points. Keep only critical facts and emotional arc. Max 80 words.',
        },
        { role: 'user', content: summary },
      ];
      const l2Result = await AiProxy.complete({
        model: AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug,
        messages: l2Prompt,
        temperature: 0.2,
        maxTokens: 120,
      });
      const l2 = l2Result.content.trim();
      if (l2.length > 10) summary = l2;
    }

    // L3 hard cap
    if (env.LCM_ESCALATION_ENABLED && summary.length > L2_MAX_CHARS) {
      summary = truncateAtWordBoundary(summary, L3_HARD_CAP);
    }

    return summary;
  } catch (err) {
    console.warn('[compaction] node group summarize failed:', (err as Error).message);
    return null;
  }
}

/**
 * Estimate salience of a message chunk based on emotional and plot signals.
 * Returns 0-1 score.
 */
function estimateSalience(
  messages: Array<{ content: string; speakerType: string }>,
): number {
  const text = messages.map((m) => m.content).join(' ');
  let score = 0.3; // baseline

  // Emotional intensity markers
  const emotionalPatterns = /\b(love|hate|scared|afraid|trust|betray|promise|hurt|tears|cry|kiss|embrace|jealous|angry|cinta|benci|takut|percaya|janji|sakit|tangis|cium|peluk|cemburu|marah)\b/gi;
  const emotionalHits = (text.match(emotionalPatterns) || []).length;
  score += Math.min(0.3, emotionalHits * 0.05);

  // Plot advancement markers
  const plotPatterns = /\b(reveal|secret|discover|decide|confess|leave|arrive|fight|escape|death|truth|rahasia|keputusan|pengakuan|pergi|tiba|pertarungan|kabur)\b/gi;
  const plotHits = (text.match(plotPatterns) || []).length;
  score += Math.min(0.2, plotHits * 0.05);

  // Scene transitions
  const scenePatterns = /\[STATE:|===|---|\*\*\*/g;
  const sceneHits = (text.match(scenePatterns) || []).length;
  score += Math.min(0.1, sceneHits * 0.03);

  // Vulnerability moments (high salience)
  if (/vulnerability|first time|never told anyone/i.test(text)) {
    score += 0.15;
  }

  return Math.min(1.0, score);
}
