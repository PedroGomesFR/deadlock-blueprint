// The one reason a card shows for its rank: the part of its score that sets it apart in this offer. Pure.
import type { RankedCard } from './ranking';

/** Smallest part (win rate) worth naming as a card's reason: 0.2 points. */
const MIN_REASON = 0.002;

export type CardReason =
  | { kind: 'owned' }
  /** The card's item upgrades one the player owns */
  | { kind: 'upgrades'; itemId: string }
  /** Most of its worth: the upgrade it leads to */
  | { kind: 'path'; upgradeId: string }
  /** Most of its worth: the bonus item of a two-item card */
  | { kind: 'twoItems' }
  /** Most of its worth: a higher tier than the offer's other cards (rare, legendary) */
  | { kind: 'tier'; value: number }
  /** The item itself, against its tier for the hero (negative when below the tier's average) */
  | { kind: 'item'; gain: number }
  | { kind: 'noData' };

/**
 * `upgradedOwned`: the owned item this card's item upgrades, if any (the player sees that first). Otherwise the
 * largest positive part of the score wins: the item's own gain, its path, its bonus item, or its tier's souls above
 * the offer's lowest (every card of a pick has the tier's value; only a higher tier sets one apart).
 */
export function cardReason(card: RankedCard, offer: RankedCard[], upgradedOwned?: string): CardReason {
  if (card.owned) return { kind: 'owned' };
  if (upgradedOwned) return { kind: 'upgrades', itemId: upgradedOwned };
  const lowestSouls = Math.min(...offer.filter((c) => !c.owned).map((c) => c.soulGain), card.soulGain);
  const parts: [CardReason, number][] = [
    [{ kind: 'item', gain: card.itemGain ?? 0 }, card.itemGain ?? 0],
    [card.pathTo ? { kind: 'path', upgradeId: card.pathTo.upgrade } : { kind: 'noData' }, card.pathTo ? card.pathGain : 0],
    [{ kind: 'twoItems' }, card.bonusGain],
    [{ kind: 'tier', value: card.soulGain - lowestSouls }, card.soulGain - lowestSouls],
  ];
  const [best, value] = parts.reduce((a, b) => (b[1] > a[1] ? b : a));
  // A part worth less than this does not set the card apart: a +0.01 path on a -1 point item is still a weak item
  if (value >= MIN_REASON) return best;
  return card.itemGain === null ? { kind: 'noData' } : { kind: 'item', gain: card.itemGain };
}
