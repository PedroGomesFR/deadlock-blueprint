// What the Street Brawl tests share: the same reference images and item facts the app uses (templates.ts, items.ts),
// read from the repository's files in Node, and the test frames.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import catalog from '../../src/data/generated/itemsCatalog.json';
import { toGrid } from '../../src/streetBrawl/image';
import type { RgbaImage } from '../../src/streetBrawl/image';
import type { ItemTemplate } from '../../src/streetBrawl/pickScreen';
import { LEGENDARY_ITEMS, LEGENDARY_TIER } from '../../src/streetBrawl/stats';
import { decodePng } from './png';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const items = catalog.items as Record<string, { id: string; icon?: string; tier: number; category: string }>;

/** As items.ts › tierOf: the shop's tiers, LEGENDARY_TIER for the Street Brawl-only items. */
export const tierOf = (id: string): number | undefined => (LEGENDARY_ITEMS[id] ? LEGENDARY_TIER : items[id]?.tier);

/** As items.ts › itemInfo. */
export const itemInfo = (id: string) =>
  LEGENDARY_ITEMS[id]
    ? { tier: LEGENDARY_TIER, category: LEGENDARY_ITEMS[id].category }
    : items[id] && { tier: items[id].tier, category: items[id].category };

/** As templates.ts › getItemTemplates: every catalogue item's icon, plus the legendary items'. */
export const itemTemplates: ItemTemplate[] = [
  ...Object.values(items).map((it) => [it.id, it.icon] as const),
  ...Object.entries(LEGENDARY_ITEMS).map(([id, it]) => [id, it.icon] as const),
]
  .filter(([, icon]) => icon && fs.existsSync(path.join(ROOT, 'public', icon)))
  .map(([itemId, icon]) => ({ itemId, grid: toGrid(decodePng(path.join(ROOT, 'public', icon!))) }));

/** A test frame of tests/streetBrawl/frames, by name. */
export const frame = (name: string): RgbaImage => decodePng(path.join(ROOT, 'tests/streetBrawl/frames', `${name}.png`));
