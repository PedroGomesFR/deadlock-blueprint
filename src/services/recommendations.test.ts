import { describe, expect, it } from 'vitest';
import { HeroBuildArchetype, ITEMS_DB, TacticalRecommendation } from '../data/deadlockData';
import { makeTranslate } from '../i18n';
import {
  InventoryStatus,
  buildPurchaseOrder,
  counterRole,
  dropAnsweredCounters,
  effectiveOwnedSet,
  getComponentIds,
  getNextPurchases,
  getPurchaseCounters,
  getSellCandidates,
  getSlotPlans,
  hasLaneThreat,
  isInventoryFull,
  isStaleLock,
  withLockedFirst,
} from './recommendations';
import { entry } from '../test/queue';
import { sellKeepsSpikes } from './investments';

const t = makeTranslate('en');

const build = (phases: Partial<HeroBuildArchetype['phases']>): HeroBuildArchetype => ({
  id: 'test',
  name: 'test',
  subtitle: '',
  playstyle: '',
  recommendedForLanes: ['solo', 'duo'],
  abilitiesOrder: ['1', '2', '3', '4'],
  abilitiesDetails: [],
  phases: { early: [], mid: [], late: [], situational: [], ...phases },
  laneTips: { solo: '', duo: '', yellow_purple: '', orange_blue: '' },
});

const counter = (
  id: string,
  reason = `Counters X`,
  urgency: TacticalRecommendation['priorityItems'][number]['urgency'] = 'Critique (En Face / Lane)'
): TacticalRecommendation['priorityItems'][number] => ({
  item: ITEMS_DB[id],
  reasons: [reason],
  urgency,
});

const status = (itemIds: string[], occupied: number, locked = 0): InventoryStatus => ({
  itemIds,
  occupied,
  locked,
  unmatched: 0,
});

const BUILD = build({
  early: ['extra_spirit', 'extended_magazine', 'extra_regen', 'extra_charge'],
  mid: ['improved_spirit', 'titanic_magazine', 'spirit_lifesteal'],
  late: ['boundless_spirit'],
});

describe('upgrade components', () => {
  it('follows the whole chain', () => {
    expect([...getComponentIds('boundless_spirit')].sort()).toEqual(['extra_spirit', 'improved_spirit']);
    expect([...effectiveOwnedSet(['boundless_spirit'])].sort()).toEqual(['boundless_spirit', 'extra_spirit', 'improved_spirit']);
  });
});

