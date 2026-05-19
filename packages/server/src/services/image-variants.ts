/**
 * PLANBv7 W-C — Image variant pipeline.
 *
 * Runs after a gallery upload commits. For each image we:
 *   1. Download the original bytes from R2.
 *   2. Re-encode through sharp() with EXIF explicitly stripped
 *      (withMetadata({exif:{}, icc:undefined})). Orientation from EXIF
 *      is applied via .rotate() BEFORE the strip, so the visible
 *      orientation is preserved while GPS / camera metadata is dropped.
 *   3. Emit three sized WebP variants (thumb 128, md 480, lg 1024) and
 *      upload them to R2 alongside the original.
 *
 * Idempotent: overwrites existing variant keys. Fire-and-forget from
 * the commit handler; failures are logged and do not block the commit.
 */

import sharp from 'sharp';
import { getObjectBytes, putObjectBytes, publicUrlFor, isR2Configured } from './r2-storage.js';

export interface VariantInfo {
  key: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
}

export interface VariantSet {
  thumb: VariantInfo;
  md: VariantInfo;
  lg: VariantInfo;
}

const SIZES: Array<{ name: keyof VariantSet; width: number; quality: number }> = [
  { name: 'thumb', width: 128, quality: 80 },
  { name: 'md', width: 480, quality: 82 },
  { name: 'lg', width: 1024, quality: 85 },
];

/**
 * Re-encode bytes into a WebP variant with metadata stripped.
 * Exported for unit tests so we can feed a GPS-tagged fixture in and
 * assert the output has no EXIF GPS block.
 */
export async function encodeVariant(
  source: Buffer,
  targetWidth: number,
  quality = 82,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const pipeline = sharp(source, { failOn: 'error' })
    .rotate() // applies EXIF orientation then drops it
    .resize({ width: targetWidth, withoutEnlargement: true })
    .withMetadata({ exif: {}, icc: undefined })
    .webp({ quality });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

/**
 * Generate and upload all three variants. Returns null when R2 is not
 * configured (dev / tests) so callers can degrade gracefully.
 */
export async function generateVariants(args: {
  sourceKey: string;
  userId: string;
  characterId: string;
  imageId: string;
}): Promise<VariantSet | null> {
  if (!isR2Configured()) return null;

  const original = await getObjectBytes(args.sourceKey);
  if (!original) {
    console.warn('[variants] source not found in R2', args.sourceKey);
    return null;
  }

  const basePrefix = args.sourceKey.replace(/\.[^./]+$/, '') + '.v';
  const out: Partial<VariantSet> = {};

  for (const spec of SIZES) {
    const { buffer, width, height } = await encodeVariant(original, spec.width, spec.quality);
    const key = `${basePrefix}/${spec.name}.webp`;
    await putObjectBytes({ key, body: buffer, mime: 'image/webp' });
    out[spec.name] = {
      key,
      url: publicUrlFor(key),
      width,
      height,
      bytes: buffer.length,
    };
  }

  return out as VariantSet;
}
