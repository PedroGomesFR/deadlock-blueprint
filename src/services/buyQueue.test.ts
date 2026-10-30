import { describe, expect, it } from 'vitest';
import { HEROES_DB, ITEMS_DB, generateTacticalPlan, getHeroItemStat } from '../data/deadlockData';
import { makeTranslate } from '../i18n';
import { entry, ids, SPIKE_BUILD } from '../test/queue';
import {
  BuyQueue,
  computeBuyQueue,
  estimateClockS,
  isLaneOver,
  laneCounterDueS,
  nudgeTowardKeySpike,
  placeCounters,
} from './buyQueue';
import {
  KEY_CORE_PICK_RATE,
  KEY_SPIKE,
  SPIKES,
  inBuyOrder,
  investedSouls,
  investmentProgress,
  sellKeepsSpikes,
  spikeOrder,
} from './investments';
import { QueueEntry, getBuildItemIds, getComponentIds, getSellCandidates, getSlotPlans } from './recommendations';

const t = makeTranslate('en');

/** A deterministic random generator (mulberry32) so the simulated lineups never change. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const median = (values: number[]) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];

interface Tally {
  games: number;
  keyCoreBehindCounter: number; // a counter ahead of a key core item that is already due
  laneCounterAfterLaning: number;
  teamCounterBeforeFirstSpike: number;
  unansweredEnemyMissing: number; // a counter queued although every enemy it answers is answered
  laneBuySouls: number[];
  sells: number;
  sellsBreakingSpike: number;
}

/**
 * Plays every hero's meta build against random lineups (one of them with the lane opponent marked fed), always buying
 * the #1 with the inventory limit of 12, and checks the queue's rules at every step.
 */
function simulate(lineupsPerHero: number): Tally {
  const random = rng(5);
  const heroIds = HEROES_DB.map((h) => h.id);
  const tally: Tally = {
    games: 0,
    keyCoreBehindCounter: 0,
    laneCounterAfterLaning: 0,
    teamCounterBeforeFirstSpike: 0,
    unansweredEnemyMissing: 0,
    laneBuySouls: [],
    sells: 0,
    sellsBreakingSpike: 0,
  };
  for (const fedMode of [false, true]) {
    for (const heroId of heroIds) {
      const hero = HEROES_DB.find((h) => h.id === heroId)!;
      const build = hero.builds[0];
      const buildIds = getBuildItemIds(build);
      const stat = (id: string) => getHeroItemStat(heroId, id);
      const buyTimeS = (id: string) => stat(id)?.buyTimeS || undefined;
      const isKeyCore = (id: string) => (stat(id)?.pickRate ?? 0) >= KEY_CORE_PICK_RATE;
      const order = spikeOrder(inBuyOrder(buildIds, buyTimeS));
      for (let k = 0; k < lineupsPerHero; k++) {
        const team = heroIds.filter((e) => e !== heroId).sort(() => random() - 0.5).slice(0, 6);
        const lane = team.slice(0, 2);
        const plan = generateTacticalPlan(heroId, build.id, 'yellow', 'duo', lane, team, null, 'en', fedMode ? [lane[0]] : []);
        const counterIds = new Set(plan.priorityItems.map((r) => r.item.id));
        tally.games++;
        let owned: string[] = [];
        let spent = 0;
        let laneOverLatched = false;
        const seenLane = new Set<string>();
        for (let step = 0; step < 40 && spent < 45000; step++) {
          const laneOver: boolean = laneOverLatched || isLaneOver(undefined, spent);
          laneOverLatched = laneOver;
          const status = { itemIds: owned, occupied: owned.length, locked: 0, unmatched: 0 };
          const sellCandidates = getSellCandidates(status, build, counterIds);
          const investment = investmentProgress(order, owned);
          const { queue }: BuyQueue = computeBuyQueue({
            build,
            priorityItems: plan.priorityItems,
            matchupAlerts: plan.matchupAlerts,
            laneOutlook: plan.laneStrategy.outlook?.outlook,
            items: ITEMS_DB,
            t,
            ownedItems: owned,
            investedItems: owned,
            inventoryStatus: status,
            sellCandidates,
            investment,
            stat,
            laneOver,
          });
          if (queue.length === 0) break;

          const nowS = estimateClockS(spent);
          const firstSpikeDone = investment.categories.some((c) => c.done);
          queue.forEach((entry, index) => {
            if (!entry.role) return;
            if (entry.role === 'lane' && laneOver) tally.laneCounterAfterLaning++;
            if (entry.role === 'team' && !firstSpikeDone && nowS < SPIKES[0].pushUntilMin * 60) tally.teamCounterBeforeFirstSpike++;
            // A key core item that is due stays ahead of every counter
            const dueBehind = queue.some(
              (other, j) => j > index && !other.role && isKeyCore(other.item.id) && (buyTimeS(other.item.id) ?? Infinity) <= nowS
            );
            if (dueBehind) tally.keyCoreBehindCounter++;
          });

          const item = queue[0].item;
          const components = getComponentIds(item.id);
          const isUpgrade = [...components].some((c) => owned.includes(c));
          let next = owned.filter((o) => !components.has(o));
          if (!isUpgrade && owned.length >= 12) {
            const slotPlan = getSlotPlans(queue.slice(0, 6), owned, status, sellCandidates, (sold, bought) =>
              sellKeepsSpikes(owned, sold, bought)
            ).get(item.id);
            if (slotPlan?.kind !== 'sell') break;
            tally.sells++;
            const before = investedSouls(owned);
            next = next.filter((o) => o !== slotPlan.itemId);
            const after = investedSouls([...next, item.id]);
            if ((['weapon', 'spirit', 'vitality'] as const).some((c) => before[c] >= KEY_SPIKE && after[c] < KEY_SPIKE)) {
              tally.sellsBreakingSpike++;
            }
          }
          const refund = owned.filter((o) => components.has(o)).reduce((sum, o) => sum + ITEMS_DB[o].cost, 0);
          if (queue[0].role === 'lane' && !seenLane.has(item.id)) {
            seenLane.add(item.id);
            tally.laneBuySouls.push(spent);
          }
          spent += item.cost - refund;
          owned = [...next, item.id];
        }
      }
    }
  }
  return tally;
}

