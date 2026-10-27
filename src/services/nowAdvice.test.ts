import { describe, expect, it } from 'vitest';
import type { TeamBoard } from './matchTracker';
import { NowEnemy, NowInput, getNowAdvice } from './nowAdvice';

// Slots go by lane pairs: 0-1 York, 2-3 Broadway, 4-5 Orchard. I am Infernus, slot 2 (Broadway) with Sinclair.
const ALLIES = ['celeste', 'vindicta', 'infernus', 'sinclair', 'mirage', 'billy'];
const ENEMIES = ['apollo', 'warden', 'paige', 'wraith', 'rat_king', 'haze'];

const board = (allyDead: number[] = [], enemyDead: number[] = [], mySlot = 2): TeamBoard => ({
  allies: ALLIES.map((heroId, i) => ({ heroId, dead: allyDead.includes(i) })),
  enemies: ENEMIES.map((heroId, i) => ({ heroId, dead: enemyDead.includes(i) })),
  mySlot,
});

const input = (overrides: Partial<NowInput> = {}): NowInput => ({
  board: board(),
  nextItem: { id: 'mystic_burst', cost: 1600 },
  souls: 1000,
  enemies: [],
  ...overrides,
});

const kinds = (i: NowInput, max = 10) => getNowAdvice(i, max).map((a) => a.kind);

describe('what to do now', () => {
  it('buys the #1 when the souls are there, otherwise farms for it', () => {
    expect(getNowAdvice(input({ souls: 1700 }))).toEqual([{ kind: 'buy', itemId: 'mystic_burst' }]);
    expect(getNowAdvice(input({ souls: 1150 }))).toEqual([{ kind: 'farm', itemId: 'mystic_burst', missing: 450 }]);
    // Souls not read (OCR): nothing about them
    expect(getNowAdvice(input({ souls: null }))).toEqual([]);
  });

  it('when I am dead: only the next purchase and who to hit, no lane orders', () => {
    const advice = getNowAdvice(input({ board: board([2, 3], [0, 1, 4]) }), 10);
    expect(advice[0]).toEqual({ kind: 'dead', itemId: 'mystic_burst', missing: 600 });
    expect(advice.map((a) => a.kind)).not.toContain('push');
    expect(advice.map((a) => a.kind)).not.toContain('farm');
  });

  it('pushes with 3 enemies dead and 2 more than allies, plays safe the other way round', () => {
    expect(kinds(input({ board: board([0], [0, 1, 4, 5]) }))).toContain('push');
    expect(kinds(input({ board: board([0], [0, 1]) }))).not.toContain('push'); // 2 dead: no numbers advantage
    expect(kinds(input({ board: board([0, 1, 4], [5]) }))).toContain('safe');
    expect(kinds(input({ board: board([0, 1, 4], [3, 5]) }))).not.toContain('safe'); // 3 against 2
  });

  it('pushes my lane when both my lane opponents are dead', () => {
    const advice = getNowAdvice(input({ board: board([], [2, 3]) }), 10);
    expect(advice).toContainEqual({ kind: 'pushLane', enemyIds: ['paige', 'wraith'] });
  });

  it('backs off when my lane partner is dead against two', () => {
    const advice = getNowAdvice(input({ board: board([3]) }), 10);
    expect(advice).toContainEqual({ kind: 'partnerDead', partnerId: 'sinclair' });
    expect(advice.map((a) => a.kind)).not.toContain('help'); // I cannot leave my lane
  });

  it('sends me to help an ally left alone against two, only when my lane is covered', () => {
    // York: Celeste dead, Vindicta alone against Apollo and Warden; one of my opponents dead, my partner alive
    const help = { kind: 'help', lanePair: 0, allyId: 'vindicta', enemyIds: ['apollo', 'warden'] };
    expect(getNowAdvice(input({ board: board([0], [2]) }), 10)).toContainEqual(help);
    // Both my opponents alive: my partner would be alone in turn
    expect(kinds(input({ board: board([0]) }))).not.toContain('help');
    // One of York's enemies is dead too: Vindicta is not outnumbered
    expect(kinds(input({ board: board([0], [1, 2]) }))).not.toContain('help');
  });

  it('focuses a fed enemy first, otherwise my best matchup, never a dead one', () => {
    const enemies: NowEnemy[] = [
      { id: 'apollo', stance: 'focus', diff: 0.03, winRate: 0.53, isFed: false },
      { id: 'haze', stance: 'focus', diff: 0.06, winRate: 0.56, isFed: false },
      { id: 'warden', stance: 'avoid', diff: -0.04, winRate: 0.46, isFed: false },
      { id: 'paige', stance: 'even', diff: 0, winRate: 0.5, isFed: false },
    ];
    expect(getNowAdvice(input({ enemies }), 10)).toContainEqual({ kind: 'focus', enemyId: 'haze', fed: false, winRate: 0.56 });
    expect(getNowAdvice(input({ enemies }), 10)).toContainEqual({ kind: 'avoid', enemyIds: ['warden'] });
    // Haze dead (slot 5): Apollo
    expect(getNowAdvice(input({ enemies, board: board([], [5]) }), 10)).toContainEqual({
      kind: 'focus',
      enemyId: 'apollo',
      fed: false,
      winRate: 0.53,
    });
    // Paige fed: hit her in teamfights, she is not also listed to avoid
    const fed = enemies.map((e) => (e.id === 'paige' ? { ...e, stance: 'avoid' as const, isFed: true } : e));
    const advice = getNowAdvice(input({ enemies: fed }), 10);
    expect(advice).toContainEqual({ kind: 'focus', enemyId: 'paige', fed: true, winRate: undefined });
    expect(advice).toContainEqual({ kind: 'avoid', enemyIds: ['warden'] });
  });

  it('keeps the most urgent orders first and cuts the list', () => {
    const enemies: NowEnemy[] = [
      { id: 'haze', stance: 'focus', diff: 0.06, winRate: 0.56, isFed: false },
      { id: 'warden', stance: 'avoid', diff: -0.04, winRate: 0.46, isFed: false },
    ];
    expect(kinds(input({ enemies, souls: 2000, board: board([0], [0, 2, 3, 4]) }), 3)).toEqual(['buy', 'push', 'focus']);
    // Without the top bar (shop, menus) nobody is known dead: only the purchase and the matchups
    expect(kinds(input({ enemies, board: null }))).toEqual(['focus', 'farm', 'avoid']);
  });
});
