import { describe, expect, it } from 'vitest';
import { cardReason } from './reasons';
import type { RankedCard } from './ranking';

const ranked = (itemId: string, parts: Partial<RankedCard> = {}): RankedCard => ({
  card: { position: 'center', itemId, distance: 0, secondDistance: 1, enhanced: false, rare: false, hasBonus: false, bonusItemId: null },
  itemId,
  winRate: 0.5,
  itemGain: 0,
  bonusGain: 0,
  owned: false,
  pathGain: 0,
  pathTo: null,
  soulGain: 0.0035,
  score: 0,
  scoreSd: 0.005,
  ...parts,
});

describe('a card’s reason', () => {
  it('names the part that sets the card apart', () => {
    const good = ranked('a', { itemGain: 0.011 });
    const path = ranked('b', { itemGain: 0.001, pathGain: 0.004, pathTo: { upgrade: 'up', gain: 0.03, extraChance: 0.1 } });
    const two = ranked('c', { itemGain: -0.002, bonusGain: 0.009 });
    const offer = [good, path, two];
    expect(cardReason(good, offer)).toEqual({ kind: 'item', gain: 0.011 });
    expect(cardReason(path, offer)).toEqual({ kind: 'path', upgradeId: 'up' });
    expect(cardReason(two, offer)).toEqual({ kind: 'twoItems' });
  });

  it('counts a tier only when it is above the offer’s other cards', () => {
    const normal = ranked('a', { itemGain: 0.002, soulGain: 0.0035 });
    const rare = ranked('b', { itemGain: 0.001, soulGain: 0.007 });
    expect(cardReason(rare, [normal, rare])).toEqual({ kind: 'tier', value: 0.0035 });
    expect(cardReason(normal, [normal, rare])).toEqual({ kind: 'item', gain: 0.002 });
  });

  it('says when the card is owned, or upgrades an owned item, before anything else', () => {
    expect(cardReason(ranked('a', { owned: true, itemGain: 0.05 }), [])).toEqual({ kind: 'owned' });
    expect(cardReason(ranked('a', { itemGain: 0.05 }), [], 'grit')).toEqual({ kind: 'upgrades', itemId: 'grit' });
  });

  it('does not name a tiny part: a weak item with a sliver of path is a weak item', () => {
    const weak = ranked('a', { itemGain: -0.0096, pathGain: 0.0001, pathTo: { upgrade: 'up', gain: 0.005, extraChance: 0.02 } });
    expect(cardReason(weak, [weak])).toEqual({ kind: 'item', gain: -0.0096 });
  });

  it('shows a below-average item as such, and an item without data as such', () => {
    expect(cardReason(ranked('a', { itemGain: -0.004 }), [])).toEqual({ kind: 'item', gain: -0.004 });
    expect(cardReason(ranked('a', { itemGain: null }), [])).toEqual({ kind: 'noData' });
  });
});
