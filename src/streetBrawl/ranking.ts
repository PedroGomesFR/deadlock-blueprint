// Which offered card to take, and when to re-roll: pure scoring of a pick screen reading with the hero's Street Brawl
// statistics.
import type { CardReading } from './pickScreen';
import { cardGain, cardWinRate, soulWinPerThousand } from './stats';
import type { StreetBrawlHeroStats } from './stats';

/** Fewer items than this in a card's tier: the re-roll estimate for that card falls back to a wider pool. */
const MIN_POOL = 6;

/** Uncertainty of an item without data (fewer games than the generator keeps): more than any measured item's. */
const UNKNOWN_GAIN_SD = 0.01;

/** An item's souls by tier: the shop's prices, and 9,999 for the Street Brawl-only legendary items (their API cost). */
const TIER_SOULS: Record<number, number> = { 1: 800, 2: 1600, 3: 3200, 4: 6400, 5: 9999 };

/**
 * What a tier's souls are worth, whatever the item: its stats and the category investment they add. The items' gains
 * are measured within their tier (stats.ts › itemGains), so this is the only place a higher tier counts. Measured on
 * the draft each week (soulWinPerThousand): +0.22 points per 1,000 souls on 2026-10-28, so +1.2 from tier 1 to tier 4.
 */
export const tierValue = (tier: number | undefined) =>
  tier === undefined ? 0 : ((TIER_SOULS[tier] ?? 0) / 1000) * soulWinPerThousand();

export interface RankedCard {
  card: CardReading;
  /** The card's item (cards whose item was not recognised are left out) */
  itemId: string;
  /** The hero's win rate with the card's item (the enhanced copy's when the card is enhanced), or null without data */
  winRate: number | null;
  /** The item's worth against its tier for the hero (cardGain), or null without data */
  itemGain: number | null;
  /** The bonus item's worth, its gain and its souls, counted only when positive (a bonus never makes a card worse) */
  bonusGain: number;
  /** The item is already owned, or included in an owned item: nothing of it counts, and the card comes last */
  owned: boolean;
  /** What the item's upgrades add (pathValue): 0 for an owned item or without a path */
  pathGain: number;
  /** The upgrade that adds the most, for the card's note */
  pathTo: { upgrade: string; gain: number; extraChance: number } | null;
  /** What the souls of the card's item are worth (tierValue): 0 for an owned item */
  soulGain: number;
  /** itemGain + soulGain (unless owned) + bonusGain + pathGain: what the cards are sorted by, owned cards last */
  score: number;
  /** How uncertain the score is (standard deviation): its item's gain and its bonus item's; 0 for an owned card */
  scoreSd: number;
}

export interface PickAdvice {
  ranked: RankedCard[];
  /** Re-roll suggested: the best card is worth less than what the re-roll is worth here */
  suggestReroll: boolean;
  /** What a re-roll is worth now, on the cards' scale (null without re-roll or data) */
  rerollWorth: number | null;
  /**
   * The two best cards are closer than their scores' combined uncertainty: the data cannot tell them apart, either is
   * fine. Their tier and upgrade parts are taken as known; only the items' own gains are uncertain.
   */
  closeCall: boolean;
}

export interface PickContext {
  /** Re-rolls left this round (they are shared by the round's three picks and lost at its end) */
  rerolls: 0 | 1 | 2 | null;
  /** n of "CHOICE n OF 3" (unknown: counted as the round's last pick) */
  choice: 1 | 2 | 3 | null;
  /** Items owned this game with the components they include (effectiveOwnedSet); none known when absent */
  owned?: Set<string>;
  /** Tiers still to be offered this game, this pick included (an upgrade of another tier cannot come); all when absent */
  laterTiers?: Set<number>;
  /**
   * Normal tier of each pick of the round after this one (draftRoundTiers), for the re-roll: a re-roll kept is spent on
   * them. Absent: they are taken as offering this pick's tiers.
   */
  nextPickTiers?: number[];
}

/**
 * What taking a component adds through its upgrades: for each upgrade not owned and of a tier still to come, the
 * extra chance of ending up with it (stats.paths) times its gain for the hero, when positive. Measured, not modelled:
 * Nurse Harrow's Mystic Vulnerability, +6 points of chance of Escalating Exposure (+4.5): about +0.28.
 */
