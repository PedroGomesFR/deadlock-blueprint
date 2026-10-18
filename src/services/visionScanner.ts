import Tesseract from 'tesseract.js';
import { HEROES_DB, ITEMS_DB, ItemCategory, LaneColor } from '../data/deadlockData';
import officialIconsMap from '../data/officialIconsMap.json';

export interface VisionDetectionResult {
  detectedHeroId?: string;
  detectedPartnerId?: string;
  detectedLaneEnemyIds: string[];
  detectedTeamEnemyIds: string[];
  detectedAllyIds: string[];
  detectedEnemyIds: string[];
  detectedOwnedItemIds: string[];
  inventoryScanned: boolean;
  occupiedSlotsCount: number;
  unmatchedSlotsCount?: number; // occupied slots whose icon matched no template (left unknown)
  lockedSlotsCount?: number; // inventory slots still locked (padlock icon)
  hudVisible?: boolean; // in-game top bar (team score boxes) visible
  highlightedHeroId?: string; // hero of the highlighted (own) portrait in the top bar
  abilityHeroId?: string; // hero matched by the ability icons (less reliable, cooldown numbers fool it)
  detectedSouls?: number;
  detectedLaneColor?: LaneColor;
  rawText: string;
  confidence: number;
  sourceName: string;
  isDeadlockWindow: boolean;
  timestamp: string;
  hudPreviewUrl?: string;
  debugLogs: string[];
}

const HERO_ICONS = officialIconsMap.heroes as Record<string, string>;
const ABILITY_ICONS = officialIconsMap.abilities as Record<string, string>;
const ITEM_ICONS = officialIconsMap.items as Record<string, string>;

const ITEM_ID_TO_ICON_KEY: Record<string, string> = {
  high_velocity_mag: 'High-Velocity Mag',
  headshot_booster: 'Headshot Booster',
  restorative_shot: 'Restorative Shot',
  monster_rounds: 'Monster Rounds',
  hollow_point_ward: 'Hollow Point Ward',
  rapid_rounds: 'Rapid Rounds',
  close_quarters: 'Close Quarters',
  active_reload: 'Active Reload',
  kinetic_dash: 'Kinetic Dash',
  slowing_bullets: 'Slowing Bullets',
  mystic_shot: 'Mystic Shot',
  soul_shredder_bullets: 'Soul Shredder Bullets',
  fleetfoot: 'Fleetfoot',
  sharpshooter: 'Sharpshooter',
  toxic_bullets: 'Toxic Bullets',
  pristine_emblem: 'Pristine Emblem',
  alchemical_fire: 'Alchemical Fire',
  tesla_bullets: 'Tesla Bullets',
  headhunter: 'Headhunter',
  burst_fire: 'Burst Fire',
  crippling_headshot: 'Crippling Headshot',
  spiritual_overflow: 'Spiritual Overflow',
  glass_cannon: 'Glass Cannon',
  silencer: 'Silencer',
  extra_regen: 'Extra Regen',
  extra_stamina: 'Extra Stamina',
  sprint_boots: 'Sprint Boots',
  extra_health: 'Extra Health',
  healing_rite: 'Healing Rite',
  enchanters_barrier: "Enchanter's Barrier",
  combat_barrier: 'Combat Barrier',
  reactive_barrier: 'Reactive Barrier',
  healbane: 'Healbane',
  debuff_reducer: 'Debuff Reducer',
  bullet_lifesteal: 'Bullet Lifesteal',
  spirit_lifesteal: 'Spirit Lifesteal',
  enduring_speed: 'Enduring Speed',
  return_fire: 'Return Fire',
  superior_stamina: 'Superior Stamina',
  debuff_remover: 'Debuff Remover',
  metal_skin: 'Metal Skin',
  bullet_resilience: 'Bullet Resilience',
  spirit_resilience: 'Spirit Resilience',
  leech: 'Leech',
  unstoppable: 'Unstoppable',
  extra_charge: 'Extra Charge',
  mystic_burst: 'Mystic Burst',
  mystic_reach: 'Mystic Reach',
  spirit_strike: 'Spirit Strike',
  quicksilver_reload: 'Quicksilver Reload',
  suppressor: 'Suppressor',
  decay: 'Decay',
  slowing_hex: 'Slowing Hex',
  duration_extender: 'Duration Extender',
  improved_cooldown: 'Improved Cooldown',
  rapid_recharge: 'Rapid Recharge',
  improved_burst: 'Improved Burst',
  knockdown: 'Knockdown',
  ethereal_shift: 'Ethereal Shift',
  mystic_vulnerability: 'Mystic Vulnerability',
  surge_of_power: 'Surge of Power',
  superior_cooldown: 'Superior Cooldown',
  boundless_spirit: 'Boundless Spirit',
  mystic_reverb: 'Mystic Reverb',
  curse: 'Curse',
};

interface HeroPortraitTemplate {
  heroId: string;
  heroName: string;
  rgba: Uint8ClampedArray; // 20x27 RGBA
}

interface AbilityMaskTemplate {
  heroId: string;
  abilityName: string;
  fgMask: Uint8Array; // 20x20 (1 where alpha > 128)
}

interface ItemIconTemplate {
  itemId: string;
  itemName: string;
  category: ItemCategory;
  rgba: Uint8ClampedArray; // 20x20 RGBA
}

let cachedPortraitTemplates: HeroPortraitTemplate[] | null = null;
let cachedAbilityTemplates: AbilityMaskTemplate[] | null = null;
let cachedItemTemplates: ItemIconTemplate[] | null = null;

// Non-blocking Souls OCR cache so item detection resolves in < 8ms
let ocrWorkerPromise: Promise<Tesseract.Worker> | null = null;
let isOcrBusy = false;
let lastMintPixels = -1;
let lastMintXSum = -1;
let cachedDetectedSouls: number | undefined = undefined;

