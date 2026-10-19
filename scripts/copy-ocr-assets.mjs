#!/usr/bin/env node
// Copies the OCR engine (Tesseract.js worker, WebAssembly core, English model) into public/tesseract/, so that
// the souls counter is read offline, without any request to a CDN. Run before `vite` and `vite build`
// (npm scripts predev / prebuild); public/tesseract/ is generated, not committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'tesseract');

// LSTM-only cores: the scanner creates its worker with OEM 1 (LSTM_ONLY); SIMD first, plain as fallback
const FILES = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];

let copied = 0;
for (const [from, to] of FILES) {
  const src = path.join(ROOT, from);
  const dest = path.join(OUT, to);
  if (!fs.existsSync(src)) {
    console.error(`✖ OCR : fichier introuvable ${from} (npm install ?)`);
    process.exit(1);
  }
  const srcStat = fs.statSync(src);
  if (fs.existsSync(dest) && fs.statSync(dest).size === srcStat.size) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  copied++;
}
if (copied > 0) console.log(`✔ OCR : ${copied} fichier(s) copié(s) dans public/tesseract/`);
