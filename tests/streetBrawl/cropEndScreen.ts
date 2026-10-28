// Writes the end-of-game screen's reference crops (src/streetBrawl/layout.ts › END_SCREEN_BOXES) from a full-screen
// screenshot of that screen, at their 1920x1080 size, into public/icons/streetBrawl/ui. Only needed again if the
// game changes that screen.
//
//   node tests/streetBrawl/cropEndScreen.ts <end-of-game screenshot.png>
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.ts';
import { toReferenceSize } from './reference.ts';
import { END_SCREEN_BOXES } from '../../src/streetBrawl/layout.ts';

const [input] = process.argv.slice(2);
if (!input) {
  console.error('usage: node tests/streetBrawl/cropEndScreen.ts <end-of-game screenshot.png>');
  process.exit(1);
}
const img = toReferenceSize(decodePng(input), input);
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/icons/streetBrawl/ui');
for (const [part, box] of Object.entries(END_SCREEN_BOXES)) {
  const data = new Uint8ClampedArray(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const from = ((box.y + y) * img.width + box.x) * 4;
    data.set(img.data.subarray(from, from + box.w * 4), y * box.w * 4);
  }
  encodePng(path.join(outDir, `${part}.png`), { data, width: box.w, height: box.h });
  console.log(`✔ ${part}.png`);
}
