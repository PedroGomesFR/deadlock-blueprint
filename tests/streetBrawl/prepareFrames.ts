// Turns a full Street Brawl screenshot into a test frame: resized to 1920x1080, and every pixel the readers do not look
// at blacked out (src/streetBrawl/layout.ts › readRegions), which keeps the frame small and shows what is read.
//
//   node tests/streetBrawl/prepareFrames.ts <screenshot.png> <name>
//       -> tests/streetBrawl/frames/<name>.png, then describe it in a test (see docs/STREET_BRAWL.md › Adding a test frame)
//
// 16:9 screenshots only.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.ts';
import { toReferenceSize } from './reference.ts';
import { readRegions } from '../../src/streetBrawl/layout.ts';

const [input, name] = process.argv.slice(2);
if (!input || !name) {
  console.error('usage: node tests/streetBrawl/prepareFrames.ts <screenshot.png> <name>');
  process.exit(1);
}
const img = toReferenceSize(decodePng(input), input);

const keep = new Uint8Array(img.width * img.height);
for (const b of readRegions(8)) {
  for (let y = Math.max(0, Math.floor(b.y)); y < Math.min(img.height, Math.ceil(b.y + b.h)); y++) {
    for (let x = Math.max(0, Math.floor(b.x)); x < Math.min(img.width, Math.ceil(b.x + b.w)); x++) {
      keep[y * img.width + x] = 1;
    }
  }
}
for (let i = 0; i < keep.length; i++) {
  if (keep[i]) continue;
  img.data[i * 4] = 0;
  img.data[i * 4 + 1] = 0;
  img.data[i * 4 + 2] = 0;
  img.data[i * 4 + 3] = 255;
}
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'frames', `${name}.png`);
encodePng(out, img);
console.log(`✔ ${out}`);
