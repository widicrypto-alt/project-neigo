import { describe, it, expect } from 'bun:test';
import sharp from 'sharp';
import { encodeVariant } from './image-variants.js';

/**
 * PLANBv7 W-C — variant pipeline unit tests.
 *
 * We synthesize a 300x200 PNG with an injected EXIF GPS block so we can
 * assert (a) sharp resizes correctly, (b) EXIF is stripped, and (c) the
 * output is webp.
 */

async function buildGpsTaggedPng(): Promise<Buffer> {
  // Create a simple raw image; sharp cannot inject EXIF into PNG directly,
  // but we can round-trip through JPEG where EXIF is supported.
  const base = await sharp({
    create: {
      width: 300,
      height: 200,
      channels: 3,
      background: { r: 128, g: 64, b: 192 },
    },
  })
    .jpeg()
    .withMetadata({
      exif: {
        IFD0: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '35/1,39/1,29/1',
          GPSLongitudeRef: 'E',
          GPSLongitude: '139/1,42/1,14/1',
        } as unknown as Record<string, string>,
      },
    })
    .toBuffer();
  return base;
}

describe('PLANBv7 W-C — encodeVariant', () => {
  it('produces webp at the requested width', async () => {
    const source = await buildGpsTaggedPng();
    const { buffer, width, height } = await encodeVariant(source, 128, 80);
    expect(width).toBeLessThanOrEqual(128);
    expect(height).toBeGreaterThan(0);
    const meta = await sharp(buffer).metadata();
    expect(meta.format).toBe('webp');
  });

  it('strips EXIF GPS metadata from the output', async () => {
    const source = await buildGpsTaggedPng();
    // Verify source actually has EXIF first — this is the test's own sanity check.
    const srcMeta = await sharp(source).metadata();
    expect(srcMeta.exif).toBeDefined();

    const { buffer } = await encodeVariant(source, 480, 82);
    const outMeta = await sharp(buffer).metadata();
    // sharp encodes with EXIF block omitted entirely, OR with an empty
    // block; either way GPS* tags must be gone.
    if (outMeta.exif) {
      const asString = outMeta.exif.toString('binary');
      expect(asString.includes('GPSLatitude')).toBe(false);
      expect(asString.includes('GPSLongitude')).toBe(false);
    }
  });

  it('does not upscale a small source', async () => {
    const small = await sharp({
      create: { width: 80, height: 40, channels: 3, background: '#222' },
    })
      .jpeg()
      .toBuffer();
    const { width } = await encodeVariant(small, 1024, 85);
    expect(width).toBe(80);
  });
});
