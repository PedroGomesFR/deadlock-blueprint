/**
 * "Buy right now" queue: what to buy next, what to sell when the inventory is full. Pure functions of the
 * build, the counters and what the player owns (tested in recommendations.test.ts).
 */
import { DeadlockItem, HeroBuildArchetype, ITEMS_DB, TacticalRecommendation } from '../data/deadlockData';
import type { LaneOutlook, MatchupStance } from '../data/matchupStats';
import type { Translate } from '../i18n';

export const INVENTORY_SLOTS = 12;

export interface InventoryStatus {
  itemIds: string[]; // items currently in the inventory (confirmed by the scanner)
  occupied: number;
  locked: number;
  unmatched: number;
}

/** What kind of counter a queued item outside the build is (placeCounters): against a fed enemy, my lane, or the team. */
export type CounterRole = 'fed' | 'lane' | 'team';

export interface QueueEntry {
  item: DeadlockItem;
  reason: string;
  phase?: 'early' | 'mid' | 'late' | 'situational'; // phase of the active build that holds the item
  role?: CounterRole; // set on a counter that is not part of the build
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

type PriorityItem = TacticalRecommendation['priorityItems'][number];

const isFedReason = (reason: string) => reason.startsWith('🔥');
const isTeamReason = (reason: string) => reason.startsWith('[TEAM]');

/**
 * A counter only goes into the purchase queue when the threat is real: it answers the enemy in my lane, or
 * at least two different enemies (one team enemy alone is not worth bending the build for).
 */
const isStrongCounter = (r: PriorityItem) => r.urgency === 'Critique (En Face / Lane)' || r.reasons.length >= 2;

/**
 * A lane threat worth a counter: a lane enemy to avoid (my real win rate against it), a lane enemy marked fed, or a
 * hard lane. Measured on 1,760 simulated lineups, every lane enemy's counters are "critical", so a lane counter
 * was queued in 98% of games while only 28% had a lane enemy to avoid.
 */
export function hasLaneThreat(
  alerts: { isInMyLane: boolean; isFed: boolean; stance?: MatchupStance }[],
  outlook?: LaneOutlook
): boolean {
  return outlook === 'hard' || alerts.some((a) => a.isInMyLane && (a.isFed || a.stance === 'avoid'));
}

export interface CounterContext {
  /** A real lane threat (hasLaneThreat): without one, lane-only counters stay out of the queue. Default: yes */
  laneThreat?: boolean;
  /** Laning is over (isLaneOver): a Tier 1-2 lane-only counter leaves the queue. Default: no */
  laneOver?: boolean;
}

/**
 * A counter that only answers my lane (critical, every reason a lane one: "[LANE]" or an unprefixed lane tip, none
 * "[TEAM]" nor fed "🔥"): the lane items of the first minutes. An item against both lane enemies (two reasons)
 * is still a lane counter; one that also answers a team enemy or a fed enemy is not.
 */
const isLaneOnlyCounter = (r: PriorityItem) =>
  r.urgency === 'Critique (En Face / Lane)' && r.reasons.every((reason) => !isFedReason(reason) && !isTeamReason(reason));

/**
 * A counter's role in the queue: against a fed enemy, my lane (Tier 1-2: the lane items of the first minutes), or the
 * team. A Tier 3-4 counter against my lane cannot be bought in the lane phase: it is a team counter by timing.
 */
export function counterRole(r: PriorityItem): CounterRole {
  if (r.reasons.some(isFedReason)) return 'fed';
  if (isLaneOnlyCounter(r) && r.item.tier <= 2) return 'lane';
  return 'team';
}

/**
 * The counters whose threat is not answered yet. An enemy is answered when one of its best counters (the three the
 * cards show) is owned or in the build, bought or still to come: nothing outside the build is queued against it.
 * Measured on 1,760 simulated lineups, 24% of the lane enemies already had one of their top 3 counters in the build.
 * An item that is itself owned or in the build keeps its counter reason, and a counter no enemy lists (a lane tip)
 * is kept.
 */
export function dropAnsweredCounters(
  priorityItems: TacticalRecommendation['priorityItems'],
  alerts: { counters: { item: { id: string } }[] }[],
  answeredIds: ReadonlySet<string>
): TacticalRecommendation['priorityItems'] {
  const answered = new Set(alerts.filter((a) => a.counters.some((c) => answeredIds.has(c.item.id))));
  return priorityItems.filter((r) => {
    if (answeredIds.has(r.item.id)) return true;
    const countered = alerts.filter((a) => a.counters.some((c) => c.item.id === r.item.id));
    return countered.length === 0 || countered.some((a) => !answered.has(a));
  });
}

/** Whether a counter goes into the queue: a lane-only one needs a lane threat, and a Tier 1-2 one leaves with laning. */
function isQueuedCounter(r: PriorityItem, { laneThreat = true, laneOver = false }: CounterContext) {
  if (!isStrongCounter(r)) return false;
  if (!isLaneOnlyCounter(r)) return true;
  if (!laneThreat) return false;
  return !(laneOver && r.item.tier <= 2);
}

/**
 * The counter items included in the purchase queue and highlighted in the interface: at most one Tier 1-2
 * and one Tier 3-4, so that following the queue still follows the build. A lane-only counter needs a real lane
 * threat, and a Tier 1-2 one leaves once laning is over (a lane counter bought at a median 15 min was a counter to
 * a lane that was over). Counters against a fed enemy or against two enemies are unaffected.
 */
export function getPurchaseCounters(priorityItems: PriorityItem[], context: CounterContext = {}) {
  const queued = priorityItems.filter((r) => isQueuedCounter(r, context));
  const tier12 = queued.filter((r) => r.item.tier <= 2);
  const tier34 = queued.filter((r) => r.item.tier >= 3);
  return [...tier12.slice(0, 1), ...tier34.slice(0, 1)];
}

/**
 * Full purchase order of the build, counters included:
 * 1. first two early items, 2. urgent Tier 1-2 counters, 3. remaining early items, 4. first two mid items,
 * 5. Tier 3-4 counters, 6. remaining mid and late items. `items` gives the entries in the interface language.
 */
export function buildPurchaseOrder(
  build: HeroBuildArchetype,
  priorityItems: TacticalRecommendation['priorityItems'],
  items: Record<string, DeadlockItem>,
  t: Translate,
  counterContext?: CounterContext
): QueueEntry[] {
  const queue: QueueEntry[] = [];
  const seen = new Set<string>();
  const counters = getPurchaseCounters(priorityItems, counterContext);
  const phaseOf = (id: string): QueueEntry['phase'] =>
    (['early', 'mid', 'late', 'situational'] as const).find((p) => build.phases[p].includes(id));

  const pushItem = (id: string, reason: string) => {
    if (seen.has(id)) return;
    const item = items[id];
    if (!item) return;
    const counter = counters.find((r) => r.item.id === id);
    if (counter) reason = counter.reasons[0] ?? t(item.tier <= 2 ? 'reason.laneCounter' : 'reason.teamfightCounter');
    seen.add(id);
    const phase = phaseOf(id);
    // A counter outside the build gets its role: placeCounters times it (a counter in the build keeps its place)
    queue.push({ item, phase, reason, ...(counter && !phase ? { role: counterRole(counter) } : {}) });
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
 * `canSell` refuses a sale for an item: the weakest item that could be sold is skipped when selling it would drop
 * a finished 4,800 spike (services/investments.ts › sellKeepsSpikes), and the next one is suggested.
 */
export function getSlotPlans(
  shown: QueueEntry[],
  ownedItems: string[],
  status: InventoryStatus | null,
  sellCandidates: string[],
  canSell?: (soldId: string, itemId: string) => boolean
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
    const sold = new Set<string>();
    for (const entry of shown) {
      if (plans.has(entry.item.id)) continue;
      const sellId = toSell.find((id) => !sold.has(id) && (canSell?.(id, entry.item.id) ?? true));
      if (sellId) sold.add(sellId);
      plans.set(entry.item.id, sellId ? { kind: 'sell', itemId: sellId } : { kind: 'full' });
    }
  }
  return plans;
}
