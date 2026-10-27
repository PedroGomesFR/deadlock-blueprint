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
  shopOpen?: boolean; // shop (B) open: inventory and souls read at their shop position
  inventorySlots?: InventorySlotReading[]; // what each of the 12 slots looked like (game log, diagnostics)
  highlightedHeroId?: string; // hero of the highlighted (own) portrait in the top bar
  abilityHeroId?: string; // hero matched by the ability icons (less reliable, cooldown numbers fool it)
  allySlots?: (string | null)[]; // hero of each of the 6 ally portraits (left), null when unreadable
  enemySlots?: (string | null)[]; // hero of each of the 6 enemy portraits (right)
  topBar?: TopBarReading; // last match clock and team souls read (background OCR, possibly from an earlier frame)
  allyDead?: boolean[]; // respawn timer over each of the 6 ally portraits (dead), set with allySlots
  enemyDead?: boolean[];
  mySlotIndex?: number; // ally slot used as mine for the lane (-1 when unknown)
  frameWidth?: number; // size of the captured frame (analysed once normalized to 1920x1080); unset if not analysed
  frameHeight?: number;
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

export interface InventorySlotReading {
  slot: string; // "1.1" .. "2.6" (row.column)
  // item: recognized; cooldown: item last recognized in this slot, confirmed despite the cooldown sweep;
  // unknown: occupied but not recognized (itemId = best candidate)
  state: 'empty' | 'locked' | 'item' | 'cooldown' | 'unknown';
  category?: ItemCategory;
  itemId?: string;
  error?: number;
  secondId?: string;
  secondError?: number;
}

/** Match clock and team souls of the top bar, read by OCR in the background from one frame. */
export interface TopBarReading {
  clockS?: number; // match clock (seconds) on that frame
  allySouls?: number; // souls of the team on the left (thousands, as shown: "62 k")
  enemySouls?: number;
  at: number; // Date.now() when that frame was analysed
  // Portraits of that frame: the death cam shows the killer's top bar, whose left side is not my team
  allySlots: (string | null)[];
  enemySlots: (string | null)[];
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

/**
 * OCR worker for the souls digits. Everything is local (copied into ./tesseract/ by scripts/copy-ocr-assets.mjs):
 * no request to the Tesseract CDN, and the souls are read offline.
 */
function getDigitsOcrWorker(): Promise<Tesseract.Worker> {
  if (!ocrWorkerPromise) {
    const local = (p: string) => new URL(`./tesseract/${p}`, document.baseURI).href;
    ocrWorkerPromise = Tesseract.createWorker('eng', 1, {
      workerPath: local('worker.min.js'),
      corePath: local('core/'),
      langPath: local('lang'),
      workerBlobURL: false,
      cacheMethod: 'none',
      gzip: true,
    });
    // A failed start (missing files) must not stop every later attempt
    ocrWorkerPromise.catch(() => {
      ocrWorkerPromise = null;
    });
  }
  return ocrWorkerPromise;
}

// Top bar OCR (match clock, team souls): its own worker, set to a single line of digits
let topBarWorkerPromise: Promise<Tesseract.Worker> | null = null;
let isTopBarOcrBusy = false;
let lastTopBarOcrAt = -Infinity;
let cachedTopBar: TopBarReading | undefined = undefined;

function getTopBarOcrWorker(): Promise<Tesseract.Worker> {
  if (!topBarWorkerPromise) {
    const local = (p: string) => new URL(`./tesseract/${p}`, document.baseURI).href;
    topBarWorkerPromise = Tesseract.createWorker('eng', 1, {
      workerPath: local('worker.min.js'),
      corePath: local('core/'),
      langPath: local('lang'),
      workerBlobURL: false,
      cacheMethod: 'none',
      gzip: true,
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: '0123456789:',
      });
      return worker;
    });
    topBarWorkerPromise.catch(() => {
      topBarWorkerPromise = null;
    });
  }
  return topBarWorkerPromise;
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
// Own-portrait banner of the Sapphire team: darker than the score box, and never turquoise (a game effect on
// teammates, (34,198,181), that passes isSapphireBlue)
const isSapphireBanner = (d: Uint8ClampedArray, i: number) =>
  d[i + 2] > 150 && d[i + 2] - d[i] > 70 && d[i + 2] - d[i + 1] > 40 && d[i + 1] - d[i] > 10;
// Own portrait: its team-colour box is ~76 px wide (x0-3 .. x0+72), coloured at y = 4..24, while the hero art is
// clipped to the 70 px slot. Rows, and the share of team-colour pixels the 3 px strips just outside the slot need.
const OWN_BOX_Y = 4;
const OWN_BOX_H = 21;
const OWN_BOX_STRIP_MIN = 0.5;
// Gap between two portraits (5 px, from 7 px outside the slot): team-coloured scenery colours it too
const OWN_BOX_GAP_MAX = 0.3;
// For the current hero's slot, one well coloured side with a clean edge is enough (a hit flash pales the other)
const OWN_BOX_SINGLE_SIDE_MIN = 0.75;

// Dead hero: its portrait turns grey under a big red-orange respawn timer (~(235, 76, 30), rows 49..69 of the
// portrait). Grey portraits were still matched, often to the wrong hero: a large part of the enemy lineup noise
// late in a game. Measured on every portrait of 3 recorded games (x 5..66, y 45..76): alive <= 5 such pixels
// (Apollo's red skin has more blue, Deadman Danny's goggles sit higher, low-HP bars are thin), dead >= 80.
const RESPAWN_DIGIT_MIN_PIXELS = 30;
const isRespawnDigitPixel = (d: Uint8ClampedArray, i: number) =>
  d[i] > 220 && d[i + 1] > 45 && d[i + 1] < 115 && d[i + 2] < 60;

// Match clock and team souls of the top bar (measured on the 12 frames of tests/vision, 0:32 to 35:01). The clock
// ("15:45", light grey, 9 px high) sits in a dark box above the score boxes; each score box shows its team's souls
// in thousands ("62 k", 20 px high): white on the blue box, black on the amber one, followed by a faint "k". The
// left box's number ends before its team icon (right-aligned), the right box's starts after its icon.
const CLOCK_BOX = { x: 925, y: 14, w: 70, h: 18 };
const LEFT_SOULS_BOX = { x: 855, y: 48, w: 67, h: 30 };
const RIGHT_SOULS_BOX = { x: 998, y: 48, w: 67, h: 30 };
// Read every few seconds only: the application extrapolates the clock, and the team souls change slowly
const TOP_BAR_OCR_INTERVAL_MS = 4000;
const isWhiteTextPixel = (d: Uint8ClampedArray, i: number) => d[i] > 190 && d[i + 1] > 190 && d[i + 2] > 190;
const isDarkTextPixel = (d: Uint8ClampedArray, i: number) => d[i] < 90 && d[i + 1] < 80 && d[i + 2] < 70;

