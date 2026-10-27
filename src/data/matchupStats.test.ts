import { describe, expect, it, vi } from 'vitest';

// Usual win rate of `a`: game-wide rows 600 / 1200 = 50 %
const meta = {
  heroes: {
    a: {
      matchups: {
        hard: [400, 1000, 200, 500], // lane 40 %, game 40 %
        easy: [30, 50, 400, 700], // too few lane games: game-wide numbers (57 %)
      },
      laneDuos: { ally: [550, 1000] },
      counterItems: { hard: [['healbane', 0.031], ['metal_skin', 0.012]] },
    },
    old: {}, // data file cached by a version before 1.4.8: no pair statistics
  },
};

vi.mock('./dataSource', () => ({ getMetaData: () => meta }));

const { getCounterItemStats, getLaneDuoStat, getMatchupStat, laneOutlookOf, stanceOf } = await import('./matchupStats');

describe('matchup statistics', () => {
  it('uses the lane games against a lane opponent, smoothed towards the usual win rate', () => {
    const stat = getMatchupStat('a', 'hard', true)!;
    expect(stat.lane).toBe(true);
    expect(stat.games).toBe(1000);
    expect(stat.usualWinRate).toBeCloseTo(0.5);
    // (400 + 200 × 0.5) / (1000 + 200)
    expect(stat.winRate).toBeCloseTo(500 / 1200);
    expect(stat.stance).toBe('avoid');
  });

  it('uses the game-wide numbers for a team enemy, or when they rarely laned against each other', () => {
    expect(getMatchupStat('a', 'hard', false)).toMatchObject({ lane: false, games: 500 });
    const easy = getMatchupStat('a', 'easy', true)!;
    expect(easy).toMatchObject({ lane: false, games: 700, stance: 'focus' });
  });

  it('calls a matchup favourable or hard only beyond 2.5 points', () => {
    expect(stanceOf(-0.026)).toBe('avoid');
    expect(stanceOf(-0.02)).toBe('even');
    expect(stanceOf(0.02)).toBe('even');
    expect(stanceOf(0.026)).toBe('focus');
  });

  it('averages the lane matchups into a lane outlook', () => {
    const hard = getMatchupStat('a', 'hard', true)!;
    const easy = getMatchupStat('a', 'easy', true)!;
    expect(laneOutlookOf([hard])?.outlook).toBe('hard');
    expect(laneOutlookOf([hard, easy])?.diff).toBeCloseTo((hard.diff + easy.diff) / 2);
    expect(laneOutlookOf([])).toBeUndefined();
  });

  it('gives the lane duo and the items that win against an enemy', () => {
    expect(getLaneDuoStat('a', 'ally')).toMatchObject({ games: 1000, usualWinRate: 0.5 });
    expect(getLaneDuoStat('a', 'ally')!.diff).toBeGreaterThan(0);
    expect(getCounterItemStats('a', 'hard')).toEqual([
      { itemId: 'healbane', lift: 0.031 },
      { itemId: 'metal_skin', lift: 0.012 },
    ]);
  });

  it('returns nothing with a data file from before these statistics', () => {
    expect(getMatchupStat('old', 'hard', true)).toBeUndefined();
    expect(getLaneDuoStat('old', 'ally')).toBeUndefined();
    expect(getCounterItemStats('old', 'hard')).toEqual([]);
    expect(getMatchupStat('unknown', 'hard', true)).toBeUndefined();
  });
});
