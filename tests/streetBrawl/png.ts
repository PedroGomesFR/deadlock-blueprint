// Test-only PNG reader/writer (8-bit RGB / RGBA, not interlaced), so the Street Brawl tests can read saved frames
// and item icons in Node without adding a dependency. Not used by the application.
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import type { RgbaImage } from '../../src/streetBrawl/image';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(file: string): RgbaImage {
  const buf = readFileSync(file);
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error(`${file}: not a PNG`);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let palette: Buffer | null = null;
  let paletteAlpha: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const bitDepth = body[8];
      colorType = body[9];
      // 2 = RGB, 6 = RGBA, 4 = grey + alpha, 3 = palette (the ability icons use the last two)
      if (bitDepth !== 8 || ![2, 3, 4, 6].includes(colorType) || body[12] !== 0) {
        throw new Error(`${file}: unsupported PNG (depth ${bitDepth}, colour type ${colorType}, interlace ${body[12]})`);
      }
    } else if (type === 'PLTE') palette = Buffer.from(body);
    else if (type === 'tRNS') paletteAlpha = Buffer.from(body);
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 3 ? 1 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[(y - 1) * stride + x - bpp] : 0;
      const v = line[x];
      pixels[y * stride + x] =
        filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b : filter === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c);
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += bpp) {
    if (bpp === 1) {
      const k = pixels[j];
      data[i * 4] = palette![k * 3];
      data[i * 4 + 1] = palette![k * 3 + 1];
      data[i * 4 + 2] = palette![k * 3 + 2];
      data[i * 4 + 3] = paletteAlpha && k < paletteAlpha.length ? paletteAlpha[k] : 255;
      continue;
    }
    if (bpp === 2) {
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = pixels[j];
      data[i * 4 + 3] = pixels[j + 1];
      continue;
    }
    data[i * 4] = pixels[j];
    data[i * 4 + 1] = pixels[j + 1];
    data[i * 4 + 2] = pixels[j + 2];
    data[i * 4 + 3] = bpp === 4 ? pixels[j + 3] : 255;
  }
  return { data, width, height };
}

function crc32(bytes: Buffer): number {
  let c = ~0;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** Writes an RGBA image as PNG (used to save the test frames). */
export function encodePng(file: string, img: RgbaImage): void {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((img.width * 4 + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (img.width * 4 + 1)] = 0;
    Buffer.from(img.data.buffer, img.data.byteOffset + y * img.width * 4, img.width * 4).copy(raw, y * (img.width * 4 + 1) + 1);
  }
  writeFileSync(
    file,
    Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
  );
}