/**
 * Text pixels of a region as a black-on-white image for the OCR (scaled up, padded), keeping only the glyphs as tall
 * as the tallest one: the faint "k" after the team souls is shorter, and is dropped when some of it passes the test.
 */
function textImageForOcr(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  isText: (d: Uint8ClampedArray, i: number) => boolean,
  scale: number
): string | null {
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = isText(data, i * 4) ? 1 : 0;
  // Glyphs = runs of columns holding text pixels
  const glyphs: { x0: number; x1: number; y0: number; y1: number }[] = [];
  let current: { x0: number; x1: number; y0: number; y1: number } | null = null;
  for (let x = 0; x < w; x++) {
    let y0 = h;
    let y1 = -1;
    for (let y = 0; y < h; y++) {
      if (on[y * w + x]) {
        y0 = Math.min(y0, y);
        y1 = y;
      }
    }
    if (y1 < 0) {
      current = null;
      continue;
    }
    if (!current) glyphs.push((current = { x0: x, x1: x, y0, y1 }));
    current.x1 = x;
    current.y0 = Math.min(current.y0, y0);
    current.y1 = Math.max(current.y1, y1);
  }
  const tallest = Math.max(0, ...glyphs.map((g) => g.y1 - g.y0 + 1));
  if (tallest < 6) return null;
  const kept = glyphs.filter((g) => g.y1 - g.y0 + 1 >= tallest * 0.7);
  if (kept.length === 0) return null;
  const pad = 12;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale + pad * 2;
  canvas.height = h * scale + pad * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (const g of kept) {
    for (let x = g.x0; x <= g.x1; x++) {
      for (let y = 0; y < h; y++) if (on[y * w + x]) ctx.fillRect(pad + x * scale, pad + y * scale, scale, scale);
    }
  }
  return canvas.toDataURL('image/png');
}

/**
 * Small light text on a box of any shade (the clock): dark-on-white grey levels from the box's own contrast (its
 * median is the background, its brightest pixels the text), scaled up smoothly. A fixed colour test lost most of the
 * 9 px anti-aliased digits, and all of them on the lighter box of a bright map area.
 */
function contrastImageForOcr(data: Uint8ClampedArray, w: number, h: number, scale: number): string | null {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  const sorted = Array.from(lum).sort((a, b) => a - b);
  const background = sorted[Math.floor(sorted.length / 2)];
  const text = sorted[Math.floor(sorted.length * 0.97)];
  if (text - background < 40) return null; // no text on the box
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const smallCtx = small.getContext('2d');
  if (!smallCtx) return null;
  const out = smallCtx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.min(1, Math.max(0, (lum[i] - background) / (text - background)));
    const grey = Math.round(255 * (1 - v));
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = grey;
    out.data[i * 4 + 3] = 255;
  }
  smallCtx.putImageData(out, 0, 0);
  const pad = 16;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale + pad * 2;
  canvas.height = h * scale + pad * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, pad, pad, w * scale, h * scale);
  return canvas.toDataURL('image/png');
}

/** "15:45", "1545" -> 945 s; "0:32" -> 32 s. */
export function parseClock(text: string): number | undefined {
  const digits = text.replace(/[^0-9]/g, '');
  if (digits.length < 3 || digits.length > 4) return undefined;
  const minutes = parseInt(digits.slice(0, -2), 10);
  const seconds = parseInt(digits.slice(-2), 10);
  return seconds < 60 && minutes <= 120 ? minutes * 60 + seconds : undefined;
}

/** "62", "219" (thousands of souls); the "k" and anything else is ignored. */
export function parseTeamSouls(text: string): number | undefined {
  const digits = text.replace(/[^0-9]/g, '');
  return digits.length >= 1 && digits.length <= 3 ? parseInt(digits, 10) : undefined;
}

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
// Measured over a whole game (2 s captures): padlocked slots median 0.72-0.77 but pale or hidden padlocks
// (shop, bright scenery, effects) fall lower; slots never padlocked stay <= 0.26 at any contrast. Contrast 8 and
// IoU 0.35 miss 5 % of the frames (16 % with the former 12 / 0.5), never more than ~6 s in a row.
const LOCK_CONTRAST = 8;
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
const LOCK_MIN_IOU = 0.35;
// A padlock seen in this slot during the last 10 s still counts while the slot holds no item: slots never
// re-lock during a game, and an inventory missing its padlock reads as "not full" (the "⇄ Vendre" hint vanished)
const LOCK_HOLD_MS = 10000;

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
      const isFg = lumAt(x, y) - sum / n > LOCK_CONTRAST;
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
// A slightly worse match is still accepted when it clearly beats the runner-up: on a real 2560x1440 capture,
// Spirit Resilience read 20.7 (2nd: 38.0) and Greater Expansion 27.3 (2nd: 44.1) and were left unknown.
const ITEM_MATCH_CLEAR_WINNER_MAX_MAE = 30;
const ITEM_MATCH_CLEAR_WINNER_MARGIN = 15;
// Tie-breaker in favour of the active build's items.
const BUILD_ITEM_MAE_BONUS = 2;

// Item on cooldown: a dark sweep covers the icon (mean luminance 31-48) but the coloured category corner stays.
// Measured over a whole game: such slots have a variance of 223-2131, an empty slot < 10, and the empty slots whose
// see-through background fakes a category corner are all brighter (>= 55).
const COOLDOWN_SLOT_MAX_LUM = 50;
const COOLDOWN_SLOT_MIN_VARIANCE = 200;
// Cooldown-tolerant match: each pixel may match the icon or the icon darkened by the sweep. Only used to confirm
// the item last recognized in that slot (never to guess one): over a whole game it was then the best candidate in
// 619/626 cooldown frames, with an error of 5-15, while empty slots reach 17 against random items.
const COOLDOWN_DARKENING = 0.35;
const COOLDOWN_MATCH_MAX_ERROR = 20;