describe('purchase order', () => {
  it('uses the same limited set of counters for the queue and highlighting', () => {
    const ids = ['extra_spirit', 'extra_regen', 'extra_charge', 'boundless_spirit'];
    const priorities = ids.map((id) => counter(id));
    const selected = getPurchaseCounters(priorities).map((r) => r.item.id);
    expect(selected).toEqual(['extra_spirit', 'boundless_spirit']);
    const order = buildPurchaseOrder(build({}), priorities, ITEMS_DB, t);
    expect(order.map((entry) => entry.item.id)).toEqual(selected);
  });

  it('ignores a counter against a single team enemy, keeps lane counters and counters against two enemies', () => {
    const teamOnly = counter('healbane', '[TEAM] Anti-heal vs Abrams', 'Haute (Teamfight / Mid)');
    expect(getPurchaseCounters([teamOnly])).toEqual([]);
    const twoEnemies = { ...teamOnly, reasons: ['[TEAM] Anti-heal vs Abrams', '[TEAM] Anti-heal vs Kelvin'] };
    expect(getPurchaseCounters([twoEnemies]).map((r) => r.item.id)).toEqual(['healbane']);
    const lane = counter('healbane', '[LANE] Anti-heal vs Abrams');
    expect(getPurchaseCounters([lane]).map((r) => r.item.id)).toEqual(['healbane']);
  });

  it('leaves the build untouched when no counter is strong enough', () => {
    const teamOnly = counter('healbane', '[TEAM] Anti-heal vs Abrams', 'Haute (Teamfight / Mid)');
    const withCounter = buildPurchaseOrder(BUILD, [teamOnly], ITEMS_DB, t).map((e) => e.item.id);
    expect(withCounter).toEqual(buildPurchaseOrder(BUILD, [], ITEMS_DB, t).map((e) => e.item.id));
  });

  it.each([
    ['early', 'healbane'],
    ['mid', 'boundless_spirit'],
  ] as const)('keeps the counter explanation when the item is already in the first %s purchases', (phase, id) => {
    const activeBuild = build({ [phase]: [id] });
    const reason = 'Useful against the selected enemy';
    const order = buildPurchaseOrder(activeBuild, [counter(id, reason)], ITEMS_DB, t);
    expect(order.map((entry) => entry.item.id)).toEqual([id]);
    expect(order[0]).toMatchObject({ phase, reason });
  });

  it('interleaves the lane counters after the first two early items', () => {
    const order = buildPurchaseOrder(BUILD, [counter('healbane'), counter('boundless_spirit')], ITEMS_DB, t).map((e) => e.item.id);
    expect(order.slice(0, 3)).toEqual(['extra_spirit', 'extended_magazine', 'healbane']);
    expect(order).toContain('boundless_spirit');
    expect(new Set(order).size).toBe(order.length);
  });

  it('keeps the counter reason, and the phase of build items', () => {
    const order = buildPurchaseOrder(BUILD, [counter('healbane', '[LANE] Anti-heal vs Abrams')], ITEMS_DB, t);
    const healbane = order.find((e) => e.item.id === 'healbane')!;
    expect(healbane.reason).toBe('[LANE] Anti-heal vs Abrams');
    expect(order[0].reason).toBe(t('reason.earlyPriority'));
    expect(order[0].phase).toBe('early');
  });

  it('uses a translated fallback when a counter has no explanation', () => {
    const withoutReason = { ...counter('healbane'), reasons: [] };
    const order = buildPurchaseOrder(build({ early: ['healbane'] }), [withoutReason], ITEMS_DB, t);
    expect(order[0].reason).toBe(t('reason.laneCounter'));
  });

  it('builds the reason text in the requested language without changing purchase order', () => {
    const french = makeTranslate('fr');
    const englishOrder = buildPurchaseOrder(BUILD, [], ITEMS_DB, t);
    const frenchOrder = buildPurchaseOrder(BUILD, [], ITEMS_DB, french);
    expect(englishOrder[0].reason).toBe(t('reason.earlyPriority'));
    expect(frenchOrder[0].reason).toBe(french('reason.earlyPriority'));
    expect(frenchOrder[0].reason).not.toBe(englishOrder[0].reason);
    expect(frenchOrder.map((entry) => entry.item.id)).toEqual(englishOrder.map((entry) => entry.item.id));
  });
});

describe('lane counters', () => {
  const lane = counter('extra_charge', '[LANE] Sustain vs Abrams'); // Tier 1, lane-only
  const laneT3 = counter('metal_skin', '[LANE] Metal Skin vs Abrams'); // Tier 3
  const fed = counter('extra_regen', '🔥 [LANE] Sustain vs Ivy'); // Tier 1
  const twoEnemies = {
    ...counter('spirit_resilience', '[TEAM] Resist vs Abrams', 'Haute (Teamfight / Mid)'),
    reasons: ['[TEAM] Resist vs Abrams', '[TEAM] Resist vs Kelvin'],
  };
  const queuedIds = (priorities: ReturnType<typeof counter>[], context = {}) =>
    getPurchaseCounters(priorities, context).map((r) => r.item.id);

  it('needs a real lane threat: a lane enemy to avoid, a fed lane enemy or a hard lane', () => {
    const alert = (over: object) => ({ isInMyLane: true, isFed: false, stance: 'even' as const, ...over });
    expect(hasLaneThreat([alert({})], 'even')).toBe(false);
    expect(hasLaneThreat([alert({ stance: 'avoid' })])).toBe(true);
    expect(hasLaneThreat([alert({ isFed: true })])).toBe(true);
    expect(hasLaneThreat([alert({})], 'hard')).toBe(true);
    expect(hasLaneThreat([alert({ isInMyLane: false, stance: 'avoid' })], 'favourable')).toBe(false);
  });

  it('keeps a lane-only counter out of the queue without a lane threat', () => {
    expect(queuedIds([lane, laneT3], { laneThreat: false })).toEqual([]);
    expect(queuedIds([lane, laneT3], { laneThreat: true })).toEqual(['extra_charge', 'metal_skin']);
  });

  it('drops a Tier 1-2 lane-only counter once laning is over, and keeps a Tier 3-4 one', () => {
    expect(queuedIds([lane, laneT3], { laneThreat: true, laneOver: true })).toEqual(['metal_skin']);
  });

  it('never touches the counters against a fed enemy or against two enemies', () => {
    const noLane = { laneThreat: false, laneOver: true };
    expect(queuedIds([fed, twoEnemies], noLane)).toEqual(['extra_regen', 'spirit_resilience']);
  });

  it('counts an item against both lane enemies as a lane counter, not one that also answers a team enemy', () => {
    const bothLane = { ...lane, reasons: ['[LANE] Sustain vs Abrams', '[LANE] Sustain vs Kelvin'] };
    const laneAndTeam = { ...lane, reasons: ['[LANE] Sustain vs Abrams', '[TEAM] Sustain vs Kelvin'] };
    expect(queuedIds([bothLane], { laneThreat: false })).toEqual([]);
    expect(queuedIds([laneAndTeam], { laneThreat: false })).toEqual(['extra_charge']);
  });

  it('keeps the old behaviour without a context', () => {
    expect(queuedIds([lane, laneT3])).toEqual(['extra_charge', 'metal_skin']);
  });

  it('puts the lane counter after the first two early items, and nowhere once laning is over', () => {
    const early = (context: object) =>
      buildPurchaseOrder(BUILD, [lane], ITEMS_DB, t, context).map((e) => e.item.id);
    expect(early({ laneThreat: true, laneOver: false }).slice(0, 3)).toEqual(['extra_spirit', 'extended_magazine', 'extra_charge']);
    expect(early({ laneThreat: true, laneOver: true })).toEqual(
      buildPurchaseOrder(BUILD, [], ITEMS_DB, t).map((e) => e.item.id)
    );
  });

});

