import { describe, expect, it } from 'vitest';
import data from '../data/generated/streetBrawl.json';
import { tierOf } from '../../tests/streetBrawl/fixtures';
import { getStreetBrawlHeroStats } from './stats';

const heroIds = Object.keys((data as { heroes: Record<string, unknown> }).heroes);

describe('Street Brawl item gains', () => {
  it('centres every tier on its average item, whatever the hero’s win rate', () => {
    // Raw "win rate minus the hero's" leaned with the hero: against hero win rate, tier 4's average item had a slope of
    // -0.22 and the legendary items' -0.37 (-2.0 and -2.5 pts for a 60 % hero). Centred, the average is near 0 (the
    // shrinkage moves it a little) and the lean is gone.
    const points: Record<number, [number, number][]> = {};
    for (const heroId of heroIds) {
      const stats = getStreetBrawlHeroStats(heroId, tierOf)!;
      for (const tier of [1, 2, 3, 4, 5]) {
        const ids = Object.keys(stats.items).filter((id) => tierOf(id) === tier && stats.offerOdds[id]);
        const total = ids.reduce((s, id) => s + stats.offerOdds[id], 0);
        if (total === 0) continue;
        const mean = ids.reduce((s, id) => s + stats.offerOdds[id] * stats.items[id].gain, 0) / total;
        expect(Math.abs(mean), `${heroId} tier ${tier}`).toBeLessThan(0.005);
        (points[tier] ??= []).push([stats.winRate, mean]);
      }
    }
    for (const [tier, xy] of Object.entries(points)) {
      const mx = xy.reduce((s, [x]) => s + x, 0) / xy.length;
      const my = xy.reduce((s, [, y]) => s + y, 0) / xy.length;
      const slope = xy.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / xy.reduce((s, [x]) => s + (x - mx) ** 2, 0);
      expect(Math.abs(slope), `tier ${tier}`).toBeLessThan(0.05);
    }
  });

  it('shrinks each gain towards its tier’s average, never past it', () => {
    for (const heroId of heroIds.slice(0, 10)) {
      const stats = getStreetBrawlHeroStats(heroId, tierOf)!;
      const h = (data as unknown as { heroes: Record<string, { items: Record<string, number[]> }> }).heroes[heroId];
      for (const tier of [1, 2, 3, 4]) {
        const ids = Object.keys(stats.items).filter((id) => tierOf(id) === tier);
        const raw = ids.map((id) => h.items[id][1] - stats.winRate);
        const rawSpread = Math.max(...raw) - Math.min(...raw);
        const gains = ids.map((id) => stats.items[id].gain);
        expect(Math.max(...gains) - Math.min(...gains), `${heroId} tier ${tier}`).toBeLessThanOrEqual(rawSpread + 1e-9);
      }
    }
  });
});
