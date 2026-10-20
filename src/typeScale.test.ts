import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The interface has four text sizes (src/index.css): text-small, text-body, text-title, text-heading.
// Any other size (Tailwind's text-xs / text-sm..., text-[10px], an inline fontSize) brings back the
// patchwork of slightly different sizes, with 9 px labels in the overlay.
const OTHER_SIZE = /\btext-(xs|sm|base|lg|[2-9]?xl)\b|\btext-\[[\d.]+(px|rem|em)\]|fontSize/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.tsx$/.test(entry.name) ? [file] : [];
  });
}

describe('type scale', () => {
  it('uses only the four text sizes of the scale', () => {
    const offenders = sourceFiles('src').flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => [`${file}:${i + 1}`, line.match(OTHER_SIZE)?.[0]] as const)
        .filter(([, match]) => match)
    );
    expect(offenders).toEqual([]);
  });
});