describe('counter roles', () => {
  it('gives each counter its role: fed, a Tier 1-2 lane counter, or team', () => {
    const rec = (id: string, reasons: string[], urgency: TacticalRecommendation['priorityItems'][number]['urgency'] = 'Critique (En Face / Lane)') => ({
      item: ITEMS_DB[id],
      reasons,
      urgency,
    });
    expect(counterRole(rec('extra_regen', ['🔥 [LANE] Sustain vs Ivy']))).toBe('fed');
    expect(counterRole(rec('extra_regen', ['[LANE] Sustain vs Abrams', '[LANE] Sustain vs Kelvin']))).toBe('lane');
    expect(counterRole(rec('metal_skin', ['[LANE] Metal Skin vs Abrams']))).toBe('team'); // Tier 3: cannot be a lane item
    expect(counterRole(rec('extra_regen', ['[LANE] Sustain vs Abrams', '[TEAM] Sustain vs Kelvin']))).toBe('team');
  });


  it('marks only the counters outside the build with a role', () => {
    const lane = { item: ITEMS_DB.extra_charge, reasons: ['[LANE] Sustain vs Abrams'], urgency: 'Critique (En Face / Lane)' as const };
    const inBuild = { item: ITEMS_DB.extra_spirit, reasons: ['[LANE] Sustain vs Abrams'], urgency: 'Critique (En Face / Lane)' as const };
    const order = buildPurchaseOrder(BUILD, [lane, inBuild], ITEMS_DB, t);
    expect(order.find((e) => e.item.id === 'extra_charge')?.role).toBeUndefined(); // in the build: keeps its place
    const outside = buildPurchaseOrder(build({ early: ['extra_spirit'] }), [lane], ITEMS_DB, t);
    expect(outside.find((e) => e.item.id === 'extra_charge')?.role).toBe('lane');
  });
});

