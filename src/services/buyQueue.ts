/**
 * "Buy right now" pipeline as one pure function (tested in buyQueue.test.ts on simulated games): the counters worth
 * queueing, the purchase order, what is left to buy, the counters placed by the time they are due, and the gentle
 * 4,800 spike nudge. The priority when two items are due together, first to last:
 * 1. a key core item that is due (bought in 70% or more of the hero's games, never overtaken),
 * 2. a counter against a fed enemy that nothing owned or in the build answers,
 * 3. a lane counter against a real lane threat, after the first two items and gone at 10 min,
 * 4. a spike item (up to 2 min early, only while the spike is worth it),
 * 5. the other build items, by usual buy time,
 * 6. a team counter, once the first spike is done.
 */
import type { DeadlockItem, HeroBuildArchetype, TacticalRecommendation } from '../data/deadlockData';
import type { LaneOutlook } from '../data/matchupStats';
import type { Translate } from '../i18n';
import { KEY_CORE_PICK_RATE, SPIKES, InvestmentProgress, sellKeepsSpikes, spikeBadge, totalInvested } from './investments';
import {
  CounterRole,
  InventoryStatus,
  QueueEntry,
  buildPurchaseOrder,
  dropAnsweredCounters,
  effectiveOwnedSet,
  getBuildItemIds,
  getNextPurchases,
  getPurchaseCounters,
  getSlotPlans,
  hasLaneThreat,
} from './recommendations';

/** What the player has, and what could be sold if the inventory is full. */
export interface InventoryView {
  /** Owned items, and the ones the 4,800 spikes count (investmentItems) */
  ownedItems: string[];
  investedItems: string[];
  inventoryStatus: InventoryStatus | null;
  sellCandidates: string[];
}

export interface BuyQueueInput extends InventoryView {
  build: HeroBuildArchetype;
  priorityItems: TacticalRecommendation['priorityItems'];
  matchupAlerts: TacticalRecommendation['matchupAlerts'];
  laneOutlook?: LaneOutlook;
  items: Record<string, DeadlockItem>;
  t: Translate;
  investment: InvestmentProgress;
  /** The hero's statistics of an item: pick rate and usual buy time (getHeroItemStat) */
  stat: (itemId: string) => { pickRate: number; buyTimeS: number } | undefined;
  /** The match clock in seconds when it is read */
  clockS?: number;
  /** Laning is over (isLaneOver, latched for the match) */
  laneOver: boolean;
}

export interface BuyQueue {
  /** What to buy, best first (before the locked #1) */
  queue: QueueEntry[];
  /** The counters the queue and the cards highlight */
  counters: TacticalRecommendation['priorityItems'];
}

export function computeBuyQueue(input: BuyQueueInput): BuyQueue {
  const { build, ownedItems, investedItems, inventoryStatus, sellCandidates, investment, stat } = input;
  const buyTimeS = (itemId: string) => stat(itemId)?.buyTimeS || undefined;
  const isKeyCore = (itemId: string) => (stat(itemId)?.pickRate ?? 0) >= KEY_CORE_PICK_RATE;
  const buildItemIds = getBuildItemIds(build);

  // Counters: not against an enemy that an owned or build item already answers, and lane ones only for a lane threat
  const answered = new Set([...effectiveOwnedSet(ownedItems), ...buildItemIds]);
  const priorityItems = dropAnsweredCounters(input.priorityItems, input.matchupAlerts, answered);
  const counterContext = {
    laneThreat: hasLaneThreat(input.matchupAlerts, input.laneOutlook),
    laneOver: input.laneOver,
  };
  const counters = getPurchaseCounters(priorityItems, counterContext);
  const order = buildPurchaseOrder(build, priorityItems, input.items, input.t, counterContext);

  const nowS = input.clockS ?? estimateClockS(totalInvested(ownedItems));
  const firstSpikeDone = investment.categories.some((c) => c.done);
  const remaining = getNextPurchases(order, ownedItems, inventoryStatus, sellCandidates, (id) => stat(id)?.buyTimeS);
  const placed = placeCounters(remaining, {
    nowS,
    buyTimeS,
    isKeyCore,
    laneDueS: laneCounterDueS(buildItemIds, buyTimeS),
    teamReleased: firstSpikeDone || nowS >= SPIKES[0].pushUntilMin * 60,
  });

  // The item each card will say to sell (inventory full) leaves before the spike is counted
  const soldFor = (queue: QueueEntry[], itemId: string) => {
    const plan = getSpikeSafeSlotPlans(queue.slice(0, 6), input).get(itemId);
    return plan?.kind === 'sell' ? plan.itemId : undefined;
  };
  return {
    queue: nudgeTowardKeySpike(placed, investedItems, investment, { buyTimeS, isKeyCore, soldFor }),
    counters,
  };
}

