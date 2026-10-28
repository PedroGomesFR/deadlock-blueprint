// Reads the items in the HUD's slots (bottom left, also visible under the pick screen), and keeps the items owned this
// game from many readings. Pure, no DOM.
import { GRID, bestMatch, luminance, pixelAt, pixelShare, toGrid } from './image';
import type { GridMask, RgbaImage } from './image';
import { INVENTORY_COLS, INVENTORY_ROWS, inventorySlotBox } from './layout';
import type { ItemTemplate } from './pickScreen';
import type { ItemCategory } from './stats';

/**
 * Brightness spread (0-255) of a slot's grid: items 38-47, empty slots up to 14 (one over a light background stripe)
 * on the test frames. Below this the slot is empty and not matched at all: a flat slot can still look like some icon.
 */
const ITEM_MIN_SPREAD = 25;
/** On the 24 items of the test frames: 0.016-0.171, the runner-up at least 0.25 behind. */
const SLOT_MAX_DISTANCE = 0.3;
const SLOT_MIN_MARGIN = 0.1;
/**
 * Pixel shifts tried around a slot (1080p pixels). The read items' best shift was 0 or 1 px; 2-3 px off, a match fell
 * from 0.04 to 0.3-0.66.
 */
const SHIFTS = [-1, 0, 1];

// Active items are round, and the tier badge covers the top-right corner: the disc minus that corner
const C = (GRID - 1) / 2;
const slotMask: GridMask = (gx, gy) => (gx - C) ** 2 + (gy - C) ** 2 <= (0.36 * GRID) ** 2 && gx - gy < GRID / 3;

/**
 * Enhanced item: the cyan bolt over the slot's bottom-right corner (from 34, 32 in the slot) covers 0.144 of that
 * corner on the enhanced items of the test frames, 0 on the others. (The cards' colour error rule does not hold on
 * slots this small.)
 */
const BOLT_MIN_SHARE = 0.05;
const isBoltCyan = (r: number, g: number, b: number) => b > 200 && g > 150 && r < 120;

// The tier badge: a right triangle in the slot's top-right corner, BADGE_SIZE px on its sides
const BADGE_SIZE = 24;
/** Badge pixels darker than this are the numeral's strokes (or the edge); brighter ones are its colour. */
const BADGE_DARK_MAX = 90;
/** Fewer bright badge pixels than this: the badge is darkened (a cooldown) or covered, and not read. */
const BADGE_MIN_PIXELS = 40;
/** Rows (from the slot's top) where the numeral's strokes are counted: near its top and near its bottom. */
const NUMERAL_TOP_ROW = 6;
const NUMERAL_BOTTOM_ROW = 10;

export interface SlotReading {
  row: number;
  col: number;
  /** null: empty, or an item not recognised */
  itemId: string | null;
  empty: boolean;
  enhanced: boolean;
  /** What the slot's corner badge says, when it can be read */
  badge?: SlotBadge | null;
}

export interface SlotBadge {
  category: ItemCategory | null;
  /** 1-4 from the Roman numeral, null when unclear */
  tier: number | null;
}

/** What the reader needs to know of an item to use the badge. */
export type ItemInfo = (itemId: string) => { tier: number; category: string } | undefined;

/**
 * The slot's corner badge. Colour of its bright pixels: weapon orange (213-229, 138-148, 25-28), vitality green
 * (115-121, 173-182, 29-31), spirit purple (190-200, 134-141, 235-247) on the test frames. The numeral is dark vertical
 * strokes, counted near its top and near its bottom: I 1/1, II 2/2, III 3/3, IV 3/1-2 (the V's arms merge).
 */
function readBadge(img: RgbaImage, row: number, col: number): SlotBadge | null {
  const b = inventorySlotBox(row, col);
  const left = b.x + b.w - BADGE_SIZE;
  // Inside the triangle, 2 px clear of its diagonal edge and of the slot's right edge
  const inside = (x: number, y: number) => x - left >= y - b.y + 2 && x < b.x + b.w - 1;
  const isDark = (x: number, y: number) => luminance(...pixelAt(img, x, y)) <= BADGE_DARK_MAX;

  let r = 0;
  let g = 0;
  let bl = 0;
  let n = 0;
  for (let y = b.y + 3; y < b.y + 16; y++) {
    for (let x = left; x < b.x + b.w; x++) {
      if (!inside(x, y) || isDark(x, y)) continue;
      const p = pixelAt(img, x, y);
      r += p[0];
      g += p[1];
      bl += p[2];
      n++;
    }
  }
  if (n < BADGE_MIN_PIXELS) return null;
  r /= n;
  g /= n;
  bl /= n;
  const category: ItemCategory | null =
    r > 170 && bl < 90 ? 'weapon' : g > r + 30 && bl < 90 ? 'vitality' : bl > 180 && r > 150 ? 'spirit' : null;

  const strokes = (y: number) => {
    let runs = 0;
    let inRun = false;
    for (let x = left; x < b.x + b.w; x++) {
      if (!inside(x, y)) continue;
      const dark = isDark(x, y);
      if (dark && !inRun) runs++;
      inRun = dark;
    }
    return runs;
  };
  const top = strokes(b.y + NUMERAL_TOP_ROW);
  const bottom = strokes(b.y + NUMERAL_BOTTOM_ROW);
  let tier: number | null = null;
  if (top === bottom && top >= 1 && top <= 3) tier = top;
  else if (top === 3 && bottom >= 1 && bottom < 3) tier = 4;
  return { category, tier };
}