// Item at the very start of its cooldown: the whole card is darkened, category corner included (vitality corner
// (31,48,14) instead of (113,167,34)), so no category is found. Accepted only for a slot whose item is known, as a
// dark textured card with a dimmed corner of that item's category hue. Replay of a whole game: late-game frames of a
// full inventory read as "not full" 9 -> 2 / 168, and only slots really holding that item were concerned.
const DARK_CARD_MAX_LUM = 55;
const DARK_CARD_MIN_VARIANCE = 150;
const DARK_CORNER_MAX_LUM = 90;
const DARK_CORNER_MAX_CHROMA_DISTANCE = 0.1;
// Chromaticity (r, g, b shares) of the bright category corners
const CATEGORY_CORNER_CHROMA: Record<ItemCategory, [number, number, number]> = {
  weapon: [0.55, 0.36, 0.09],
  vitality: [0.36, 0.53, 0.11],
  spirit: [0.34, 0.24, 0.42],
};

function isDimCategoryCorner(r: number, g: number, b: number, category: ItemCategory): boolean {
  const sum = r + g + b;
  if (sum <= 0 || 0.299 * r + 0.587 * g + 0.114 * b > DARK_CORNER_MAX_LUM) return false;
  const [cr, cg, cb] = CATEGORY_CORNER_CHROMA[category];
  return Math.hypot(r / sum - cr, g / sum - cg, b / sum - cb) <= DARK_CORNER_MAX_CHROMA_DISTANCE;
}

// An empty slot is uniform (variance < 10; a cooldown card is > 150): seen like that 6 scans in a row (~2 s), the
// slot forgets its item (sold)
const EMPTY_SLOT_MAX_VARIANCE = 50;
const EMPTY_SCANS_TO_FORGET = 6;

// Per inventory slot (row * 6 + col): last item recognized with certainty, when a padlock was last seen, and how
// many scans in a row it has looked empty
const slotLastItem: (string | null)[] = new Array(12).fill(null);
const slotLastLockSeen: number[] = new Array(12).fill(-Infinity);
const slotEmptyStreak: number[] = new Array(12).fill(0);

// Shop (B) open: the top bar disappears and the bottom-left HUD moves up. Measured on real 1920x1080
// captures: inventory rows at y = 906 / 968 instead of 946 / 1008, souls digits at y = 842..876 instead of
// 892..926 (same x for both).
const SHOP_INVENTORY_DY = -40;
const SHOP_SOULS_DY = -50;

/** Souls digits (mint-cyan) of the souls counter. */
const isSoulsDigitPixel = (r: number, g: number, b: number) => g > 200 && b > 165 && r < 205 && g - r > 20;
const MIN_SOULS_DIGIT_PIXELS = 18;

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

