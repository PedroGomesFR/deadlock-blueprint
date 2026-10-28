import { describe, expect, it } from 'vitest';
import { OPEN_GATE, passReading } from './readingGate';
import type { GateState } from './readingGate';
import type { CardReading } from './pickScreen';

const card = (position: CardReading['position'], itemId: string | null, enhanced = false): CardReading => ({
  position,
  itemId,
  distance: 0.01,
  secondDistance: 0.5,
  enhanced,
  rare: false,
  hasBonus: false,
  bonusItemId: null,
});
const offer = (left: string | null, centre: string | null, right: string | null, centreEnhanced = false) => [
  card('left', left),
  card('center', centre, centreEnhanced),
  card('right', right),
];
/** Feeds scans [pick, cards] and returns each decision. */
const run = (scans: [string, CardReading[]][], start: GateState = OPEN_GATE) => {
  let state = start;
  return scans.map(([pick, cards]) => {
    const r = passReading(state, pick, cards);
    state = r.state;
    return r.decision;
  });
};

describe('which readings may replace the advice', () => {
  const full = offer('close_quarters', 'extra_stamina', 'mystic_burst');

  it('accepts a reading once two scans agree', () => {
    expect(run([['r1p1', full], ['r1p1', full]])).toEqual(['keep', 'accept']);
  });

  it('ignores a card that only flashes by (the centre read as an enhanced Titanic Magazine for a scan)', () => {
    const flash = offer('close_quarters', 'titanic_magazine', 'mystic_burst', true);
    expect(run([['r1p1', full], ['r1p1', full], ['r1p1', flash], ['r1p1', full]])).toEqual(['keep', 'accept', 'keep', 'keep']);
  });

  it('keeps the full reading while the cards leave after a pick (fewer cards read)', () => {
    const leaving = offer(null, null, 'mystic_burst');
    expect(run([['r1p3', full], ['r1p3', full], ['r1p3', leaving], ['r1p3', leaving]])).toEqual(['keep', 'accept', 'keep', 'keep']);
  });

  it('takes a re-roll’s new cards (as many cards read)', () => {
    const rerolled = offer('rapid_rounds', 'extra_regen', 'sprint_boots');
    expect(run([['r1p1', full], ['r1p1', full], ['r1p1', rerolled], ['r1p1', rerolled]])).toEqual(['keep', 'accept', 'keep', 'accept']);
  });

  it('keeps the advice when no card reads on the same pick, clears it on a new pick', () => {
    const none = offer(null, null, null);
    expect(run([['r1p1', full], ['r1p1', full], ['r1p1', none]])).toEqual(['keep', 'accept', 'keep']);
    expect(run([['r1p1', full], ['r1p1', full], ['r1p2', none]])).toEqual(['keep', 'accept', 'clear']);
  });

  it('accepts a new pick with fewer readable cards (the count is per pick)', () => {
    const two = offer('a', null, 'b');
    expect(run([['r1p1', full], ['r1p1', full], ['r1p2', two], ['r1p2', two]])).toEqual(['keep', 'accept', 'keep', 'accept']);
  });
});