describe('placeCounters', () => {
  const times: Record<string, number> = {
    extra_spirit: 160,
    extended_magazine: 214,
    extra_regen: 280,
    improved_spirit: 560,
    titanic_magazine: 720,
    spirit_lifesteal: 870,
    boundless_spirit: 1500,
    metal_skin: 900,
  };
  const ctx = (over = {}) => ({
    nowS: 0,
    buyTimeS: (id: string) => times[id],
    isKeyCore: () => false,
    laneDueS: 215,
    teamReleased: false,
    ...over,
  });
  const buildEntries = ['improved_spirit', 'titanic_magazine', 'spirit_lifesteal'].map((id) => entry(id));

  it('puts a counter against a fed enemy first, a lane counter right after the first two items', () => {
    const queue = [entry('extra_spirit'), entry('extended_magazine'), ...buildEntries, entry('extra_charge', 'fed'), entry('extra_regen', 'lane')];
    expect(ids(placeCounters(queue, ctx({ teamReleased: true })))).toEqual([
      'extra_charge',
      'extra_spirit',
      'extended_magazine',
      'extra_regen',
      'improved_spirit',
      'titanic_magazine',
      'spirit_lifesteal',
    ]);
  });

  it('times a Tier 3-4 counter against a fed enemy by its usual buy time, at the front once that has passed', () => {
    const queue = [entry('extra_spirit'), entry('extended_magazine'), ...buildEntries, entry('metal_skin', 'fed')];
    const early = ids(placeCounters(queue, ctx({ nowS: 100 })));
    expect(early.indexOf('metal_skin')).toBe(early.length - 1); // usual buy time 900 s, after the whole build here
    expect(ids(placeCounters(queue, ctx({ nowS: 1000 })))[0]).toBe('extra_spirit');
    const late = ids(placeCounters([entry('improved_spirit'), entry('metal_skin', 'fed')], ctx({ nowS: 1000 })));
    expect(late).toEqual(['improved_spirit', 'metal_skin']);
  });

  it('never puts a counter ahead of a key core item that is already due', () => {
    const queue = [entry('extra_spirit'), entry('extended_magazine'), entry('improved_spirit'), entry('extra_charge', 'fed')];
    const keyCore = (id: string) => id === 'extended_magazine' || id === 'improved_spirit';
    // 10 min: improved_spirit (560 s) and extended_magazine are due, extra_spirit is not a key core item
    expect(ids(placeCounters(queue, ctx({ nowS: 600, isKeyCore: keyCore })))).toEqual([
      'extra_spirit',
      'extended_magazine',
      'improved_spirit',
      'extra_charge',
    ]);
    // 5 min: improved_spirit is not due yet, the fed counter goes ahead of it but not of the due extended_magazine
    expect(ids(placeCounters(queue, ctx({ nowS: 300, isKeyCore: keyCore })))).toEqual([
      'extra_spirit',
      'extended_magazine',
      'extra_charge',
      'improved_spirit',
    ]);
  });

  it('keeps a team counter out of the queue until the first spike, unless it is against a fed enemy', () => {
    const queue = [...buildEntries, entry('metal_skin', 'team'), entry('extra_regen', 'fed')];
    expect(ids(placeCounters(queue, ctx()))).toEqual(['extra_regen', 'improved_spirit', 'titanic_magazine', 'spirit_lifesteal']);
    const released = ids(placeCounters(queue, ctx({ teamReleased: true })));
    expect(released).toContain('metal_skin');
    // at its usual buy time (900 s), after the items bought before that
    expect(released.indexOf('metal_skin')).toBeGreaterThan(released.indexOf('spirit_lifesteal'));
  });

  it('returns the queue itself when it holds no counter', () => {
    const queue = [entry('extra_spirit'), ...buildEntries];
    expect(placeCounters(queue, ctx())).toBe(queue);
  });
});

