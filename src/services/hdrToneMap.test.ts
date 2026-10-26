import { describe, expect, it } from 'vitest';
import {
  fitScoreBoxes,
  hdrCaptureValue,
  HdrToneMapTracker,
  roundTripLut,
  toneMapLut,
  undoToneMap,
} from './hdrToneMap';

// A score box (50x24 RGBA) of one colour
const box = ([r, g, b]: number[]) => {
  const d = new Uint8ClampedArray(50 * 24 * 4);
  for (let i = 0; i < d.length; i += 4) d.set([r, g, b, 255], i);
  return d;
};
const BLUE = [80, 118, 194];
const AMBER = [209, 135, 13];
const throughHdr = (c: number[], gain: number) => c.map((v) => hdrCaptureValue(v, gain));

describe('fitScoreBoxes', () => {
  it('reads an SDR capture as SDR, either team on the left', () => {
    expect(fitScoreBoxes(box(BLUE), box(AMBER))).toMatchObject({ hdr: false });
    expect(fitScoreBoxes(box(AMBER), box(BLUE))).toMatchObject({ hdr: false });
    // Measured spread of the medians, and the death cam's darker amber box
    expect(fitScoreBoxes(box([79, 117, 192]), box([193, 133, 23]))).toMatchObject({ hdr: false });
  });

  it('reads the real HDR capture (SDR white 80 nits) as gain 1', () => {
    // Medians of the score boxes of the capture of the 5:36 frame (tests/vision/frames/hdr_capture_*)
    const fit = fitScoreBoxes(box([20, 46, 137]), box([164, 63, 0]));
    expect(fit?.hdr).toBe(true);
    expect(fit?.gain).toBeCloseTo(1, 1);
  });

  it('finds brighter settings, the boxes partly clipped', () => {
    for (const gain of [1.5, 2.5, 4, 6]) {
      const fit = fitScoreBoxes(box(throughHdr(AMBER, gain)), box(throughHdr(BLUE, gain)));
      expect(fit?.hdr).toBe(true);
      expect(Math.abs(fit!.gain - gain) / gain).toBeLessThan(0.05);
    }
  });

  it('ignores frames without the two team colours', () => {
    // Shop open, end screen, both boxes of one colour (a wrong layout)
    expect(fitScoreBoxes(box([77, 68, 54]), box([75, 66, 52]))).toBeNull();
    expect(fitScoreBoxes(box([16, 32, 38]), box([16, 32, 38]))).toBeNull();
    expect(fitScoreBoxes(box([200, 40, 40]), box([40, 200, 220]))).toBeNull();
  });
});

describe('HdrToneMapTracker', () => {
  const sdr = [box(BLUE), box(AMBER)] as const;
  const hdr = (gain: number) => [box(throughHdr(BLUE, gain)), box(throughHdr(AMBER, gain))] as const;

  it('decides on the first reading after start', () => {
    const tracker = new HdrToneMapTracker();
    expect(tracker.current).toEqual({ hdr: false });
    tracker.observe(...hdr(2.5));
    expect(tracker.current).toEqual({ hdr: true, gain: expect.closeTo(2.5, 1) });
  });

  it('changes mode only after 3 readings in a row', () => {
    const tracker = new HdrToneMapTracker();
    tracker.observe(...sdr);
    tracker.observe(...hdr(1));
    tracker.observe(...hdr(1));
    tracker.observe(...sdr); // streak broken
    tracker.observe(...hdr(1));
    tracker.observe(...hdr(1));
    expect(tracker.current.hdr).toBe(false);
    tracker.observe(...hdr(1));
    expect(tracker.current.hdr).toBe(true);
  });

  it('keeps its mode on frames without score boxes (shop, death)', () => {
    const tracker = new HdrToneMapTracker();
    tracker.observe(...hdr(2));
    tracker.observe(box([77, 68, 54]), box([75, 66, 52]));
    tracker.observe(...sdr); // one SDR-looking frame is not enough
    expect(tracker.current.hdr).toBe(true);
  });

  it('gives the gain in 5 % steps, from the last readings', () => {
    // Close readings, one gain: the HDR templates are made once per gain
    const gains = [2.47, 2.5, 2.52].map((gain) => {
      const tracker = new HdrToneMapTracker();
      tracker.observe(...hdr(gain));
      return tracker.current.hdr ? tracker.current.gain : 0;
    });
    expect(new Set(gains).size).toBe(1);
    const tracker = new HdrToneMapTracker();
    for (const gain of [2.4, 2.5, 3.5, 2.5, 2.45]) tracker.observe(...hdr(gain));
    expect(tracker.current.hdr && tracker.current.gain).toBeCloseTo(2.5, 0);
  });

  it('forgets everything on reset', () => {
    const tracker = new HdrToneMapTracker();
    tracker.observe(...hdr(1));
    tracker.reset();
    expect(tracker.current).toEqual({ hdr: false });
    tracker.observe(...sdr);
    expect(tracker.current).toEqual({ hdr: false });
  });
});

describe('undoToneMap', () => {
  it('gives the game colours back, within the capture rounding', () => {
    for (const gain of [1, 2.5]) {
      const lut = toneMapLut(gain);
      for (const v of [40, 80, 128, 160]) {
        expect(Math.abs(lut[hdrCaptureValue(v, gain)] - v)).toBeLessThanOrEqual(gain === 1 ? 6 : 3);
      }
    }
  });

  it('keeps clipped values at 255', () => {
    // Respawn timer red (R > 220) and the Sapphire box blue (B > 175) must stay above their thresholds
    const d = new Uint8ClampedArray([255, 28, 5, 255, 51, 115, 255, 255]);
    undoToneMap(d, { hdr: true, gain: 2.5 });
    expect(d[0]).toBe(255);
    expect(d[6]).toBe(255);
    expect(d[3]).toBe(255); // alpha untouched
  });

  it('leaves SDR captures untouched', () => {
    const d = new Uint8ClampedArray([12, 128, 250, 255]);
    undoToneMap(d, { hdr: false });
    expect([...d]).toEqual([12, 128, 250, 255]);
  });

  it('round trip: what the templates become, never decreasing', () => {
    const lut = roundTripLut(2.5);
    for (let v = 1; v < 256; v++) expect(lut[v]).toBeGreaterThanOrEqual(lut[v - 1]);
    expect(lut[200]).toBe(255); // above sRGB ~170: clipped like in the frame
    expect(Math.abs(lut[100] - 100)).toBeLessThanOrEqual(3);
  });
});
