/**
 * Captures of an HDR screen (Windows HDR on): the colours the scanner gets are not the game's.
 *
 * Measured with the app's own capture (window and screen, WGC disabled, Electron 33) of a real game frame shown on an
 * HDR display: every channel comes back as LINEAR light, 255 x sRGB-to-linear(value), instead of the sRGB value
 * (128 -> 55, 64 -> 13, 192 -> 134, 255 -> 255), at the lowest "SDR content brightness" (SDR white 80 nits). The
 * desktop is composed in scRGB, where 1.0 = 80 nits and SDR content is scaled by (SDR white / 80): above that setting
 * the capture is brighter and clipped ("too bright"). Either way the top bar was not seen (no hero, no lineups) and
 * no item was recognised. Electron does not report HDR (its display colour space stays 8-bit sRGB), so the gain is
 * read from the image itself: the two score boxes of the top bar have fixed colours.
 */

// Median colours of the score boxes (x 855..905 and 1015..1065, y 44..68), SDR: 12 frames of 3 games, 2 teams,
// within 3 levels (the death cam's darker amber box 16 off)
const BLUE_BOX = [80, 118, 194] as const;
const AMBER_BOX = [209, 135, 13] as const;
// Mean channel error of the chosen model: SDR frames 1-6, the real HDR capture 1
const FIT_MAX_ERROR = 20;
// A change of mode (SDR <-> HDR) needs this many readings in a row; the first reading after start decides at once
const SWITCH_READINGS = 3;
// The gain is the median of the last readings
const GAIN_WINDOW = 5;
const MIN_GAIN = 0.5;
const MAX_GAIN = 10;
// The gain in steps of 5 %: the templates seen through the capture are computed once per gain (scanner)
const GAIN_STEP = 1.05;
const quantizeGain = (gain: number): number =>
  Math.round(Math.pow(GAIN_STEP, Math.round(Math.log(gain) / Math.log(GAIN_STEP))) * 100) / 100;

export type ToneMap = { hdr: false } | { hdr: true; gain: number };

export const srgbToLinear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

export const linearToSrgb = (l: number): number => {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, c * 255));
};

/** What an HDR capture with this gain gives for an sRGB value (replay harness: simulates HDR on saved frames). */
export const hdrCaptureValue = (v: number, gain: number): number => Math.round(255 * Math.min(1, gain * srgbToLinear(v)));

const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function medianColor(d: Uint8ClampedArray): number[] {
  const channels: number[][] = [[], [], []];
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) channels[c].push(d[i + c]);
  return channels.map(median);
}

export interface ScoreBoxFit {
  hdr: boolean;
  gain: number;
  error: number;
}

/**
 * Which capture explains the colours of the two score boxes (RGBA pixels, either team on the left): SDR, or HDR with
 * which gain. Null when they are not the two team colours (shop, menus, end screen, wrong layout).
 */
export function fitScoreBoxes(left: Uint8ClampedArray, right: Uint8ClampedArray): ScoreBoxFit | null {
  const l = medianColor(left);
  const r = medianColor(right);
  const blueish = (c: number[]) => c[2] > c[0];
  if (blueish(l) === blueish(r)) return null;
  const [blue, amber] = blueish(l) ? [l, r] : [r, l];
  const seen = [...blue, ...amber];
  const sdr = [...BLUE_BOX, ...AMBER_BOX];
  const linear = sdr.map(srgbToLinear);

  const sdrError = seen.reduce((sum, v, i) => sum + Math.abs(v - sdr[i]), 0) / seen.length;

  // Every channel neither clipped nor too dark gives the gain (the amber box has almost no blue)
  const gains: number[] = [];
  seen.forEach((v, i) => {
    if (linear[i] > 0.05 && v >= 6 && v <= 250) gains.push(v / 255 / linear[i]);
  });
  let hdrError = Infinity;
  let gain = 1;
  if (gains.length > 0) {
    gain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, median(gains)));
    hdrError = seen.reduce((sum, v, i) => sum + Math.abs(v - 255 * Math.min(1, gain * linear[i])), 0) / seen.length;
  }

  const hdr = hdrError < sdrError;
  const error = hdr ? hdrError : sdrError;
  return error <= FIT_MAX_ERROR ? { hdr, gain, error } : null;
}