function getDigitsOcrWorker(): Promise<Tesseract.Worker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = Tesseract.createWorker('eng');
  }
  return ocrWorkerPromise;
}

async function getPortraitTemplates(): Promise<HeroPortraitTemplate[]> {
  if (cachedPortraitTemplates) return cachedPortraitTemplates;
  const templates: HeroPortraitTemplate[] = [];

  await Promise.all(
    HEROES_DB.map(
      (hero) =>
        new Promise<void>((resolve) => {
          const fileSlug = hero.id === 'mo_and_krill' ? 'mo_krill' : hero.id;
          const src = HERO_ICONS[hero.name] || `./icons/heroes/${fileSlug}.png`;
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = 20;
            c.height = 27;
            const ctx = c.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, 20, 27);
              templates.push({
                heroId: hero.id,
                heroName: hero.name,
                rgba: ctx.getImageData(0, 0, 20, 27).data,
              });
            }
            resolve();
          };
          img.onerror = () => resolve();
          img.src = src;
        })
    )
  );

  cachedPortraitTemplates = templates;
  return templates;
}

/** Local icon of an ability (named "Nom FR (English Name)" in the builds), if any. */
function getAbilityIconSrc(abilityName: string): string | undefined {
  const matchParen = abilityName.match(/\(([^)]+)\)/);
  const candidateEn = matchParen ? matchParen[1].trim() : abilityName.split('(')[0].trim();
  return (
    ABILITY_ICONS[candidateEn] ||
    (candidateEn === 'Spirit Snare' ? ABILITY_ICONS['Immobilizing Trap'] : undefined)
  );
}

/** Heroes the ability icons can recognize (the others are only found by their portrait). */
export const ABILITY_TEMPLATE_HERO_IDS = new Set(
  HEROES_DB.filter((hero) =>
    (hero.builds[0]?.abilitiesDetails ?? []).some((ab) => getAbilityIconSrc(ab.name))
  ).map((hero) => hero.id)
);

async function getAbilityTemplates(): Promise<AbilityMaskTemplate[]> {
  if (cachedAbilityTemplates) return cachedAbilityTemplates;
  const templates: AbilityMaskTemplate[] = [];

  const tasks: Promise<void>[] = [];
  for (const hero of HEROES_DB) {
    const build = hero.builds[0];
    if (!build) continue;
    for (const ab of build.abilitiesDetails) {
      const src = getAbilityIconSrc(ab.name);
      if (!src) continue;

      tasks.push(
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = 20;
            c.height = 20;
            const ctx = c.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, 20, 20);
              const data = ctx.getImageData(0, 0, 20, 20).data;
              const mask = new Uint8Array(400);
              for (let i = 0; i < 400; i++) {
                mask[i] = data[i * 4 + 3] > 128 ? 1 : 0;
              }
              templates.push({
                heroId: hero.id,
                abilityName: ab.name.split('(')[0].trim(),
                fgMask: mask,
              });
            }
            resolve();
          };
          img.onerror = () => resolve();
          img.src = src;
        })
      );
    }
  }

  await Promise.all(tasks);
  cachedAbilityTemplates = templates;
  return templates;
}

// Team colours of the HUD (RGBA buffer, pixel at byte offset i): score boxes and the local player's highlight
const isSapphireBlue = (d: Uint8ClampedArray, i: number) => d[i + 2] > 175 && d[i + 2] - d[i] > 85;
const isAmberGold = (d: Uint8ClampedArray, i: number) =>
  d[i] > 175 && d[i + 1] > 100 && d[i] - d[i + 2] > 105;

/** Share of the pixels (every `step` bytes) passing `test`. */
function colorRatio(
  d: Uint8ClampedArray,
  test: (d: Uint8ClampedArray, i: number) => boolean,
  step = 4
): number {
  let hits = 0;
  let samples = 0;
  for (let i = 0; i < d.length; i += step) {
    samples++;
    if (test(d, i)) hits++;
  }
  return samples > 0 ? hits / samples : 0;
}

// Padlock of a still-locked inventory slot, as a local-contrast mask (pixel brighter than its neighbourhood)
// over the slot area x = 8..43, y = 8..43 (1920x1080). Extracted from a real capture: IoU between padlocks
// 0.80-0.96, against empty slots (see-through, any background) <= 0.08.
const LOCK_MASK_ORIGIN = 8;
const LOCK_MASK = [
  '.................####...............',
  '...............########.............',
  '..............##########............',
  '.............############...........',
  '.............####....####...........',
  '............####......####..........',
  '............###........###..........',
  '............###........###..........',
  '............###........###..........',
  '............###........###..........',
  '............###........###..........',
  '............###........###..........',
  '....................................',
  '....................................',
  '........######################......',
  '........######.#.#....#.######......',
  '........####............#.####......',
  '........####.#..........#.####......',
  '........##................#.##......',
  '........##.#..............####......',
  '........##..................##......',
  '........####..............####......',
  '........##.#..............#.##......',
  '........######..........######......',
  '........####.#..........#.####......',
  '........######################......',
  '........######################......',
];
const LOCK_MASK_ROW_OFFSET = 7; // first mask row is row 7 of the 36x36 slot area
const LOCK_MIN_IOU = 0.5;

