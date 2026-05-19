/**
 * PLANv3 X2.5 — Regex script loader.
 *
 * Loads enabled regex_scripts for (userId, placement) combining all matching
 * scopes in canonical pipeline order: `order_index ASC, created_at ASC`.
 *
 * Gated by `env.REGEX_SCRIPTS_ENABLED` — when false, returns []. Callers
 * should wrap in try/catch: DB failures are non-fatal (pipeline continues
 * with original text).
 */

import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { env } from '../lib/env.js';
import type { RegexScript } from '@neigo/shared';

export type RegexPlacement = 'edit_input' | 'edit_output' | 'edit_process' | 'edit_display';

export interface LoadScriptsArgs {
  userId: string;
  placement: RegexPlacement;
  characterId?: string | null;
  presetId?: string | null;
}

export async function loadRegexScripts(args: LoadScriptsArgs): Promise<RegexScript[]> {
  if (!env.REGEX_SCRIPTS_ENABLED) return [];
  try {
    const rows = await db
      .select()
      .from(schema.regexScripts)
      .where(
        and(
          eq(schema.regexScripts.userId, args.userId),
          eq(schema.regexScripts.enabled, true),
          eq(schema.regexScripts.placement, args.placement),
        ),
      )
      .orderBy(asc(schema.regexScripts.orderIndex), asc(schema.regexScripts.createdAt));

    const scoped = rows.filter((r) => {
      if (r.scope === 'user') return true;
      if (r.scope === 'character') return !!args.characterId && r.scopeId === args.characterId;
      if (r.scope === 'preset') return !!args.presetId && r.scopeId === args.presetId;
      return false;
    });

    return scoped.map((r) => ({
      id: r.id,
      findRegex: r.findRegex,
      replaceString: r.replaceString,
      trimStrings: Array.isArray(r.trimStrings) ? (r.trimStrings as string[]) : [],
      flags: r.flags,
      minDepth: r.minDepth,
      maxDepth: r.maxDepth,
      promptOnly: r.promptOnly,
    }));
  } catch (err) {
    console.warn('[regex-scripts] load failed:', err);
    return [];
  }
}