/** SDR or HDR (and its gain), from the score boxes of successive frames. */
export class HdrToneMapTracker {
  private map: ToneMap = { hdr: false };
  private decided = false;
  private gains: number[] = [];
  private pendingGains: number[] = [];

  get current(): ToneMap {
    return this.map;
  }

  /** Score boxes of a frame (RGBA, as captured): ignored unless they are the two team colours. */
  observe(left: Uint8ClampedArray, right: Uint8ClampedArray): void {
    const fit = fitScoreBoxes(left, right);
    if (!fit) return;
    if (!this.decided || fit.hdr === this.map.hdr) {
      this.decided = true;
      this.pendingGains = [];
      this.setMode(fit.hdr, fit.hdr ? [...this.gains, fit.gain].slice(-GAIN_WINDOW) : []);
      return;
    }
    // The other mode, read SWITCH_READINGS times in a row
    this.pendingGains.push(fit.gain);
    if (this.pendingGains.length >= SWITCH_READINGS) {
      this.setMode(fit.hdr, fit.hdr ? this.pendingGains.slice(-GAIN_WINDOW) : []);
      this.pendingGains = [];
    }
  }

  reset(): void {
    this.map = { hdr: false };
    this.decided = false;
    this.gains = [];
    this.pendingGains = [];
  }

  private setMode(hdr: boolean, gains: number[]): void {
    this.gains = gains;
    this.map = hdr ? { hdr: true, gain: quantizeGain(median(gains)) } : { hdr: false };
  }
}

// Clipped values: anything from sRGB(1 / gain) to 255 was captured as 255, and maps back to 255, as bright as it
// can be (the respawn timer's red is R > 220, the Sapphire score box B > 175: with 255 -> sRGB(1 / gain), 213 at
// gain 1.5 and 170 at 2.5, neither was seen). The last values before it ramp up to 255 (video noise near the clip).
const CLIP_RAMP_FROM = 248;

const lutCache = new Map<number, Uint8ClampedArray>();

/** Captured value -> sRGB value, for an HDR capture of this gain. */
export function toneMapLut(gain: number): Uint8ClampedArray {
  const key = Math.round(gain * 100);
  let lut = lutCache.get(key);
  if (!lut) {
    lut = new Uint8ClampedArray(256);
    const unclipped = (c: number) => linearToSrgb(Math.min(1, c / 255 / (key / 100)));
    const rampStart = unclipped(CLIP_RAMP_FROM);
    for (let c = 0; c < 256; c++) {
      lut[c] = Math.round(
        c < CLIP_RAMP_FROM
          ? unclipped(c)
          : rampStart + ((255 - rampStart) * (c - CLIP_RAMP_FROM)) / (255 - CLIP_RAMP_FROM)
      );
    }
    lutCache.set(key, lut);
  }
  return lut;
}

const roundTripCache = new Map<number, Uint8ClampedArray>();

/**
 * sRGB value -> what the scanner gets of it from an HDR capture of this gain once corrected. Above the clip the
 * capture lost the detail (from sRGB 170 up at gain 2.5): the templates (icons, portraits) go through the same
 * losses before being compared, or every bright icon was "unknown".
 */
export function roundTripLut(gain: number): Uint8ClampedArray {
  const key = Math.round(gain * 100);
  let lut = roundTripCache.get(key);
  if (!lut) {
    const back = toneMapLut(gain);
    lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = back[hdrCaptureValue(v, key / 100)];
    roundTripCache.set(key, lut);
  }
  return lut;
}

/** RGBA pixels as the scanner sees them through an HDR capture of this gain (new array). */
export function throughHdrCapture(d: Uint8ClampedArray, gain: number): Uint8ClampedArray {
  const lut = roundTripLut(gain);
  const out = new Uint8ClampedArray(d);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = lut[out[i]];
    out[i + 1] = lut[out[i + 1]];
    out[i + 2] = lut[out[i + 2]];
  }
  return out;
}

/** Turns RGBA pixels of an HDR capture back into the game's colours, in place. Nothing to do in SDR. */
export function undoToneMap(d: Uint8ClampedArray, map: ToneMap): void {
  if (!map.hdr) return;
  const lut = toneMapLut(map.gain);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }
}