/** Is this inventory slot (top-left corner at 1920x1080 coordinates) a padlocked, not yet unlocked slot? */
function isLockedSlot(
  data: Uint8ClampedArray,
  dataW: number,
  dataX0: number,
  dataY0: number,
  slotX1920: number,
  slotY1080: number,
  scaleX: number,
  scaleY: number
): boolean {
  const lumAt = (x: number, y: number) => {
    const i = (y * dataW + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };
  const r = Math.max(1, Math.round(6 * scaleX));
  const step = Math.max(1, Math.round(3 * scaleX));
  let inter = 0;
  let union = 0;
  for (let ty = 0; ty < 36; ty++) {
    const maskRow = LOCK_MASK[ty - LOCK_MASK_ROW_OFFSET];
    const y = Math.round((slotY1080 + LOCK_MASK_ORIGIN + ty) * scaleY) - dataY0;
    for (let tx = 0; tx < 36; tx++) {
      const x = Math.round((slotX1920 + LOCK_MASK_ORIGIN + tx) * scaleX) - dataX0;
      let sum = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy += step) {
        for (let dx = -r; dx <= r; dx += step) {
          sum += lumAt(x + dx, y + dy);
          n++;
        }
      }
      const isFg = lumAt(x, y) - sum / n > 12;
      const isMask = maskRow !== undefined && maskRow[tx] === '#';
      if (isFg && isMask) inter++;
      if (isFg || isMask) union++;
    }
  }
  return union > 0 && inter / union >= LOCK_MIN_IOU;
}

const MATCH_GRID = 20;
// Max error (mean absolute RGB difference, 0-255) for an inventory slot to be accepted as an item.
// Measured on a real capture: correct items 4-9, best wrong candidate >= 29.
const ITEM_MATCH_MAX_MAE = 20;
// Tie-breaker in favour of the active build's items.
const BUILD_ITEM_MAE_BONUS = 2;

/**
 * Area-averaged (box filter) downsample of an RGBA image to 20x20. Templates and screen slots go through
 * this exact same code: canvas drawImage downscaling differs between the GPU and CPU backends and aliases
 * thin lines (e.g. Mystic Reverb), which inflated the error of correct matches up to the threshold.
 */
function areaDownsample(src: Uint8ClampedArray, srcW: number, srcH: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(MATCH_GRID * MATCH_GRID * 4);
  const fx = srcW / MATCH_GRID;
  const fy = srcH / MATCH_GRID;
  for (let oy = 0; oy < MATCH_GRID; oy++) {
    const y0 = oy * fy;
    const y1 = y0 + fy;
    for (let ox = 0; ox < MATCH_GRID; ox++) {
      const x0 = ox * fx;
      const x1 = x0 + fx;
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        wSum = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wgt = wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
          const i = (sy * srcW + sx) * 4;
          r += src[i] * wgt;
          g += src[i + 1] * wgt;
          b += src[i + 2] * wgt;
          a += src[i + 3] * wgt;
          wSum += wgt;
        }
      }
      const o = (oy * MATCH_GRID + ox) * 4;
      out[o] = r / wSum;
      out[o + 1] = g / wSum;
      out[o + 2] = b / wSum;
      out[o + 3] = a / wSum;
    }
  }
  return out;
}

async function getItemTemplates(): Promise<ItemIconTemplate[]> {
  if (cachedItemTemplates) return cachedItemTemplates;
  const templates: ItemIconTemplate[] = [];

  const loadTemplate = (itemId: string, itemName: string, category: ItemCategory, src: string) =>
    new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (ctx && c.width > 0 && c.height > 0) {
          ctx.drawImage(img, 0, 0);
          templates.push({
            itemId,
            itemName,
            category,
            rgba: areaDownsample(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height),
          });
        }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = src;
    });

  // One template per item: the current official shop icon (generated catalog), falling back to the
  // older local icon. Outdated artworks of renamed items would only create false matches.
  const tasks = Object.values(ITEMS_DB).map((item) => {
    const iconKey = ITEM_ID_TO_ICON_KEY[item.id];
    const src = item.icon || item.legacyIcon || (iconKey ? ITEM_ICONS[iconKey] : undefined);
    if (!src) return Promise.resolve();
    return loadTemplate(item.id, item.name.split('(')[0].trim(), item.category, src);
  });

  await Promise.all(tasks);
  cachedItemTemplates = templates;
  return templates;
}

// Reusable tiny scratch canvases to avoid DOM allocation overhead on 350ms fast loop
let sharedFullCanvas: HTMLCanvasElement | null = null;
let shared20x20Canvas: HTMLCanvasElement | null = null;
let shared20x27Canvas: HTMLCanvasElement | null = null;

