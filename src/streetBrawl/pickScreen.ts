// Reads the Street Brawl "SELECT ITEMS" screen: is it open, which items the cards offer (with their bonus item),
// which are rare or enhanced, and whether a re-roll is left. Pure: takes pixels, returns a reading.
import {
  GRID,
  REF_W,
  WHOLE_GRID,
  bestMatch,
  brightNeutralShare,
  channelAverage,
  gridError,
  pixelAt,
  pixelShare,
  toGrid,
  toGridRotated,
} from './image';
import type { GridMask, RgbaImage } from './image';
import { LEGENDARY_TIER } from './stats';
import {
  BONUS_TAG,
  CARD_ICON_BOXES,
  CHOICE_DIGIT_GLYPHS,
  CHOICE_DIGIT_ORIGIN,
  CardPosition,
  REROLL_DIGIT_HOLE,
  REROLL_LINE_BOX,
  REROLL_PLURAL_MIN_WIDTH,
  TITLE_BOX,
  bonusLabelBox,
  rareLabelBox,
} from './layout';

/** An item icon reduced to the matching grid (see templates.ts). */
export interface ItemTemplate {
  itemId: string;
  grid: Float32Array;
}

export interface CardReading {
  position: CardPosition;
  /** null when no item matches clearly (card hidden, animation, unknown artwork) */
  itemId: string | null;
  /** Shape distance of the best and second-best item (0 = identical shading), for the Diagnostics */
  distance: number;
  secondDistance: number;
  /** Artwork recoloured blue + "ENHANCED" banner: a stronger copy of the item */
  enhanced: boolean;
  /** Teal "RARE!" label over the icon */
  rare: boolean;
  /** The card gives a second item ("BONUS!" tag) */
  hasBonus: boolean;
  /** That second item, when recognised */
  bonusItemId: string | null;
}

export interface PickScreenReading {
  open: boolean;
  cards: CardReading[];
  /** Re-rolls left this round (1 per round, 2 with a random hero), null when unreadable */
  rerolls: 0 | 1 | 2 | null;
  /** n of "CHOICE n OF 3": each round has three picks, which share the round's re-rolls */
  choice: 1 | 2 | 3 | null;
}

/** Title pixels: ~0.43 on every pick screen, at most 0.11 in play or on the round-end screens. */
const TITLE_MIN_SHARE = 0.3;
/**
 * Icon match: the right items of the test frames scored 0.002-0.074 (enhanced ones included), at least 0.107 ahead of
 * the runner-up (Compress Cooldown, Grit second). A card whose item has no template scored 0.36, 0.006 ahead:
 * rejected, never misread.
 */
const ICON_MAX_DISTANCE = 0.2;
const ICON_MIN_MARGIN = 0.08;
/** Colour error of a right shape match: normal cards <= 6.9, enhanced (recoloured) 32.8-42.4. */
const ENHANCED_MIN_COLOUR_ERROR = 15;
/** "RARE!" label: ~0.19 of its box is teal on rare cards, 0 otherwise. */
const RARE_MIN_TEAL_SHARE = 0.08;
/** "BONUS!" label: 0.16-0.22 of its box is white on bonus cards, 0 on every other card of the test frames. */
const BONUS_LABEL_MIN_SHARE = 0.08;
/**
 * Bonus item, once the label says there is one: Recharging Rush scored 0.17 and Monster Rounds 0.12 (with Compress
 * Cooldown 0.08 behind: the tag is small, the label is what tells a bonus from none).
 */
const BONUS_MAX_DISTANCE = 0.3;

// The "RARE!" label covers the top rows of the icon and the enhanced bolt its bottom-right corner
const iconMask: GridMask = (gx, gy) => gy >= 5 && !(gx >= GRID - 5 && gy >= GRID - 5);

/** The "RARE!" label's teal. */
const isTeal = (r: number, g: number, b: number) => g > 170 && b > 130 && r < 170 && g - r > 40;

/** Brightness at a point (reference coordinates), on the scale the re-roll line's thresholds were measured with. */
const brightness = (img: RgbaImage, x: number, y: number) => channelAverage(...pixelAt(img, x, y));

/** The "CHOICE n" digit's magenta. */
const isChoiceMagenta = ([r, g, b]: [number, number, number]) => r > 170 && b > 140 && g < 130;

