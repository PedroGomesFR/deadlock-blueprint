/**
 * "Buy right now" queue: what to buy next, what to sell when the inventory is full. Pure functions of the
 * build, the counters and what the player owns (tested in recommendations.test.ts).
 */
import { DeadlockItem, HeroBuildArchetype, ITEMS_DB, TacticalRecommendation } from '../data/deadlockData';
import type { MessageKey } from '../i18n';

export const INVENTORY_SLOTS = 12;

export interface InventoryStatus {
  itemIds: string[]; // items currently in the inventory (confirmed by the scanner)
  occupied: number;
  locked: number;
  unmatched: number;
}

export interface QueueEntry {
  item: DeadlockItem;
  reasonKey?: MessageKey; // generic reason (build phase)
  counterReason?: string; // reason of a counter-item, already in the interface language
  isCounter?: boolean;
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
 * Full purchase order of the build, counters included:
 * 1. first two early items, 2. urgent Tier 1-2 counters, 3. remaining early items, 4. first two mid items,
 * 5. Tier 3-4 counters, 6. remaining mid and late items. `items` gives the entries in the interface language.
 */
export function buildPurchaseOrder(
  build: HeroBuildArchetype,
  priorityItems: TacticalRecommendation['priorityItems'],
  items: Record<string, DeadlockItem>
): QueueEntry[] {
  const queue: QueueEntry[] = [];
  const seen = new Set<string>();
  const phaseOf = (id: string): QueueEntry['phase'] =>
    (['early', 'mid', 'late', 'situational'] as const).find((p) => build.phases[p].includes(id));

  const pushItem = (id: string, entry: Omit<QueueEntry, 'item' | 'phase'>) => {
    if (seen.has(id)) return;
    const item = items[id];
    if (!item) return;
    seen.add(id);
    queue.push({ item, phase: phaseOf(id), ...entry });
  };
  const pushCounter = (r: TacticalRecommendation['priorityItems'][number], fallback: MessageKey) =>
    pushItem(r.item.id, r.reasons[0] ? { counterReason: r.reasons[0], isCounter: true } : { reasonKey: fallback, isCounter: true });

  build.phases.early.slice(0, 2).forEach((id) => pushItem(id, { reasonKey: 'reason.earlyPriority' }));
  priorityItems
    .filter((r) => r.item.tier <= 2)
    .slice(0, 2)
    .forEach((r) => pushCounter(r, 'reason.laneCounter'));
  build.phases.early.slice(2).forEach((id) => pushItem(id, { reasonKey: 'reason.earlyEnd' }));
  build.phases.mid.slice(0, 2).forEach((id) => pushItem(id, { reasonKey: 'reason.midSpike' }));
  priorityItems
    .filter((r) => r.item.tier >= 3)
    .slice(0, 2)
    .forEach((r) => pushCounter(r, 'reason.teamfightCounter'));
  build.phases.mid.slice(2).forEach((id) => pushItem(id, { reasonKey: 'reason.midCore' }));
  build.phases.late.forEach((id) => pushItem(id, { reasonKey: 'reason.lateCore' }));

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
 * Next purchases, nothing owned (nor consumed by an owned upgrade). With a full inventory, an item needing a
 * free slot must be worth at least the weakest item it replaces. Once the early slots are filled (4+ items, or
 * 3+ Tier 1), the mid / late items come first.
 */
export function getNextPurchases(
  order: QueueEntry[],
  ownedItems: string[],
  status: InventoryStatus | null,
  sellCandidates: string[]
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
    return [...midAndLate, ...leftoverEarly];
  }
  return unowned;
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
