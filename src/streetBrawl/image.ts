// Pure pixel helpers for the Street Brawl readers (pick screen, inventory, hero, end screen). No DOM: the app passes
// canvas pixels in, the tests pass decoded PNGs, so the same code runs in both.

/** RGBA pixels, row by row, like ImageData. */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Rectangle in the 1920x1080 reference frame. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const REF_W = 1920;
export const REF_H = 1080;

/** Perceived brightness of a colour (Rec. 601 weights), 0-255. */
export const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Plain average of the three channels, 0-255: the brightness the pick screen's text thresholds were measured with. */
export const channelAverage = (r: number, g: number, b: number) => (r + g + b) / 3;

/** The pixel at (x, y) in reference coordinates (the frame may be any 16:9 size), as [R, G, B]. */
export function pixelAt(img: RgbaImage, x: number, y: number): [number, number, number] {
  const i = (Math.round(y * (img.height / REF_H)) * img.width + Math.round(x * (img.width / REF_W))) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

/** Share of the box's pixels (reference coordinates) for which `test(r, g, b)` holds, read at the frame's own size. */
export function pixelShare(img: RgbaImage, box: Box, test: (r: number, g: number, b: number) => boolean): number {
  const sx = img.width / REF_W;
  const sy = img.height / REF_H;
  const x0 = Math.max(0, Math.round(box.x * sx));
  const y0 = Math.max(0, Math.round(box.y * sy));
  const x1 = Math.min(img.width, Math.round((box.x + box.w) * sx));
  const y1 = Math.min(img.height, Math.round((box.y + box.h) * sy));
  let hits = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      if (test(img.data[i], img.data[i + 1], img.data[i + 2])) hits++;
      n++;
    }
  }
  return n > 0 ? hits / n : 0;
}

/** Share of the box's pixels brighter than `minLum` with little colour (the game's off-white titles). */
export const brightNeutralShare = (img: RgbaImage, box: Box, minLum = 180, maxChroma = 45) =>
  pixelShare(img, box, (r, g, b) => channelAverage(r, g, b) >= minLum && Math.max(r, g, b) - Math.min(r, g, b) <= maxChroma);

export const GRID = 24;

/** Which cells of a grid a comparison looks at (an overlay or a badge hides the others). */
export type GridMask = (gx: number, gy: number) => boolean;
/** Every cell. */
export const WHOLE_GRID: GridMask = () => true;

/**
 * The box of the frame (reference coordinates) reduced to GRID x GRID RGB cells by area averaging, the
 * representation the icon matching compares. Without a box, the whole image (an item icon file).
 */
export function toGrid(img: RgbaImage, box?: Box): Float32Array {
  const sx = box ? img.width / REF_W : 1;
  const sy = box ? img.height / REF_H : 1;
  const bx = box ? box.x * sx : 0;
  const by = box ? box.y * sy : 0;
  const bw = box ? box.w * sx : img.width;
  const bh = box ? box.h * sy : img.height;
  const out = new Float32Array(GRID * GRID * 3);
  const cw = bw / GRID;
  const ch = bh / GRID;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const x0 = bx + gx * cw;
      const y0 = by + gy * ch;
      let r = 0;
      let g = 0;
      let b = 0;
      let wSum = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y0 + ch); y++) {
        if (y < 0 || y >= img.height) continue;
        const wy = Math.min(y0 + ch, y + 1) - Math.max(y0, y);
        for (let x = Math.floor(x0); x < Math.ceil(x0 + cw); x++) {
          if (x < 0 || x >= img.width) continue;
          const w = wy * (Math.min(x0 + cw, x + 1) - Math.max(x0, x));
          const i = (y * img.width + x) * 4;
          // Transparent icon pixels count as black, like the dark card background behind them
          const a = img.data[i + 3] / 255;
          r += img.data[i] * a * w;
          g += img.data[i + 1] * a * w;
          b += img.data[i + 2] * a * w;
          wSum += w;
        }
      }
      const o = (gy * GRID + gx) * 3;
      out[o] = wSum > 0 ? r / wSum : 0;
      out[o + 1] = wSum > 0 ? g / wSum : 0;
      out[o + 2] = wSum > 0 ? b / wSum : 0;
    }
  }
  return out;
}

/**
 * Like toGrid, for a square of the frame turned by `angleDeg` around (cx, cy) (reference coordinates): the bonus
 * item of a card is shown on a small tag tilted to the left. Point sampling (4 x 4 per cell) is enough at this size.
 */
