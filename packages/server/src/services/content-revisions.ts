/**
 * PLANIMPv1 §4.1 — Content revision service.
 * Saves a new revision row and returns the version number.
 */
import { nanoid } from 'nanoid';
import { eq, and, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { renderAndSanitize } from './rich-content.js';
import { estimateTokensFast } from '@neigo/shared';

export interface SaveRevisionArgs {
  entityType: 'character' | 'story';
  entityId: string;
  fieldKey: string;
  authorId: string;
  contentMd: string;
  summary?: string | null;
}

export async function saveRevision(args: SaveRevisionArgs): Promise<{ version: number; revisionId: string }> {
  const { entityType, entityId, fieldKey, authorId, contentMd, summary } = args;

  // Get current max version.
  const existing = await db
    .select({ version: sql<number>`MAX(${schema.contentRevisions.version})` })
    .from(schema.contentRevisions)
    .where(
      and(
        eq(schema.contentRevisions.entityType, entityType),
        eq(schema.contentRevisions.entityId, entityId),
        eq(schema.contentRevisions.fieldKey, fieldKey),
      ),
    );

  const nextVersion = (Number(existing[0]?.version) || 0) + 1;
  const { html, tokenCount } = renderAndSanitize(contentMd);
  const revisionId = nanoid();

  await db.insert(schema.contentRevisions).values({
    id: revisionId,
    entityType,
    entityId,
    fieldKey,
    version: nextVersion,
    authorId,
    summary: summary ?? null,
    contentMd,
    contentHtml: html,
    tokenCount,
  });

  return { version: nextVersion, revisionId };
}

export async function listRevisions(args: {
  entityType: 'character' | 'story';
  entityId: string;
  fieldKey?: string;
  limit?: number;
}): Promise<Array<typeof schema.contentRevisions.$inferSelect>> {
  const { entityType, entityId, fieldKey, limit = 20 } = args;
  const where = fieldKey
    ? and(
        eq(schema.contentRevisions.entityType, entityType),
        eq(schema.contentRevisions.entityId, entityId),
        eq(schema.contentRevisions.fieldKey, fieldKey),
      )
    : and(
        eq(schema.contentRevisions.entityType, entityType),
        eq(schema.contentRevisions.entityId, entityId),
      );

  return db
    .select()
    .from(schema.contentRevisions)
    .where(where)
    .orderBy(sql`${schema.contentRevisions.version} DESC`)
    .limit(limit);
}