/**
 * Re-rolls left, from the line under the button: "1 Re-Roll Remaining" is narrower than the plural lines; in those,
 * the digit's middle is hollow in "0" and crossed by the stroke in "2". null when the line is not there.
 */
function readRerolls(img: RgbaImage): 0 | 1 | 2 | null {
  const sx = img.width / REF_W;
  const b = REROLL_LINE_BOX;
  const cols: number[] = [];
  for (let x = Math.round(b.x * sx); x < Math.round((b.x + b.w) * sx); x++) {
    let max = 0;
    for (let y = b.y; y < b.y + b.h; y++) max = Math.max(max, brightness(img, x / sx, y));
    cols.push(max);
  }
  // The text is ~70 levels brighter than the blurred background behind it
  const background = [...cols].sort((a, c) => a - c)[Math.floor(cols.length * 0.2)];
  const isText = cols.map((v) => v - background > 35);
  const first = isText.indexOf(true);
  if (first < 0) return null;
  const width = (isText.lastIndexOf(true) - first) / sx;
  if (width < REROLL_PLURAL_MIN_WIDTH) return 1;
  const left = b.x + first / sx;
  const h = REROLL_DIGIT_HOLE;
  let lit = 0;
  let n = 0;
  for (let y = h.y; y < h.y + h.h; y++) {
    for (let x = left + h.x; x < left + h.x + h.w; x++) {
      if (brightness(img, x, y) - background > 35) lit++;
      n++;
    }
  }
  return lit / n < 0.25 ? 0 : 2;
}

/** n of "CHOICE n OF 3", by the closest digit pattern; null when none is close (screen fading in or out). */
function readChoice(img: RgbaImage): 1 | 2 | 3 | null {
  const o = CHOICE_DIGIT_ORIGIN;
  const rows = CHOICE_DIGIT_GLYPHS[1].length;
  const cols = CHOICE_DIGIT_GLYPHS[1][0].length;
  const seen: boolean[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      seen.push(isChoiceMagenta(pixelAt(img, o.x + c * o.stepX, o.y + r * o.stepY)));
    }
  }
  let best: 1 | 2 | 3 | null = null;
  let bestMiss = Infinity;
  for (const digit of [1, 2, 3] as const) {
    const pattern = CHOICE_DIGIT_GLYPHS[digit].join('');
    let miss = 0;
    for (let k = 0; k < pattern.length; k++) if ((pattern[k] === '#') !== seen[k]) miss++;
    if (miss < bestMiss) {
      bestMiss = miss;
      best = digit;
    }
  }
  // The three patterns differ in 40+ of their 280 cells; a few pixels of shift cost ~15
  return bestMiss <= 25 ? best : null;
}

/** How much of the "SELECT ITEMS" title is there (0.43 on the pick screen; open from TITLE_MIN_SHARE), for the panel's diagnostics. */
export const titleShare = (img: RgbaImage) => brightNeutralShare(img, TITLE_BOX);

function isPickScreenOpen(img: RgbaImage): boolean {
  return titleShare(img) >= TITLE_MIN_SHARE;
}

/**
 * The tiers of a pick's normal cards: recognised, not rare (one tier up), not legendary (the rare tier of its pick,
 * labelled "LEGENDARY" rather than "RARE!"). The game offers one normal tier per pick, so they tell which tier the
 * pick is, and which rounds it can be in (roundTracker.possibleRounds).
 */
export function normalCardTiers(
  cards: { itemId: string | null; rare: boolean }[],
  tierOf: (itemId: string) => number | undefined
): number[] {
  return cards
    .filter((c) => c.itemId && !c.rare)
    .map((c): number | undefined => tierOf(c.itemId!))
    .filter((t): t is number => t !== undefined && t < LEGENDARY_TIER);
}

/** The tier the pick's normal cards share, undefined unless they agree. */
function pickNormalTier(
  cards: { itemId: string | null; rare: boolean }[],
  tierOf: (itemId: string) => number | undefined
): number | undefined {
  const tiers = new Set(normalCardTiers(cards, tierOf));
  return tiers.size === 1 ? [...tiers][0] : undefined;
}

/**
 * `tierOf`: the tier of an item, to settle a card the shape alone leaves too close to call (the blue recolouring of
 * an enhanced card flattens its artwork: enhanced Superior Cooldown 0.189, Arcane Surge 0.232 behind) among the items
 * of the tier the pick's other cards show.
 */
