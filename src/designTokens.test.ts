import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Colours, radii and shadows come from the design tokens (src/styles/tokens.css, named in tailwind.config.js):
// bg-surface-panel, text-ink-muted, text-accent-300, rounded-xl, shadow-overlay... tailwind.config.js replaces
// Tailwind's palette, so a raw colour (text-slate-400, bg-[#181520]) would not even be generated: it would silently
// lose its colour. The lane and hero colours of src/data are game data, not interface styles, and are not checked.
const PALETTE =
  'slate|stone|gray|zinc|neutral|white|black|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|red|orange';
const RAW_COLOUR = new RegExp(
  `(?<![\\w-])(bg|text|border(-[trblxy])?|ring|ring-offset|from|via|to|fill|stroke|divide|outline|decoration|placeholder|caret|shadow)-(${PALETTE})(-\\d{2,3})?(?![\\w-])`
);
const ARBITRARY_COLOUR = /(?<![\w-])[a-z-]+-\[(#|rgba?\()/;
const OFF_SCALE = /(?<![\w-])(rounded(-[trbl]{1,2})?-3xl|shadow-(sm|md|lg|xl|2xl|inner)|shadow-glow-\w+|tracking-\[)/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'data' || entry.name === 'replay' ? [] : sourceFiles(file);
    return /\.tsx?$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [file] : [];
  });
}

function offenders(pattern: RegExp): string[] {
  return sourceFiles('src').flatMap((file) =>
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => {
        const match = line.match(pattern)?.[0];
        return match ? [`${file}:${i + 1} ${match}`] : [];
      })
  );
}

describe('design tokens', () => {
  it('uses token colours, not raw Tailwind palette colours', () => {
    expect(offenders(RAW_COLOUR)).toEqual([]);
  });

  it('uses no arbitrary colour values', () => {
    expect(offenders(ARBITRARY_COLOUR)).toEqual([]);
  });

  it('uses the radius, shadow and tracking tokens', () => {
    expect(offenders(OFF_SCALE)).toEqual([]);
  });
});