/** Analyses one game frame: a live capture frame (ImageBitmap) or an image data URL. */
export async function analyzeDeadlockScreen(
  frame: string | ImageBitmap,
  sourceName: string,
  isDeadlockWindow: boolean,
  currentMyHeroId: string,
  buildItemIds: string[] = [],
  includePreview = false
): Promise<VisionDetectionResult> {
  const [portraitTemplates, abilityTemplates, itemTemplates] = await Promise.all([
    getPortraitTemplates(),
    getAbilityTemplates(),
    getItemTemplates(),
  ]);

  const debugLogs: string[] = [];

  return new Promise((resolve) => {
    const onFrame = (img: HTMLImageElement | ImageBitmap) => {
      const w = img.width;
      const h = img.height;

      if (w < 400 || h < 300) {
        resolve({
          detectedLaneEnemyIds: [],
          detectedTeamEnemyIds: [],
          detectedAllyIds: [],
          detectedEnemyIds: [],
          detectedOwnedItemIds: [],
          inventoryScanned: false,
          occupiedSlotsCount: 0,
          rawText: '',
          confidence: 0,
          sourceName,
          isDeadlockWindow,
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          debugLogs,
        });
        return;
      }

      if (!sharedFullCanvas) sharedFullCanvas = document.createElement('canvas');
      if (sharedFullCanvas.width !== w || sharedFullCanvas.height !== h) {
        sharedFullCanvas.width = w;
        sharedFullCanvas.height = h;
      }
      const fullCtx = sharedFullCanvas.getContext('2d', { willReadFrequently: true });

      if (!fullCtx) {
        resolve({
          detectedLaneEnemyIds: [],
          detectedTeamEnemyIds: [],
          detectedAllyIds: [],
          detectedEnemyIds: [],
          detectedOwnedItemIds: [],
          inventoryScanned: false,
          occupiedSlotsCount: 0,
          rawText: '',
          confidence: 0,
          sourceName,
          isDeadlockWindow,
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          debugLogs,
        });
        return;
      }

      fullCtx.drawImage(img, 0, 0);

      if (!shared20x20Canvas) {
        shared20x20Canvas = document.createElement('canvas');
        shared20x20Canvas.width = 20;
        shared20x20Canvas.height = 20;
      }
      const abCtx = shared20x20Canvas.getContext('2d', { willReadFrequently: true });

      // 0. VERIFY IF DEADLOCK TOP TEAM BARS ARE VISIBLE (score boxes on each side of the timer)
      // Prevents false-positive hero detection when the Shop (B) is open or when another window is focused.
      // The player's team is always on the left in its own colour: Sapphire Blue | Amber Gold when playing
      // Sapphire, Amber Gold | Sapphire Blue when playing Amber. Both layouts must be accepted.
      let isDeadlockTopBarVisible = false;
      try {
        const leftBarData = fullCtx.getImageData(
          Math.round((w * 855) / 1920),
          Math.round((h * 44) / 1080),
          Math.max(1, Math.round((w * 50) / 1920)),
          Math.max(1, Math.round((h * 24) / 1080))
        ).data;
        const rightBarData = fullCtx.getImageData(
          Math.round((w * 1015) / 1920),
          Math.round((h * 44) / 1080),
          Math.max(1, Math.round((w * 50) / 1920)),
          Math.max(1, Math.round((h * 24) / 1080))
        ).data;

        const sapphireLayout =
          colorRatio(leftBarData, isSapphireBlue, 16) >= 0.35 &&
          colorRatio(rightBarData, isAmberGold, 16) >= 0.35;
        const amberLayout =
          colorRatio(leftBarData, isAmberGold, 16) >= 0.35 &&
          colorRatio(rightBarData, isSapphireBlue, 16) >= 0.35;
        isDeadlockTopBarVisible = sapphireLayout || amberLayout;
      } catch {
        // Ignore
      }

      // 1. ULTRA-FAST OWNED INVENTORY ITEMS SCANNER (12 Bottom-Left Slots: 2 rows x 6 cols)
      // Runs on EVERY frame (even when the Shop 'B' is open!) in < 3ms
      // Calibrated on 1920x1080: x = 26 + col * 62, y = 944 + row * 62, size = 52x52
      const detectedOwnedItemIds: string[] = [];
      const occupiedCategoryCounts: Record<ItemCategory, number> = {
        weapon: 0,
        vitality: 0,
        spirit: 0,
      };
      const matchedCategoryCounts: Record<ItemCategory, number> = {
        weapon: 0,
        vitality: 0,
        spirit: 0,
      };
      let totalOccupiedSlots = 0;
      let unmatchedSlotsCount = 0;
      let lockedSlotsCount = 0;
      const buildItemSet = new Set<string>(buildItemIds);

      if (abCtx && itemTemplates.length > 0) {
        // Whole inventory area once, for the padlock test of the empty-looking slots
        const scaleX = w / 1920;
        const scaleY = h / 1080;
        const invX0 = Math.round(10 * scaleX);
        const invY0 = Math.round(930 * scaleY);
        const invW = Math.min(w - invX0, Math.round(400 * scaleX));
        const invH = h - invY0;
        const invData = fullCtx.getImageData(invX0, invY0, invW, invH).data;
        const isSlotLocked = (row: number, col: number) =>
          isLockedSlot(invData, invW, invX0, invY0, 26 + col * 62, 944 + row * 62, scaleX, scaleY);

        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 6; col++) {
            const ix = Math.round((w * (26 + col * 62)) / 1920);
            const iy = Math.round((h * (944 + row * 62)) / 1080);
            const isz = Math.round((w * 52) / 1920);

            abCtx.clearRect(0, 0, 20, 20);
            abCtx.drawImage(sharedFullCanvas, ix, iy, isz, isz, 0, 0, 20, 20);
            const sData = abCtx.getImageData(0, 0, 20, 20).data;

            // Step 1A: Detect Top-Right Category Corner Triangle (Orange=Weapon, Green=Vitality, Purple=Spirit)
            let trR = 0,
              trG = 0,
              trB = 0,
              trN = 0;
            for (let py = 1; py <= 6; py++) {
              for (let px = 13; px <= 18; px++) {
                if (px - 12 >= py) {
                  const idx = (py * 20 + px) * 4;
                  const r = sData[idx];
                  const g = sData[idx + 1];
                  const b = sData[idx + 2];
                  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                  // Skip dark Roman numeral pixels ('I', 'II', 'III', 'IV') inside the corner badge
                  if (lum > 70) {
                    trR += r;
                    trG += g;
                    trB += b;
                    trN++;
                  }
                }
              }
            }

            let slotCat: ItemCategory | null = null;
            if (trN >= 4) {
              trR /= trN;
              trG /= trN;
              trB /= trN;
              if (trR > 170 && trG > 90 && trB < 90 && trR - trB > 95) {
                slotCat = 'weapon';
              } else if (trG > 110 && trG > trR + 8 && trG - trB > 30) {
                slotCat = 'vitality';
              } else if (trB > 120 && trR > 85 && trB - trG > 20) {
                slotCat = 'spirit';
              }
            }

            if (!slotCat) {
              if (isSlotLocked(row, col)) lockedSlotsCount++;
              continue;
            }

            // Step 1B: Verify inner card body luminance & contrast (excluding top-right triangle)
            let lumSum = 0;
            let lumSq = 0;
            let innerN = 0;
            for (let py = 2; py < 18; py++) {
              for (let px = 2; px < 18; px++) {
                if (px >= 10 && py <= 10 && px - 9 >= py) continue;
                const idx = (py * 20 + px) * 4;
                const lum =
                  0.299 * sData[idx] + 0.587 * sData[idx + 1] + 0.114 * sData[idx + 2];
                lumSum += lum;
                lumSq += lum * lum;
                innerN++;
              }
            }

            const meanLum = lumSum / innerN;
            const variance = lumSq / innerN - meanLum * meanLum;

            // Every real Deadlock item card (including dark icons like Healbane/Decay) has high contrast (variance > 600)
            if (meanLum <= 45 || variance <= 600) {
              if (isSlotLocked(row, col)) lockedSlotsCount++;
              continue;
            }

            totalOccupiedSlots++;
            occupiedCategoryCounts[slotCat]++;

            // Step 1C: Match against itemTemplates of the SAME category (Weapon/Vitality/Spirit).
            // The icon artwork sits 2px lower and is 54px wide inside the 52px slot box used above
            // (calibrated on a real 1920x1080 capture: average error of correct matches 30 -> 9).
            const mx = Math.round((w * (26 + col * 62)) / 1920);
            const my = Math.round((h * (946 + row * 62)) / 1080);
            const msz = Math.round((w * 54) / 1920);
            const mData = areaDownsample(fullCtx.getImageData(mx, my, msz, msz).data, msz, msz);

            let bestItem: string | null = null;
            let bestEffectiveMAE = 999;
            let secondItem: string | null = null;
            let secondEffectiveMAE = 999;

            for (const tpl of itemTemplates) {
              if (tpl.category !== slotCat) continue;
              const tData = tpl.rgba;
              let diff = 0;
              let cnt = 0;
              for (let py = 2; py < 18; py++) {
                for (let px = 2; px < 18; px++) {
                  if (px >= 10 && py <= 10 && px - 9 >= py) continue;
                  const idx = (py * 20 + px) * 4;
                  const dr = Math.abs(tData[idx] - mData[idx]);
                  const dg = Math.abs(tData[idx + 1] - mData[idx + 1]);
                  const db = Math.abs(tData[idx + 2] - mData[idx + 2]);
                  diff += (dr + dg + db) / 3.0;
                  cnt++;
                }
              }
              const rawMae = diff / cnt;
              // Slight tie-breaker preference for items of the active build (static list, independent of the
              // buy queue, so the match of a slot can't change just because the recommendations changed)
              const effectiveMae = buildItemSet.has(tpl.itemId) ? rawMae - BUILD_ITEM_MAE_BONUS : rawMae;
              if (effectiveMae < bestEffectiveMAE) {
                secondItem = bestItem;
                secondEffectiveMAE = bestEffectiveMAE;
                bestEffectiveMAE = effectiveMae;
                bestItem = tpl.itemId;
              } else if (effectiveMae < secondEffectiveMAE) {
                secondEffectiveMAE = effectiveMae;
                secondItem = tpl.itemId;
              }
            }

            const accepted = bestItem !== null && bestEffectiveMAE <= ITEM_MATCH_MAX_MAE;
            debugLogs.push(
              `Slot ${row + 1}.${col + 1} [${slotCat}] ${accepted ? '✓' : '✗'} ${bestItem} (${bestEffectiveMAE.toFixed(
                1
              )}) • 2e : ${secondItem} (${secondEffectiveMAE.toFixed(1)})`
            );
            if (accepted && bestItem && !detectedOwnedItemIds.includes(bestItem)) {
              detectedOwnedItemIds.push(bestItem);
              matchedCategoryCounts[slotCat]++;
            }
          }
        }

        // Step 1D: an occupied slot that matches no template stays UNKNOWN. Never guess it from the
        // recommendations: doing so marked the next item to buy as owned on every scan, cascading through the list.
        for (const cat of ['weapon', 'vitality', 'spirit'] as ItemCategory[]) {
          unmatchedSlotsCount += occupiedCategoryCounts[cat] - matchedCategoryCounts[cat];
        }

        if (detectedOwnedItemIds.length > 0 || unmatchedSlotsCount > 0 || lockedSlotsCount > 0) {
          debugLogs.push(
            `Inventaire détecté (${detectedOwnedItemIds.length} objets${
              unmatchedSlotsCount > 0 ? `, ${unmatchedSlotsCount} slot(s) non reconnu(s)` : ''
            }, ${lockedSlotsCount} slot(s) verrouillé(s)) : ${detectedOwnedItemIds.join(', ')}`
          );
        }
      }

      // 2. NON-BLOCKING SOULS COUNTER SCANNER (Bottom-Left Mint-Cyan Digits: x=110..208, y=892..924)
      // Only invokes Tesseract OCR in the background when the mint-cyan pixel fingerprint actually changes!
      try {
        const sx = Math.round((w * 110) / 1920);
        const sy = Math.round((h * 892) / 1080);
        const sw = Math.max(1, Math.round((w * 98) / 1920));
        const sh = Math.max(1, Math.round((h * 32) / 1080));

        const rawSouls = fullCtx.getImageData(sx, sy, sw, sh).data;
        let mintPixels = 0;
        let mintXSum = 0;

        for (let py = 0; py < sh; py++) {
          for (let px = 0; px < sw; px++) {
            const idx = (py * sw + px) * 4;
            const r = rawSouls[idx];
            const g = rawSouls[idx + 1];
            const b = rawSouls[idx + 2];
            if (g > 200 && b > 165 && r < 205 && g - r > 20) {
              mintPixels++;
              mintXSum += px;
            }
          }
        }

        if (mintPixels >= 18) {
          const fingerprintChanged =
            Math.abs(mintPixels - lastMintPixels) > 2 || Math.abs(mintXSum - lastMintXSum) > 35;

          if (fingerprintChanged && !isOcrBusy) {
            lastMintPixels = mintPixels;
            lastMintXSum = mintXSum;
            isOcrBusy = true;

            const pad = 12;
            const soulsCanvas = document.createElement('canvas');
            soulsCanvas.width = sw * 2 + pad * 2;
            soulsCanvas.height = sh * 2 + pad * 2;
            const soulsCtx = soulsCanvas.getContext('2d');

            if (soulsCtx) {
              soulsCtx.fillStyle = '#ffffff';
              soulsCtx.fillRect(0, 0, soulsCanvas.width, soulsCanvas.height);
              soulsCtx.fillStyle = '#000000';
              for (let py = 0; py < sh; py++) {
                for (let px = 0; px < sw; px++) {
                  const idx = (py * sw + px) * 4;
                  const r = rawSouls[idx];
                  const g = rawSouls[idx + 1];
                  const b = rawSouls[idx + 2];
                  if (g > 200 && b > 165 && r < 205 && g - r > 20) {
                    soulsCtx.fillRect(pad + px * 2, pad + py * 2, 2, 2);
                  }
                }
              }
              const soulsDataUrl = soulsCanvas.toDataURL('image/png');
              getDigitsOcrWorker()
                .then((worker) => worker.recognize(soulsDataUrl))
                .then((ocrRes) => {
                  const digitsOnly = (ocrRes.data.text || '').replace(/[^0-9]/g, '');
                  if (digitsOnly.length >= 1 && digitsOnly.length <= 6) {
                    const parsed = parseInt(digitsOnly, 10);
                    if (!isNaN(parsed) && parsed >= 0 && parsed <= 99999) {
                      cachedDetectedSouls = parsed;
                    }
                  }
                })
                .catch(() => {})
                .finally(() => {
                  isOcrBusy = false;
                });
            } else {
              isOcrBusy = false;
            }
          }
        }
      } catch {
        // Ignore
      }

      // 3. DETECT MY HERO & ALL 12 PLAYERS ONLY WHEN DEADLOCK HUD TOP BAR IS VISIBLE
      let abilityDetectedHeroId: string | undefined = undefined;
      let bestAbilityIoU = 0;
      const allyHeroesBySlot: (string | null)[] = [null, null, null, null, null, null];
      const enemyHeroesBySlot: (string | null)[] = [null, null, null, null, null, null];
      let myAllySlotIdx = -1;

      if (isDeadlockTopBarVisible) {
        if (abCtx && abilityTemplates.length > 0) {
          const heroIoUScores: Record<
            string,
            { maxIoU: number; sumIoU: number; slots: Set<number>; spell: string }
          > = {};

          for (let idx = 0; idx < 3; idx++) {
            const bx = Math.round((w * (798 + idx * 90)) / 1920);
            const by = Math.round((h * 979) / 1080);
            const bsz = Math.round((w * 54) / 1920);

            abCtx.clearRect(0, 0, 20, 20);
            abCtx.drawImage(sharedFullCanvas, bx, by, bsz, bsz, 0, 0, 20, 20);
            const pData = abCtx.getImageData(0, 0, 20, 20).data;

            for (const tpl of abilityTemplates) {
              let interDark = 0,
                unionDark = 0;
              let interLight = 0,
                unionLight = 0;

              for (let py = 2; py < 18; py++) {
                for (let px = 2; px < 18; px++) {
                  const i = py * 20 + px;
                  const isFgTpl = tpl.fgMask[i] === 1;
                  const r = pData[i * 4];
                  const g = pData[i * 4 + 1];
                  const b = pData[i * 4 + 2];
                  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

                  const isDarkCap = lum < 98;
                  if (isFgTpl && isDarkCap) interDark++;
                  if (isFgTpl || isDarkCap) unionDark++;

                  const isLightCap = lum > 145;
                  if (isFgTpl && isLightCap) interLight++;
                  if (isFgTpl || isLightCap) unionLight++;
                }
              }

              const iouDark = unionDark > 0 ? interDark / unionDark : 0;
              const iouLight = unionLight > 0 ? interLight / unionLight : 0;
              const iou = Math.max(iouDark, iouLight);

              if (iou > 0.55) {
                if (!heroIoUScores[tpl.heroId]) {
                  heroIoUScores[tpl.heroId] = {
                    maxIoU: iou,
                    sumIoU: iou,
                    slots: new Set([idx]),
                    spell: tpl.abilityName,
                  };
                } else {
                  heroIoUScores[tpl.heroId].sumIoU += iou;
                  heroIoUScores[tpl.heroId].slots.add(idx);
                  if (iou > heroIoUScores[tpl.heroId].maxIoU) {
                    heroIoUScores[tpl.heroId].maxIoU = iou;
                    heroIoUScores[tpl.heroId].spell = tpl.abilityName;
                  }
                }
              }
            }
          }

          const abilityRanking = Object.entries(heroIoUScores)
            .sort(([, a], [, b]) => b.sumIoU - a.sumIoU)
            .slice(0, 3)
            .map(
              ([hId, sc]) =>
                `${hId} (Σ${sc.sumIoU.toFixed(2)}, max ${sc.maxIoU.toFixed(2)} ${sc.spell}, slots ${[...sc.slots]
                  .map((s) => s + 1)
                  .join('+')})`
            );
          debugLogs.push(`Sorts : ${abilityRanking.join(' • ') || 'aucun sort reconnu'}`);

          let bestSumIoU = 0;
          for (const [hId, sc] of Object.entries(heroIoUScores)) {
            if ((sc.slots.size >= 2 || sc.maxIoU >= 0.78) && sc.sumIoU > bestSumIoU) {
              bestSumIoU = sc.sumIoU;
              bestAbilityIoU = sc.maxIoU;
              abilityDetectedHeroId = hId;
            }
          }
        }

        if (!shared20x27Canvas) {
          shared20x27Canvas = document.createElement('canvas');
          shared20x27Canvas.width = 20;
          shared20x27Canvas.height = 27;
        }
        const patchCtx = shared20x27Canvas.getContext('2d', { willReadFrequently: true });

        interface SlotCandidate {
          side: 'ally' | 'enemy';
          slotIndex: number;
          scores: { heroId: string; mae: number }[];
        }

        const allSlots: SlotCandidate[] = [];

        if (patchCtx && portraitTemplates.length > 0) {
          const evaluateSlot = (baseX1920: number): { heroId: string; mae: number }[] => {
            const bestByHero: Record<string, number> = {};

            for (const dx1920 of [-2, 0, 2]) {
              const sx = Math.round((w * (baseX1920 + dx1920)) / 1920);
              const sy = 0;
              const sw = Math.round((w * 70) / 1920);
              const sh = Math.round((h * 95) / 1080);

              patchCtx.clearRect(0, 0, 20, 27);
              patchCtx.drawImage(sharedFullCanvas!, sx, sy, sw, sh, 0, 0, 20, 27);
              const pData = patchCtx.getImageData(0, 0, 20, 27).data;

              let lumSum = 0,
                lumSq = 0;
              for (let i = 0; i < 20 * 18; i++) {
                const lum =
                  0.299 * pData[i * 4] + 0.587 * pData[i * 4 + 1] + 0.114 * pData[i * 4 + 2];
                lumSum += lum;
                lumSq += lum * lum;
              }
              const mean = lumSum / 360;
              const variance = lumSq / 360 - mean * mean;
              if (variance < 180) continue;

              for (const tpl of portraitTemplates) {
                let diff = 0;
                let cnt = 0;
                const tData = tpl.rgba;

                for (let py = 2; py < 16; py++) {
                  for (let px = 4; px < 16; px++) {
                    const idx = (py * 20 + px) * 4;
                    if (tData[idx + 3] > 215) {
                      const dr = Math.abs(tData[idx] - pData[idx]);
                      const dg = Math.abs(tData[idx + 1] - pData[idx + 1]);
                      const db = Math.abs(tData[idx + 2] - pData[idx + 2]);
                      diff += (dr + dg + db) / 3.0;
                      cnt++;
                    }
                  }
                }

                if (cnt > 25) {
                  const mae = diff / cnt;
                  if (bestByHero[tpl.heroId] === undefined || mae < bestByHero[tpl.heroId]) {
                    bestByHero[tpl.heroId] = mae;
                  }
                }
              }
            }

            return Object.entries(bestByHero)
              .map(([heroId, mae]) => ({ heroId, mae }))
              .sort((a, b) => a.mae - b.mae);
          };

          for (let i = 0; i < 6; i++) {
            allSlots.push({
              side: 'ally',
              slotIndex: i,
              scores: evaluateSlot(339 + i * 88),
            });
          }
          for (let i = 0; i < 6; i++) {
            allSlots.push({
              side: 'enemy',
              slotIndex: i,
              scores: evaluateSlot(1071 + i * 88),
            });
          }
        }

        const usedHeroes = new Set<string>();
        const allPairs: {
          side: 'ally' | 'enemy';
          slotIndex: number;
          heroId: string;
          mae: number;
        }[] = [];
        for (const s of allSlots) {
          for (const sc of s.scores.slice(0, 4)) {
            if (sc.mae <= 45) {
              allPairs.push({
                side: s.side,
                slotIndex: s.slotIndex,
                heroId: sc.heroId,
                mae: sc.mae,
              });
            }
          }
        }
        allPairs.sort((a, b) => a.mae - b.mae);

        for (const pair of allPairs) {
          if (usedHeroes.has(pair.heroId)) continue;
          if (pair.side === 'ally' && allyHeroesBySlot[pair.slotIndex] === null) {
            allyHeroesBySlot[pair.slotIndex] = pair.heroId;
            usedHeroes.add(pair.heroId);
          } else if (pair.side === 'enemy' && enemyHeroesBySlot[pair.slotIndex] === null) {
            enemyHeroesBySlot[pair.slotIndex] = pair.heroId;
            usedHeroes.add(pair.heroId);
          }
        }

        // The local player's own portrait sits on a solid team-colour box (amber or blue) whose top corners
        // stick out of the round portrait; teammates' corners show the map behind them.
        // Measured on a real 1920x1080 capture: own slot 0.87-0.97, teammates <= 0.11.
        const highlightedSlots: number[] = [];
        const cornerW = Math.max(1, Math.round((w * 12) / 1920));
        const cornerH = Math.max(1, Math.round((h * 30) / 1080));
        const isTeamColor = (d: Uint8ClampedArray, i: number) => isAmberGold(d, i) || isSapphireBlue(d, i);
        for (let i = 0; i < 6; i++) {
          const x0 = 339 + i * 88;
          const left = fullCtx.getImageData(Math.round((w * x0) / 1920), 0, cornerW, cornerH).data;
          const right = fullCtx.getImageData(Math.round((w * (x0 + 58)) / 1920), 0, cornerW, cornerH).data;
          if (colorRatio(left, isTeamColor) >= 0.5 && colorRatio(right, isTeamColor) >= 0.5) {
            highlightedSlots.push(i);
          }
        }
        if (highlightedSlots.length === 1) myAllySlotIdx = highlightedSlots[0];

        debugLogs.push(
          `Portraits alliés : ${allyHeroesBySlot
            .map((id, i) => `${i + 1}:${id ?? '?'}${i === myAllySlotIdx ? '★' : ''}`)
            .join(' ')}`
        );
      }

      const validAllies = allyHeroesBySlot.filter((x): x is string => Boolean(x));
      const validEnemies = enemyHeroesBySlot.filter((x): x is string => Boolean(x));

      // Never allow cooldown numbers during death cam to match an enemy hero or low-confidence icon
      if (
        abilityDetectedHeroId &&
        (validEnemies.includes(abilityDetectedHeroId) || bestAbilityIoU < 0.62)
      ) {
        abilityDetectedHeroId = undefined;
      }

      // 1st choice: the highlighted portrait (works for every hero, even without ability templates, and is
      // not fooled by cooldown numbers). 2nd: the 4 abilities. Then the previous hero / first ally slot.
      const highlightedHeroId = myAllySlotIdx >= 0 ? allyHeroesBySlot[myAllySlotIdx] ?? undefined : undefined;
      let detectedHeroId = highlightedHeroId ?? abilityDetectedHeroId;
      if (isDeadlockTopBarVisible) {
        if (!detectedHeroId && !validEnemies.includes(currentMyHeroId)) {
          detectedHeroId = currentMyHeroId;
        }
        if (!detectedHeroId && allyHeroesBySlot[0]) {
          detectedHeroId = allyHeroesBySlot[0];
        }
      }

      let detectedPartnerId: string | undefined = undefined;
      let detectedLaneEnemyIds: string[] = [];
      let detectedTeamEnemyIds: string[] = [];
      let detectedLaneColor: LaneColor | undefined = undefined;

      if (isDeadlockTopBarVisible && detectedHeroId && validAllies.length > 0) {
        // The app's (match-locked) hero first: while dead, the highlight may follow the spectated teammate
        const currentHeroSlot = allyHeroesBySlot.indexOf(currentMyHeroId);
        let mySlotIdx =
          currentHeroSlot >= 0
            ? currentHeroSlot
            : myAllySlotIdx >= 0
            ? myAllySlotIdx
            : allyHeroesBySlot.indexOf(detectedHeroId);
        if (mySlotIdx === -1) mySlotIdx = 0;

        const pairIdx = Math.floor(mySlotIdx / 2);
        const partnerSlotIdx = mySlotIdx % 2 === 0 ? mySlotIdx + 1 : mySlotIdx - 1;
        if (allyHeroesBySlot[partnerSlotIdx]) {
          detectedPartnerId = allyHeroesBySlot[partnerSlotIdx]!;
        }

        const laneE1 = enemyHeroesBySlot[pairIdx * 2];
        const laneE2 = enemyHeroesBySlot[pairIdx * 2 + 1];
        detectedLaneEnemyIds = [laneE1, laneE2].filter((x): x is string => Boolean(x));
        detectedTeamEnemyIds = validEnemies.filter((id) => !detectedLaneEnemyIds.includes(id));
        detectedLaneColor = pairIdx === 0 ? 'yellow' : pairIdx === 1 ? 'blue' : 'orange';
      } else if (isDeadlockTopBarVisible && validEnemies.length > 0) {
        detectedLaneEnemyIds = validEnemies.slice(0, 2);
        detectedTeamEnemyIds = validEnemies.slice(2, 6);
      }

      let hudPreviewUrl: string | undefined = undefined;
      if (includePreview) {
        const stripCanvas = document.createElement('canvas');
        const topH = Math.floor(h * 0.12);
        const botH = Math.floor(h * 0.16);
        stripCanvas.width = w;
        stripCanvas.height = topH + botH;
        const stripCtx = stripCanvas.getContext('2d');
        if (stripCtx) {
          stripCtx.drawImage(sharedFullCanvas, 0, 0, w, topH, 0, 0, w, topH);
          stripCtx.drawImage(sharedFullCanvas, 0, h - botH, w, botH, 0, topH, w, botH);
          hudPreviewUrl = stripCanvas.toDataURL('image/jpeg', 0.85);
        }
      }

      const detectedAllyIds = validAllies.filter((id) => id !== detectedHeroId);
      const inventoryScanned = isDeadlockTopBarVisible || totalOccupiedSlots > 0;
      const confidence =
        isDeadlockTopBarVisible || totalOccupiedSlots > 0
          ? Math.min(99, 80 + validEnemies.length * 3)
          : 0;

      resolve({
        detectedHeroId,
        detectedPartnerId,
        detectedLaneEnemyIds,
        detectedTeamEnemyIds,
        detectedAllyIds,
        detectedEnemyIds: validEnemies,
        detectedOwnedItemIds,
        inventoryScanned,
        occupiedSlotsCount: totalOccupiedSlots,
        unmatchedSlotsCount,
        lockedSlotsCount,
        hudVisible: isDeadlockTopBarVisible,
        highlightedHeroId,
        abilityHeroId: abilityDetectedHeroId,
        detectedSouls: cachedDetectedSouls,
        detectedLaneColor,
        rawText: [
          detectedHeroId ? `Moi: ${detectedHeroId}` : '',
          detectedOwnedItemIds.length > 0 ? `Items: ${detectedOwnedItemIds.length}` : '',
          cachedDetectedSouls !== undefined ? `Âmes: ${cachedDetectedSouls}` : '',
        ]
          .filter(Boolean)
          .join(' | '),
        confidence,
        sourceName,
        isDeadlockWindow,
        timestamp: new Date().toLocaleTimeString('fr-FR'),
        hudPreviewUrl,
        debugLogs,
      });
    };

    const onError = () =>
      resolve({
        detectedLaneEnemyIds: [],
        detectedTeamEnemyIds: [],
        detectedAllyIds: [],
        detectedEnemyIds: [],
        detectedOwnedItemIds: [],
        inventoryScanned: false,
        occupiedSlotsCount: 0,
        rawText: '',
        confidence: 0,
        sourceName,
        isDeadlockWindow,
        timestamp: new Date().toLocaleTimeString('fr-FR'),
        debugLogs,
      });

    if (typeof frame !== 'string') {
      onFrame(frame);
      return;
    }
    const img = new Image();
    img.onload = () => onFrame(img);
    img.onerror = onError;
    img.src = frame;
  });
}
