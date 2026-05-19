/**
 * PLANv3 X4.1 (post-batch Track B.1) — Context blob externalization.
 *
 * Offloads large tool outputs / scene artifacts out of the prompt into
 * a pluggable storage backend, keeping only a short digest + pointer in
 * `context_nodes`. This file lands the schema-layer glue and a
 * `BlobStorageProvider` contract; a real R2/S3 adapter is a follow-up.
 *
 * Today the default provider is in-memory (dev + tests only). Callers
 * reading from the DB can detect externalised content via the
 * `blob_ref` column on `context_nodes`.
 */

import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import {
  getObjectBytes,
  putObjectBytes,
  isR2Configured,
} from './r2-storage.js';

export interface BlobStorageProvider {
  put(key: string, content: string, mimeType: string): Promise<void>;
  get(key: string): Promise<string>;
}

/**
 * Process-local fallback provider. Intended for unit tests and local dev —
 * swap in an R2 adapter via `setDefaultStorageProvider` once wired.
 */
class InMemoryStorageProvider implements BlobStorageProvider {
  private store = new Map<string, string>();
  async put(key: string, content: string): Promise<void> {
    this.store.set(key, content);
  }
  async get(key: string): Promise<string> {
    const v = this.store.get(key);
    if (v == null) throw new Error(`blob_not_found:${key}`);
    return v;
  }
}

/**
 * PLANBv7 W-D — R2-backed provider. Uses the same S3 client as the
 * gallery path. Content is UTF-8 text (context blobs are transcripts /
 * tool outputs, not binary), so we round-trip through Buffer.
 */
export class R2StorageProvider implements BlobStorageProvider {
  async put(key: string, content: string, mimeType: string): Promise<void> {
    await putObjectBytes({
      key,
      body: Buffer.from(content, 'utf8'),
      mime: mimeType || 'text/plain; charset=utf-8',
    });
  }
  async get(key: string): Promise<string> {
    const bytes = await getObjectBytes(key);
    if (!bytes) throw new Error(`blob_not_found:${key}`);
    return bytes.toString('utf8');
  }
}

let provider: BlobStorageProvider = new InMemoryStorageProvider();

/**
 * Register the R2 provider when the environment is fully configured.
 * Safe to call repeatedly (subsequent calls are no-ops).
 */
export function installDefaultBlobProvider(): void {
  if (provider instanceof InMemoryStorageProvider && isR2Configured()) {
    provider = new R2StorageProvider();
    console.log('[blobs] R2StorageProvider registered');
  }
}

export function setDefaultStorageProvider(next: BlobStorageProvider): void {
  provider = next;
}

/** Externalisation threshold — payloads below this never go to blob store. */
export const BLOB_THRESHOLD_BYTES = 8192;

export interface StoreAsBlobResult {
  blobId: string;
  digest: string;
  bytes: number;
}

/**
 * Persist `content` via the configured storage provider and a
 * `context_blobs` row. `digestBuilder` is injected so callers can reuse
 * their own summariser without this module depending on an LLM layer.
 */
export async function storeAsBlob(
  sessionId: string,
  content: string,
  opts: {
    mimeType?: string;
    digestBuilder: (content: string) => Promise<string> | string;
  },
): Promise<StoreAsBlobResult> {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes <= BLOB_THRESHOLD_BYTES) {
    throw new Error(`too_small_for_blob:${bytes}`);
  }
  const mimeType = opts.mimeType ?? 'text/plain';
  const digest = await opts.digestBuilder(content);
  const blobId = nanoid();
  const contentRef = `blob/${sessionId}/${blobId}`;
  await provider.put(contentRef, content, mimeType);
  await db.insert(schema.contextBlobs).values({
    id: blobId,
    sessionId,
    mimeType,
    sizeBytes: bytes,
    contentRef,
    digest,
  });
  return { blobId, digest, bytes };
}

/** Fetch the full content backing a context_blobs row. */
export async function expandBlob(blobId: string): Promise<string> {
  const row = await db.query.contextBlobs.findFirst({
    where: eq(schema.contextBlobs.id, blobId),
  });
  if (!row) throw new Error(`blob_not_found:${blobId}`);
  return provider.get(row.contentRef);
}

/**
 * X4.2 — link a context_node to a blob source. Sets `blob_ref` on the
 * node and records a `source_type='blob'` lineage row. Idempotent.
 */
export async function attachBlobToNode(
  nodeId: string,
  blobId: string,
): Promise<void> {
  const { lineageInsertCounter } = await import('./context-compaction.js');
  await db
    .update(schema.contextNodes)
    .set({ blobRef: blobId })
    .where(eq(schema.contextNodes.id, nodeId));
  await db
    .insert(schema.contextNodeSources)
    .values({
      contextNodeId: nodeId,
      sourceType: 'blob' as const,
      sourceId: blobId,
      rangeStart: null,
      rangeEnd: null,
    })
    .onConflictDoNothing();
  lineageInsertCounter.blob += 1;
}
