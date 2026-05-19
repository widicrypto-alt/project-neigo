/**
 * Stitches individual pose PNGs into a 4×3 spritesheet (sheet.png).
 *
 * Frame layout (col × row):
 *   Row 0:  idle · listening · speaking · thinking
 *   Row 1:  typing · searching · calculating · fixing
 *   Row 2:  success · error · alert · sleeping
 *
 * Usage:
 *   bun run src/db/stitch-sprites.ts <slug>
 *
 * Example:
 *   bun run src/db/stitch-sprites.ts kaia-schneider
 *
 * Each source PNG is resized into each frame while preserving aspect ratio.
 * Any extra space uses transparent pixels (no added white/grey letterbox).
 *
 * Source files are read from   packages/web/public/sprites/<slug>/
 * The mapping file             packages/web/public/sprites/<slug>/frames.json
 * Optional framing presets     packages/web/public/sprites/<slug>/framing.json
 * controls which PNG goes to which frame. If frames.json does not exist
 * a default mapping is auto-detected from files in the folder.
 *
 * frames.json example:
 * {
 *   "idle":        "Netral.png",
 *   "listening":   "Netral.png",
 *   "speaking":    "Smiled.png",
 *   "thinking":    "Irritated.png",
 *   "typing":      "Netral.png",
 *   "searching":   "Netral.png",
 *   "calculating": "Irritated.png",
 *   "fixing":      "Irritated.png",
 *   "success":     "Smiled.png",
 *   "error":       "Annoyed.png",
 *   "alert":       "Annoyed.png",
 *   "sleeping":    "Netral.png"
 * }
 */

import sharp from 'sharp';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Config ────────────────────────────────────────────────────────────────────

const CELL_W = 256;
const COLS = 4;
const ROWS = 3;
const SHEET_W = CELL_W * COLS;  // 1024

// Distribute 1360px across 3 rows: [453, 453, 454] — total = 1360
const ROW_H = [453, 453, 454] as const;
const SHEET_H = ROW_H.reduce((a, b) => a + b, 0);  // 1360
// Top-y offset per row
const ROW_Y = ROW_H.reduce<number[]>((acc, _, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1]! + ROW_H[i - 1]!);
  return acc;
}, []);

const BG_RGBA = { r: 0, g: 0, b: 0, alpha: 0 };

const FRAME_ORDER: string[] = [
  'idle',       'listening',   'speaking',   'thinking',
  'typing',     'searching',   'calculating','fixing',
  'success',    'error',       'alert',      'sleeping',
];

// ── Paths ─────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webPublic = path.resolve(__dirname, '../../../../packages/web/public');

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: bun run src/db/stitch-sprites.ts <slug>');
  console.error('       e.g.: bun run src/db/stitch-sprites.ts kaia-schneider');
  process.exit(1);
}

const spriteDir = path.join(webPublic, 'sprites', slug);
if (!existsSync(spriteDir)) {
  console.error(`Folder not found: ${spriteDir}`);
  process.exit(1);
}

// ── Resolve frame mapping ─────────────────────────────────────────────────────

type FrameMap = Record<string, string>;
type FrameName = (typeof FRAME_ORDER)[number];

interface FrameTuning {
  // Scale multiplier relative to cell size (e.g., 1.2 = 20% zoom-in)
  scale?: number;
  // Pixel offsets after scale (positive x => right, positive y => down)
  x?: number;
  y?: number;
}

interface FramingConfig {
  // Default tuning used for every frame.
  default?: FrameTuning;
  // Per-frame override.
  frames?: Partial<Record<FrameName, FrameTuning>>;
}

function autoDetectMapping(dir: string): FrameMap {
  const pngs = readdirSync(dir)
    .filter(f => f.endsWith('.png') && f !== 'sheet.png')
    .sort();
  if (pngs.length === 0) {
    console.error('No PNG files found in', dir);
    process.exit(1);
  }
  console.log(`Auto-detected ${pngs.length} source PNG(s): ${pngs.join(', ')}`);
  // Round-robin assign: cycles through available PNGs for all 12 frames
  const map: FrameMap = {};
  FRAME_ORDER.forEach((frame, i) => {
    map[frame] = pngs[i % pngs.length]!;
  });
  return map;
}

const mappingPath = path.join(spriteDir, 'frames.json');
let frameMap: FrameMap;
if (existsSync(mappingPath)) {
  frameMap = JSON.parse(readFileSync(mappingPath, 'utf8')) as FrameMap;
  console.log(`Loaded frame mapping from frames.json`);
} else {
  frameMap = autoDetectMapping(spriteDir);
  // Write it so user can customise
  writeFileSync(mappingPath, JSON.stringify(frameMap, null, 2) + '\n');
  console.log(`Wrote default frames.json – edit it to remap poses, then re-run.`);
}