/**
 * What each shown card does to the inventory (getSlotPlans), never selling an item whose sale would drop a finished
 * 4,800 spike. One function for the cards and for the nudge, so they can never disagree about what is sold.
 */
export function getSpikeSafeSlotPlans(shown: QueueEntry[], inventory: InventoryView) {
  const { ownedItems, investedItems, inventoryStatus, sellCandidates } = inventory;
  return getSlotPlans(shown, ownedItems, inventoryStatus, sellCandidates, (soldId, itemId) =>
    sellKeepsSpikes(investedItems, soldId, itemId)
  );
}

// ---- The steps of the pipeline above ----

/** Laning ends at 10 min: the game clock when it is read, otherwise about what players have spent by then. */
export const LANE_END_S = 600;
export const LANE_END_SOULS = 6400;
export const isLaneOver = (clockS: number | undefined, soulsSpent: number) =>
  clockS !== undefined ? clockS >= LANE_END_S : soulsSpent >= LANE_END_SOULS;

/**
 * Median souls spent on build items by game minute (44 meta builds, usual buy times, 2026-10-26 data). Gives a clock
 * when none is read: the same curve puts about 6,400 souls at 10 min, the end of laning (LANE_END_SOULS).
 */
const SOULS_BY_MINUTE: [number, number][] = [
  [0, 0],
  [5, 1600],
  [8, 4000],
  [10, 6400],
  [12, 8000],
  [15, 12000],
  [20, 17600],
  [25, 26400],
  [30, 34400],
];

/** Game seconds estimated from the souls spent, by the curve above (capped at 40 min). */
export function estimateClockS(soulsSpent: number): number {
  const points = SOULS_BY_MINUTE;
  if (soulsSpent >= points[points.length - 1][1]) return 40 * 60;
  const i = points.findIndex(([, souls]) => souls > soulsSpent);
  const [m0, s0] = points[i - 1] ?? points[0];
  const [m1, s1] = points[i];
  return Math.round((m0 + ((soulsSpent - s0) / (s1 - s0)) * (m1 - m0)) * 60);
}

/** A lane counter comes right after the build's first two items: just after the second one's usual buy time. */
export function laneCounterDueS(buildItemIds: string[], buyTimeS: (itemId: string) => number | undefined): number {
  const times = buildItemIds
    .map((id) => buyTimeS(id))
    .filter((time): time is number => time !== undefined)
    .sort((a, b) => a - b);
  return (times[1] ?? 240) + 1;
}

export interface DueContext {
  /** The game clock in seconds (read, or estimated from the souls spent) */
  nowS: number;
  buyTimeS: (itemId: string) => number | undefined;
  /** A key core item: bought in 70% or more of the hero's games (KEY_CORE_PICK_RATE) */
  isKeyCore: (itemId: string) => boolean;
  /** When a lane counter is due (laneCounterDueS) */
  laneDueS: number;
  /** The first 4,800 spike is done, or its window is over: the team counters (not against a fed enemy) are released */
  teamReleased: boolean;
}

const ROLE_RANK: Record<CounterRole, number> = { fed: 0, lane: 1, team: 2 };

/** The queue's own items with the time each is due: its usual buy time, an item without one following the one before. */
function withDueTimes(entries: QueueEntry[], buyTimeS: DueContext['buyTimeS']) {
  let due = 0;
  return entries.map((entry) => {
    due = buyTimeS(entry.item.id) ?? due;
    return { entry, due };
  });
}

