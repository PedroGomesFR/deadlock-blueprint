/**
 * Item investment: the souls of the owned items in one shop category give a growing bonus at fixed thresholds,
 * the biggest jump at 4,800. Builds and high-rank players take one category to 4,800, then the next, then the
 * last. Pure functions of the build order and the owned items (tested in investments.test.ts).
 */
import { ITEMS_DB, ItemCategory } from '../data/deadlockData';
import { getComponentIds } from './recommendations';

/** The key spike: the largest bonus jump of every category. */
export const KEY_SPIKE = 4800;

/** How hard a spike is pushed: any item, a cheap top-up only, or not at all (see SPIKES). */
export type SpikePush = 'full' | 'top-up' | 'off';

/**
 * The three spikes, first to last.
 * - `pace`: the median minute players have it, rank 81+ and rank 1-40 (40,000 players per group, 1.5 days of
 *   deadlock-api.com data). Shown as a range: comparing everyone to rank 81+ alone flagged half of them "behind".
 * - `fullUntilMin` / `pushUntilMin`: any item is pushed until the first minute, a cheap top-up until the second, then
 *   nothing (no reordering, badge or "late" colour). On 534,000 ranked players (Oct 2026), at equal spend and team
 *   lead, the first 4,800 is worth about +1 point of win rate at 9-12 min and 0 at 15 min; each later one +0.7 to +1
 *   while early and 0 by 30 min.
 * - `withoutClock`: how hard it is pushed when no clock is read.
 */
export const SPIKES = [
  { pace: { highRank: 10.2, lowRank: 11.6 }, fullUntilMin: 14, pushUntilMin: 14, withoutClock: 'full' },
  { pace: { highRank: 15.3, lowRank: 17.4 }, fullUntilMin: 20, pushUntilMin: 20, withoutClock: 'full' },
  { pace: { highRank: 19.9, lowRank: 23.2 }, fullUntilMin: 22, pushUntilMin: 24, withoutClock: 'top-up' },
] as const;

/** A top-up: an item that adds at most this many souls to the category. */
export const CHEAP_TOP_UP = 800;

/**
 * The player's own commitment wins over the build: a category not yet at 4,800 with at least this many souls,
 * and this far ahead of the build's next category, becomes the target. Replay of a recorded Infernus game
 * (tests/replays/sapphire_infernus_full): vitality at 4,000 against spirit 1,600 at 13 min, weapon at 3,200
 * against spirit 1,600 at 21 min, while the build still pointed at spirit all game. Below 2,400 nothing is
 * committed yet: an 800 or 1,600 item says little about the build.
 */
const COMMIT_MIN_SOULS = 2400;
const COMMIT_LEAD = 1600;

/**
 * A key core item: bought in at least this share of the hero's games (high rank). It always keeps its place:
 * a spike item never moves above one, and a counter never takes its place.
 */
export const KEY_CORE_PICK_RATE = 0.7;

const CATEGORIES: ItemCategory[] = ['weapon', 'spirit', 'vitality'];

/** A "last souls" badge: the category already holds this many souls, and the item adds at most CHEAP_TOP_UP. */
const NEAR_MISS_FROM = 4000;

export interface CategoryInvestment {
  category: ItemCategory;
  souls: number;
  done: boolean; // at 4,800 or more
}

export interface InvestmentProgress {
  categories: CategoryInvestment[]; // at 4,800 first, then the target, then the rest (build's spike order)
  target: CategoryInvestment | null; // the next category to take to 4,800, null once all three are there
  fromInventory: boolean; // the target is the category the player committed to, not the build's next one
  spikeNumber: number; // 1-3: which spike the target is (categories already at 4,800 + 1)
  pace: { highRank: number; lowRank: number } | null; // median minute players have that many spikes
  push: SpikePush; // how hard the target is pushed at this point of the game (SPIKES)
}

/**
 * The items the investment counts. An item marked by hand ("Skip" or a click) counts only once the scanner sees
 * it: skipping a 3,200 item filled 3,200 of its category and could fake a spike. Without an inventory read
 * (no scan), the hand-marked items are all there is.
 */
