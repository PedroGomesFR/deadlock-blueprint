#!/usr/bin/env node
// Release notes of a GitHub release (.github/workflows/release.yml): the CHANGELOG.md section of the version,
// the downloads, their SHA-256 checksums and VirusTotal links.
//   node scripts/release-notes.mjs v1.4.0 > release/notes.md   (after `npm run dist` and release/SHA256SUMS.txt)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const REPO = pkg.homepage;
const tag = process.argv[2] || `v${pkg.version}`;
const version = tag.replace(/^v/, '');

const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
const start = changelog.search(new RegExp(`^## \\[?${version.replace(/\./g, '\\.')}\\]?`, 'm'));
let section = '';
if (start >= 0) {
  const rest = changelog.slice(start);
  const next = rest.slice(3).search(/^## /m);
  section = (next >= 0 ? rest.slice(0, next + 3) : rest).replace(/^## [^\n]*\n/, '').trim();
}

const sums = path.join(ROOT, 'release', 'SHA256SUMS.txt');
const checksums = fs.existsSync(sums)
  ? fs
      .readFileSync(sums, 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+\*?/))
      .map(([hash, file]) => ({ hash, file }))
  : [];

const describe = () => 'Portable — one file (`.exe`), no install';

const lines = [];
if (section) lines.push(section, '');
lines.push('## Download', '', '| File | | SHA-256 | Scan |', '| :--- | :--- | :--- | :--- |');
for (const { hash, file } of checksums) {
  lines.push(`| \`${file}\` | ${describe(file)} | \`${hash}\` | [VirusTotal](https://www.virustotal.com/gui/file/${hash}) |`);
}
lines.push(
  '',
  `Built from this tag by [GitHub Actions](${REPO}/actions/workflows/release.yml): anyone can check what went into it.`,
  '',
  '> [!NOTE]',
  '> The executable is not code-signed: Windows SmartScreen may say "Windows protected your PC". Click **More info**, then **Run anyway**. To check your download, compare its SHA-256 (`Get-FileHash .\\<file>.exe` in PowerShell) with the table above. If VirusTotal shows "not found", upload the file there yourself: the checksum must match.',
  '',
  `The app only reads the image of the game window (like OBS): no memory reading, no injection, no simulated input. See [Can I get banned?](${REPO}#can-i-get-banned).`
);
process.stdout.write(lines.join('\n') + '\n');
