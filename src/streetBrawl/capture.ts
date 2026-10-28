// Turns a captured game frame into the pixels the Street Brawl readers take (browser only: it draws on a canvas).
import { REF_H, REF_W } from './image';
import type { RgbaImage } from './image';

/** How far from 16:9 a capture may be. The readers' positions are measured on 16:9 screens only. */
const WIDE_TOLERANCE = 0.02;

/** The frame resized to 1920x1080, 'not-wide' when it is not 16:9, null when it has no pixels. */
export async function framePixels(
  image: ImageBitmap | string,
  canvas: HTMLCanvasElement
): Promise<RgbaImage | 'not-wide' | null> {
  let source: CanvasImageSource;
  let w: number;
  let h: number;
  if (typeof image === 'string') {
    const img = new Image();
    img.src = image;
    await img.decode().catch(() => undefined);
    source = img;
    w = img.naturalWidth;
    h = img.naturalHeight;
  } else {
    source = image;
    w = image.width;
    h = image.height;
  }
  if (w === 0 || h === 0) return null;
  if (Math.abs(w / h - 16 / 9) > WIDE_TOLERANCE) return 'not-wide';
  canvas.width = REF_W;
  canvas.height = REF_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, REF_W, REF_H);
  const { data, width, height } = ctx.getImageData(0, 0, REF_W, REF_H);
  return { data, width, height };
}
