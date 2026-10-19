/**
 * Vision replay page (dist/replay.html), driven by scripts/vision-replay.cjs: runs the real scanner on saved
 * frames — full captures, or HUD crops of a game log pasted back at their place in a 1920x1080 frame — and
 * returns a compact summary of what it read.
 */
import { loadGameData } from '../data/dataSource';
import type { VisionDetectionResult } from '../services/visionScanner';

export interface ReplayJob {
  name: string;
  /** Image files and where to paste them in the 1920x1080 frame (one full frame: a single part at 0, 0). */
  parts: { file: string; x: number; y: number }[];
  heroId?: string;
  buildItemIds?: string[];
}

export interface ReplaySummary {
  frame: string;
  mode: 'hud' | 'shop' | 'other';
  highlighted: string | null;
  abilityHero: string | null;
  mySlot: number;
  allySlots: (string | null)[] | null;
  enemySlots: (string | null)[] | null;
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
  if (images.length === 1 && images[0].p.x === 0 && images[0].p.y === 0) return images[0].bitmap;
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1920, 1080);
  for (const { p, bitmap } of images) {
    ctx.drawImage(bitmap, p.x, p.y);
    bitmap.close();
  }
  return createImageBitmap(canvas);
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