describe('answered threats', () => {
  const alert = (counterIds: string[]) => ({ counters: counterIds.map((id) => ({ item: ITEMS_DB[id] })) });
  const rec = (id: string) => ({ item: ITEMS_DB[id], reasons: ['[LANE] x'], urgency: 'Critique (En Face / Lane)' as const });

  it('drops a counter whose enemies each have a counter in the build or owned', () => {
    const alerts = [alert(['metal_skin', 'healbane']), alert(['metal_skin', 'toxic_bullets'])];
    expect(dropAnsweredCounters([rec('metal_skin')], alerts, new Set(['healbane', 'toxic_bullets'])).length).toBe(0);
  });

  it('keeps a counter while one of its enemies is not answered yet', () => {
    const alerts = [alert(['metal_skin', 'healbane']), alert(['metal_skin', 'toxic_bullets'])];
    expect(dropAnsweredCounters([rec('metal_skin')], alerts, new Set(['healbane'])).map((r) => r.item.id)).toEqual(['metal_skin']);
  });

  it('keeps an item that is itself in the build, and a counter no enemy lists', () => {
    const alerts = [alert(['healbane'])];
    expect(dropAnsweredCounters([rec('healbane')], alerts, new Set(['healbane'])).length).toBe(1);
    expect(dropAnsweredCounters([rec('monster_rounds')], alerts, new Set(['healbane'])).length).toBe(1);
  });
});

describe('next purchases', () => {
  const order = buildPurchaseOrder(BUILD, [], ITEMS_DB, t);

  it('never suggests an owned item nor a component consumed by an owned upgrade', () => {
    const next = getNextPurchases(order, ['boundless_spirit'], null, []).map((e) => e.item.id);
    expect(next).not.toContain('boundless_spirit');
    expect(next).not.toContain('improved_spirit');
    expect(next).not.toContain('extra_spirit');
  });

  it('moves on to the mid / late items once the early slots are filled', () => {
    const next = getNextPurchases(order, ['extra_spirit', 'extended_magazine', 'extra_regen'], null, []);
    expect(next[0].item.tier).toBeGreaterThanOrEqual(2);
    expect(next.at(-1)!.item.id).toBe('extra_charge');
  });

  it('with a full inventory, skips items weaker than the weakest one it would replace', () => {
    const full = status(['extra_regen', 'extra_charge', 'improved_spirit', 'titanic_magazine'], 12);
    const sell = getSellCandidates(full, BUILD, new Set());
    expect(ITEMS_DB[sell[0]].tier).toBe(1);
    const fullOfTier2 = status(['improved_spirit', 'titanic_magazine', 'spirit_lifesteal'], 9, 3);
    const next = getNextPurchases(order, fullOfTier2.itemIds, fullOfTier2, getSellCandidates(fullOfTier2, BUILD, new Set()));
    expect(next.every((e) => e.item.tier >= 2)).toBe(true);
  });

  it('orders by the usual buy time, items without a time keeping their position', () => {
    const times: Record<string, number> = { titanic_magazine: 600, improved_spirit: 1200, boundless_spirit: 300 };
    const next = getNextPurchases(order, ['extra_spirit', 'extended_magazine', 'extra_regen'], null, [], (id) => times[id]);
    const ids = next.map((e) => e.item.id);
    const noTimes = getNextPurchases(order, ['extra_spirit', 'extended_magazine', 'extra_regen'], null, []).map((e) => e.item.id);
    const timedIds = ids.filter((id) => id in times);
    expect(timedIds).toEqual(['boundless_spirit', 'titanic_magazine', 'improved_spirit']);
    // untimed entries stay where they were, early leftovers stay last
    ids.forEach((id, i) => {
      if (!(id in times)) expect(noTimes[i]).toBe(id);
    });
    expect(ids.at(-1)).toBe('extra_charge');
  });

  it('keeps the locked #1 first', () => {
    const next = getNextPurchases(order, [], null, []);
    const locked = withLockedFirst(next, next[3].item.id);
    expect(locked[0].item.id).toBe(next[3].item.id);
    expect(locked).toHaveLength(next.length);
  });

  it('lets go of a lock left from the last game, but not of one on an earlier item', () => {
    // Ivy, 0 items: the head is usually bought at 1:31, Tesla Bullets (locked at the end of the last game) at 9:06
    const queue = [entry('extended_magazine'), entry('monster_rounds'), entry('tesla_bullets')];
    const times: Record<string, number> = { extended_magazine: 91, monster_rounds: 170, tesla_bullets: 546 };
    const buyTimeS = (id: string) => times[id];
    expect(isStaleLock(queue, 'tesla_bullets', buyTimeS)).toBe(true);
    expect(isStaleLock(queue, 'monster_rounds', buyTimeS)).toBe(false);
    expect(isStaleLock(queue, 'extended_magazine', buyTimeS)).toBe(false);
    // a counter placed first that is bought later than the locked item does not release it
    expect(isStaleLock([entry('tesla_bullets'), ...queue], 'extended_magazine', buyTimeS)).toBe(false);
    // without usual buy times nothing is stale
    expect(isStaleLock(queue, 'tesla_bullets', () => undefined)).toBe(false);
  });
});

