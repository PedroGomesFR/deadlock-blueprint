import { describe, expect, it } from 'vitest';
import { HEROES_DB, getHeroItemStat } from '../data/deadlockData';
import { readJournal, replayJournal } from '../test/journalReplay';
import { SPIKE_BUILD } from '../test/queue';
import { getBuildItemIds } from './recommendations';
import {
  inBuyOrder,
  investedSouls,
  investmentItems,
  investmentProgress,
  paceStatus,
  keySpikeReached,
  spikeOrder,
  spikeBadge,
} from './investments';

describe('investedSouls', () => {
  it('sums the owned items per category', () => {
    expect(investedSouls(['extended_magazine', 'monster_rounds']).weapon).toBe(1600);
  });

  it('counts an upgrade at its full cost and not its consumed component', () => {
    expect(investedSouls(['cultist_sacrifice', 'monster_rounds']).weapon).toBe(3200);
  });
});

describe('investmentItems', () => {
  const manual = new Set(['tesla_bullets']);

  it('counts a hand-marked item ("Skip") only once the scanner sees it', () => {
    expect(investmentItems(['tesla_bullets', 'extended_magazine'], manual, ['extended_magazine'])).toEqual([
      'extended_magazine',
    ]);
    expect(investmentItems(['tesla_bullets'], manual, ['tesla_bullets'])).toEqual(['tesla_bullets']);
  });

  it('keeps the hand-marked items without an inventory read', () => {
    expect(investmentItems(['tesla_bullets'], manual, null)).toEqual(['tesla_bullets']);
  });
});

describe('inBuyOrder', () => {
  it('orders the build by usual buy time, not by phase', () => {
    const times: Record<string, number> = { extra_spirit: 160, tesla_bullets: 600, long_range: 1300 };
    expect(inBuyOrder(['extra_spirit', 'long_range', 'tesla_bullets'], (id) => times[id])).toEqual([
      'extra_spirit',
      'tesla_bullets',
      'long_range',
    ]);
  });

  it('keeps an item without a buy time after the item before it', () => {
    const times: Record<string, number> = { extra_spirit: 900, long_range: 300 };
    expect(inBuyOrder(['extra_spirit', 'mystic_slow', 'long_range'], (id) => times[id])).toEqual([
      'long_range',
      'extra_spirit',
      'mystic_slow',
    ]);
  });
});

describe('spikeOrder', () => {
  it('follows the order the build takes each category to 4,800', () => {
    expect(spikeOrder(SPIKE_BUILD)).toEqual(['weapon', 'spirit', 'vitality']);
  });

  it('puts the categories the build never takes to 4,800 last, most souls first', () => {
    expect(spikeOrder(['mystic_slow', 'healbane', 'extra_regen', 'extended_magazine'])).toEqual([
      'vitality',
      'spirit',
      'weapon',
    ]);
  });
});

describe('investmentProgress', () => {
  const order = spikeOrder(SPIKE_BUILD);

  it('targets the first category of the order that is not at 4,800 yet', () => {
    const progress = investmentProgress(order, ['tesla_bullets']);
    expect(progress.target).toEqual({ category: 'weapon', souls: 3200, done: false });
    expect(progress.spikeNumber).toBe(1);
    expect(progress.pace).toEqual({ highRank: 10.2, lowRank: 11.6 });
  });

  it('moves on to the next category once one is at 4,800', () => {
    const progress = investmentProgress(order, ['tesla_bullets', 'long_range', 'slowing_hex']);
    expect(progress.categories.map((c) => c.done)).toEqual([true, false, false]);
    expect(progress.target?.category).toBe('spirit');
    expect(progress.spikeNumber).toBe(2);
    expect(progress.pace).toEqual({ highRank: 15.3, lowRank: 17.4 });
  });

  it('counts a spike reached out of order', () => {
    const progress = investmentProgress(order, ['metal_skin', 'healbane']);
    expect(progress.target?.category).toBe('weapon');
    expect(progress.spikeNumber).toBe(2);
  });

  it('follows the category the player committed to: 2,400+ souls and 1,600 ahead of the build\'s next one', () => {
    const spiritFirst: ('spirit' | 'weapon' | 'vitality')[] = ['spirit', 'weapon', 'vitality'];
    const committed = investmentProgress(spiritFirst, ['tesla_bullets']);
    expect(committed.target?.category).toBe('weapon');
    expect(committed.fromInventory).toBe(true);
    expect(committed.categories.map((c) => c.category)).toEqual(['weapon', 'spirit', 'vitality']);
    expect(investmentProgress(spiritFirst, ['tesla_bullets', 'mystic_slow']).target?.category).toBe('weapon');
    // Not far enough ahead, or not enough souls yet: the build's order holds
    const close = investmentProgress(spiritFirst, ['tesla_bullets', 'mystic_slow', 'extra_spirit']);
    expect(close.target?.category).toBe('spirit');
    expect(close.fromInventory).toBe(false);
    expect(investmentProgress(spiritFirst, ['long_range']).target?.category).toBe('spirit');
  });

  it('lists the categories at 4,800 first, then the target', () => {
    const progress = investmentProgress(order, ['metal_skin', 'healbane']);
    expect(progress.categories.map((c) => c.category)).toEqual(['vitality', 'weapon', 'spirit']);
  });

  it('has no target once all three are at 4,800', () => {
    const progress = investmentProgress(order, SPIKE_BUILD);
    expect(progress.target).toBeNull();
    expect(progress.pace).toBeNull();
  });
});