/** Brightness spread (standard deviation, 0-255) of a grid. */
function spread(grid: Float32Array): number {
  let s = 0;
  let s2 = 0;
  const n = GRID * GRID;
  for (let i = 0; i < n; i++) {
    const l = luminance(grid[i * 3], grid[i * 3 + 1], grid[i * 3 + 2]);
    s += l;
    s2 += l * l;
  }
  return Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
}

/**
 * Every slot of the HUD. With `itemInfo`, a slot is matched only among the items of its badge's category and tier
 * (8-19 candidates instead of ~175, so look-alikes of other tiers do not crowd the best match), at a few pixel shifts.
 * A slot whose badge colour cannot be read is left unread rather than matched against every item.
 */
export function readInventory(img: RgbaImage, templates: ItemTemplate[], itemInfo?: ItemInfo): SlotReading[] {
  const out: SlotReading[] = [];
  for (let row = 0; row < INVENTORY_ROWS; row++) {
    for (let col = 0; col < INVENTORY_COLS; col++) {
      const box = inventorySlotBox(row, col);
      const grid = toGrid(img, box);
      if (spread(grid) < ITEM_MIN_SPREAD) {
        out.push({ row, col, itemId: null, empty: true, enhanced: false });
        continue;
      }
      const badge = itemInfo ? readBadge(img, row, col) : null;
      if (itemInfo && !badge?.category) {
        out.push({ row, col, itemId: null, empty: false, enhanced: false, badge });
        continue;
      }

      let match: ReturnType<typeof bestMatch<ItemTemplate>>;
      if (itemInfo && badge) {
        const candidates = templates.filter((t) => {
          const info = itemInfo(t.itemId);
          // An unclear numeral (or a legendary item's badge, not measured yet): the category alone
          return info?.category === badge.category && (badge.tier === null || info.tier === badge.tier);
        });
        // Few candidates: try small shifts, keep the one where the best match is closest
        match = bestMatch(grid, candidates, slotMask);
        for (const dx of SHIFTS) {
          for (const dy of SHIFTS) {
            if (dx === 0 && dy === 0) continue;
            const shifted = bestMatch(toGrid(img, { ...box, x: box.x + dx, y: box.y + dy }), candidates, slotMask);
            if (shifted.bestD < match.bestD) match = shifted;
          }
        }
      } else {
        match = bestMatch(grid, templates, slotMask);
      }
      const ok = match.best !== null && match.bestD <= SLOT_MAX_DISTANCE && match.secondD - match.bestD >= SLOT_MIN_MARGIN;
      const corner = { x: box.x + 34, y: box.y + 32, w: box.w - 34, h: box.h - 32 };
      out.push({
        row,
        col,
        itemId: ok ? match.best!.itemId : null,
        empty: false,
        enhanced: ok && pixelShare(img, corner, isBoltCyan) >= BOLT_MIN_SHARE,
        badge,
      });
    }
  }
  return out;
}

/**
 * A slot holds an item once it reads it on this many scans in a row (2 s). Items sit still in their slot while
 * misreads come and go (a cooldown sweep, an animation over the slot), so one-off misreads never count.
 */
const OWNED_SCANS_IN_A_ROW = 4;

/**
 * The items owned this game, slot by slot. A slot keeps its item until it confirms another one: a misread that did
 * get confirmed is replaced as soon as the slot shows its real item again, and a slot hidden or darkened for a while
 * (a cooldown, the round-end screen) does not lose its item.
 */
export interface OwnedState {
  /** Per slot ("row.col"): the item it read on its last scans and how many scans in a row */
  streaks: Map<string, { itemId: string; scans: number }>;
  /** Per slot: the item last confirmed in it */
  bySlot: Map<string, string>;
}

export const noItemsOwned = (): OwnedState => ({ streaks: new Map(), bySlot: new Map() });

/** The items in the slots, each once (two copies of an item are not offered). */
export const ownedItems = (state: OwnedState): string[] => [...new Set(state.bySlot.values())];

export function observeSlots(state: OwnedState, slots: SlotReading[]): OwnedState {
  const streaks = new Map<string, { itemId: string; scans: number }>();
  const bySlot = new Map(state.bySlot);
  for (const s of slots) {
    if (!s.itemId) continue; // empty, or not recognised: the streak is broken, the slot keeps its item
    const key = `${s.row}.${s.col}`;
    const previous = state.streaks.get(key);
    const scans = previous?.itemId === s.itemId ? previous.scans + 1 : 1;
    streaks.set(key, { itemId: s.itemId, scans });
    if (scans >= OWNED_SCANS_IN_A_ROW) bySlot.set(key, s.itemId);
  }
  return { streaks, bySlot };
}
