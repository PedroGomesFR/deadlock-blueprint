// Brings a full-screen capture to the readers' 1920x1080 reference size, for the frame scripts (prepareFrames.ts,
// cropEndScreen.ts). The app does the same with a canvas (src/streetBrawl/capture.ts).
import type { RgbaImage } from '../../src/streetBrawl/image.ts';

const REF_W = 1920;
const REF_H = 1080;
/** As capture.ts: how far from 16:9 a capture may be. */
const WIDE_TOLERANCE = 0.02;

/** The capture resized to 1920x1080 by area averaging; throws when it is not 16:9. */
export function toReferenceSize(raw: RgbaImage, file: string): RgbaImage {
  if (Math.abs(raw.width / raw.height - 16 / 9) > WIDE_TOLERANCE) {
    throw new Error(`${file}: not 16:9 (${raw.width}x${raw.height})`);
  }
  const img = { data: new Uint8ClampedArray(REF_W * REF_H * 4), width: REF_W, height: REF_H };
  const fx = raw.width / REF_W;
  const fy = raw.height / REF_H;
  for (let y = 0; y < REF_H; y++) {
    for (let x = 0; x < REF_W; x++) {
      const acc = [0, 0, 0];
      let wSum = 0;
      for (let sy = Math.floor(y * fy); sy < Math.ceil((y + 1) * fy); sy++) {
        const wy = Math.min((y + 1) * fy, sy + 1) - Math.max(y * fy, sy);
        for (let sx = Math.floor(x * fx); sx < Math.ceil((x + 1) * fx); sx++) {
          const w = wy * (Math.min((x + 1) * fx, sx + 1) - Math.max(x * fx, sx));
          const i = (sy * raw.width + sx) * 4;
          for (let c = 0; c < 3; c++) acc[c] += raw.data[i + c] * w;
          wSum += w;
        }
      }
      const o = (y * REF_W + x) * 4;
      for (let c = 0; c < 3; c++) img.data[o + c] = acc[c] / wSum;
      img.data[o + 3] = 255;
    }
  }
  return img;
}