export function toGridRotated(img: RgbaImage, cx: number, cy: number, size: number, angleDeg: number): Float32Array {
  const sx = img.width / REF_W;
  const sy = img.height / REF_H;
  const cos = Math.cos((angleDeg * Math.PI) / 180);
  const sin = Math.sin((angleDeg * Math.PI) / 180);
  const out = new Float32Array(GRID * GRID * 3);
  const SUB = 4;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let j = 0; j < SUB; j++) {
        for (let i = 0; i < SUB; i++) {
          // Position inside the upright square, from -size/2 to size/2, turned into the frame
          const u = ((gx + (i + 0.5) / SUB) / GRID - 0.5) * size;
          const v = ((gy + (j + 0.5) / SUB) / GRID - 0.5) * size;
          const x = Math.round((cx + u * cos - v * sin) * sx);
          const y = Math.round((cy + u * sin + v * cos) * sy);
          if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
          const k = (y * img.width + x) * 4;
          r += img.data[k];
          g += img.data[k + 1];
          b += img.data[k + 2];
          n++;
        }
      }
      const o = (gy * GRID + gx) * 3;
      out[o] = n > 0 ? r / n : 0;
      out[o + 1] = n > 0 ? g / n : 0;
      out[o + 2] = n > 0 ? b / n : 0;
    }
  }
  return out;
}

/** The masked cells of one channel of a grid (0-2 = R, G, B; 3 = brightness). */
function channel(g: Float32Array, c: number, mask: GridMask): number[] {
  const out: number[] = [];
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      if (!mask(gx, gy)) continue;
      const o = (gy * GRID + gx) * 3;
      out.push(c === 3 ? luminance(g[o], g[o + 1], g[o + 2]) : g[o + c]);
    }
  }
  return out;
}

function correlation(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

/**
 * Shape distance of two grids, blind to colour: 1 - the best correlation between any channel of one (R, G, B or
 * brightness) and any channel of the other, over the masked cells (0 = same shading, 1 = unrelated).
 * Enhanced cards show the item's artwork recoloured in blue: Titanic Magazine's gold bullets turn teal, and the detail
 * moves from one channel to another. Brightness alone kept Spirit Rend at 0.31 (0.145 ahead of the runner-up);
 * the best channel pair reads it at 0.07 (0.28 ahead), and every card of the test frames at 0.074 or less.
 */
export function shapeDistance(a: Float32Array, b: Float32Array, mask: GridMask): number {
  const ca = [0, 1, 2, 3].map((c) => channel(a, c, mask));
  const cb = [0, 1, 2, 3].map((c) => channel(b, c, mask));
  let best = -1;
  for (const x of ca) for (const y of cb) best = Math.max(best, correlation(x, y));
  return 1 - best;
}

/**
 * The closest template to a grid by shape, and how far it and the runner-up are: a match is trusted when the best is
 * close and clearly ahead (each reader sets both limits).
 */
export function bestMatch<T extends { grid: Float32Array }>(
  grid: Float32Array,
  templates: T[],
  mask: GridMask
): { best: T | null; bestD: number; secondD: number } {
  let best: T | null = null;
  let bestD = Infinity;
  let secondD = Infinity;
  for (const t of templates) {
    const d = shapeDistance(t.grid, grid, mask);
    if (d < bestD) {
      secondD = bestD;
      bestD = d;
      best = t;
    } else if (d < secondD) secondD = d;
  }
  return { best, bestD, secondD };
}

/**
 * Mean absolute RGB difference of two grids over the cells where `mask` is true (cells hidden by the "RARE!" label
 * or the enhanced bolt are left out). Each cell is normalized by its grid's mean brightness first, so the dimmer
 * card behind the pick screen's blur does not count as a difference.
 */
export function gridError(a: Float32Array, b: Float32Array, mask: GridMask): number {
  let meanA = 0;
  let meanB = 0;
  let n = 0;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      if (!mask(gx, gy)) continue;
      const o = (gy * GRID + gx) * 3;
      meanA += a[o] + a[o + 1] + a[o + 2];
      meanB += b[o] + b[o + 1] + b[o + 2];
      n += 3;
    }
  }
  if (n === 0) return Infinity;
  meanA /= n;
  meanB /= n;
  const k = meanA > 1 && meanB > 1 ? meanB / meanA : 1;
  let diff = 0;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      if (!mask(gx, gy)) continue;
      const o = (gy * GRID + gx) * 3;
      for (let c = 0; c < 3; c++) diff += Math.abs(a[o + c] * k - b[o + c]);
    }
  }
  return diff / n;
}
