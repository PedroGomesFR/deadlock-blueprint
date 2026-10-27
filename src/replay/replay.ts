/**
 * Vision replay page (dist/replay.html), driven by scripts/vision-replay.cjs: runs the real scanner on saved
 * frames — full captures, or HUD crops of a game log pasted back at their place in a 1920x1080 frame — and
 * returns a compact summary of what it read.
 */
import { loadGameData } from '../data/dataSource';
import type { VisionDetectionResult } from '../services/visionScanner';

export interface SimulatedLayout {
  width: number;
  height: number;
  mode: '16:9' | '16:10' | 'ultrawide' | 'windowed';
  borderX?: number;
  borderTop?: number;
  borderBottom?: number;
}

export interface ReplayJob {
  name: string;
  /** Image files and where to paste them in the 1920x1080 frame (one full frame: a single part at 0, 0). */
  parts: { file: string; x: number; y: number }[];
  heroId?: string;
  buildItemIds?: string[];
  simulateLayout?: SimulatedLayout;
}

export interface ReplaySummary {
  frame: string;
  mode: 'hud' | 'shop' | 'other';
  highlighted: string | null;
  abilityHero: string | null;
  mySlot: number;
  allySlots: (string | null)[] | null;
  enemySlots: (string | null)[] | null;
  dead: string | null; // respawn timers, allies | enemies: "000100|110000"
  slots: string[]; // '.' empty, 'lock', '?category' unknown, item id ('~id' on cooldown)
  occupied: number;
  locked: number;
  unmatched: number;
  souls: number | null;
}

interface ReplayApi {
  getJobs: () => Promise<{ jobs: ReplayJob[]; sequential: boolean; ocr: boolean }>;
  readFile: (file: string) => Promise<ArrayBuffer>;
  result: (name: string, summary: ReplaySummary | { error: string }) => void;
  done: () => void;
}

const api = (window as unknown as { replayAPI: ReplayApi }).replayAPI;

function summarize(d: VisionDetectionResult): ReplaySummary {
  return {
    frame: `${d.frameWidth}x${d.frameHeight}`,
    mode: d.shopOpen ? 'shop' : d.hudVisible ? 'hud' : 'other',
    highlighted: d.highlightedHeroId ?? null,
    abilityHero: d.abilityHeroId ?? null,
    mySlot: d.mySlotIndex ?? -1,
    allySlots: d.allySlots ?? null,
    enemySlots: d.enemySlots ?? null,
    dead:
      d.allyDead && d.enemyDead
        ? `${d.allyDead.map(Number).join('')}|${d.enemyDead.map(Number).join('')}`
        : null,
    slots: (d.inventorySlots ?? []).map((s) =>
      s.state === 'empty'
        ? '.'
        : s.state === 'locked'
        ? 'lock'
        : s.state === 'unknown'
        ? `?${s.category ?? ''}`
        : s.state === 'cooldown'
        ? `~${s.itemId}`
        : s.itemId ?? '?'
    ),
    occupied: d.occupiedSlotsCount,
    locked: d.lockedSlotsCount ?? 0,
    unmatched: d.unmatchedSlotsCount ?? 0,
    souls: d.detectedSouls ?? null,
  };
}

async function composeFrame(job: ReplayJob): Promise<ImageBitmap> {
  const images = await Promise.all(
    job.parts.map(async (p) => ({ p, bitmap: await createImageBitmap(new Blob([await api.readFile(p.file)])) }))
  );
  if (!job.simulateLayout && images.length === 1 && images[0].p.x === 0 && images[0].p.y === 0) return images[0].bitmap;
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = 1920;
  baseCanvas.height = 1080;
  const baseCtx = baseCanvas.getContext('2d')!;
  baseCtx.fillStyle = '#000';
  baseCtx.fillRect(0, 0, 1920, 1080);
  for (const { p, bitmap } of images) {
    baseCtx.drawImage(bitmap, p.x, p.y);
    bitmap.close();
  }
  if (!job.simulateLayout) return createImageBitmap(baseCanvas);

  const { width, height, mode } = job.simulateLayout;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  if (mode === '16:9') {
    ctx.drawImage(baseCanvas, 0, 0, width, height);
  } else if (mode === '16:10') {
    const scale = width / 1920;
    const halfH = Math.round(540 * scale);
    ctx.drawImage(baseCanvas, 0, 0, 1920, 540, 0, 0, width, halfH);
    ctx.drawImage(baseCanvas, 0, 540, 1920, 540, 0, height - halfH, width, halfH);
  } else if (mode === 'ultrawide') {
    const scale = height / 1080;
    const centerOffsetX = Math.round((width - 1920 * scale) / 2);
    // Top bar centered
    ctx.drawImage(baseCanvas, 0, 0, 1920, 260, centerOffsetX, 0, Math.round(1920 * scale), Math.round(260 * scale));
    // Bottom-left inventory + souls pinned to left edge
    ctx.drawImage(baseCanvas, 0, 580, 680, 500, 0, height - Math.round(500 * scale), Math.round(680 * scale), Math.round(500 * scale));
    // Bottom-center abilities centered
    ctx.drawImage(
      baseCanvas,
      680,
      800,
      560,
      280,
      centerOffsetX + Math.round(680 * scale),
      height - Math.round(280 * scale),
      Math.round(560 * scale),
      Math.round(280 * scale)
    );
  } else if (mode === 'windowed') {
    const bx = job.simulateLayout.borderX ?? 8;
    const bt = job.simulateLayout.borderTop ?? 39;
    const bb = job.simulateLayout.borderBottom ?? 8;
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(0, 0, width, bt);
    ctx.drawImage(baseCanvas, 0, 0, 1920, 1080, bx, bt, width - 2 * bx, height - bt - bb);
  }
  return createImageBitmap(out);
}

async function main() {
  await loadGameData({ bundledOnly: true });
  const scanner = await import('../services/visionScanner');
  const { jobs, sequential, ocr } = await api.getJobs();
  for (const job of jobs) {
    try {
      if (!sequential) scanner.resetScannerState();
      const frame = await composeFrame(job);
      const scan = () =>
        scanner.analyzeDeadlockScreen(frame, job.name, true, job.heroId ?? 'infernus', job.buildItemIds ?? [], false);
      let detection = await scan();
      if (ocr) {
        // The souls are read in the background: the next scan of the same frame returns them
        await new Promise((resolve) => setTimeout(resolve, 30));
        await scanner.waitForOcrIdle();
        detection = await scan();
      }
      frame.close();
      api.result(job.name, summarize(detection));
    } catch (err) {
      api.result(job.name, { error: err instanceof Error ? err.message : String(err) });
    }
  }
  api.done();
}

main();
