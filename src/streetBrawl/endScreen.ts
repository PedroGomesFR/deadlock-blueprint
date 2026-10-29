// Recognises the end-of-game screen (MVP, key players, "PLAY AGAIN"): the game is over. Pure, no DOM.
import { WHOLE_GRID, shapeDistance, toGrid } from './image';
import type { RgbaImage } from './image';
import { END_SCREEN_BOXES } from './layout';

export type EndScreenPart = keyof typeof END_SCREEN_BOXES;
/** Each part's reference crop reduced to a grid (templates.ts loads public/icons/streetBrawl/ui/<part>.png). */
export type EndScreenTemplates = Record<EndScreenPart, Float32Array>;

/**
 * Shape distance of a part to its reference: 0.008 or less on the end-screen captures of 2 games (the title from the
 * first moment, the button and the round icons a few seconds later), at least 0.537 (title), 0.626 (button) and 0.631
 * (round icons) on 18 other screenshots (pick screens, play, round ends, the FPS overlay over the title's corner).
 */
const PART_MAX_DISTANCE = 0.25;

export function partDistances(img: RgbaImage, refs: EndScreenTemplates): Record<EndScreenPart, number> {
  const out = {} as Record<EndScreenPart, number>;
  for (const part of Object.keys(END_SCREEN_BOXES) as EndScreenPart[]) {
    out[part] = shapeDistance(refs[part], toGrid(img, END_SCREEN_BOXES[part]), WHOLE_GRID);
  }
  return out;
}

/**
 * The end-of-game screen: its "STREET BRAWL" title, and the "PLAY AGAIN" button or the round icons. The title alone
 * might show elsewhere (not seen yet); the button and the icons come a few seconds after the screen opens, which it
 * stays on much longer.
 */
export function isEndScreen(img: RgbaImage, refs: EndScreenTemplates): boolean {
  const d = partDistances(img, refs);
  return d.title <= PART_MAX_DISTANCE && (d.playAgain <= PART_MAX_DISTANCE || d.roundIcons <= PART_MAX_DISTANCE);
}
