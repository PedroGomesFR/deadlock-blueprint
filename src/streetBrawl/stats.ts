// Street Brawl statistics per hero (src/data/generated/streetBrawl.json, `npm run update-street-brawl`), read into the
// shapes the tab uses.
//
// The module holds the data in use (`data` below): the bundled file, until dataSource.ts adopts a newer one downloaded
// from the repository (adoptStreetBrawlFile). Everything here reads it when called, so callers see the newer data from
// then on; the panel re-reads its hero's statistics when that happens.
import bundled from '../data/generated/streetBrawl.json';

/** Must match SCHEMA_VERSION in scripts/update-street-brawl.mjs: data of another version is never used. */
export const STREET_BRAWL_SCHEMA_VERSION = 3;

export interface StreetBrawlItemStat {
  /**
   * Share of the hero's Street Brawl games in which the item was acquired at some point (also reflects how often it
   * is offered): components later upgraded or sold count too, so a tier's shares add up to its picks per game.
   */
  pickRate: number;
  /** Win rate of the games in which a normal copy was acquired, smoothed towards the hero's win rate */
  winRate: number;
  matches: number;
  /**
   * What the item is worth against the other items of its tier, for the hero (see itemGains): win rate minus the
   * tier's average, shrunk by its noise. What the cards are compared on; a tier's own worth is the ranking's tierValue.
   */
  gain: number;
  /**
   * How uncertain that gain is (standard deviation, in win rate): what its games leave unknown after shrinking. Median
   * 0.9 points for items with 1,000-3,000 games, 0.6 with 3,000-10,000, 0.4 above. Two cards closer than their
   * combined uncertainty are a close call (ranking.ts).
   */
  gainSd: number;
}

export interface StreetBrawlHeroStats {
  matches: number;
  winRate: number;
  /** Normal copies only */
  items: Record<string, StreetBrawlItemStat>;
  /** Enhanced copies: win rate (smoothed towards the item's normal win rate + its tier's gap) and games */
  enhancedItems: Record<string, { winRate: number; matches: number }>;
  /** Enhanced minus normal win rate per tier (1-5), for items without enough enhanced games */
  enhancedTierGain: Record<number, number>;
  /** Where to put each ability point, in order (see AbilityPlanStep) */
  abilityPlan: AbilityPlanStep[];
  /** How likely each item is to be offered on a card of its tier (see draftOdds), empty with older data */
  offerOdds: Record<string, number>;
  /**
   * Per component: its upgrades, with how much more often the hero's players end up with each after taking the
   * component (probability, smoothed towards all heroes'; see componentPaths in the generator). Empty with older data.
   */
  paths: Record<string, { upgrade: string; extraChance: number }[]>;
}

/** One ability point of the plan: Street Brawl games merged by allocation (points per ability), see the generator. */
export interface AbilityPlanStep {
  ability: AbilityKey;
  /** Win rate of the players who made this choice here (smoothed) */
  winRate: number;
  games: number;
  /** When players usually spend this point, in seconds since the game started */
  timeS: number;
  /** The next-best choice here, when there is one with enough players */
  runnerUp: { ability: AbilityKey; winRate: number } | null;
  /** No choice had enough players: this is the most common one, not the best */
  mostCommon: boolean;
}

/** The tier of the Street Brawl-only legendary items, one above the shop's tiers 1-4. */
export const LEGENDARY_TIER = 5;

export type ItemCategory = 'weapon' | 'vitality' | 'spirit';
/** An ability's slot: 1-3 its abilities, 4 its ultimate. */
export type AbilityKey = '1' | '2' | '3' | '4';

/** A Street Brawl-only item ("LEGENDARY" card, tier 5): not in the normal-mode catalogue (ITEMS_DB). */
export interface LegendaryItem {
  apiId: number;
  nameEn: string;
  nameFr: string;
  nameIt: string;
  category: ItemCategory;
  icon?: string;
}

type RawHero = {
  matches: number;
  winRate: number;
  items: Record<string, [number, number, number]>;
  enhancedItems?: Record<string, [number, number]>;
  enhancedTierGain?: Record<string, number>;
  abilityPlan?: [string, number, number, number, string | null, number | null, number][];
  draft?: Record<string, [number, number]>;
  paths?: Record<string, [string, number][]>;
};
export interface StreetBrawlFile {
  schemaVersion?: number;
  generatedAt?: string;
  windowDays?: number;
  draftGoodShare?: Record<string, number>;
  draftRoundTiers?: number[][];
  soulValue?: { perThousand: number; se: number; players: number } | null;
  legendaryItems?: Record<string, LegendaryItem>;
  heroes: Record<string, RawHero>;
}

