import { describe, expect, it } from 'vitest';
import { entry, ids, SPIKE_BUILD } from '../test/queue';
import { investmentProgress, spikeOrder } from './investments';
import { QueueEntry } from './recommendations';
import { nudgeTowardKeySpike } from './buyQueue';

describe('nudgeTowardKeySpike', () => {
  const owned = ['tesla_bullets'];
  const progress = investmentProgress(spikeOrder(SPIKE_BUILD), owned);
  const queue = [entry('extended_magazine'), entry('close_quarters'), entry('long_range'), entry('heroic_aura')];
  const times: Record<string, number> = { extended_magazine: 600, close_quarters: 620, long_range: 700 };

  it('moves an item taking the target to 4,800 from #2 or #3 to #1 when it is usually bought about as early', () => {
    expect(ids(nudgeTowardKeySpike(queue, owned, progress, { buyTimeS: (id) => times[id] }))).toEqual([
      'long_range',
      'extended_magazine',
      'close_quarters',
      'heroic_aura',
    ]);
  });

  it('only nudges toward the target category', () => {
    // Spirit 2,400 is close enough to weapon 3,200 for the build's spirit-first order to hold
    const spiritOwned = [...owned, 'mystic_slow', 'extra_spirit'];
    const spiritTarget = investmentProgress(['spirit', 'weapon', 'vitality'], spiritOwned);
    expect(spiritTarget.fromInventory).toBe(false);
    expect(nudgeTowardKeySpike(queue, spiritOwned, spiritTarget, { buyTimeS: (id) => times[id] })).toBe(queue);
  });

  it('keeps the order when the spike item is usually bought much later', () => {
    expect(nudgeTowardKeySpike(queue, owned, progress, { buyTimeS: (id) => ({ ...times, long_range: 900 })[id] })).toBe(queue);
  });

  it('does not nudge an item whose spike the sale it needs takes back', () => {
    const full = ['tesla_bullets', 'extended_magazine'];
    const fullProgress = investmentProgress(spikeOrder(SPIKE_BUILD), full);
    const q = [entry('extra_spirit'), entry('monster_rounds')];
    const at = () => 600;
    expect(ids(nudgeTowardKeySpike(q, full, fullProgress, { buyTimeS: at }))).toEqual(['monster_rounds', 'extra_spirit']);
    // The #1 sells the weakest item: once moved to #1, the spike item would sell Extended Magazine
    const sold = (queue: QueueEntry[], id: string) => (queue[0].item.id === id ? 'extended_magazine' : undefined);
    expect(nudgeTowardKeySpike(q, full, fullProgress, { buyTimeS: at, soldFor: sold })).toBe(q);
  });

  it('never moves a spike item above a key core item', () => {
    const keyCore = new Set(['close_quarters']);
    const isKeyCore = (id: string) => keyCore.has(id);
    // #2 is a key core item standing between #1 and the spike item at #3
    expect(nudgeTowardKeySpike(queue, owned, progress, { buyTimeS: (id) => times[id], isKeyCore })).toBe(queue);
    // a key core item at #1 holds the spike item behind it too
    const keyFirst = new Set(['extended_magazine']);
    expect(nudgeTowardKeySpike(queue, owned, progress, { buyTimeS: (id) => times[id], isKeyCore: (id) => keyFirst.has(id) })).toBe(queue);
    // without a key core item in front, the nudge still happens
    expect(ids(nudgeTowardKeySpike(queue, owned, progress, { buyTimeS: (id) => times[id], isKeyCore: () => false }))[0]).toBe('long_range');
  });

  it('does not reorder the build\'s queue when the target comes from the inventory', () => {
    const fromInventory = { ...progress, fromInventory: true };
    expect(nudgeTowardKeySpike(queue, owned, fromInventory, { buyTimeS: (id) => times[id] })).toBe(queue);
  });

  it('never reaches past #3', () => {
    const late = [entry('extended_magazine'), entry('close_quarters'), entry('monster_rounds'), entry('long_range')];
    expect(nudgeTowardKeySpike(late, owned, progress, { buyTimeS: () => 600 })).toBe(late);
  });

  it('does not nudge toward a spike past its window', () => {
    const atMinute = (minute: number) => investmentProgress(spikeOrder(SPIKE_BUILD), owned, minute * 60);
    expect(ids(nudgeTowardKeySpike(queue, owned, atMinute(12), { buyTimeS: (id) => times[id] }))[0]).toBe('long_range');
    expect(nudgeTowardKeySpike(queue, owned, atMinute(16), { buyTimeS: (id) => times[id] })).toBe(queue);
  });
});
