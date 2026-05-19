/**
 * PLANBv3 H4 — Cloudflare R2 storage for character galleries.
 *
 * R2 is S3-compatible. We use `@aws-sdk/client-s3` + presigner to issue
 * short-lived PUT URLs so the browser uploads directly to R2 (no
 * multipart streaming through the Hono server).
 *
 * Env:
 *   R2_ACCOUNT_ID        → account_id for endpoint host
 *   R2_ACCESS_KEY_ID     → access key
 *   R2_SECRET_ACCESS_KEY → secret
 *   R2_BUCKET            → bucket name
 *   R2_PUBLIC_BASE_URL   → public base like https://cdn.example.com
 *                          (or https://<bucket>.<account>.r2.cloudflarestorage.com)
 *   R2_ENDPOINT (optional) → override endpoint; otherwise derived from account id
 *
 * When env is missing, `isR2Configured()` returns false and the gallery
 * routes degrade to 503 `storage_not_configured`. This keeps local dev
 * and tests runnable without cloud credentials.
 */
import { S3Client, HeadObjectCommand, DeleteObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID ?? '';
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';
const BUCKET = process.env.R2_BUCKET ?? '';
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
const ENDPOINT =
  process.env.R2_ENDPOINT ?? (ACCOUNT_ID ? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com` : '');

export function isR2Configured(): boolean {
  return !!(ACCESS_KEY && SECRET_KEY && BUCKET && ENDPOINT && PUBLIC_BASE);
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: 'auto',
    endpoint: ENDPOINT,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    forcePathStyle: true,
  });
  return _client;
}

export const R2_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
export const R2_DAILY_QUOTA = 200 * 1024 * 1024; // 200 MB
export const R2_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface PresignedUploadArgs {
  key: string;
  mime: string;
  size: number;
  expiresInSeconds?: number;
  cacheControl?: string;
}

export async function presignPut(args: PresignedUploadArgs): Promise<string> {
  if (!isR2Configured()) throw new Error('r2_not_configured');
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: args.key,
    ContentType: args.mime,
    ContentLength: args.size,
    CacheControl: args.cacheControl,
  });
  return getSignedUrl(client(), cmd, { expiresIn: args.expiresInSeconds ?? 600 });
}

export async function headObject(key: string): Promise<{ bytes: number; mime: string } | null> {
  if (!isR2Configured()) throw new Error('r2_not_configured');
  try {
    const res = await client().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return {
      bytes: Number(res.ContentLength ?? 0),
      mime: res.ContentType ?? 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (!isR2Configured()) throw new Error('r2_not_configured');
  try {
    await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    // best-effort; row delete proceeds
  }
}

export function publicUrlFor(key: string): string {
  return `${PUBLIC_BASE}/${key}`;
}

/**
 * PLANBv7 W-C — fetch raw bytes for server-side processing (EXIF strip,
 * variant generation, future classifier). Returns null when not configured
 * or the object is missing; throws on transport errors.
 */
export async function getObjectBytes(key: string): Promise<Buffer | null> {
  if (!isR2Configured()) return null;
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = res.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    if (!body?.transformToByteArray) return null;
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

/**
 * PLANBv7 W-C — server-origin PUT (variants, etc). No presign; runs
 * synchronously with the service's long-lived client.
 */
export async function putObjectBytes(args: {
  key: string;
  body: Buffer;
  mime: string;
}): Promise<void> {
  if (!isR2Configured()) throw new Error('r2_not_configured');
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: args.key,
      Body: args.body,
      ContentType: args.mime,
      ContentLength: args.body.length,
    }),
  );
}

/** Build a deterministic key path for a user/character upload. */
export function buildObjectKey(args: {
  userId: string;
  characterId: string;
  imageId: string;
  mime: string;
}): string {
  const ext =
    args.mime === 'image/png' ? 'png'
      : args.mime === 'image/webp' ? 'webp'
        : args.mime === 'image/gif' ? 'gif'
          : 'jpg';
  return `users/${args.userId}/characters/${args.characterId}/${args.imageId}.${ext}`;
}

/**
 * R2 key structure for sprite expression/pose/outfit assets.
 *
 * Recommended layout:
 *   sprites/{characterId}/expressions/{emotion}.webp   ← 12 slots
 *   sprites/{characterId}/poses/{pose}.webp            ← 5 slots
 *   sprites/{characterId}/outfits/{outfit}.webp        ← 3 slots
 *
 * slot:   'expressions' | 'poses' | 'outfits'
 * name:   e.g. 'neutral', 'standing', 'default'
 */
export function buildSpriteKey(args: {
  characterId: string;
  slot: 'expressions' | 'poses' | 'outfits';
  name: string;
}): string {
  return `sprites/${args.characterId}/${args.slot}/${args.name}.webp`;
}

/**
 * Sprite manifest type: maps slot/name → full public CDN URL.
 * Stored in characters.persona.spriteManifest as JSONB.
 */
export interface SpriteManifest {
  expressions: Record<string, string>;
  poses: Record<string, string>;
  outfits: Record<string, string>;
  updatedAt?: string;
}

export const SPRITE_EXPRESSION_SLOTS = [
  'neutral', 'happy', 'sad', 'surprised', 'angry',
  'embarrassed', 'curious', 'scared', 'smug', 'tender', 'conflicted', 'shy',
] as const;

export const SPRITE_POSE_SLOTS = [
  'standing', 'sitting', 'leaning', 'action', 'intimate',
] as const;

export const SPRITE_OUTFIT_SLOTS = [
  'default', 'casual', 'formal',
] as const;