/** The data in use: the bundled file, or a newer downloaded one (adoptStreetBrawlFile). */
let data = bundled as unknown as StreetBrawlFile;
/**
 * The Street Brawl-only items. One object for the app's whole life: a downloaded file adds its new items to it
 * (adoptStreetBrawlFile), so modules that imported it see them.
 */
export const LEGENDARY_ITEMS: Record<string, LegendaryItem> = { ...(data.legendaryItems ?? {}) };

/** The bundled file's legendary items: their icons are in the application. */
const BUNDLED_LEGENDARY_IDS = new Set(Object.keys(LEGENDARY_ITEMS));

/** Switches to a downloaded file (dataSource.ts checks it first); `iconBase` is where icons missing here are read. */
export function adoptStreetBrawlFile(file: StreetBrawlFile, iconBase: string): void {
  data = file;
  for (const [id, item] of Object.entries(file.legendaryItems ?? {})) {
    if (BUNDLED_LEGENDARY_IDS.has(id)) continue;
    LEGENDARY_ITEMS[id] = item.icon?.startsWith('./') ? { ...item, icon: `${iconBase}/public/${item.icon.slice(2)}` } : item;
  }
}

/**
 * P(an item is offered | a card of its tier), per item: the card comes from the "Good" bucket with the tier's
 * share, else from "Normal" (or from the only one the tier has for the hero), then an item of that bucket in
 * proportion to its weight.
 */
function draftOdds(
  draft: Record<string, [number, number]>,
  tierOf: (itemId: string) => number | undefined
): Record<string, number> {
  const totals = new Map<string, number>(); // "tier:good" -> weight
  for (const [id, [good, weight]] of Object.entries(draft)) {
    const key = `${tierOf(id)}:${good}`;
    totals.set(key, (totals.get(key) ?? 0) + weight);
  }
  const odds: Record<string, number> = {};
  for (const [id, [good, weight]] of Object.entries(draft)) {
    const tier = tierOf(id);
    if (tier === undefined) continue;
    const goodShare = data.draftGoodShare?.[tier] ?? 0.5;
    const hasGood = totals.has(`${tier}:1`);
    const hasNormal = totals.has(`${tier}:0`);
    const bucketShare = hasGood && hasNormal ? (good ? goodShare : 1 - goodShare) : 1;
    odds[id] = (bucketShare * weight) / totals.get(`${tier}:${good}`)!;
  }
  return odds;
}

/**
 * Each item's gain within its tier, for the hero. Two corrections of the raw "win rate minus the hero's":
 * - Centred on the tier: tier 4 and legendary items mostly come in rounds 4-5, and games that last that long are near
 *   50/50, so for a 60 % hero an average tier 4 item read -2.0 points and a legendary one -2.5, for a 42 % hero +2.0
 *   and +4.3 (tier 1: -0.4 and +0.2). Against the tier's average (weighted by the offer odds, else by games), that
 *   lean cancels; what a higher tier is worth is counted apart (ranking.ts › tierValue).
 * - Shrunk by its noise (empirical Bayes, per tier): sampling alone spreads gains by about 0.7 points, half the spread
 *   of tier 1 items. Each gain keeps the share of it that the tier's true spread explains: true variance / (true
 *   variance + its sampling variance).
 * An item without data counts as its tier's average (0). Each gain comes with its remaining uncertainty: the standard
 * deviation of the true gain given the item's games, sqrt(true variance x sampling variance / their sum).
 */
function itemGains(
  heroWinRate: number,
  rows: Record<string, [number, number, number]>,
  offerOdds: Record<string, number>,
  tierOf: (itemId: string) => number | undefined
): Record<string, { gain: number; sd: number }> {
  const byTier = new Map<number, { id: string; g: number; v: number; w: number }[]>();
  for (const [id, [, winRate, matches]] of Object.entries(rows)) {
    const tier = tierOf(id);
    if (tier === undefined || matches <= 0) continue;
    const list = byTier.get(tier) ?? byTier.set(tier, []).get(tier)!;
    list.push({
      id,
      g: winRate - heroWinRate,
      v: (heroWinRate * (1 - heroWinRate)) / matches,
      w: offerOdds[id] ?? 0,
    });
  }
  const gains: Record<string, { gain: number; sd: number }> = {};
  for (const list of byTier.values()) {
    // Weights: the offer odds when known for this tier, else the games
    const useOdds = list.some((x) => x.w > 0);
    const weight = (x: (typeof list)[number]) => (useOdds ? x.w : 1 / x.v);
    const total = list.reduce((s, x) => s + weight(x), 0);
    const mean = list.reduce((s, x) => s + weight(x) * x.g, 0) / total;
    // True spread: observed spread minus the sampling noise, not below (0.1 point)²
    const trueVar = Math.max(1e-6, list.reduce((s, x) => s + weight(x) * ((x.g - mean) ** 2 - x.v), 0) / total);
    for (const x of list) {
      gains[x.id] = { gain: ((x.g - mean) * trueVar) / (trueVar + x.v), sd: Math.sqrt((trueVar * x.v) / (trueVar + x.v)) };
    }
  }
  return gains;
}

