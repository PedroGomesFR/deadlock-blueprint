import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../tests/streetBrawl/png';
import { ROOT, frame } from '../../tests/streetBrawl/fixtures';
import { toGrid } from './image';
import { isEndScreen, partDistances } from './endScreen';
import type { EndScreenTemplates } from './endScreen';

// As templates.ts › getEndScreenTemplates loads them
const refs = Object.fromEntries(
  (['title', 'playAgain', 'roundIcons'] as const).map((p) => [p, toGrid(decodePng(path.join(ROOT, 'public/icons/streetBrawl/ui', `${p}.png`)))])
) as EndScreenTemplates;

describe('Street Brawl end-of-game screen', () => {
  it('recognises it once the "PLAY AGAIN" button shows', () => {
    expect(isEndScreen(frame('end_screen_play_again'), refs)).toBe(true);
  });

  it('recognises another end screen without the button, by the round icons (Apollo MVP, icons in another order)', () => {
    const d = partDistances(frame('end_screen_apollo'), refs);
    expect(d.playAgain).toBeGreaterThan(0.5);
    expect(isEndScreen(frame('end_screen_apollo'), refs)).toBe(true);
  });

  it('waits for the button or the round icons on its first seconds (the title alone is not enough)', () => {
    const early = frame('end_screen_early');
    expect(partDistances(early, refs).title).toBeLessThan(0.1);
    expect(isEndScreen(early, refs)).toBe(false);
  });

  it.each(['in_play_full', 'pick_r5_c1_inventory_12_items', 'pick_r4_c1_inventory_9_items', 'roundend_round3'])(
    'does not take %s for it',
    (name) => {
      const d = partDistances(frame(name), refs);
      expect(isEndScreen(frame(name), refs)).toBe(false);
      expect(Math.min(d.title, d.playAgain, d.roundIcons)).toBeGreaterThan(0.4);
    }
  );
});
