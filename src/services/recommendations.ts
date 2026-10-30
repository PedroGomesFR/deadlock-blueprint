/**
 * "Buy right now" queue: what to buy next, what to sell when the inventory is full. Pure functions of the
 * build, the counters and what the player owns (tested in recommendations.test.ts).
 */
import { DeadlockItem, HeroBuildArchetype, ITEMS_DB, TacticalRecommendation } from '../data/deadlockData';
import type { Translate } from '../i18n';

export const INVENTORY_SLOTS = 12;

export interface InventoryStatus {
  itemIds: string[]; // items currently in the inventory (confirmed by the scanner)
  occupied: number;
  locked: number;
  unmatched: number;
}

export interface QueueEntry {
  item: DeadlockItem;
  reason: string;
  phase?: 'early' | 'mid' | 'late' | 'situational'; // phase of the active build that holds the item
}

export type SlotPlan =
  | { kind: 'upgrade'; itemId: string } // takes the slot of this owned component
  | { kind: 'sell'; itemId: string } // inventory full: sell this owned item first
  | { kind: 'full' }; // inventory full, no recognized item to suggest

/** Components consumed (recursively) when buying this item: Titanic Magazine -> Extended Magazine... */
export function getComponentIds(itemId: string): Set<string> {
  const components = new Set<string>();
  const stack = [...(ITEMS_DB[itemId]?.upgradesFrom ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (components.has(id)) continue;
    components.add(id);
    stack.push(...(ITEMS_DB[id]?.upgradesFrom ?? []));
  }
  return components;
}

/** The item ids of a build in its phase order: early, mid, late (the situational ones only against a threat). */
export const getBuildItemIds = (build: HeroBuildArchetype): string[] => [
  ...build.phases.early,
  ...build.phases.mid,
  ...build.phases.late,
];

/** Owned items + the components they consumed (owning Titanic Magazine means Extended Magazine is done). */
export function effectiveOwnedSet(ownedItems: string[]): Set<string> {
  const owned = new Set<string>(ownedItems);
  const stack = [...ownedItems];
  while (stack.length > 0) {
    for (const componentId of ITEMS_DB[stack.pop()!]?.upgradesFrom ?? []) {
      if (!owned.has(componentId)) {
        owned.add(componentId);
        stack.push(componentId);
      }
    }
  }
  return owned;
}

/**
 * A counter only goes into the purchase queue when the threat is real: it answers the enemy in my lane, or
 * at least two different enemies (one team enemy alone is not worth bending the build for).
 */
const isStrongCounter = (r: TacticalRecommendation['priorityItems'][number]) =>
  r.urgency === 'Critique (En Face / Lane)' || r.reasons.length >= 2;

/**
 * The counter items included in the purchase queue and highlighted in the interface: at most one Tier 1-2
 * and one Tier 3-4, so that following the queue still follows the build.
 */
export const getPurchaseCounters = (priorityItems: TacticalRecommendation['priorityItems']) => {
  const strong = priorityItems.filter(isStrongCounter);
  return [...strong.filter((r) => r.item.tier <= 2).slice(0, 1), ...strong.filter((r) => r.item.tier >= 3).slice(0, 1)];
};

/**
 * Full purchase order of the build, counters included:
 * 1. first two early items, 2. urgent Tier 1-2 counters, 3. remaining early items, 4. first two mid items,
 * 5. Tier 3-4 counters, 6. remaining mid and late items. `items` gives the entries in the interface language.
 */
export function buildPurchaseOrder(
  build: HeroBuildArchetype,
  priorityItems: TacticalRecommendation['priorityItems'],
  items: Record<string, DeadlockItem>,
  t: Translate
): QueueEntry[] {
  const queue: QueueEntry[] = [];
  const seen = new Set<string>();
  const counters = getPurchaseCounters(priorityItems);
  const phaseOf = (id: string): QueueEntry['phase'] =>
    (['early', 'mid', 'late', 'situational'] as const).find((p) => build.phases[p].includes(id));

  const pushItem = (id: string, reason: string) => {
    if (seen.has(id)) return;
    const item = items[id];
    if (!item) return;
    const counter = counters.find((r) => r.item.id === id);
    if (counter) reason = counter.reasons[0] ?? t(item.tier <= 2 ? 'reason.laneCounter' : 'reason.teamfightCounter');
    seen.add(id);
    queue.push({ item, phase: phaseOf(id), reason });
  };

  build.phases.early.slice(0, 2).forEach((id) => pushItem(id, t('reason.earlyPriority')));
  counters.filter((r) => r.item.tier <= 2).forEach((r) => pushItem(r.item.id, t('reason.laneCounter')));
  build.phases.early.slice(2).forEach((id) => pushItem(id, t('reason.earlyEnd')));
  build.phases.mid.slice(0, 2).forEach((id) => pushItem(id, t('reason.midSpike')));
  counters.filter((r) => r.item.tier >= 3).forEach((r) => pushItem(r.item.id, t('reason.teamfightCounter')));
  build.phases.mid.slice(2).forEach((id) => pushItem(id, t('reason.midCore')));
  build.phases.late.forEach((id) => pushItem(id, t('reason.lateCore')));

  return queue;
}

export const isInventoryFull = (status: InventoryStatus | null) =>
  status !== null && status.occupied > 0 && status.occupied + status.locked >= INVENTORY_SLOTS;

/**
 * Items of the inventory to sell when it is full, weakest first: outside the active build and the counters,
 * then lowest tier, then earliest build phase, then cheapest.
 */
export function getSellCandidates(
  status: InventoryStatus | null,
  build: HeroBuildArchetype,
  counterIds: Set<string>
): string[] {
  if (!status) return [];
  const { early, mid, late, situational } = build.phases;
  const phaseRank = (id: string) =>
    late.includes(id) ? 3 : mid.includes(id) || situational.includes(id) ? 2 : early.includes(id) ? 1 : 0;
  const isWanted = (id: string) => phaseRank(id) > 0 || counterIds.has(id);
  return status.itemIds
    .filter((id) => ITEMS_DB[id])
    .sort(
      (a, b) =>
        Number(isWanted(a)) - Number(isWanted(b)) ||
        ITEMS_DB[a].tier - ITEMS_DB[b].tier ||
        phaseRank(a) - phaseRank(b) ||
        ITEMS_DB[a].cost - ITEMS_DB[b].cost
    );
}

/** Owned component this item upgrades (buying it then takes that component's slot). */
export function getUpgradedComponent(itemId: string, ownedItems: string[]): string | undefined {
  return [...getComponentIds(itemId)].find((id) => ownedItems.includes(id));
}

/**
 * Orders entries by the average time players buy them. Entries without a known time keep their own position,
 * the others are sorted (stable) into the positions of the timed ones.
 */
export function sortByBuyTime(queue: QueueEntry[], buyTimeS?: (itemId: string) => number | undefined): QueueEntry[] {
  if (!buyTimeS) return queue;
  const timed = queue
    .map((entry, index) => ({ entry, index, time: buyTimeS(entry.item.id) }))
    .filter((e): e is { entry: QueueEntry; index: number; time: number } => e.time !== undefined);
  const sorted = [...timed].sort((a, b) => a.time - b.time || a.index - b.index);
  const result = [...queue];
  timed.forEach((slot, i) => {
    result[slot.index] = sorted[i].entry;
  });
  return result;
}

/**
 * Next purchases, nothing owned (nor consumed by an owned upgrade). With a full inventory, an item needing a
 * free slot must be worth at least the weakest item it replaces. Once the early slots are filled (4+ items, or
 * 3+ Tier 1), the mid / late items come first. With `buyTimeS`, each of those groups is ordered by the time
 * players usually buy the item.
 */
export function getNextPurchases(
  order: QueueEntry[],
  ownedItems: string[],
  status: InventoryStatus | null,
  sellCandidates: string[],
  buyTimeS?: (itemId: string) => number | undefined
): QueueEntry[] {
  const owned = effectiveOwnedSet(ownedItems);
  let unowned = order.filter((entry) => !owned.has(entry.item.id));

  if (isInventoryFull(status) && sellCandidates.length > 0) {
    const weakestTier = ITEMS_DB[sellCandidates[0]].tier;
    unowned = unowned.filter(
      (entry) => getUpgradedComponent(entry.item.id, ownedItems) !== undefined || entry.item.tier >= weakestTier
    );
  }

  const ownedTier1Count = ownedItems.filter((id) => ITEMS_DB[id]?.tier === 1).length;
  if (ownedItems.length >= 4 || ownedTier1Count >= 3) {
    const midAndLate = unowned.filter((entry) => entry.item.tier >= 2);
    const leftoverEarly = unowned.filter((entry) => entry.item.tier === 1);
    return [...sortByBuyTime(midAndLate, buyTimeS), ...sortByBuyTime(leftoverEarly, buyTimeS)];
  }
  return sortByBuyTime(unowned, buyTimeS);
}

/** The locked #1 first, the rest in order. */
export function withLockedFirst(queue: QueueEntry[], lockedItemId: string | null): QueueEntry[] {
  const lockedIdx = lockedItemId ? queue.findIndex((entry) => entry.item.id === lockedItemId) : -1;
  if (lockedIdx <= 0) return queue;
  return [queue[lockedIdx], ...queue.slice(0, lockedIdx), ...queue.slice(lockedIdx + 1)];
}

/**
 * What each shown recommendation does to the inventory: an upgrade replaces its component; with a full
 * inventory, the other ones each need an owned item sold first (the weakest for #1, the next one for #2...).
 */
export function getSlotPlans(
  shown: QueueEntry[],
  ownedItems: string[],
  status: InventoryStatus | null,
  sellCandidates: string[]
): Map<string, SlotPlan> {
  const plans = new Map<string, SlotPlan>();
  const upgradedComponents = new Set<string>();
  for (const entry of shown) {
    const component = getUpgradedComponent(entry.item.id, ownedItems);
    if (component) {
      plans.set(entry.item.id, { kind: 'upgrade', itemId: component });
      upgradedComponents.add(component);
    }
  }
  if (isInventoryFull(status)) {
    // Never sell a component that one of the shown upgrades is about to consume
    const toSell = sellCandidates.filter((id) => !upgradedComponents.has(id));
    let nextSell = 0;
    for (const entry of shown) {
      if (plans.has(entry.item.id)) continue;
      const sellId = toSell[nextSell++];
      plans.set(entry.item.id, sellId ? { kind: 'sell', itemId: sellId } : { kind: 'full' });
    }
  }
  return plans;
}
