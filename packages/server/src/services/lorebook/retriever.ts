/**
 * Wk3 PLANv2 F1 — Lorebook retriever.
 *
 * Given a session + scan window (last N user/character messages), returns
 * the lorebook entries that should be injected into the prompt, packed
 * under a soft token budget. Ordering:
 *
 *   1. Keyword scan against haystack.
 *   2. Sort hits by entry.priority DESC, then title ASC.
 *   3. Pack greedily under tokenBudget; skip entries that overflow.
 *
 * `activeLore()` is the main entry-point used by the orchestrator; it can
 * also be hit by `GET /api/sessions/:id/active-lore` in wk5 (Inspector
 * backend) without modification.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema, sql as pg } from '../../db/client.js';
import { scanForMatches, type KeywordMatch } from './keyword-scan.js';
import { parseDirectives, passesDirectiveGate, type LoreDirectives } from './decorator-parser.js';
import { env } from '../../lib/env.js';
import { estimateTokensFast } from '../tokenizer.js';
import { Embeddings } from '../embeddings.js';

/**
 * Fallback when `lorebook_entries.token_estimate` is missing or stale.
 *
 * PLANBv1 X3.3 — this path stays synchronous on purpose: the retriever
 * runs inline per turn and the write path already persisted an accurate
 * cl100k count via `countTokens`. The fast heuristic is only a safety
 * net for legacy rows where `token_estimate` was 0/null.
 */
function estimateTokens(text: string): number {
  return estimateTokensFast(text);
}

export interface ActiveLoreEntry {
  id: string;
  lorebookId: string;
  title: string;
  content: string;
  depth: number;
  priority: number;
  tokenEstimate: number;
  matchedKeywords: string[];
  /** RRF rank score if from hybrid search. */
  vectorScore?: number;
}

export interface ActiveLoreResult {
  entries: ActiveLoreEntry[];
  /** Total estimated tokens of packed entries. */
  usedTokens: number;
  /** Lorebook IDs that contributed at least one matched entry. */
  lorebookIds: string[];
  /** Entries that matched but were skipped for budget reasons. */
  skipped: number;
}

export interface RetrieveArgs {
  sessionId: string;
  userId: string;
  /** Combined recent text (last user messages + last assistant replies). */
  scanText: string;
  /** Soft cap on total injected tokens across all matched entries. */
  tokenBudget?: number;
  /** Hard cap on number of entries returned regardless of budget. */
  maxEntries?: number;
  /** PLANv3 X2.6 — used by decorator gates (activate_only_after/every). */
  turnCount?: number;
  /** CIM v1 — Enable semantic search if true. */
  vectorSearch?: boolean;
}

/**
 * Load all enabled entries available to this session:
 *
 * - Entries of enabled lorebooks owned by the user with scope = USER (auto).
 * - Entries of enabled lorebooks explicitly linked via
 *   `session_lorebook_links` (scope = SESSION).
 */
async function loadCandidateEntries(args: Pick<RetrieveArgs, 'sessionId' | 'userId'>) {
  // 1. Pull active lorebooks (user-owned USER scope + session-linked).
  const userBooks = await db
    .select({ id: schema.lorebooks.id })
    .from(schema.lorebooks)
    .where(
      and(
        eq(schema.lorebooks.userId, args.userId),
        eq(schema.lorebooks.scope, 'USER'),
        eq(schema.lorebooks.isEnabled, true),
      ),
    );

  const linkedBooks = await db
    .select({ id: schema.lorebooks.id })
    .from(schema.sessionLorebookLinks)
    .innerJoin(
      schema.lorebooks,
      eq(schema.sessionLorebookLinks.lorebookId, schema.lorebooks.id),
    )
    .where(
      and(
        eq(schema.sessionLorebookLinks.sessionId, args.sessionId),
        eq(schema.lorebooks.isEnabled, true),
      ),
    );

  const bookIds = Array.from(new Set([...userBooks, ...linkedBooks].map((b) => b.id)));
  if (bookIds.length === 0) return { bookIds: [], entries: [] };

  const entries = await db
    .select({
      id: schema.lorebookEntries.id,
      lorebookId: schema.lorebookEntries.lorebookId,
      title: schema.lorebookEntries.title,
      content: schema.lorebookEntries.content,
      keywords: schema.lorebookEntries.keywords,
      priority: schema.lorebookEntries.priority,
      depth: schema.lorebookEntries.depth,
      tokenEstimate: schema.lorebookEntries.tokenEstimate,
      // embedding is added via raw SQL migration, so it's not in schema.lorebookEntries
      embedding: sql<string | null>`embedding`,
    })
    .from(schema.lorebookEntries)
    .where(
      and(
        inArray(schema.lorebookEntries.lorebookId, bookIds),
        eq(schema.lorebookEntries.enabled, true),
      ),
    );

  return { bookIds, entries };
}