function pathValue(
  stats: StreetBrawlHeroStats,
  itemId: string,
  context: Pick<PickContext, 'owned' | 'laterTiers'>,
  tierOf: (itemId: string) => number | undefined
): { value: number; best: RankedCard['pathTo'] } {
  let value = 0;
  let best: RankedCard['pathTo'] = null;
  for (const { upgrade, extraChance } of stats.paths[itemId] ?? []) {
    if (context.owned?.has(upgrade)) continue;
    const tier = tierOf(upgrade);
    if (context.laterTiers && (tier === undefined || !context.laterTiers.has(tier))) continue;
    const g = gain(stats, upgrade);
    if (g === null || g <= 0) continue;
    value += extraChance * g;
    if (!best || extraChance * g > best.extraChance * best.gain) best = { upgrade, gain: g, extraChance };
  }
  return { value, best };
}

/** An item's worth against its tier for the hero (stats.ts › itemGains), or null without data. */
const gain = (stats: StreetBrawlHeroStats, itemId: string | null): number | null => {
  const s = itemId ? stats.items[itemId] : undefined;
  return s ? s.gain : null;
};

/** What one card slot can turn into on a re-roll: the gains of its tier's items, normal or enhanced, and their odds. */
interface SlotDraw {
  gains: number[]; // sorted
  /** cumulative[i]: probability of a card worth at most gains[i] (the last one is 1) */
  cumulative: number[];
}

function slotDraw(cards: { gain: number; p: number }[]): SlotDraw {
  const sorted = [...cards].sort((a, b) => a.gain - b.gain);
  const total = sorted.reduce((s, c) => s + c.p, 0) || 1;
  let acc = 0;
  return {
    gains: sorted.map((c) => c.gain),
    cumulative: sorted.map((c) => (acc += c.p / total)),
  };
}

