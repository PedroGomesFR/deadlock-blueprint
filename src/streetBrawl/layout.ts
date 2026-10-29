// Where things are on the Street Brawl screens (pick screen, HUD item slots and ability icons, end-of-game screen), in
// the 1920x1080 reference frame: any 16:9 capture is scaled to it. Measured on the 2560x1440 captures of
// tests/streetBrawl/frames. Other aspect ratios (16:10, ultrawide) are not handled yet.
import type { Box } from './image';

/** The "SELECT ITEMS" title, top left. */
export const TITLE_BOX: Box = { x: 72, y: 192, w: 475, h: 62 };

export type CardPosition = 'center' | 'left' | 'right';

/** Item icon of each offered card (the square artwork, without the ring). Order = top centre, bottom left, bottom right. */
export const CARD_ICON_BOXES: Record<CardPosition, Box> = {
  center: { x: 893, y: 327, w: 134, h: 134 },
  left: { x: 467, y: 573, w: 134, h: 134 },
  right: { x: 1318, y: 573, w: 134, h: 134 },
};

/** The teal "RARE!" label sits on the top edge of the icon. */
export const rareLabelBox = (icon: Box): Box => ({ x: icon.x + 10, y: icon.y - 30, w: 114, h: 36 });

/**
 * A card that gives a second item shows it on a "BONUS!" tag tilted to the left, at the top left of the card's icon
 * (offsets from the icon's centre). Seen on the top card only (Boundless Spirit + Recharging Rush, Sharpshooter +
 * Monster Rounds); the same offset is assumed for the other two.
 */
export const BONUS_TAG = { dx: -112, dy: -76, size: 88, angleDeg: -20 };
/** The white "BONUS!" label above the tag: ~0.16-0.22 of the box is white on bonus cards, 0 elsewhere. */
const BONUS_LABEL = { dx: -134, dy: -138, w: 80, h: 32 };
export const bonusLabelBox = (icon: Box): Box => ({
  x: icon.x + icon.w / 2 + BONUS_LABEL.dx,
  y: icon.y + icon.h / 2 + BONUS_LABEL.dy,
  w: BONUS_LABEL.w,
  h: BONUS_LABEL.h,
});

/** The "1 Re-Roll Remaining" / "0 Re-Rolls Remaining" line under the Re-Roll button. */
export const REROLL_LINE_BOX: Box = { x: 860, y: 764, w: 200, h: 28 };
/** The singular line ("1 Re-Roll Remaining") is ~155 px wide, the plural ("0 Re-Rolls Remaining") ~170 px. */
export const REROLL_PLURAL_MIN_WIDTH = 163;
/**
 * In the plural line, the digit's middle (from its left edge, 12 px tall glyph starting at y 772): hollow in "0", crossed
 * by the stroke in "2". Measured on "0" only: "2 Re-Rolls Remaining" (random hero) still needs a capture.
 */
export const REROLL_DIGIT_HOLE: Box = { x: 4, y: 775, w: 3, h: 6 };

/**
 * The digit of "CHOICE n OF 3" (magenta), sampled every pixel across and every 2 px down from (184, 290):
 * '#' = magenta. Measured on 8 captures, identical for the same digit.
 */
export const CHOICE_DIGIT_ORIGIN = { x: 184, y: 290, stepX: 1, stepY: 2 };
export const CHOICE_DIGIT_GLYPHS: Record<1 | 2 | 3, string[]> = {
  1: [
    '..........#.........',
    '.......####.........',
    '...########.........',
    '.......####.........',
    '.......####.........',
    '.......####.........',
    '.......####.........',
    '.......####.........',
    '.......####.........',
    '.......####.........',
    '.......#####........',
    '.......#####........',
    '....................',
    '....................',
  ],
  2: [
    '....#...............',
    '...#########........',
    '......##########....',
    '............####....',
    '............####....',
    '............####....',
    '..........####......',
    '.........####.......',
    '.......####.........',
    '....#####...........',
    '....###.............',
    '..##############....',
    '....................',
    '....................',
  ],
  3: [
    '....................',
    '....#########.......',
    '......##########....',
    '.............###....',
    '.............###....',
    '.........######.....',
    '........########....',
    '............#####...',
    '.............####...',
    '...#.........####...',
    '..#####......####...',
    '....###########.....',
    '.........##.........',
    '....................',
  ],
};

/**
 * The hero's 4 ability icons, bottom centre (centres, alternately lower and higher), shown on the pick screen too: they
 * tell the hero apart from any other, skins included (the top bar portraits change with skins: Nurse Harrow's matched
 * no stored portrait). Measured on 14 captures of 4 heroes; the icon fits a 44-52 px box.
 */
export const ABILITY_ICON_CENTRES: [number, number][] = [
  [824, 1020],
  [915, 1005],
  [1004, 1005],
  [1094, 1020],
];
export const ABILITY_ICON_SIZES = [44, 52];

/**
 * Item slots of the HUD (bottom left): 2 rows of 8, 52 px squares 61.5 px apart, fitted on the items of the test frames
 * (each read item's best shift). Not the normal mode's spots (visionScanner.ts): Street Brawl's sit 2-3 px lower and
 * slightly closer together. Active items are drawn as circles.
 */
export const INVENTORY_ROWS = 2;
export const INVENTORY_COLS = 8;
export const inventorySlotBox = (row: number, col: number): Box => ({
  x: 26 + col * 61.5,
  y: 946.5 + row * 61.5,
  w: 52,
  h: 52,
});

/**
 * The end-of-game screen (MVP, key players): its "STREET BRAWL" title at the top right (there from the start; the
 * match number under it is left out, it changes), the "PLAY AGAIN" button and the row of round icons at the bottom
 * (both a few seconds later). Reference crops in public/icons/streetBrawl/ui/<name>.png.
 */
export const END_SCREEN_BOXES = {
  title: { x: 1716, y: 22, w: 174, h: 26 },
  playAgain: { x: 836, y: 932, w: 250, h: 46 },
  roundIcons: { x: 784, y: 1018, w: 352, h: 38 },
} satisfies Record<string, Box>;

/** Every region the readers look at, with a margin: the test frames keep only these pixels (tests/streetBrawl). */
export function readRegions(margin = 24): Box[] {
  const grow = (b: Box): Box => ({ x: b.x - margin, y: b.y - margin, w: b.w + 2 * margin, h: b.h + 2 * margin });
  const icons = Object.values(CARD_ICON_BOXES);
  const bonusHalf = (BONUS_TAG.size * Math.SQRT2) / 2;
  return [
    TITLE_BOX,
    REROLL_LINE_BOX,
    ...Object.values(END_SCREEN_BOXES),
    { x: CHOICE_DIGIT_ORIGIN.x, y: CHOICE_DIGIT_ORIGIN.y, w: 20, h: 28 },
    ...ABILITY_ICON_CENTRES.map(([x, y]) => ({ x: x - 26, y: y - 26, w: 52, h: 52 })),
    ...Array.from({ length: INVENTORY_ROWS * INVENTORY_COLS }, (_, i) =>
      inventorySlotBox(Math.floor(i / INVENTORY_COLS), i % INVENTORY_COLS)
    ),
    ...icons,
    ...icons.map(rareLabelBox),
    ...icons.map(bonusLabelBox),
    ...icons.map((b) => ({
      x: b.x + b.w / 2 + BONUS_TAG.dx - bonusHalf,
      y: b.y + b.h / 2 + BONUS_TAG.dy - bonusHalf,
      w: 2 * bonusHalf,
      h: 2 * bonusHalf,
    })),
  ].map(grow);
}