describe('inventory full', () => {
  it('counts padlocked slots as unavailable', () => {
    expect(isInventoryFull(status([], 9, 3))).toBe(true);
    expect(isInventoryFull(status([], 9, 2))).toBe(false);
    expect(isInventoryFull(null)).toBe(false);
  });

  it('sells the least useful item first: outside the build, then the lowest tier', () => {
    const full = status(['spirit_lifesteal', 'healbane', 'extra_regen'], 12);
    expect(getSellCandidates(full, BUILD, new Set())).toEqual(['healbane', 'extra_regen', 'spirit_lifesteal']);
    expect(getSellCandidates(full, BUILD, new Set(['healbane']))[0]).toBe('extra_regen');
  });

  it('shows "replaces" for an upgrade and "sell" for the others, never selling an upgraded component', () => {
    const owned = ['extra_spirit', 'extra_regen', 'healbane'];
    const full = status(owned, 12);
    const shown = buildPurchaseOrder(BUILD, [], ITEMS_DB, t).filter((e) => ['improved_spirit', 'titanic_magazine'].includes(e.item.id));
    const plans = getSlotPlans(shown, owned, full, getSellCandidates(full, BUILD, new Set()));
    expect(plans.get('improved_spirit')).toEqual({ kind: 'upgrade', itemId: 'extra_spirit' });
    expect(plans.get('titanic_magazine')).toEqual({ kind: 'sell', itemId: 'healbane' });
  });

  describe('finished 4,800 spikes', () => {
    // Weapon at 4,800 with Tesla Bullets and Long Range; Healbane (vitality, 800) is the weakest item
    const owned = ['tesla_bullets', 'long_range', 'healbane', 'extra_regen'];
    const full = status(owned, 12);
    const candidates = getSellCandidates(full, build({}), new Set());

    it('tells a sale that drops a finished spike from one that does not', () => {
      expect(sellKeepsSpikes(owned, 'long_range', 'extended_magazine')).toBe(false);
      expect(sellKeepsSpikes(owned, 'long_range', 'close_quarters')).toBe(false);
      expect(sellKeepsSpikes(owned, 'healbane', 'extended_magazine')).toBe(true);
    });

    it('lets the new item bring the category back to 4,800', () => {
      expect(sellKeepsSpikes(owned, 'long_range', 'swift_striker')).toBe(true); // 1,600 for 1,600
    });

    it('suggests the next weakest item when the first would break a spike', () => {
      const shown = [{ item: ITEMS_DB.extended_magazine, reason: '' }];
      const plain = getSlotPlans(shown, owned, full, ['long_range', 'healbane']);
      expect(plain.get('extended_magazine')).toEqual({ kind: 'sell', itemId: 'long_range' });
      const guarded = getSlotPlans(shown, owned, full, ['long_range', 'healbane'], (sold, item) =>
        sellKeepsSpikes(owned, sold, item)
      );
      expect(guarded.get('extended_magazine')).toEqual({ kind: 'sell', itemId: 'healbane' });
      expect(candidates).toContain('healbane');
    });

    it('says the inventory is full when every candidate would break a spike', () => {
      const shown = [{ item: ITEMS_DB.extended_magazine, reason: '' }];
      const plans = getSlotPlans(shown, owned, full, ['long_range'], (sold, item) => sellKeepsSpikes(owned, sold, item));
      expect(plans.get('extended_magazine')).toEqual({ kind: 'full' });
    });

    it('does not suggest the same sale twice', () => {
      const shown = [
        { item: ITEMS_DB.extended_magazine, reason: '' },
        { item: ITEMS_DB.close_quarters, reason: '' },
      ];
      const plans = getSlotPlans(shown, owned, full, ['long_range', 'healbane', 'extra_regen'], (sold, item) =>
        sellKeepsSpikes(owned, sold, item)
      );
      expect(plans.get('extended_magazine')).toEqual({ kind: 'sell', itemId: 'healbane' });
      expect(plans.get('close_quarters')).toEqual({ kind: 'sell', itemId: 'extra_regen' });
    });
  });
});