export function investmentItems(
  ownedItems: string[],
  manualOwned: ReadonlySet<string>,
  scannedItemIds: string[] | null
): string[] {
  if (!scannedItemIds) return ownedItems;
  return ownedItems.filter((id) => !manualOwned.has(id) || scannedItemIds.includes(id));
}

/** Souls invested per category. An upgrade counts its full cost, the components it consumed do not count again. */
export function investedSouls(ownedItems: string[]): Record<ItemCategory, number> {
  const consumed = new Set(ownedItems.flatMap((id) => [...getComponentIds(id)]));
  const souls: Record<ItemCategory, number> = { weapon: 0, vitality: 0, spirit: 0 };
  for (const id of new Set(ownedItems)) {
    const item = ITEMS_DB[id];
    if (item && !consumed.has(id)) souls[item.category] += item.cost;
  }
  return souls;
}

/** All the souls invested, over the three categories. */
export function totalInvested(ownedItems: string[]): number {
  return Object.values(investedSouls(ownedItems)).reduce((sum, souls) => sum + souls, 0);
}

/**
 * The build's items in the order players buy them (itemStats). The phases are tiers (T1 early, T2 mid, T3-4
 * late, scripts/update-builds.mjs), not times: walking them in order counted a 3,200 item usually bought at
 * 10 min after a 1,600 item bought at 22 min, and the spike line disagreed with the queue (ordered by buy time)
 * on 19 of 44 meta builds. An item without a buy time keeps its place after the item before it.
 */
export function inBuyOrder(itemIds: string[], buyTimeS: (itemId: string) => number | undefined): string[] {
  let previous = 0;
  const timed = itemIds.map((id, index) => {
    previous = buyTimeS(id) ?? previous;
    return { id, index, time: previous };
  });
  return timed.sort((a, b) => a.time - b.time || a.index - b.index).map((x) => x.id);
}

/**
 * The order the build takes the categories to 4,800, buying its items in order (inBuyOrder). Categories it never takes
 * there follow, most souls first.
 */
export function spikeOrder(buildItemIds: string[]): ItemCategory[] {
  const order: ItemCategory[] = [];
  const bought: string[] = [];
  for (const id of buildItemIds) {
    bought.push(id);
    const souls = investedSouls(bought);
    for (const category of CATEGORIES) if (souls[category] >= KEY_SPIKE && !order.includes(category)) order.push(category);
  }
  const souls = investedSouls(buildItemIds);
  const rest = CATEGORIES.filter((c) => !order.includes(c)).sort((a, b) => souls[b] - souls[a]);
  return [...order, ...rest];
}

/** How hard the spike at this index (0 = first) is pushed at this point of the game. */
function spikePush(spikeIndex: number, clockS?: number): SpikePush {
  const spike = SPIKES[spikeIndex];
  if (!spike) return 'off'; // all three are done
  if (clockS === undefined) return spike.withoutClock;
  if (clockS < spike.fullUntilMin * 60) return 'full';
  if (clockS < spike.pushUntilMin * 60) return 'top-up';
  return 'off';
}

export function investmentProgress(order: ItemCategory[], ownedItems: string[], clockS?: number): InvestmentProgress {
  const souls = investedSouls(ownedItems);
  const all = order.map((category) => ({ category, souls: souls[category], done: souls[category] >= KEY_SPIKE }));
  const done = all.filter((c) => c.done);
  const open = all.filter((c) => !c.done);
  const buildTarget = open[0] ?? null;
  // A category the player clearly committed to replaces the build's next one (COMMIT_MIN_SOULS, COMMIT_LEAD)
  const committed = buildTarget
    ? open
        .filter((c) => c.souls >= COMMIT_MIN_SOULS && c.souls - buildTarget.souls >= COMMIT_LEAD)
        .sort((a, b) => b.souls - a.souls)[0]
    : undefined;
  const target = committed ?? buildTarget;
  const spikeIndex = done.length;
  return {
    categories: [...done, ...(target ? [target] : []), ...open.filter((c) => c !== target)],
    target,
    fromInventory: target !== buildTarget,
    spikeNumber: spikeIndex + 1,
    pace: target ? SPIKES[spikeIndex].pace : null,
    push: target ? spikePush(spikeIndex, clockS) : 'off',
  };
}