/** Mean RGB error of a 20x20 slot against a template, each pixel matching either the icon or the icon darkened by a cooldown sweep. */
function cooldownTolerantError(tData: Uint8ClampedArray, mData: Uint8ClampedArray): number {
  let diff = 0;
  let cnt = 0;
  for (let py = 2; py < 18; py++) {
    for (let px = 2; px < 18; px++) {
      if (px >= 10 && py <= 10 && px - 9 >= py) continue;
      const idx = (py * 20 + px) * 4;
      let lit = 0;
      let dark = 0;
      for (let c = 0; c < 3; c++) {
        lit += Math.abs(tData[idx + c] - mData[idx + c]);
        dark += Math.abs(tData[idx + c] * COOLDOWN_DARKENING - mData[idx + c]);
      }
      diff += Math.min(lit, dark) / 3;
      cnt++;
    }
  }
  return diff / cnt;
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
      // Icons of items added after this release come from the repository (src/data/dataSource.ts): without
      // CORS their pixels could not be read
      if (/^https?:/.test(src)) img.crossOrigin = 'anonymous';
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

/**
 * Forgets what the scanner remembers between frames (last item of each slot, padlocks seen, souls read):
 * used by the replay harness (scripts/vision-replay.cjs) to analyse unrelated frames independently.
 */
export function resetScannerState(): void {
  slotLastItem.fill(null);
  slotLastLockSeen.fill(-Infinity);
  slotEmptyStreak.fill(0);
  lastMintPixels = -1;
  lastMintXSum = -1;
  cachedDetectedSouls = undefined;
  lastTopBarOcrAt = -Infinity;
  cachedTopBar = undefined;
  lastProvenLayout = null;
}

/** Resolves once the background OCR (souls, top bar) is done (replay harness: the next scan of the frame reads it). */
export async function waitForOcrIdle(timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while ((isOcrBusy || isTopBarOcrBusy) && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// Reusable tiny scratch canvases to avoid DOM allocation overhead on 350ms fast loop
let sharedFullCanvas: HTMLCanvasElement | null = null;
let shared20x20Canvas: HTMLCanvasElement | null = null;
let shared20x27Canvas: HTMLCanvasElement | null = null;
// sharedFullCanvas holds the last analysed frame (false while analysing, or when the frame was too small)
let normalizedFrameReady = false;

/**
 * The last analysed frame, normalized to 1920x1080 like every coordinate of the scanner (game log crops), or null
 * when that frame was not analysed. Valid until the next analysis.
 */
export function getLastNormalizedFrame(): HTMLCanvasElement | null {
  return normalizedFrameReady ? sharedFullCanvas : null;
}

/**
 * How the game's HUD inside a captured frame of size (rawW x rawH) maps onto our 1920x1080 reference canvas.
 * Covers 16:9 at any resolution (720p, 1080p, 2K 2560x1440, 4K 3840x2160), Ultrawide 21:9 / 32:9 (2560x1080,
 * 3440x1440, 5120x1440), 16:10 / 4:3 (2560x1600, 1920x1200, 1440x1080 — native Panorama, letterboxed or
 * stretched), and Windowed mode with a Windows title bar and borders (e.g. 1936x1119, 2576x1487).
 */
interface HudLayout {
  name: string;
  rawW: number;
  rawH: number;
  vx: number;
  vy: number;
  vw: number;
  vh: number;
  scaleX: number;
  scaleY: number;
  leftHudOffsetX: number;
}

let lastProvenLayout: HudLayout | null = null;

function buildHudCandidates(rawW: number, rawH: number): HudLayout[] {
  const ratio = rawW / rawH;
  const aspect16x9 = 16 / 9;
  const list: HudLayout[] = [];
  const add = (
    name: string,
    vx: number,
    vy: number,
    vw: number,
    vh: number,
    scaleX: number,
    scaleY: number,
    leftHudOffsetX = 0
  ) => {
    if (vw < 320 || vh < 240 || scaleX <= 0 || scaleY <= 0) return;
    list.push({ name, rawW, rawH, vx, vy, vw, vh, scaleX, scaleY, leftHudOffsetX });
  };

  if (Math.abs(ratio - aspect16x9) <= 0.02) {
    // Standard 16:9 (1280x720, 1600x900, 1920x1080, 2560x1440 2K, 3840x2160 4K)
    add('16:9', 0, 0, rawW, rawH, rawW / 1920, rawH / 1080);
  } else if (ratio > aspect16x9) {
    // Ultrawide (21:9 2560x1080, 3440x1440 2K, 32:9 5120x1440) or maximized window above taskbar
    const s = rawH / 1080;
    add('ultrawide', 0, 0, rawW, rawH, s, s, 0);
    const safeOffset = Math.max(0, Math.round((rawW - 1920 * s) / 2));
    if (safeOffset > 8) {
      add('ultrawide-safe', 0, 0, rawW, rawH, s, s, safeOffset);
    }
    add('stretched', 0, 0, rawW, rawH, rawW / 1920, rawH / 1080);
  } else {
    // Narrower than 16:9: 16:10 (2560x1600 2K, 1920x1200), 4:3 (1440x1080), or 16:9 window with title bar / borders.
    // Standard 16:9 widths (1280, 1600, 1920, 2560, 3840) are all multiples of 64, so (rawW % 64) / 2 gives the exact Win32 border.
    const exactBorder = rawW % 64 !== 0 && (rawW % 64) % 2 === 0 && rawW % 64 <= 40 ? (rawW % 64) / 2 : null;
    const borderCandidates = exactBorder !== null ? [exactBorder] : [8, 0];
    for (const b of borderCandidates) {
      const vw = rawW - 2 * b;
      const vh = Math.round((vw * 9) / 16);
      const vy = rawH - b - vh;
      if (vy >= 18 && vy <= Math.round((64 * rawH) / 1080)) {
        add(`windowed-16:9-b${b}`, b, vy, vw, vh, vw / 1920, vh / 1080);
      }
    }
    const sw = rawW / 1920;
    add('narrow-native', 0, 0, rawW, rawH, sw, sw);
    const letterH = Math.round((rawW * 9) / 16);
    const letterY = Math.round((rawH - letterH) / 2);
    if (letterY >= 8) {
      add('letterbox-16:9', 0, letterY, rawW, letterH, sw, letterH / 1080);
    }
    add('stretched', 0, 0, rawW, rawH, rawW / 1920, rawH / 1080);
  }
  // Every frame of at least 400x300 (smaller ones are not analysed) keeps its full-frame candidate
  if (list.length === 0) add('stretched', 0, 0, rawW, rawH, rawW / 1920, rawH / 1080);

  if (lastProvenLayout && lastProvenLayout.rawW === rawW && lastProvenLayout.rawH === rawH) {
    const idx = list.findIndex((c) => c.name === lastProvenLayout!.name);
    if (idx > 0) {
      const [proven] = list.splice(idx, 1);
      list.unshift(proven);
    }
  }
  return list;
}

function drawTopBarZone(img: HTMLImageElement | ImageBitmap, ctx: CanvasRenderingContext2D, l: HudLayout): void {
  const srcX = l.vx + l.vw / 2 - 960 * l.scaleX;
  const srcY = l.vy;
  const srcW = 1920 * l.scaleX;
  const srcH = 160 * l.scaleY;
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, 1920, 160);
}

function drawHudLayout(img: HTMLImageElement | ImageBitmap, ctx: CanvasRenderingContext2D, l: HudLayout): void {
  if (
    l.vx === 0 &&
    l.vy === 0 &&
    l.vw === l.rawW &&
    l.vh === l.rawH &&
    Math.abs(l.vw - 1920 * l.scaleX) <= 1 &&
    Math.abs(l.vh - 1080 * l.scaleY) <= 1 &&
    l.leftHudOffsetX === 0
  ) {
    if (l.rawW === 1920 && l.rawH === 1080) {
      ctx.drawImage(img, 0, 0);
    } else {
      ctx.drawImage(img, 0, 0, l.rawW, l.rawH, 0, 0, 1920, 1080);
    }
    return;
  }
  // Base viewport fill, then exact Panorama UI placement for the 3 HUD zones (top bar, bottom-left, bottom-center)
  ctx.drawImage(img, l.vx, l.vy, l.vw, l.vh, 0, 0, 1920, 1080);
  drawTopBarZone(img, ctx, l);
  ctx.drawImage(
    img,
    l.vx + l.leftHudOffsetX,
    l.vy + l.vh - 280 * l.scaleY,
    520 * l.scaleX,
    280 * l.scaleY,
    0,
    800,
    520,
    280
  );
  ctx.drawImage(
    img,
    l.vx + l.vw / 2 + (520 - 960) * l.scaleX,
    l.vy + l.vh - 280 * l.scaleY,
    1400 * l.scaleX,
    280 * l.scaleY,
    520,
    800,
    1400,
    280
  );
}

function checkTopBarOn1080pCanvas(ctx: CanvasRenderingContext2D): { visible: boolean; amber: boolean } {
  try {
    const leftBarData = ctx.getImageData(855, 44, 50, 24).data;
    const rightBarData = ctx.getImageData(1015, 44, 50, 24).data;
    const sapphireLayout =
      colorRatio(leftBarData, isSapphireBlue, 16) >= 0.35 && colorRatio(rightBarData, isAmberGold, 16) >= 0.35;
    const amberLayout =
      colorRatio(leftBarData, isAmberGold, 16) >= 0.35 && colorRatio(rightBarData, isSapphireBlue, 16) >= 0.35;
    return { visible: sapphireLayout || amberLayout, amber: amberLayout };
  } catch {
    return { visible: false, amber: false };
  }
}

function countSoulsMintPixelsOn1080pCanvas(ctx: CanvasRenderingContext2D, dy: number): number {
  const data = ctx.getImageData(110, 892 + dy, 98, 32).data;
  let mintPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (isSoulsDigitPixel(data[i], data[i + 1], data[i + 2])) mintPixels++;
  }
  return mintPixels;
}

/**
 * Projects any captured game frame onto a 1920x1080 canvas so the scanner works identically on 1080p, 2K
 * (2560x1440 / 2560x1600 / 3440x1440), 4K, 720p, 16:10, 21:9, 32:9, 4:3, and windowed mode.
 */
function drawNormalizedFrame(
  img: HTMLImageElement | ImageBitmap,
  ctx: CanvasRenderingContext2D
): { layout: HudLayout; topBarVisible: boolean; isMyTeamAmber: boolean } {
  const candidates = buildHudCandidates(img.width, img.height);
  const primary = candidates[0];

  // Fast check on the primary layout
  drawHudLayout(img, ctx, primary);
  let topBar = checkTopBarOn1080pCanvas(ctx);
  // 16:9 (the usual case): a single layout, nothing else to try
  if (candidates.length === 1) return { layout: primary, topBarVisible: topBar.visible, isMyTeamAmber: topBar.amber };
  if (topBar.visible) {
    // On ultrawide, check if the bottom-left HUD is shifted to the 16:9 safe zone instead of the left edge
    if (primary.name === 'ultrawide') {
      const safe = candidates.find((c) => c.name === 'ultrawide-safe');
      if (safe && countSoulsMintPixelsOn1080pCanvas(ctx, 0) < MIN_SOULS_DIGIT_PIXELS) {
        drawHudLayout(img, ctx, safe);
        if (countSoulsMintPixelsOn1080pCanvas(ctx, 0) >= MIN_SOULS_DIGIT_PIXELS) {
          lastProvenLayout = safe;
          return { layout: safe, topBarVisible: true, isMyTeamAmber: topBar.amber };
        }
        drawHudLayout(img, ctx, primary);
      }
    }
    lastProvenLayout = primary;
    return { layout: primary, topBarVisible: true, isMyTeamAmber: topBar.amber };
  }

  // Test alternative layouts (16:10 letterbox/stretched, windowed title bar) to see if the top bar sits there
  for (let i = 1; i < candidates.length; i++) {
    const cand = candidates[i];
    drawTopBarZone(img, ctx, cand);
    topBar = checkTopBarOn1080pCanvas(ctx);
    if (topBar.visible) {
      drawHudLayout(img, ctx, cand);
      lastProvenLayout = cand;
      return { layout: cand, topBarVisible: true, isMyTeamAmber: topBar.amber };
    }
  }

  // Top bar hidden (Shop open or menus): test if an alternative layout has the Shop / HUD souls digits
  drawHudLayout(img, ctx, primary);
  if (
    countSoulsMintPixelsOn1080pCanvas(ctx, 0) < MIN_SOULS_DIGIT_PIXELS &&
    countSoulsMintPixelsOn1080pCanvas(ctx, SHOP_SOULS_DY) < MIN_SOULS_DIGIT_PIXELS
  ) {
    for (let i = 1; i < candidates.length; i++) {
      const cand = candidates[i];
      drawHudLayout(img, ctx, cand);
      if (
        countSoulsMintPixelsOn1080pCanvas(ctx, 0) >= MIN_SOULS_DIGIT_PIXELS ||
        countSoulsMintPixelsOn1080pCanvas(ctx, SHOP_SOULS_DY) >= MIN_SOULS_DIGIT_PIXELS
      ) {
        lastProvenLayout = cand;
        return { layout: cand, topBarVisible: false, isMyTeamAmber: false };
      }
    }
    drawHudLayout(img, ctx, primary);
  }

  return { layout: primary, topBarVisible: false, isMyTeamAmber: false };
}

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
      normalizedFrameReady = false;
      const rawW = img.width;
      const rawH = img.height;

      if (rawW < 400 || rawH < 300) {
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

      // All HUD analysis runs on the normalized 1920x1080 canvas so every threshold, mask and OCR box stays exact
      const w = 1920;
      const h = 1080;
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

      if (!shared20x20Canvas) {
        shared20x20Canvas = document.createElement('canvas');
        shared20x20Canvas.width = 20;
        shared20x20Canvas.height = 20;
      }
      const abCtx = shared20x20Canvas.getContext('2d', { willReadFrequently: true });

      // 0. NORMALIZE ANY SCREEN SIZE / ASPECT RATIO TO 1920x1080 & VERIFY IF TOP TEAM BARS ARE VISIBLE
      const normalized = drawNormalizedFrame(img, fullCtx);
      normalizedFrameReady = true;
      const isDeadlockTopBarVisible = normalized.topBarVisible;
      const isMyTeamAmber = normalized.isMyTeamAmber;
      if (rawW !== 1920 || rawH !== 1080) {
        debugLogs.push(`Format capturé : ${rawW}×${rawH} (${normalized.layout.name}) → normalisé 1920×1080`);
      }

      // 0B. SHOP (B) OPEN? The top bar is hidden and the souls digits (mint-cyan, x=110..208, y=892..924 in the HUD)
      // sit 50 px higher. Language-independent, and the inventory below them moves up by 40 px.
      const readSoulsRegion = (dy: number) => {
        const sx = Math.round((w * 110) / 1920);
        const sy = Math.round((h * (892 + dy)) / 1080);
        const sw = Math.max(1, Math.round((w * 98) / 1920));
        const sh = Math.max(1, Math.round((h * 32) / 1080));
        const data = fullCtx.getImageData(sx, sy, sw, sh).data;
        let mintPixels = 0;
        let mintXSum = 0;
        for (let py = 0; py < sh; py++) {
          for (let px = 0; px < sw; px++) {
            const idx = (py * sw + px) * 4;
            if (isSoulsDigitPixel(data[idx], data[idx + 1], data[idx + 2])) {
              mintPixels++;
              mintXSum += px;
            }
          }
        }
        return { data, sw, sh, mintPixels, mintXSum };
      };
      let soulsRegion = readSoulsRegion(0);
      let isShopOpen = false;
      if (!isDeadlockTopBarVisible && soulsRegion.mintPixels < MIN_SOULS_DIGIT_PIXELS) {
        const shopSoulsRegion = readSoulsRegion(SHOP_SOULS_DY);
        if (shopSoulsRegion.mintPixels >= MIN_SOULS_DIGIT_PIXELS) {
          isShopOpen = true;
          soulsRegion = shopSoulsRegion;
        }
      }
      const invDy = isShopOpen ? SHOP_INVENTORY_DY : 0;
      if (isShopOpen) debugLogs.push(`Boutique ouverte : inventaire lu ${-SHOP_INVENTORY_DY} px plus haut`);

      // 1. ULTRA-FAST OWNED INVENTORY ITEMS SCANNER (12 Bottom-Left Slots: 2 rows x 6 cols)
      // Runs on EVERY frame in < 3ms, also with the Shop 'B' open (the whole grid is then `invDy` higher)
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
      const slotReadings: InventorySlotReading[] = [];
      const buildItemSet = new Set<string>(buildItemIds);

      if (abCtx && itemTemplates.length > 0) {
        // Whole inventory area once, for the padlock test of the empty-looking slots
        const scaleX = w / 1920;
        const scaleY = h / 1080;
        const invX0 = Math.round(10 * scaleX);
        const invY0 = Math.round((930 + invDy) * scaleY);
        const invW = Math.min(w - invX0, Math.round(400 * scaleX));
        const invH = h - invY0;
        const invData = fullCtx.getImageData(invX0, invY0, invW, invH).data;
        const scanTime = performance.now();
        // Slot without item: padlocked if a padlock is seen now or was seen there during the last LOCK_HOLD_MS.
        // Seen uniformly empty for a while, it forgets its last item (sold).
        const readEmptySlot = (row: number, col: number, slotIndex: number, variance: number) => {
          const slot = `${row + 1}.${col + 1}`;
          // Only on a real game screen: during the shop's fade-out the grid is read at the wrong height and every
          // slot looks empty, which made a slot forget its item on cooldown
          if (!isDeadlockTopBarVisible && !isShopOpen) {
            slotEmptyStreak[slotIndex] = 0;
          } else if (variance < EMPTY_SLOT_MAX_VARIANCE) {
            slotEmptyStreak[slotIndex]++;
            if (slotEmptyStreak[slotIndex] >= EMPTY_SCANS_TO_FORGET) slotLastItem[slotIndex] = null;
          } else {
            slotEmptyStreak[slotIndex] = 0;
          }
          if (isLockedSlot(invData, invW, invX0, invY0, 26 + col * 62, 944 + invDy + row * 62, scaleX, scaleY)) {
            slotLastLockSeen[slotIndex] = scanTime;
          }
          if (scanTime - slotLastLockSeen[slotIndex] < LOCK_HOLD_MS) {
            lockedSlotsCount++;
            slotReadings.push({ slot, state: 'locked' });
          } else {
            slotReadings.push({ slot, state: 'empty' });
          }
        };

        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 6; col++) {
            const slotIndex = row * 6 + col;
            const ix = Math.round((w * (26 + col * 62)) / 1920);
            const iy = Math.round((h * (944 + invDy + row * 62)) / 1080);
            const isz = Math.round((w * 52) / 1920);

            abCtx.clearRect(0, 0, 20, 20);
            abCtx.drawImage(sharedFullCanvas, ix, iy, isz, isz, 0, 0, 20, 20);
            const sData = abCtx.getImageData(0, 0, 20, 20).data;

            // Step 1A: Detect Top-Right Category Corner Triangle (Orange=Weapon, Green=Vitality, Purple=Spirit)
            const slot = `${row + 1}.${col + 1}`;
            let trR = 0,
              trG = 0,
              trB = 0,
              trN = 0;
            // All corner pixels, numerals included: hue of a corner dimmed by the start of a cooldown
            let cornerR = 0,
              cornerG = 0,
              cornerB = 0,
              cornerN = 0;
            for (let py = 1; py <= 6; py++) {
              for (let px = 13; px <= 18; px++) {
                if (px - 12 >= py) {
                  const idx = (py * 20 + px) * 4;
                  const r = sData[idx];
                  const g = sData[idx + 1];
                  const b = sData[idx + 2];
                  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                  cornerR += r;
                  cornerG += g;
                  cornerB += b;
                  cornerN++;
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

            // Item at the very start of its cooldown: the whole card, category corner included, is darkened so no
            // category is found. Only for a slot whose item is known, with the dimmed corner of that item's category.
            const lastItem = slotLastItem[slotIndex];
            const lastCategory = lastItem ? ITEMS_DB[lastItem]?.category : undefined;
            if (
              !slotCat &&
              lastItem &&
              lastCategory &&
              meanLum <= DARK_CARD_MAX_LUM &&
              variance > DARK_CARD_MIN_VARIANCE &&
              isDimCategoryCorner(cornerR / cornerN, cornerG / cornerN, cornerB / cornerN, lastCategory)
            ) {
              totalOccupiedSlots++;
              occupiedCategoryCounts[lastCategory]++;
              matchedCategoryCounts[lastCategory]++;
              slotLastLockSeen[slotIndex] = -Infinity;
              slotEmptyStreak[slotIndex] = 0;
              if (!detectedOwnedItemIds.includes(lastItem)) detectedOwnedItemIds.push(lastItem);
              debugLogs.push(`Slot ${slot} [${lastCategory}] ⏳ ${lastItem} en recharge (carte assombrie)`);
              slotReadings.push({ slot, state: 'cooldown', category: lastCategory, itemId: lastItem });
              continue;
            }

            // Every real Deadlock item card (including dark icons like Healbane/Decay) has high contrast (variance > 600);
            // an item on cooldown is darker but keeps its category corner and some contrast
            const isItemCard = meanLum > 45 && variance > 600;
            const isCooldownCard = meanLum <= COOLDOWN_SLOT_MAX_LUM && variance > COOLDOWN_SLOT_MIN_VARIANCE;
            if (!slotCat || (!isItemCard && !isCooldownCard)) {
              readEmptySlot(row, col, slotIndex, variance);
              continue;
            }

            totalOccupiedSlots++;
            occupiedCategoryCounts[slotCat]++;
            slotLastLockSeen[slotIndex] = -Infinity;
            slotEmptyStreak[slotIndex] = 0;

            // Step 1C: Match against itemTemplates of the SAME category (Weapon/Vitality/Spirit).
            // The icon artwork sits 2px lower and is 54px wide inside the 52px slot box used above
            // (calibrated on a real 1920x1080 capture: average error of correct matches 30 -> 9).
            const mx = Math.round((w * (26 + col * 62)) / 1920);
            const my = Math.round((h * (946 + invDy + row * 62)) / 1080);
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

            const accepted =
              bestItem !== null &&
              (bestEffectiveMAE <= ITEM_MATCH_MAX_MAE ||
                (bestEffectiveMAE <= ITEM_MATCH_CLEAR_WINNER_MAX_MAE &&
                  secondEffectiveMAE - bestEffectiveMAE >= ITEM_MATCH_CLEAR_WINNER_MARGIN));
            let recognizedItem: string | null = accepted ? bestItem : null;
            let cooldownError: number | undefined;
            if (accepted) {
              slotLastItem[slotIndex] = bestItem;
            } else {
              // Item on cooldown: confirm the item last recognized in this slot, if it is still the best candidate
              // once the dark sweep is tolerated
              if (lastItem && lastCategory === slotCat) {
                let bestTolerantItem: string | null = null;
                let bestTolerantError = Infinity;
                for (const tpl of itemTemplates) {
                  if (tpl.category !== slotCat) continue;
                  const error = cooldownTolerantError(tpl.rgba, mData);
                  if (error < bestTolerantError) {
                    bestTolerantError = error;
                    bestTolerantItem = tpl.itemId;
                  }
                }
                if (bestTolerantItem === lastItem && bestTolerantError <= COOLDOWN_MATCH_MAX_ERROR) {
                  recognizedItem = lastItem;
                  cooldownError = bestTolerantError;
                }
              }
            }

            debugLogs.push(
              `Slot ${slot} [${slotCat}] ${accepted ? '✓' : cooldownError !== undefined ? '⏳' : '✗'} ${
                cooldownError !== undefined ? `${recognizedItem} en recharge (${cooldownError.toFixed(1)}) • brut : ` : ''
              }${bestItem} (${bestEffectiveMAE.toFixed(1)}) • 2e : ${secondItem} (${secondEffectiveMAE.toFixed(1)})`
            );
            slotReadings.push({
              slot,
              state: accepted ? 'item' : cooldownError !== undefined ? 'cooldown' : 'unknown',
              category: slotCat,
              itemId: recognizedItem ?? bestItem ?? undefined,
              error: cooldownError ?? bestEffectiveMAE,
              secondId: secondItem ?? undefined,
              secondError: secondEffectiveMAE,
            });
            if (recognizedItem) {
              if (!detectedOwnedItemIds.includes(recognizedItem)) detectedOwnedItemIds.push(recognizedItem);
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

      // 2. NON-BLOCKING SOULS COUNTER SCANNER (region found in step 0B: HUD or shop position)
      // Only invokes Tesseract OCR in the background when the mint-cyan pixel fingerprint actually changes!
      try {
        const { data: rawSouls, sw, sh, mintPixels, mintXSum } = soulsRegion;

        if (mintPixels >= MIN_SOULS_DIGIT_PIXELS) {
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
                  if (isSoulsDigitPixel(rawSouls[idx], rawSouls[idx + 1], rawSouls[idx + 2])) {
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
      // Portraits under a respawn timer (dead hero): read, but not trusted for the lineups
      const allyDead: boolean[] = new Array(6).fill(false);
      const enemyDead: boolean[] = new Array(6).fill(false);
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

        const isRespawning = (baseX1920: number) => {
          const data = fullCtx.getImageData(
            Math.round((w * (baseX1920 + 5)) / 1920),
            Math.round((h * 45) / 1080),
            Math.max(1, Math.round((w * 61) / 1920)),
            Math.max(1, Math.round((h * 31) / 1080))
          ).data;
          let n = 0;
          for (let i = 0; i < data.length; i += 4) if (isRespawnDigitPixel(data, i)) n++;
          return n >= RESPAWN_DIGIT_MIN_PIXELS * (w / 1920) * (h / 1080);
        };
        for (let i = 0; i < 6; i++) {
          allyDead[i] = isRespawning(339 + i * 88);
          enemyDead[i] = isRespawning(1071 + i * 88);
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

        // The local player's own portrait sits on a team-colour box (amber or blue) slightly wider than its slot
        // (x0-3 .. x0+72), coloured at y = 4..24 above and beside the portrait; teammates' egg-shaped portraits show
        // the map there. The hero art is clipped to the 70 px slot, so the 3 px strips just outside it keep the team
        // colour whatever covers the corners. The former test (12x30 top corners of the slot) read ~0.35 on Rat
        // King's crown and ears, ~0.5 on Infernus' flame: it never found Rat King, and the hero then came from the
        // ability icons (Pocket / Paradox, flipping every few seconds).
        // Scenery in the team colour (blue sky, orange wall) colours the strips of every slot, but also the gap
        // between two portraits: at least one side must show a clean edge. Measured on 57 own-slot and 285 teammate
        // samples (5 games, both teams, Infernus, Vindicta, Rat King): own strips 0.75-1.00, teammates <= 0.52 out of
        // team-coloured scenery; own slot found in 44 frames instead of 28, never a wrong one. The rest have no
        // team-coloured box (critical HP: red banner, hit flash: pale) or a blue sky behind every portrait.
        // Only my team's colour (left score box) counts. The Sapphire banner is darker than the score box
        // (~(78,115,182) vs (100,135,197)), and a teammate's turquoise glow (34,198,181) is not banner blue.
        const highlightedSlots: number[] = [];
        const isTeamColor = isMyTeamAmber ? isAmberGold : isSapphireBanner;
        const teamShare = (x: number, width: number) =>
          colorRatio(fullCtx.getImageData(x, OWN_BOX_Y, width, OWN_BOX_H).data, isTeamColor);
        const currentHeroSlot = allyHeroesBySlot.indexOf(currentMyHeroId);
        const boxReadings: string[] = [];
        for (let i = 0; i < 6; i++) {
          const x0 = 339 + i * 88;
          const left = teamShare(x0 - 3, 3);
          const right = teamShare(x0 + 70, 3);
          if (left < OWN_BOX_STRIP_MIN && right < OWN_BOX_STRIP_MIN) continue;
          const cleanLeft = left >= OWN_BOX_STRIP_MIN && teamShare(x0 - 10, 5) <= OWN_BOX_GAP_MAX;
          const cleanRight = right >= OWN_BOX_STRIP_MIN && teamShare(x0 + 76, 5) <= OWN_BOX_GAP_MAX;
          const isOwnBox =
            (left >= OWN_BOX_STRIP_MIN && right >= OWN_BOX_STRIP_MIN && (cleanLeft || cleanRight)) ||
            (i === currentHeroSlot &&
              ((cleanLeft && left >= OWN_BOX_SINGLE_SIDE_MIN) || (cleanRight && right >= OWN_BOX_SINGLE_SIDE_MIN)));
          if (isOwnBox) highlightedSlots.push(i);
          boxReadings.push(`${i + 1}:${left.toFixed(2)}/${right.toFixed(2)}${cleanLeft || cleanRight ? '' : ' décor'}`);
        }
        if (boxReadings.length > 0) debugLogs.push(`Cadre du portrait surligné (bords g/d) : ${boxReadings.join(' ')}`);
        if (highlightedSlots.length === 1) {
          myAllySlotIdx = highlightedSlots[0];
        } else if (highlightedSlots.length > 1) {
          myAllySlotIdx = highlightedSlots.find((i) => allyHeroesBySlot[i] === currentMyHeroId) ?? -1;
        }
        if (highlightedSlots.length > 1) {
          debugLogs.push(`Portrait surligné ambigu (slots ${highlightedSlots.map((i) => i + 1).join(', ')})`);
        }

        debugLogs.push(
          `Portraits alliés : ${allyHeroesBySlot
            .map((id, i) => `${i + 1}:${id ?? '?'}${i === myAllySlotIdx ? '★' : ''}${allyDead[i] ? '✝' : ''}`)
            .join(' ')}`
        );
        debugLogs.push(
          `Portraits ennemis : ${enemyHeroesBySlot.map((id, i) => `${i + 1}:${id ?? '?'}${enemyDead[i] ? '✝' : ''}`).join(' ')}`
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
      let mySlotIndex = -1;

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
        mySlotIndex = mySlotIdx;

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

      // 4. NON-BLOCKING TOP BAR OCR: match clock and team souls, every few seconds while the top bar is visible
      const frameAllySlots = allyHeroesBySlot.map((id, i) => (allyDead[i] ? null : id));
      const frameEnemySlots = enemyHeroesBySlot.map((id, i) => (enemyDead[i] ? null : id));
      const frameAt = Date.now();
      if (isDeadlockTopBarVisible && !isTopBarOcrBusy && frameAt - lastTopBarOcrAt >= TOP_BAR_OCR_INTERVAL_MS) {
        try {
          const region = (box: { x: number; y: number; w: number; h: number }) => {
            const sw = Math.max(1, Math.round((w * box.w) / 1920));
            const sh = Math.max(1, Math.round((h * box.h) / 1080));
            const data = fullCtx.getImageData(Math.round((w * box.x) / 1920), Math.round((h * box.y) / 1080), sw, sh).data;
            return { data, sw, sh };
          };
          // The left box is my team's colour (amber: black digits; sapphire: white digits), the right one the other
          const leftText = isMyTeamAmber ? isDarkTextPixel : isWhiteTextPixel;
          const rightText = isMyTeamAmber ? isWhiteTextPixel : isDarkTextPixel;
          const clock = region(CLOCK_BOX);
          const left = region(LEFT_SOULS_BOX);
          const right = region(RIGHT_SOULS_BOX);
          const images = [
            contrastImageForOcr(clock.data, clock.sw, clock.sh, 4),
            textImageForOcr(left.data, left.sw, left.sh, leftText, 2),
            textImageForOcr(right.data, right.sw, right.sh, rightText, 2),
          ];
          lastTopBarOcrAt = frameAt;
          isTopBarOcrBusy = true;
          getTopBarOcrWorker()
            .then(async (worker) => {
              const read = async (image: string | null) => (image ? (await worker.recognize(image)).data.text || '' : '');
              const clockOcr = await read(images[0]);
              const leftOcr = await read(images[1]);
              const rightOcr = await read(images[2]);
              cachedTopBar = {
                clockS: parseClock(clockOcr),
                allySouls: parseTeamSouls(leftOcr),
                enemySouls: parseTeamSouls(rightOcr),
                at: frameAt,
                allySlots: frameAllySlots,
                enemySlots: frameEnemySlots,
              };
            })
            .catch(() => {})
            .finally(() => {
              isTopBarOcrBusy = false;
            });
        } catch {
          isTopBarOcrBusy = false;
        }
      }
      if (cachedTopBar) {
        const c = cachedTopBar;
        const clockText =
          c.clockS === undefined ? '?' : `${Math.floor(c.clockS / 60)}:${String(c.clockS % 60).padStart(2, '0')}`;
        debugLogs.push(
          `Barre du haut (il y a ${((frameAt - c.at) / 1000).toFixed(1)} s) : chrono ${clockText}, âmes ${c.allySouls ?? '?'}k / ${
            c.enemySouls ?? '?'
          }k`
        );
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
        shopOpen: isShopOpen,
        inventorySlots: slotReadings,
        highlightedHeroId,
        abilityHeroId: abilityDetectedHeroId,
        // Dead heroes (respawn timer over a grey portrait) count as unreadable for the lineup votes
        allySlots: isDeadlockTopBarVisible ? allyHeroesBySlot.map((id, i) => (allyDead[i] ? null : id)) : undefined,
        enemySlots: isDeadlockTopBarVisible ? enemyHeroesBySlot.map((id, i) => (enemyDead[i] ? null : id)) : undefined,
        allyDead: isDeadlockTopBarVisible ? [...allyDead] : undefined,
        enemyDead: isDeadlockTopBarVisible ? [...enemyDead] : undefined,
        topBar: cachedTopBar,
        mySlotIndex,
        frameWidth: rawW,
        frameHeight: rawH,
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

    const onError = () => {
      normalizedFrameReady = false;
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
    };

    // An exception must never leave the scan without a result: from img.onload it would leave this promise
    // pending forever, and the scan loop waits for it before the next scan
    const analyse = (img: HTMLImageElement | ImageBitmap) => {
      try {
        onFrame(img);
      } catch (err) {
        debugLogs.push(`Erreur d'analyse : ${err instanceof Error ? err.message : String(err)}`);
        onError();
      }
    };

    if (typeof frame !== 'string') {
      analyse(frame);
      return;
    }
    const img = new Image();
    img.onload = () => analyse(img);
    img.onerror = onError;
    img.src = frame;
  });
}