describe('clock and lane timing', () => {
  const times: Record<string, number> = { extra_spirit: 160, extended_magazine: 214, improved_spirit: 560 };

  it('estimates the clock from the souls spent, and the lane due time from the first two items', () => {
    expect(estimateClockS(0)).toBe(0);
    expect(estimateClockS(6400)).toBe(600);
    expect(estimateClockS(7200)).toBe(660); // halfway from 10 to 12 min
    expect(estimateClockS(99999)).toBe(2400);
    expect(laneCounterDueS(['improved_spirit', 'extra_spirit', 'extended_magazine'], (id) => times[id])).toBe(215);
    expect(laneCounterDueS([], () => undefined)).toBe(241);
  });

  it('reads laning as over at 10 min, or at about 6,400 souls without a clock', () => {
    expect(isLaneOver(599, 0)).toBe(false);
    expect(isLaneOver(600, 0)).toBe(true);
    expect(isLaneOver(undefined, 6399)).toBe(false);
    expect(isLaneOver(undefined, 6400)).toBe(true);
    expect(isLaneOver(300, 9000)).toBe(false); // the clock wins when it is read
  });
});

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

describe('the buy queue on simulated games', () => {
  // 44 heroes x 3 lineups, each also with the lane opponent marked fed: 264 games
  const tally = simulate(3);

  it('never puts a counter ahead of a key core item that is already due', () => {
    expect(tally.games).toBe(264);
    expect(tally.keyCoreBehindCounter).toBe(0);
  });

  it('keeps team counters out of the queue until the first spike is done (or 14 min)', () => {
    expect(tally.teamCounterBeforeFirstSpike).toBe(0);
  });

  it('buys a lane counter right after the first items, never once laning is over', () => {
    expect(tally.laneCounterAfterLaning).toBe(0);
    expect(tally.laneBuySouls.length).toBeGreaterThan(0);
    expect(Math.max(...tally.laneBuySouls)).toBeLessThan(6400);
    expect(median(tally.laneBuySouls)).toBeLessThanOrEqual(3200);
  });

  it('never suggests a sale that drops a finished 4,800 spike', () => {
    expect(tally.sells).toBeGreaterThan(0);
    expect(tally.sellsBreakingSpike).toBe(0);
  });
});