describe('keySpikeReached', () => {
  it('gives the category the item takes to 4,800', () => {
    expect(keySpikeReached('long_range', ['tesla_bullets'])).toBe('weapon');
    expect(keySpikeReached('extended_magazine', ['tesla_bullets'])).toBeNull();
  });

  it('counts an upgrade minus the component it consumes', () => {
    expect(keySpikeReached('capacitor', ['tesla_bullets'])).toBe('weapon');
  });

  it('takes out the item sold to make room first', () => {
    expect(keySpikeReached('monster_rounds', ['tesla_bullets', 'extended_magazine'])).toBe('weapon');
    expect(keySpikeReached('monster_rounds', ['tesla_bullets', 'extended_magazine'], 'extended_magazine')).toBeNull();
    expect(keySpikeReached('monster_rounds', ['tesla_bullets', 'extended_magazine', 'extra_spirit'], 'extra_spirit')).toBe(
      'weapon'
    );
  });

  it('is null once the category is already past 4,800', () => {
    expect(keySpikeReached('long_range', ['silencer'])).toBeNull();
  });
});

describe('spikeBadge', () => {
  const order = spikeOrder(SPIKE_BUILD);
  const worthIt = (itemId: string, owned: string[]) => spikeBadge(itemId, owned, investmentProgress(order, owned)) !== null;

  it('points out an item finishing the first or second spike', () => {
    expect(worthIt('long_range', ['tesla_bullets'])).toBe(true);
    expect(worthIt('slowing_hex', ['tesla_bullets', 'long_range', 'mystic_slow', 'mystic_vulnerability'])).toBe(true);
  });

  it('ignores a spike outside the target category', () => {
    expect(worthIt('metal_skin', ['tesla_bullets', 'healbane'])).toBe(false);
  });

  it('points out the third spike only for a top-up of 800 souls or less', () => {
    const twoSpikes = ['tesla_bullets', 'long_range', 'slowing_hex', 'mystic_slow', 'mystic_vulnerability'];
    expect(worthIt('metal_skin', [...twoSpikes, 'healbane'])).toBe(false);
    expect(worthIt('extra_health', [...twoSpikes, 'metal_skin', 'extra_regen'])).toBe(true);
  });
});

describe('recorded Infernus game (sapphire_infernus_full)', () => {
  // The player went vitality, then weapon; the meta build goes spirit first. Spirit stayed at 1,600 most of the game.
  const build = HEROES_DB.find((h) => h.id === 'infernus')!.builds[0];
  const order = spikeOrder(
    inBuyOrder(getBuildItemIds(build), (id) =>
      getHeroItemStat('infernus', id)?.buyTimeS
    )
  );
  const steps = replayJournal(readJournal('tests/replays/sapphire_infernus_full.journal.log.gz'));
  const targetAt = (minute: number) => {
    const step = steps.find((s) => s.t - steps[0].t >= minute * 60_000)!;
    return investmentProgress(order, step.state.ownedItems).target?.category;
  };

  it('starts from the build, spirit first', () => {
    expect(order[0]).toBe('spirit');
    expect(targetAt(5)).toBe('spirit');
  });

  it('follows vitality, then weapon, as the player built them', () => {
    expect(targetAt(13)).toBe('vitality');
    expect(targetAt(22)).toBe('weapon');
  });
});