export function getStreetBrawlHeroStats(
  heroId: string,
  tierOf: (itemId: string) => number | undefined = () => undefined
): StreetBrawlHeroStats | undefined {
  const h = data.heroes[heroId];
  if (!h) return undefined;
  const offerOdds = draftOdds(h.draft ?? {}, tierOf);
  const gains = itemGains(h.winRate, h.items, offerOdds, tierOf);
  const items: Record<string, StreetBrawlItemStat> = {};
  for (const [id, [pickRate, winRate, matches]] of Object.entries(h.items)) {
    items[id] = { pickRate, winRate, matches, gain: gains[id]?.gain ?? 0, gainSd: gains[id]?.sd ?? 0 };
  }
  const enhancedItems: StreetBrawlHeroStats['enhancedItems'] = {};
  for (const [id, [winRate, matches]] of Object.entries(h.enhancedItems ?? {})) enhancedItems[id] = { winRate, matches };
  const enhancedTierGain = Object.fromEntries(
    Object.entries(h.enhancedTierGain ?? {}).map(([tier, v]) => [Number(tier), v])
  );
  const abilityPlan = (h.abilityPlan ?? []).map(
    ([ability, winRate, games, timeS, runnerUp, runnerUpWinRate, mostCommon]): AbilityPlanStep => ({
      ability: ability as AbilityPlanStep['ability'],
      winRate,
      games,
      timeS,
      runnerUp:
        runnerUp && runnerUpWinRate !== null
          ? { ability: runnerUp as AbilityPlanStep['ability'], winRate: runnerUpWinRate }
          : null,
      mostCommon: mostCommon === 1,
    })
  );
  const paths = Object.fromEntries(
    Object.entries(h.paths ?? {}).map(([comp, ups]) => [comp, ups.map(([upgrade, extraChance]) => ({ upgrade, extraChance }))])
  );
  return { matches: h.matches, winRate: h.winRate, items, enhancedItems, enhancedTierGain, abilityPlan, offerOdds, paths };
}

/**
 * Win rate of a card's item for the hero: the enhanced copy's when the card is enhanced (measured, or the normal
 * win rate + the tier's enhanced gap when the copy has too few games), else the normal one. undefined without data.
 */
export function cardWinRate(
  stats: StreetBrawlHeroStats,
  itemId: string,
  enhanced: boolean,
  tier: number | undefined
): number | undefined {
  const normal = stats.items[itemId]?.winRate;
  if (!enhanced) return normal;
  const measured = stats.enhancedItems[itemId]?.winRate;
  if (measured !== undefined) return measured;
  return normal === undefined ? undefined : normal + (tier !== undefined ? (stats.enhancedTierGain[tier] ?? 0) : 0);
}

/**
 * What a card's item is worth against its tier, for the hero (StreetBrawlItemStat.gain): for an enhanced card, plus
 * what the enhanced copy wins over the normal one (measured, or its tier's gap). 0 without data: the tier's average.
 */
export function cardGain(
  stats: StreetBrawlHeroStats,
  itemId: string,
  enhanced: boolean,
  tier: number | undefined
): number {
  const item = stats.items[itemId];
  if (!item) return 0;
  if (!enhanced) return item.gain;
  const enhancedRate = cardWinRate(stats, itemId, true, tier) ?? item.winRate;
  return item.gain + (enhancedRate - item.winRate);
}

/**
 * Win rate per 1,000 souls of items, whatever the items (streetBrawl.json › soulValue, measured on round 1's draft by
 * the generator; 0.0022 on 2026-10-28). Data from before the measurement: 0.003, an independent estimate.
 */
export const soulWinPerThousand = (): number => data.soulValue?.perThousand ?? 0.003;

/** Normal card tier of picks 1-3 of each round (round 1 first): see roundTracker.possibleRounds. */
export const draftRoundTiers = (): number[][] => data.draftRoundTiers ?? [];

export const streetBrawlDataInfo = () => ({
  generatedAt: data.generatedAt ?? '',
  windowDays: data.windowDays ?? 30,
});
