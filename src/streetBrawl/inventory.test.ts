import { describe, expect, it } from 'vitest';
import { frame, itemInfo, itemTemplates } from '../../tests/streetBrawl/fixtures';
import { noItemsOwned, observeSlots, ownedItems, readInventory } from './inventory';
import type { SlotReading } from './inventory';

/** Each slot read, as "row.col category tier item" (empty slots left out). */
const read = (name: string) =>
  readInventory(frame(name), itemTemplates, itemInfo)
    .filter((s) => !s.empty)
    .map((s) => `${s.row}.${s.col} ${s.badge?.category ?? '?'} ${s.badge?.tier ?? '?'} ${s.itemId ?? '-'}${s.enhanced ? ' enhanced' : ''}`);

describe('Street Brawl inventory', () => {
  it('reads every item of the in-play HUD, its badge, and nothing in the empty slots', () => {
    // Round 1, Nurse Harrow
    expect(read('inplay_round1')).toEqual([
      '0.0 weapon 2 titanic_magazine enhanced',
      '0.1 spirit 3 greater_expansion',
      '1.0 vitality 2 guardian_ward',
    ]);
  });

  it('reads no item on the round-end screen, which hides the slots', () => {
    expect(read('roundend_round3').filter((s) => !s.endsWith(' -'))).toEqual([]);
  });

  it('reads all 9 items under the pick screen, enhanced ones included (round 4)', () => {
    // Point Blank was reported owned in play: never here
    expect(read('pick_r4_c1_inventory_9_items')).toEqual([
      '0.0 spirit 1 spirit_strike',
      '0.1 vitality 2 enchanters_barrier',
      '0.2 vitality 3 spirit_resilience enhanced',
      '0.3 weapon 3 spirit_rend',
      '0.4 vitality 4 leech enhanced',
      '1.0 spirit 2 bullet_resist_shredder',
      '1.1 vitality 2 enduring_speed',
      '1.2 vitality 3 lifestrike',
      '1.3 spirit 4 mystic_reverb',
    ]);
  });

  it('reads all 12 items of a full round 5 inventory', () => {
    // Witchmail was reported owned: offered on the right card, in no slot
    expect(read('pick_r5_c1_inventory_12_items')).toEqual([
      '0.0 spirit 1 extra_spirit',
      '0.1 vitality 2 enchanters_barrier',
      '0.2 vitality 3 superior_stamina',
      '0.3 spirit 3 rapid_recharge',
      '0.4 weapon 4 spiritual_overflow',
      '0.5 spirit 4 arctic_blast enhanced',
      '1.0 weapon 2 recharging_rush',
      '1.1 vitality 2 healbane',
      '1.2 spirit 3 greater_expansion',
      '1.3 spirit 4 transcendent_cooldown',
      '1.4 spirit 4 magic_carpet',
      '1.5 spirit 4 spirit_burn',
    ]);
  });
});

describe('Street Brawl items owned', () => {
  const slot = (col: number, itemId: string | null): SlotReading => ({ row: 0, col, itemId, empty: false, enhanced: false });
  const scans = (state: ReturnType<typeof noItemsOwned>, n: number, slots: SlotReading[]) => {
    for (let i = 0; i < n; i++) state = observeSlots(state, slots);
    return state;
  };

  it('counts an item only when the same slot reads it several scans in a row', () => {
    let state = noItemsOwned();
    // A misread that comes and goes, many times over a game: never owned
    for (let i = 0; i < 50; i++) state = observeSlots(state, [slot(0, i % 3 === 0 ? 'point_blank' : null)]);
    expect(ownedItems(state)).toEqual([]);
    // The same item in another slot each scan: not a streak either
    for (let i = 0; i < 6; i++) state = observeSlots(state, [slot(i, 'point_blank')]);
    expect(ownedItems(state)).toEqual([]);
    // A real item: 4 scans in a row
    state = scans(state, 3, [slot(1, 'spirit_rend')]);
    expect(ownedItems(state)).toEqual([]);
    state = scans(state, 1, [slot(1, 'spirit_rend')]);
    expect(ownedItems(state)).toEqual(['spirit_rend']);
  });

  it('keeps an item through a hidden or empty-looking slot (cooldown, round-end screen)', () => {
    let state = scans(noItemsOwned(), 4, [slot(1, 'spirit_rend')]);
    state = scans(state, 20, []);
    state = scans(state, 20, [{ ...slot(1, null), empty: true }]);
    expect(ownedItems(state)).toEqual(['spirit_rend']);
  });

  it('replaces a confirmed misread as soon as the slot confirms its real item', () => {
    // A misread held for 4 scans (Witchmail), then the slot shows its real item again
    let state = scans(noItemsOwned(), 4, [slot(2, 'witchmail')]);
    expect(ownedItems(state)).toEqual(['witchmail']);
    state = scans(state, 4, [slot(2, 'superior_stamina')]);
    expect(ownedItems(state)).toEqual(['superior_stamina']);
  });
});
