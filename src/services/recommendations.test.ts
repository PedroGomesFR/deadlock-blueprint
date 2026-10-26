import { describe, expect, it } from 'vitest';
import { HeroBuildArchetype, ITEMS_DB, TacticalRecommendation } from '../data/deadlockData';
import { makeTranslate } from '../i18n';
import {
  InventoryStatus,
  buildPurchaseOrder,
  effectiveOwnedSet,
  getComponentIds,
  getNextPurchases,
  getPurchaseCounters,
  getSellCandidates,
  getSlotPlans,
  isInventoryFull,
  withLockedFirst,
} from './recommendations';

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

const counter = (id: string, reason = `Counters X`): TacticalRecommendation['priorityItems'][number] => ({
  item: ITEMS_DB[id],
  reasons: [reason],
  urgency: 'Haute (Teamfight / Mid)',
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
    expect(selected).toEqual(['extra_spirit', 'extra_regen', 'boundless_spirit']);
    const order = buildPurchaseOrder(build({}), priorities, ITEMS_DB, t);
    expect(order.map((entry) => entry.item.id)).toEqual(selected);
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
});