/**
 * When a counter is due. A Tier 3-4 counter against a fed enemy cannot be bought at once: it is due at its usual buy
 * time, which is already past when an enemy is marked fed late, so it still goes to the front then.
 */
function counterDueS(counter: QueueEntry, ctx: DueContext): number {
  if (counter.role === 'lane') return ctx.laneDueS;
  if (counter.role === 'fed' && counter.item.tier <= 2) return 0;
  return ctx.buyTimeS(counter.item.id) ?? ctx.nowS;
}

/**
 * Places the counters outside the build by the time they are due, among the queue's other items (which keep their
 * order): a counter against a fed enemy at once, a lane counter right after the first two items, a team counter at
 * its usual buy time once the first spike is done. None goes ahead of a key core item that is already due. Team
 * counters before that wait out of the queue (the counters panel still lists them). Measured on 1,760 simulated
 * lineups, the queue sorted by usual buy time put the lane counter at a median 12,000 souls, after laning.
 */
export function placeCounters(queue: QueueEntry[], ctx: DueContext): QueueEntry[] {
  if (!queue.some((entry) => entry.role)) return queue;
  const items = withDueTimes(queue.filter((entry) => !entry.role), ctx.buyTimeS);
  const counters = queue
    .filter((entry) => entry.role && (entry.role !== 'team' || ctx.teamReleased))
    .map((entry) => ({ entry, due: counterDueS(entry, ctx) }))
    .sort((a, b) => a.due - b.due || ROLE_RANK[a.entry.role!] - ROLE_RANK[b.entry.role!]);

  // No counter goes before the last key core item that is already due
  let afterDueKeyCore = 0;
  items.forEach(({ entry, due }, index) => {
    if (ctx.isKeyCore(entry.item.id) && due <= ctx.nowS) afterDueKeyCore = index + 1;
  });

  for (const counter of counters) {
    const next = items.findIndex((item, index) => index >= afterDueKeyCore && item.due > counter.due);
    items.splice(next < 0 ? items.length : next, 0, counter);
  }
  return items.map((item) => item.entry);
}

/** A spike item may move to #1 only when players usually buy it this close to the current #1 (seconds). */
const NUDGE_WINDOW_S = 120;

export interface NudgeOptions {
  /** The usual buy time of an item, if known */
  buyTimeS: (itemId: string) => number | undefined;
  /** The items a spike item never moves above (default: none) */
  isKeyCore?: (itemId: string) => boolean;
  /** The item sold to make room for the #1 of a queue (inventory full), as the cards will show it */
  soldFor?: (queue: QueueEntry[], itemId: string) => string | undefined;
}

/**
 * Gentle nudge: when the #1 has no spike badge but #2 or #3 has (spikeBadge) and players usually buy it
 * at about the same time, that item becomes #1. The rest of the queue keeps its order. Never when the target
 * comes from the inventory: the queue follows the build, and the player who left it does not need it reordered.
 */
export function nudgeTowardKeySpike(
  queue: QueueEntry[],
  ownedItems: string[],
  progress: InvestmentProgress,
  { buyTimeS, isKeyCore = () => false, soldFor = () => undefined }: NudgeOptions
): QueueEntry[] {
  const hasBadge = (q: QueueEntry[]) => spikeBadge(q[0].item.id, ownedItems, progress, soldFor(q, q[0].item.id)) !== null;
  if (progress.fromInventory || queue.length < 2 || hasBadge(queue)) return queue;
  const firstTime = buyTimeS(queue[0].item.id);
  if (firstTime === undefined) return queue;
  for (const [index, spike] of queue.slice(1, 3).entries()) {
    // Never above a key core item: the spike item waits behind it
    if (queue.slice(0, index + 1).some((entry) => isKeyCore(entry.item.id))) break;
    const time = buyTimeS(spike.item.id);
    if (time === undefined || time - firstTime > NUDGE_WINDOW_S) continue;
    const nudged = [spike, ...queue.filter((entry) => entry !== spike)];
    if (hasBadge(nudged)) return nudged;
  }
  return queue;
}
