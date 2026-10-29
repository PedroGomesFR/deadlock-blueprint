// Which hero the player has, from the 4 ability icons at the bottom of the screen. Pure, like pickScreen.ts.
//
// The normal mode finds the hero by its highlighted top bar portrait, but Street Brawl's top bar is 4v4 and skins
// change the portraits (Nurse Harrow's matched no stored portrait). The ability icons do not change: each of the 4 is
// compared with the same slot's icon of every hero, by shape (shapeDistance, blind to the greyed-out look before an
// ability is unlocked), and the hero whose 4 icons are closest on average wins.
import { WHOLE_GRID, shapeDistance, toGrid } from './image';
import type { RgbaImage } from './image';
import type { AbilityKey } from './stats';
import { ABILITY_ICON_CENTRES, ABILITY_ICON_SIZES } from './layout';

export interface AbilityTemplate {
  heroId: string;
  key: AbilityKey;
  grid: Float32Array;
}

export interface HeroReading {
  /** null when no hero clearly stands out (screen in play, fading, or an unknown hero) */
  heroId: string | null;
  /** Average shape distance of the best hero's 4 icons, and how far ahead of the second hero it is */
  distance: number;
  margin: number;
}

/**
 * On the 14 pick screen captures: the right hero averaged 0.20-0.49, at least 0.197 ahead (Ivy; the others 0.35+).
 * In play and on the round-end screens, the best hero averaged 0.77-0.80, at most 0.07 ahead: rejected.
 */
const MAX_DISTANCE = 0.55;
const MIN_MARGIN = 0.12;

export function readHero(img: RgbaImage, templates: AbilityTemplate[]): HeroReading {
  const byHero = new Map<string, Partial<Record<AbilityTemplate['key'], Float32Array>>>();
  for (const t of templates) {
    const icons = byHero.get(t.heroId) ?? {};
    icons[t.key] = t.grid;
    byHero.set(t.heroId, icons);
  }

  let best: HeroReading = { heroId: null, distance: Infinity, margin: 0 };
  for (const size of ABILITY_ICON_SIZES) {
    const seen = ABILITY_ICON_CENTRES.map(([x, y]) => toGrid(img, { x: x - size / 2, y: y - size / 2, w: size, h: size }));
    const scores = [...byHero].map(([heroId, icons]) => {
      const keys: AbilityKey[] = ['1', '2', '3', '4'];
      const d = keys.reduce((sum, key, i) => sum + (icons[key] ? shapeDistance(icons[key]!, seen[i], WHOLE_GRID) : 1), 0) / 4;
      return { heroId, d };
    });
    scores.sort((a, b) => a.d - b.d);
    if (scores.length > 1 && scores[0].d < best.distance) {
      best = { heroId: scores[0].heroId, distance: scores[0].d, margin: scores[1].d - scores[0].d };
    }
  }
  const sure = best.distance <= MAX_DISTANCE && best.margin >= MIN_MARGIN;
  return { ...best, heroId: sure ? best.heroId : null };
}
