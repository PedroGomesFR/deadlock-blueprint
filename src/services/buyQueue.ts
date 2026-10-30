/**
 * "Buy right now" pipeline as one pure function (tested in buyQueue.test.ts): the build's items not yet owned, by their
 * usual buy time, then the gentle 4,800 spike nudge. A key core item (bought in 70% or more of the hero's games) is
 * never overtaken by a spike item.
 */
import type { DeadlockItem, HeroBuildArchetype, TacticalRecommendation } from '../data/deadlockData';
import type { Translate } from '../i18n';
import { KEY_CORE_PICK_RATE, InvestmentProgress, sellKeepsSpikes, spikeBadge } from './investments';
import {
  InventoryStatus,
  QueueEntry,
  buildPurchaseOrder,
  getNextPurchases,
  getPurchaseCounters,
  getSlotPlans,
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
  items: Record<string, DeadlockItem>;
  t: Translate;
  investment: InvestmentProgress;
  /** The hero's statistics of an item: pick rate and usual buy time (getHeroItemStat) */
  stat: (itemId: string) => { pickRate: number; buyTimeS: number } | undefined;
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

  const order = buildPurchaseOrder(build, input.priorityItems, input.items, input.t);
  const remaining = getNextPurchases(order, ownedItems, inventoryStatus, sellCandidates, (id) => stat(id)?.buyTimeS);

  // The item each card will say to sell (inventory full) leaves before the spike is counted
  const soldFor = (queue: QueueEntry[], itemId: string) => {
    const plan = getSpikeSafeSlotPlans(queue.slice(0, 6), input).get(itemId);
    return plan?.kind === 'sell' ? plan.itemId : undefined;
  };
  return {
    queue: nudgeTowardKeySpike(remaining, investedItems, investment, { buyTimeS, isKeyCore, soldFor }),
    counters: getPurchaseCounters(input.priorityItems),
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
