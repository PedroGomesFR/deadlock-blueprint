import { describe, expect, it } from 'vitest';
import { HeroBuildArchetype, ITEMS_DB, TacticalRecommendation } from '../data/deadlockData';
import {
  InventoryStatus,
  buildPurchaseOrder,
  effectiveOwnedSet,
  getComponentIds,
  getNextPurchases,
  getSellCandidates,
  getSlotPlans,
  isInventoryFull,
  withLockedFirst,
} from './recommendations';

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
  it('interleaves the lane counters after the first two early items', () => {
    const order = buildPurchaseOrder(BUILD, [counter('healbane'), counter('boundless_spirit')], ITEMS_DB).map((e) => e.item.id);
    expect(order.slice(0, 3)).toEqual(['extra_spirit', 'extended_magazine', 'healbane']);
    expect(order).toContain('boundless_spirit');
    expect(new Set(order).size).toBe(order.length);
  });

  it('keeps the counter reason, and the phase of build items', () => {
    const order = buildPurchaseOrder(BUILD, [counter('healbane', '[LANE] Anti-heal vs Abrams')], ITEMS_DB);
    const healbane = order.find((e) => e.item.id === 'healbane')!;
    expect(healbane.counterReason).toBe('[LANE] Anti-heal vs Abrams');
    expect(healbane.isCounter).toBe(true);
    expect(order[0].reasonKey).toBe('reason.earlyPriority');
    expect(order[0].phase).toBe('early');
  });
});

describe('next purchases', () => {
  const order = buildPurchaseOrder(BUILD, [], ITEMS_DB);

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
    const shown = buildPurchaseOrder(BUILD, [], ITEMS_DB).filter((e) => ['improved_spirit', 'titanic_magazine'].includes(e.item.id));
    const plans = getSlotPlans(shown, owned, full, getSellCandidates(full, BUILD, new Set()));
    expect(plans.get('improved_spirit')).toEqual({ kind: 'upgrade', itemId: 'extra_spirit' });
    expect(plans.get('titanic_magazine')).toEqual({ kind: 'sell', itemId: 'healbane' });
  });
});