describe('spike windows', () => {
  const order = spikeOrder(SPIKE_BUILD);
  const min = (m: number) => m * 60;
  const oneSpike = ['tesla_bullets', 'long_range'];
  const twoSpikes = [...oneSpike, 'slowing_hex', 'mystic_slow', 'mystic_vulnerability'];

  it('pushes the first spike until 14 min, the second until 20, the third until 24', () => {
    expect(investmentProgress(order, [], min(13)).push).toBe('full');
    expect(investmentProgress(order, [], min(14)).push).toBe('off');
    expect(investmentProgress(order, oneSpike, min(19)).push).toBe('full');
    expect(investmentProgress(order, oneSpike, min(20)).push).toBe('off');
    expect(investmentProgress(order, twoSpikes, min(21)).push).toBe('full');
    expect(investmentProgress(order, twoSpikes, min(22)).push).toBe('top-up');
    expect(investmentProgress(order, twoSpikes, min(24)).push).toBe('off');
  });

  it('without a clock pushes the first two spikes and the third only as a top-up, as before', () => {
    expect(investmentProgress(order, []).push).toBe('full');
    expect(investmentProgress(order, oneSpike).push).toBe('full');
    expect(investmentProgress(order, twoSpikes).push).toBe('top-up');
    expect(investmentProgress(order, SPIKE_BUILD).push).toBe('off'); // all three done: no target
  });

  it('points out no item once the spike is past its window', () => {
    const early = investmentProgress(order, ['tesla_bullets'], min(10));
    expect(spikeBadge('long_range', ['tesla_bullets'], early) !== null).toBe(true);
    const late = investmentProgress(order, ['tesla_bullets'], min(15));
    expect(spikeBadge('long_range', ['tesla_bullets'], late) !== null).toBe(false);
  });

  it('points out any item for the third spike before 22 min, a top-up only after', () => {
    const owned = [...twoSpikes, 'healbane'];
    expect(spikeBadge('metal_skin', owned, investmentProgress(order, owned, min(21))) !== null).toBe(true);
    expect(spikeBadge('metal_skin', owned, investmentProgress(order, owned, min(23))) !== null).toBe(false);
    const cheap = [...twoSpikes, 'metal_skin', 'extra_regen'];
    expect(spikeBadge('extra_health', cheap, investmentProgress(order, cheap, min(23))) !== null).toBe(true);
    expect(spikeBadge('extra_health', cheap, investmentProgress(order, cheap, min(25))) !== null).toBe(false);
  });

});

describe('spikeBadge top-up', () => {
  const order = spikeOrder(SPIKE_BUILD);
  const owned = ['tesla_bullets', 'extended_magazine']; // weapon at 4,000
  const progress = investmentProgress(order, owned, 12 * 60);

  it('gives the last souls when an item crosses 4,800 from 4,000 or more', () => {
    expect(spikeBadge('monster_rounds', owned, progress)?.topUp).toBe(800);
    expect(spikeBadge('titanic_magazine', owned, progress)?.topUp).toBe(800); // 800 to 1,600 upgrade
  });

  it('is null for an item adding more than 800, or from below 4,000', () => {
    expect(spikeBadge('long_range', owned, progress)?.topUp ?? null).toBeNull();
    const far = ['tesla_bullets'];
    expect(spikeBadge('long_range', far, investmentProgress(order, far, 12 * 60))?.topUp ?? null).toBeNull();
  });

  it('is null once the spike is past its window', () => {
    expect(spikeBadge('monster_rounds', owned, investmentProgress(order, owned, 15 * 60))?.topUp ?? null).toBeNull();
  });
});

describe('paceStatus', () => {
  const order = spikeOrder(SPIKE_BUILD);
  const status = (owned: string[], clockMin?: number) =>
    paceStatus(investmentProgress(order, owned, clockMin === undefined ? undefined : clockMin * 60), clockMin === undefined ? undefined : clockMin * 60);

  it('is on pace until the slower median minute of the spike, then behind', () => {
    expect(status([], 10)).toBe('onPace');
    expect(status([], 11.6)).toBe('onPace');
    expect(status([], 12)).toBe('behind'); // first spike: rank 1-40 median is 11.6 min
  });

  it('is onPace without a clock: nobody can be behind', () => {
    expect(status([])).toBe('onPace');
  });

  it('is past once the spike is outside its push window, and top-up for a late third spike', () => {
    expect(status([], 14)).toBe('past');
    const twoSpikes = ['tesla_bullets', 'long_range', 'slowing_hex', 'mystic_slow', 'mystic_vulnerability'];
    expect(status(twoSpikes, 23)).toBe('topUp');
    expect(status(twoSpikes, 25)).toBe('past');
  });
});