/** What the pace line says: the spike is past its window, only a top-up is worth it, the player is behind, or on pace. */
export type PaceStatus = 'past' | 'topUp' | 'behind' | 'onPace';

/** Behind means past the slower median minute (rank 1-40) while the spike is still pushed. */
export function paceStatus({ push, pace }: InvestmentProgress, clockS?: number): PaceStatus {
  if (push === 'off') return 'past';
  if (push === 'top-up') return 'topUp';
  return pace && clockS !== undefined && clockS > pace.lowRank * 60 ? 'behind' : 'onPace';
}

/** The owned items after buying this one, selling `soldId` first (inventory full). */
function afterPurchase(itemId: string, ownedItems: string[], soldId?: string): string[] {
  return [...ownedItems.filter((id) => id !== soldId), itemId];
}

/** What buying an item does to its own category: the souls before and after, `soldId` sold first (inventory full). */
function categoryGain(itemId: string, ownedItems: string[], soldId?: string) {
  const category = ITEMS_DB[itemId]?.category;
  if (!category) return null;
  const before = investedSouls(ownedItems)[category];
  const after = investedSouls(afterPurchase(itemId, ownedItems, soldId))[category];
  return { category, before, after, added: after - before };
}

/**
 * Whether selling `soldId` to make room for `itemId` keeps every category that is at 4,800: a sale that drops a
 * finished spike below it (and the new item does not bring it back) throws away the biggest bonus jump. Measured
 * on 1,760 simulated games with a full inventory: 2% of the suggested sales did, in 9% of the games.
 */
export function sellKeepsSpikes(ownedItems: string[], soldId: string, itemId: string): boolean {
  const before = investedSouls(ownedItems);
  const after = investedSouls(afterPurchase(itemId, ownedItems, soldId));
  return CATEGORIES.every((category) => before[category] < KEY_SPIKE || after[category] >= KEY_SPIKE);
}

/** The category this item takes from below 4,800 to at least 4,800, if any. */
export function keySpikeReached(itemId: string, ownedItems: string[], soldId?: string): ItemCategory | null {
  const gain = categoryGain(itemId, ownedItems, soldId);
  return gain && gain.before < KEY_SPIKE && gain.after >= KEY_SPIKE ? gain.category : null;
}

export interface SpikeBadge {
  category: ItemCategory;
  /** The souls added when the category was already at 4,000 or more and the item adds at most a top-up: "last 800" */
  topUp: number | null;
}

/**
 * The badge an item gets, or null: it takes the target category to 4,800 while that spike is still worth pushing
 * (progress.push), and for a "top-up" push only when it adds at most CHEAP_TOP_UP souls. With the category already
 * at 4,000 or more the badge says how few souls are left: 38% of players spend time at 4,000-4,799 before their
 * first spike (median wait 1.9 min at rank 81+, 2.6 at 1-40; 46% of the crossings add only 800, mostly an 800 to
 * 1,600 upgrade). `soldId` is the item the card says to sell first (inventory full).
 */
export function spikeBadge(
  itemId: string,
  ownedItems: string[],
  progress: InvestmentProgress,
  soldId?: string
): SpikeBadge | null {
  if (progress.push === 'off') return null;
  const gain = categoryGain(itemId, ownedItems, soldId);
  if (!gain || gain.category !== progress.target?.category) return null;
  if (gain.before >= KEY_SPIKE || gain.after < KEY_SPIKE) return null;
  const isTopUp = gain.added <= CHEAP_TOP_UP;
  if (progress.push === 'top-up' && !isTopUp) return null;
  return { category: gain.category, topUp: isTopUp && gain.before >= NEAR_MISS_FROM ? gain.added : null };
}