export function readPickScreen(
  img: RgbaImage,
  templates: ItemTemplate[],
  tierOf?: (itemId: string) => number | undefined
): PickScreenReading {
  if (!isPickScreenOpen(img)) return { open: false, cards: [], rerolls: null, choice: null };

  const entries = Object.entries(CARD_ICON_BOXES) as [CardPosition, (typeof CARD_ICON_BOXES)[CardPosition]][];
  const firstPass = entries.map(([, box]) => {
    const grid = toGrid(img, box);
    const match = bestMatch(grid, templates, iconMask);
    const accepted = match.best !== null && match.bestD <= ICON_MAX_DISTANCE && match.secondD - match.bestD >= ICON_MIN_MARGIN;
    return { grid, match, accepted, rare: pixelShare(img, rareLabelBox(box), isTeal) >= RARE_MIN_TEAL_SHARE };
  });
  const normalTier = tierOf
    ? pickNormalTier(
        firstPass.map((p) => ({ itemId: p.accepted ? p.match.best!.itemId : null, rare: p.rare })),
        tierOf
      )
    : undefined;

  const cards = entries.map(
    ([position, box], i): CardReading => {
      const { grid, rare } = firstPass[i];
      let { match, accepted } = firstPass[i];
      // Too close to call by shape: among the items of the tier this card must be (rare: one up), the same limits
      if (!accepted && normalTier !== undefined && tierOf && match.bestD <= ICON_MAX_DISTANCE) {
        const tier = rare ? normalTier + 1 : normalTier;
        const inTier = bestMatch(grid, templates.filter((t) => tierOf(t.itemId) === tier), iconMask);
        if (inTier.best && inTier.bestD <= ICON_MAX_DISTANCE && inTier.secondD - inTier.bestD >= ICON_MIN_MARGIN) {
          match = inTier;
          accepted = true;
        }
      }
      const { best, bestD, secondD } = match;
      const enhanced = accepted && gridError(best!.grid, grid, iconMask) >= ENHANCED_MIN_COLOUR_ERROR;

      // The "BONUS!" label says whether there is a bonus item; the tag's icon says which one
      const hasBonus = brightNeutralShare(img, bonusLabelBox(box), 200, 40) >= BONUS_LABEL_MIN_SHARE;
      let bonusItemId: string | null = null;
      if (hasBonus) {
        const tag = toGridRotated(
          img,
          box.x + box.w / 2 + BONUS_TAG.dx,
          box.y + box.h / 2 + BONUS_TAG.dy,
          BONUS_TAG.size,
          BONUS_TAG.angleDeg
        );
        const bonus = bestMatch(tag, templates, WHOLE_GRID);
        if (bonus.best && bonus.bestD <= BONUS_MAX_DISTANCE) bonusItemId = bonus.best.itemId;
      }

      return {
        position,
        itemId: accepted ? best!.itemId : null,
        distance: bestD,
        secondDistance: secondD,
        enhanced,
        rare,
        hasBonus,
        bonusItemId,
      };
    }
  );

  return { open: true, cards, rerolls: readRerolls(img), choice: readChoice(img) };
}

/**
 * The reading, with what something covers filled in from the previous scan of the same pick. Hovering a card opens
 * its tooltip over the centre card and the re-roll line: the centre card then reads as unknown (0.39 against 0.13 or
 * less for the others) and the re-rolls as null, and the advice fell apart while the player read the tooltip. Same
 * pick: the same choice number, and the same re-rolls when they can be read (a re-roll changes them, so new cards are
 * never mixed with old ones while the count shows). A card read now always wins over the remembered one.
 */
export function holdCoveredCards(previous: PickScreenReading | null, now: PickScreenReading): PickScreenReading {
  const samePick =
    previous?.open &&
    now.open &&
    now.choice !== null &&
    now.choice === previous.choice &&
    (now.rerolls === null || now.rerolls === previous.rerolls);
  if (!samePick) return now;
  return {
    ...now,
    rerolls: now.rerolls ?? previous!.rerolls,
    cards: now.cards.map((card) => {
      if (card.itemId !== null) return card;
      const before = previous!.cards.find((c) => c.position === card.position);
      return before?.itemId ? before : card;
    }),
  };
}
