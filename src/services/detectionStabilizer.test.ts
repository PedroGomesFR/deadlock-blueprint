import { describe, expect, it } from 'vitest';
import { ItemAbsence, ItemConfirmation, SlotVoter, StableValue } from './detectionStabilizer';

describe('StableValue', () => {
  it('returns a value only after N identical scans in a row', () => {
    const s = new StableValue<string>(3, (v) => v);
    expect(s.push('a')).toBeUndefined();
    expect(s.push('a')).toBeUndefined();
    expect(s.push('a')).toBe('a');
    expect(s.push('a')).toBe('a');
    expect(s.push('b')).toBeUndefined();
    expect(s.push('a')).toBeUndefined();
  });
});

describe('ItemConfirmation', () => {
  it('confirms an item seen 3 scans in a row, and starts over when it is missed once', () => {
    const c = new ItemConfirmation(3);
    expect(c.push(['x'])).toEqual([]);
    expect(c.push(['x', 'y'])).toEqual([]);
    expect(c.push(['x', 'y'])).toEqual(['x']);
    expect(c.push(['y'])).toEqual(['y']);
    expect(c.push(['x'])).toEqual([]);
  });
});

describe('ItemAbsence', () => {
  it('drops an item missing 6 scans in a row from a readable inventory', () => {
    const a = new ItemAbsence(6, 30, 3);
    for (let i = 0; i < 5; i++) expect(a.push(['x', 'y'], ['y'], 0)).toEqual([]);
    expect(a.push(['x', 'y'], ['y'], 0)).toEqual(['x']);
  });

  it('waits 30 scans when 3+ items are missing together (shop fade-out, death screen)', () => {
    const a = new ItemAbsence(6, 30, 3);
    for (let i = 0; i < 29; i++) expect(a.push(['x', 'y', 'z'], [], 0)).toEqual([]);
    expect(a.push(['x', 'y', 'z'], [], 0)).toEqual(['x', 'y', 'z']);
  });

  it('counts no absence while unrecognized slots can hide the missing items (cooldown)', () => {
    const a = new ItemAbsence(6, 30, 3);
    for (let i = 0; i < 20; i++) expect(a.push(['x', 'y'], ['y'], 1)).toEqual([]);
  });
});

describe('SlotVoter', () => {
  it('keeps the majority hero of each slot despite misreads', () => {
    const v = new SlotVoter();
    for (let i = 0; i < 10; i++) v.push(['apollo', 'warden', 'paige', 'wraith', 'rat_king', 'haze']);
    for (let i = 0; i < 4; i++) v.push(['pocket', 'viscous', null, 'paradox', 'warden', null]);
    expect(v.result()).toEqual(['apollo', 'warden', 'paige', 'wraith', 'rat_king', 'haze']);
  });

  it('puts a hero in one slot only: the one where it has the most votes', () => {
    const v = new SlotVoter();
    for (let i = 0; i < 6; i++) v.push([null, 'warden', null, null, 'warden', null]);
    for (let i = 0; i < 4; i++) v.push([null, null, null, null, 'solomon', null]);
    for (let i = 0; i < 2; i++) v.push([null, 'warden', null, null, null, null]);
    // warden: 8 votes in slot 2, 6 in slot 5 -> slot 2; slot 5 falls back to its next candidate
    expect(v.result()).toEqual([null, 'warden', null, null, 'solomon', null]);
  });

  it('needs a few votes and a fair share of the slot', () => {
    const v = new SlotVoter(6, 3, 0.35);
    v.push(['a', null, null, null, null, null]);
    v.push(['a', null, null, null, null, null]);
    expect(v.result()[0]).toBeNull();
    v.push(['a', null, null, null, null, null]);
    expect(v.result()[0]).toBe('a');
    for (let i = 0; i < 6; i++) v.push(['b', null, null, null, null, null]);
    for (let i = 0; i < 6; i++) v.push(['c', null, null, null, null, null]);
    // a: 3/15 = 20% of the slot: not enough any more
    expect(v.result()[0]).toBe('b');
  });

  it('forgets everything on reset', () => {
    const v = new SlotVoter();
    for (let i = 0; i < 5; i++) v.push(['a', 'b', 'c', 'd', 'e', 'f']);
    v.reset();
    expect(v.isEmpty).toBe(true);
    expect(v.result()).toEqual([null, null, null, null, null, null]);
  });
});