function clampScale(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(2.5, Math.max(0.6, n));
}

function clampOffset(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(500, Math.max(-500, n)));
}

function mergeTuning(base: FrameTuning | undefined, over: FrameTuning | undefined): Required<FrameTuning> {
  return {
    scale: clampScale(over?.scale ?? base?.scale ?? 1),
    x: clampOffset(over?.x ?? base?.x ?? 0),
    y: clampOffset(over?.y ?? base?.y ?? 0),
  };
}

function loadFramingConfig(dir: string): FramingConfig {
  const framingPath = path.join(dir, 'framing.json');
  if (!existsSync(framingPath)) {
    const template: FramingConfig = {
      default: { scale: 1.18, x: 0, y: -42 },
      frames: {
        speaking: { y: -36 },
        thinking: { y: -32 },
        error: { y: -30 },
        success: { y: -38 },
      },
    };
    writeFileSync(framingPath, JSON.stringify(template, null, 2) + '\n');
    console.log('Wrote default framing.json – tweak scale/x/y for tighter composition.');
    return template;
  }
  try {
    return JSON.parse(readFileSync(framingPath, 'utf8')) as FramingConfig;
  } catch {
    console.warn('WARN  framing.json parse failed. Using neutral framing.');
    return {};
  }
}

const framingConfig = loadFramingConfig(spriteDir);

// ── Build cells ───────────────────────────────────────────────────────────────

async function renderCell(srcPath: string, cellH: number, tuning: Required<FrameTuning>): Promise<Buffer> {
  const srcMeta = await sharp(srcPath).metadata();
  const srcW = Math.max(1, srcMeta.width ?? CELL_W);
  const srcH = Math.max(1, srcMeta.height ?? cellH);

  // Zoom-in by cropping a smaller source window, then resize to the cell.
  const cropW = Math.max(1, Math.min(srcW, Math.round(srcW / tuning.scale)));
  const cropH = Math.max(1, Math.min(srcH, Math.round(srcH / tuning.scale)));

  // Convert output-space offsets (px in cell) to source-space crop shifts.
  const shiftX = Math.round((tuning.x / CELL_W) * cropW);
  const shiftY = Math.round((tuning.y / cellH) * cropH);

  const maxLeft = Math.max(0, srcW - cropW);
  const maxTop = Math.max(0, srcH - cropH);
  const left = Math.min(maxLeft, Math.max(0, Math.round((srcW - cropW) / 2 - shiftX)));
  const top = Math.min(maxTop, Math.max(0, Math.round((srcH - cropH) / 2 - shiftY)));

  return sharp(srcPath)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(CELL_W, cellH, {
      fit: 'contain',
      background: BG_RGBA,
    })
    .png()
    .toBuffer();
}

console.log(`\nBuilding sheet ${SHEET_W}×${SHEET_H}px (${COLS}×${ROWS} cells, each ${CELL_W}×[${ROW_H.join(',')}]px) …`);

// Start with a transparent canvas so empty areas never become white/grey.
let canvas = sharp({
  create: {
    width: SHEET_W,
    height: SHEET_H,
    channels: 4,
    background: BG_RGBA,
  },
}).png();

const composites: sharp.OverlayOptions[] = [];

for (let i = 0; i < FRAME_ORDER.length; i++) {
  const frameName = FRAME_ORDER[i]!;
  const srcFile = frameMap[frameName];
  if (!srcFile) {
    console.warn(`  WARN  frame "${frameName}" not in mapping – using blank`);
    continue;
  }
  const srcPath = path.join(spriteDir, srcFile);
  if (!existsSync(srcPath)) {
    console.warn(`  WARN  ${srcFile} not found – frame "${frameName}" will be blank`);
    continue;
  }

  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const frameTuning = mergeTuning(
    framingConfig.default,
    framingConfig.frames?.[frameName as FrameName],
  );
  const cellBuf = await renderCell(srcPath, ROW_H[row]!, frameTuning);

  composites.push({
    input: cellBuf,
    left: col * CELL_W,
    top: ROW_Y[row]!,
  });

  console.log(
    `  [${row},${col}] ${frameName.padEnd(14)} <- ${srcFile} ` +
      `(scale=${frameTuning.scale.toFixed(2)} x=${frameTuning.x} y=${frameTuning.y})`,
  );
}

const outPath = path.join(spriteDir, 'sheet.png');
await canvas.composite(composites).toFile(outPath);

const stat = (await import('fs')).statSync(outPath);
console.log(`\nDone → ${outPath}`);
console.log(`File size: ${(stat.size / 1024).toFixed(1)} KB`);
console.log(`\nTo test:  open http://localhost:3000/debug/sprites in your browser after starting the dev server.`);