export async function retrieveActiveLore(args: RetrieveArgs): Promise<ActiveLoreResult> {
  const tokenBudget = args.tokenBudget ?? 1500;
  const maxEntries = args.maxEntries ?? 30;
  const { entries } = await loadCandidateEntries(args);
  if (entries.length === 0) {
    return { entries: [], usedTokens: 0, lorebookIds: [], skipped: 0 };
  }

  // PLANv3 X2.6 — parse directives once per candidate.
  const decorated = entries.map((e) => {
    const { parsed, directives } = parseDirectives(e.content);
    return { ...e, content: parsed, directives };
  });

  // ── 1. Keyword Scan (Traditional) ──
  const keywordMatches = scanForMatches(args.scanText, decorated);
  let filteredKeywordMatches = keywordMatches;
  if (env.LOREBOOK_DECORATORS_ENABLED) {
    const turnCount = args.turnCount ?? 0;
    filteredKeywordMatches = keywordMatches.filter((m) =>
      passesDirectiveGate(m.entry.directives, { turnCount, haystack: args.scanText }),
    );
  }

  // ── 2. Vector Search (Semantic) ──
  let vectorHits: Array<{ id: string; distance: number }> = [];
  if (args.vectorSearch && args.scanText.trim().length > 0) {
    try {
      const qVec = await Embeddings.embed(args.scanText);
      const qVecLit = Embeddings.toPgLiteral(qVec);
      // Scan against only the candidate entries already loaded (book-scoped).
      const bookIds = Array.from(new Set(entries.map((e) => e.lorebookId)));
      const vRows = await pg.unsafe(
        `SELECT id, (embedding <=> $1::vector) AS distance 
         FROM lorebook_entries 
         WHERE lorebook_id = ANY($2) AND enabled = true AND embedding IS NOT NULL
         ORDER BY distance ASC LIMIT 20`,
        [qVecLit, bookIds] as never[],
      );
      vectorHits = vRows as unknown as Array<{ id: string; distance: number }>;
    } catch (err) {
      console.warn('[lore-retriever] vector search failed:', (err as Error).message);
    }
  }

  // ── 3. Hybrid RRF Fusion ──
  // Reciprocal Rank Fusion blends keyword hits and vector hits.
  const RRF_K = 60;
  const scoreMap = new Map<string, { rrf: number; keywords: string[] }>();
  
  // Rank keyword matches by priority then title (standard ordering)
  const sortedKeywords = [...filteredKeywordMatches].sort((a, b) => {
    if (b.entry.priority !== a.entry.priority) return b.entry.priority - a.entry.priority;
    return a.entry.title.localeCompare(b.entry.title);
  });
  sortedKeywords.forEach((m, i) => {
    scoreMap.set(m.entry.id, { rrf: 1 / (RRF_K + i + 1), keywords: m.matchedKeywords });
  });

  // Blend in vector hits
  vectorHits.forEach((v, i) => {
    const existing = scoreMap.get(v.id);
    const rrf = 1 / (RRF_K + i + 1);
    if (existing) {
      existing.rrf += rrf;
    } else {
      scoreMap.set(v.id, { rrf, keywords: ['semantic_sim'] });
    }
  });

  // Resolve final matches, sorted by RRF score
  const entryMap = new Map(decorated.map((e) => [e.id, e]));
  let matches = Array.from(scoreMap.entries())
    .map(([id, meta]) => ({
      entry: entryMap.get(id)!,
      matchedKeywords: meta.keywords,
      rrf: meta.rrf,
    }))
    .filter((m) => !!m.entry)
    .sort((a, b) => b.rrf - a.rrf);

  // PLANv3 X2.6 — recursive scan for transitive hits.
  if (env.LOREBOOK_RECURSIVE_SCAN_ENABLED && matches.length > 0) {
    const activated = new Set(matches.map((m) => m.entry.id));
    const remaining = decorated.filter((e) => !activated.has(e.id));
    let newText = matches.map((m) => m.entry.content).join('\n');
    for (let round = 0; round < 3 && remaining.length > 0 && newText.length > 0; round++) {
      const extra = scanForMatches(newText, remaining);
      const keep = env.LOREBOOK_DECORATORS_ENABLED
        ? extra.filter((m) =>
            passesDirectiveGate(m.entry.directives, {
              turnCount: args.turnCount ?? 0,
              haystack: newText,
            }),
          )
        : extra;
      if (keep.length === 0) break;
      for (const m of keep) {
        activated.add(m.entry.id);
        matches.push({ entry: m.entry, matchedKeywords: m.matchedKeywords, rrf: 0.01 });
      }
      newText = keep.map((m) => m.entry.content).join('\n');
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (activated.has(remaining[i]!.id)) remaining.splice(i, 1);
      }
    }
  }

  const packed: ActiveLoreEntry[] = [];
  const lorebookIds = new Set<string>();
  let usedTokens = 0;
  let skipped = 0;
  for (const match of matches) {
    if (packed.length >= maxEntries) {
      skipped++;
      continue;
    }
    const tokenEstimate =
      match.entry.tokenEstimate > 0
        ? match.entry.tokenEstimate
        : estimateTokens(`${match.entry.title}\n${match.entry.content}`);
    if (usedTokens + tokenEstimate > tokenBudget) {
      skipped++;
      continue;
    }
    usedTokens += tokenEstimate;
    lorebookIds.add(match.entry.lorebookId);
    packed.push({
      id: match.entry.id,
      lorebookId: match.entry.lorebookId,
      title: match.entry.title,
      content: match.entry.content,
      depth: match.entry.depth,
      priority: match.entry.priority,
      tokenEstimate,
      matchedKeywords: match.matchedKeywords,
      vectorScore: match.rrf,
    });
  }

  return {
    entries: packed,
    usedTokens,
    lorebookIds: Array.from(lorebookIds),
    skipped,
  };
}

/**
 * Render the packed lore entries as a single prompt fragment, grouped by
 * depth so the orchestrator can choose the correct insertion point. The
 * builder uses `appendLoreContext` to fold this into the system prompt.
 */
export function renderLoreBlock(entries: readonly ActiveLoreEntry[]): string {
  if (entries.length === 0) return '';
  const lines: string[] = ['### WORLD LORE (triggered by recent context)'];
  for (const e of entries) {
    lines.push(`\n— **${e.title}**`);
    lines.push(e.content.trim());
  }
  return lines.join('\n');
}