/** Probability that the slot's card is worth at most `x`. */
function cdf(slot: SlotDraw, x: number): number {
  let lo = 0;
  let hi = slot.gains.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (slot.gains[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? 0 : slot.cumulative[lo - 1];
}

/**
 * Distribution of the best card of a fresh offer, each slot drawn on its own: P(best <= x) is the product of the
 * slots' P(card <= x). Values sorted, with the probability that the best card is each of them.
 */
function bestOfOffer(slots: SlotDraw[]): { value: number; p: number }[] {
  const values = [...new Set(slots.flatMap((s) => s.gains))].sort((a, b) => a - b);
  let previous = 0;
  return values.map((value) => {
    const atMost = slots.reduce((prod, s) => prod * cdf(s, value), 1);
    const p = atMost - previous;
    previous = atMost;
    return { value, p };
  });
}

/**
 * What the rest of the round is worth with n picks left (the current one included) and k re-rolls, playing each pick
 * at its best: take the offer, or re-roll when a fresh offer plus the re-rolls kept is worth more.
 * worth(n, k) = E[max(best + worth(n - 1, k), worth(n, k - 1))], the best card drawn from `dists[n]`: the offer of the
 * pick with n picks left (a re-roll draws that same pick again).
 */
function roundWorth(dists: { value: number; p: number }[][], picks: number, rerolls: number): number[][] {
  const w: number[][] = Array.from({ length: picks + 1 }, () => new Array(rerolls + 1).fill(0));
  for (let n = 1; n <= picks; n++) {
    for (let k = 0; k <= rerolls; k++) {
      let e = 0;
      for (const { value, p } of dists[n]) {
        const take = value + w[n - 1][k];
        e += p * (k > 0 ? Math.max(take, w[n][k - 1]) : take);
      }
      w[n][k] = e;
    }
  }
  return w;
}

export function rankOffers(
  cards: CardReading[],
  stats: StreetBrawlHeroStats,
  context: PickContext,
  tierOf: (itemId: string) => number | undefined
): PickAdvice {
  const owned = context.owned ?? new Set<string>();
  // What an item brings when taken: its worth in its tier, its souls and its upgrades. An owned item (or one an owned
  // item includes) brings nothing new.
  const itemWorth = (id: string, enhanced: boolean) =>
    owned.has(id)
      ? 0
      : cardGain(stats, id, enhanced, tierOf(id)) + tierValue(tierOf(id)) + pathValue(stats, id, context, tierOf).value;

  const ranked = cards
    .filter((card) => card.itemId !== null)
    .map((card): RankedCard => {
      const id = card.itemId!;
      const tier = tierOf(id);
      const isOwned = owned.has(id);
      const itemGain = stats.items[id] ? cardGain(stats, id, card.enhanced, tier) : null;
      const soulGain = isOwned ? 0 : tierValue(tier);
      const path = isOwned ? { value: 0, best: null } : pathValue(stats, id, context, tierOf);
      const sdOf = (itemId: string) => stats.items[itemId]?.gainSd ?? UNKNOWN_GAIN_SD;
      // The bonus item: its gain and souls (an unrecognised one: the tier's average item, no worse), never below 0
      const bonusGain = !card.hasBonus
        ? 0
        : card.bonusItemId
          ? Math.max(0, itemWorth(card.bonusItemId, false))
          : tierValue(tier);
      return {
        card,
        itemId: id,
        winRate: cardWinRate(stats, id, card.enhanced, tier) ?? null,
        itemGain,
        bonusGain,
        owned: isOwned,
        pathGain: path.value,
        pathTo: path.best,
        soulGain,
        score: (isOwned ? 0 : (itemGain ?? 0) + soulGain + path.value) + bonusGain,
        scoreSd: Math.hypot(isOwned ? 0 : sdOf(id), card.bonusItemId && bonusGain > 0 ? sdOf(card.bonusItemId) : 0),
      };
    })
    // Owned cards last whatever their score: they bring nothing new
    .sort((a, b) => Number(a.owned) - Number(b.owned) || b.score - a.score);

  const [first, second] = ranked;
  const closeCall =
    !!second && !second.owned && first.score - second.score < Math.hypot(first.scoreSd, second.scoreSd);

  const rerolls = context.rerolls ?? 0;
  if (rerolls === 0 || ranked.length === 0) return { ranked, suggestReroll: false, rerollWorth: null, closeCall };

  // A re-roll keeps each card's quality: a tier X card turns into another tier X item, an enhanced card into another
  // enhanced one. Each slot is drawn from its own tier with the game's odds for the hero (stats.offerOdds: "Good" and
  // "Normal" buckets, weights), each item at what it brings (a bonus item is not counted on). Without odds (older
  // data), the hero's items of the tier, each as likely.
  const ids = Object.keys(stats.items);
  if (ids.length === 0) return { ranked, suggestReroll: false, rerollWorth: null, closeCall };
  const offerable = Object.keys(stats.offerOdds);
  const slotOf = (tier: number | undefined, enhanced: boolean): SlotDraw => {
    const offered = offerable.filter((id) => tier !== undefined && tierOf(id) === tier);
    if (offered.length >= MIN_POOL) {
      return slotDraw(offered.map((id) => ({ gain: itemWorth(id, enhanced), p: stats.offerOdds[id] })));
    }
    const inTier = ids.filter((id) => tier !== undefined && tierOf(id) === tier);
    const pool = inTier.length >= MIN_POOL ? inTier : ids;
    return slotDraw(pool.map((id) => ({ gain: itemWorth(id, enhanced), p: 1 })));
  };
  const slots = ranked.map((r) => slotOf(tierOf(r.itemId), r.card.enhanced));

  // dists[n]: the best card of the pick with n picks left. This pick: its own slots. The later ones: three normal
  // cards of their tier (round 1's picks are tiers 1, 2, 3: a re-roll kept for pick 3 is worth more than one spent on
  // a tier 1 offer). Without their tiers, the same as this pick.
  const picks = context.choice ? 4 - context.choice : 1;
  const dists: { value: number; p: number }[][] = [[]];
  for (let n = 1; n <= picks; n++) {
    const laterTier = n < picks ? context.nextPickTiers?.[picks - n - 1] : undefined;
    dists[n] =
      laterTier === undefined ? bestOfOffer(slots) : bestOfOffer([0, 1, 2].map(() => slotOf(laterTier, false)));
  }
  const w = roundWorth(dists, picks, rerolls);
  // Taking now: best + worth(picks - 1, rerolls); re-rolling: worth(picks, rerolls - 1)
  const rerollWorth = w[picks][rerolls - 1] - w[picks - 1][rerolls];
  return { ranked, suggestReroll: ranked[0].score < rerollWorth, rerollWorth, closeCall };
}
