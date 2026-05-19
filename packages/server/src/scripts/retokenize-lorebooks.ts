/**
 * PLANBv1 X3.3 — Retokenize lorebook entries with the real cl100k encoder.
 *
 * Legacy rows carry `token_estimate` values computed by the old
 * `Math.ceil(len/4)` heuristic (typically ~5-15% lower than the truth for
 * our Indonesian/Japanese/English mix). This script walks the table in
 * batches and overwrites `token_estimate` with the accurate count.
 *
 * Idempotent: safe to re-run. Only touches `token_estimate`.
 *
 * Usage:
 *   pnpm --filter @neigo/server tokens:retokenize                 # default batch 200
 *   pnpm --filter @neigo/server tokens:retokenize -- --batch=500  # larger batch
 *   pnpm --filter @neigo/server tokens:retokenize -- --dry-run    # report only
 */

import { asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { countTokensBatch } from '../services/tokenizer.js';

function parseArg(flag: string, fallback: number): number {
  const match = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (!match) return fallback;
  const n = Number.parseInt(match.split('=')[1] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const batchSize = parseArg('--batch', 200);
  const dryRun = process.argv.includes('--dry-run');

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.lorebookEntries);
  const totalRows = Number(countRows[0]?.count ?? 0);
  console.log(`[retokenize] ${totalRows} lorebook_entries rows total`);
  if (totalRows === 0) return;

  let processed = 0;
  let updated = 0;
  let lastId: string | null = null;
  let deltaSum = 0;
  let deltaMax = 0;

  while (true) {
    const batch = await db
      .select({
        id: schema.lorebookEntries.id,
        title: schema.lorebookEntries.title,
        content: schema.lorebookEntries.content,
        oldEstimate: schema.lorebookEntries.tokenEstimate,
      })
      .from(schema.lorebookEntries)
      .orderBy(asc(schema.lorebookEntries.id))
      .limit(batchSize)
      .offset(processed);

    if (batch.length === 0) break;

    const texts = batch.map((r) => `${r.title}\n${r.content}`);
    const counts = await countTokensBatch(texts);

    for (let i = 0; i < batch.length; i++) {
      const row = batch[i]!;
      const next = counts[i] ?? 0;
      const prev = row.oldEstimate ?? 0;
      const delta = next - prev;
      deltaSum += delta;
      if (Math.abs(delta) > deltaMax) deltaMax = Math.abs(delta);

      if (prev !== next) {
        if (!dryRun) {
          await db
            .update(schema.lorebookEntries)
            .set({ tokenEstimate: next })
            .where(eq(schema.lorebookEntries.id, row.id));
        }
        updated++;
      }
      lastId = row.id;
    }

    processed += batch.length;
    console.log(
      `[retokenize] progress ${processed}/${totalRows} — delta so far ${deltaSum > 0 ? '+' : ''}${deltaSum}, worst |Δ|=${deltaMax}`,
    );
    if (batch.length < batchSize) break;
  }

  console.log(
    `[retokenize] done — processed=${processed} updated=${updated} deltaSum=${deltaSum} maxAbsDelta=${deltaMax} dryRun=${dryRun}${lastId ? ` lastId=${lastId}` : ''}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('[retokenize] failed:', err);
  process.exit(1);
});
