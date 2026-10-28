import { describe, expect, it } from 'vitest';
import { planByRound } from './abilityRounds';
import { getStreetBrawlHeroStats } from './stats';
import type { AbilityPlanStep } from './stats';

const step = (timeS: number): AbilityPlanStep => ({
  ability: '1',
  winRate: 0.5,
  games: 1000,
  timeS,
  runnerUp: null,
  mostCommon: false,
});
const shape = (times: number[]) => planByRound(times.map(step)).map((r) => [r.round, r.steps.map((s) => s.n)]);

describe('planByRound', () => {
  it('groups steps by the round their time falls in', () => {
    expect(shape([44, 49, 44, 48, 257, 247, 431, 635, 631, 638, 861, 865])).toEqual([
      [1, [1, 2, 3, 4]],
      [2, [5, 6]],
      [3, [7]],
      [4, [8, 9, 10]],
      [5, [11, 12]],
    ]);
  });

  it('moves a step no later than the next one (averages over different players)', () => {
    // Lash: the 3rd step averages 243 s, the 4th and 5th 60 s
    expect(shape([47, 52, 243, 60, 61, 246])).toEqual([
      [1, [1, 2, 3, 4, 5]],
      [2, [6]],
    ]);
  });

  it('skips a round with no step', () => {
    expect(shape([50, 430])).toEqual([
      [1, [1]],
      [3, [2]],
    ]);
  });

  it('gives every hero of the data an ordered plan', () => {
    for (const heroId of ['infernus', 'lash', 'pocket', 'graves', 'nurse_harrow']) {
      const plan = getStreetBrawlHeroStats(heroId)?.abilityPlan ?? [];
      const rounds = planByRound(plan);
      expect(rounds.flatMap((r) => r.steps.map((s) => s.n))).toEqual(plan.map((_, i) => i + 1));
      expect(rounds[0].round).toBe(1);
    }
  });
});
