import { describe, expect, it } from 'vitest';
import cases from '../../tests/streetBrawl/cases.json';
import { tierOf } from '../../tests/streetBrawl/fixtures';
import { normalCardTiers } from './pickScreen';
import { NO_ROUND, endGame, nextPickTiers, observeRound, possibleRounds, shiftRound, tiersStillToCome } from './roundTracker';
import { draftRoundTiers } from './stats';
import type { RoundState } from './roundTracker';

const s = 1000;
/** Feeds scans [time in s, pick screen open, possible rounds] and returns the state after each. */
const runStates = (scans: [number, boolean, number[]?][], start: RoundState = NO_ROUND) => {
  let state = start;
  return scans.map(([t, open, possible]) => (state = observeRound(state, open, t * s, possible)));
};
const run = (scans: [number, boolean, number[]?][], start?: RoundState) => runStates(scans, start).map((x) => x.round);

// generic-data › street_brawl.item_draft_rounds_per_game_round, normal tiers of picks 1-3 per round
const ROUND_TIERS = [
  [1, 2, 3],
  [2, 3, 3],
  [2, 3, 4],
  [3, 3, 4],
  [4, 4, 4],
];

describe('possibleRounds', () => {
  it('tells the rounds from a pick’s normal card tier', () => {
    expect(possibleRounds(ROUND_TIERS, 1, [1])).toEqual([1]);
    expect(possibleRounds(ROUND_TIERS, 1, [2, 2])).toEqual([2, 3]);
    expect(possibleRounds(ROUND_TIERS, 1, [4])).toEqual([5]);
    expect(possibleRounds(ROUND_TIERS, 3, [4])).toEqual([3, 4, 5]);
  });

  it('matches the game data, and puts every test frame in its real round', () => {
    expect(draftRoundTiers()).toEqual(ROUND_TIERS);
    type Case = { description?: string; round?: number; choice?: number; cards?: { itemId: string | null; rare?: boolean }[] };
    const pickFrames = (cases.cases as Case[]).filter((c) => c.round !== undefined);
    expect(pickFrames.length).toBeGreaterThanOrEqual(10);
    for (const c of pickFrames) {
      const cards = (c.cards ?? []).map((k) => ({ itemId: k.itemId, rare: k.rare ?? false }));
      expect(possibleRounds(ROUND_TIERS, c.choice ?? null, normalCardTiers(cards, tierOf)), c.description).toContain(c.round);
    }
  });

  it('says nothing without a choice number, a normal card, or when cards disagree', () => {
    expect(possibleRounds(ROUND_TIERS, null, [1])).toEqual([]);
    expect(possibleRounds(ROUND_TIERS, 1, [])).toEqual([]);
    expect(possibleRounds(ROUND_TIERS, 1, [1, 3])).toEqual([]);
  });
});

describe('observeRound', () => {
  it('has no round before the first pick screen', () => {
    expect(run([[0, false], [10, false]])).toEqual([null, null]);
  });

  it('counts a round per pick phase, not per pick', () => {
    // Round 1: three picks within 20 s; round 2 opens 4 minutes later
    expect(run([[0, true], [8, false], [10, true], [20, true], [60, false], [240, true], [250, true]])).toEqual([
      1, 1, 1, 1, 1, 2, 2,
    ]);
  });

  it('starts a new game after round 5, or after a long gap', () => {
    const scans: [number, boolean][] = [0, 200, 400, 600, 800, 1000].map((t) => [t, true]);
    const states = runStates(scans);
    expect(states.map((x) => x.round)).toEqual([1, 2, 3, 4, 5, 1]);
    expect(states[5].game).toBe(states[4].game + 1);
    expect(run([[0, true], [200, true], [200 + 9 * 60, true]])).toEqual([1, 2, 1]);
  });

  it('starts a new game when a round 1 card shows, however soon (queued straight into another game)', () => {
    // Round 3 of a game, then 2 minutes later a tier 1 card on the first pick
    const states = runStates([[0, true], [200, true], [400, true], [520, true, [1]]]);
    expect(states.map((x) => x.round)).toEqual([1, 2, 3, 1]);
    expect(states[3].game).toBe(states[2].game + 1);
  });

  it('corrects the count from the cards without a new game', () => {
    // Tab opened in round 4: the first pick screen seen counts as 1, its cards say 4
    const [first] = runStates([[0, true, [4]]]);
    expect(first.round).toBe(4);
    // Counted 4, the cards allow 2 or 3: the closest, same game
    const states = runStates([[0, true], [200, true], [400, true], [600, true, [2, 3]]]);
    expect(states[3].round).toBe(3);
    expect(states[3].game).toBe(states[2].game);
  });
});

describe('tiers of the picks to come', () => {
  it('lists the tiers still offered from a round on, rare tiers included', () => {
    expect([...tiersStillToCome(ROUND_TIERS, 4)!].sort()).toEqual([3, 4, 5]);
    expect(tiersStillToCome(ROUND_TIERS, null)).toBeUndefined();
  });

  it('gives the normal tiers of the round’s later picks', () => {
    expect(nextPickTiers(ROUND_TIERS, 1, 1)).toEqual([2, 3]);
    expect(nextPickTiers(ROUND_TIERS, 3, 3)).toEqual([]);
    expect(nextPickTiers(ROUND_TIERS, 2, null)).toBeUndefined();
  });
});

describe('endGame', () => {
  it('ends the game on the end screen, once, and the next pick screen is round 1 of another game', () => {
    const [, inRound3] = runStates([[0, true], [400, true, [3]]]);
    const ended = endGame(inRound3);
    expect(ended).toMatchObject({ round: null, game: inRound3.game + 1 });
    // The end screen stays for many scans: the same state
    expect(endGame(ended)).toBe(ended);
    const [next] = runStates([[500, true]], ended);
    expect(next.round).toBe(1);
  });
});

describe('shiftRound', () => {
  it('corrects the round within 1-5', () => {
    expect(shiftRound({ round: 2, lastOpenAt: 0, game: 1 }, 1).round).toBe(3);
    expect(shiftRound({ round: 1, lastOpenAt: 0, game: 1 }, -1).round).toBe(1);
    expect(shiftRound({ round: 5, lastOpenAt: 0, game: 1 }, 1).round).toBe(5);
    expect(shiftRound(NO_ROUND, 1).round).toBe(1);
  });

  it('keeps counting from the corrected round', () => {
    const corrected = shiftRound(observeRound(NO_ROUND, true, 0), 1);
    expect(run([[200, true]], corrected)).toEqual([3]);
  });
});
