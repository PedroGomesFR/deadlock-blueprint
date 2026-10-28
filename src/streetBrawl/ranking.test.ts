import { describe, expect, it } from 'vitest';
import type { CardReading } from './pickScreen';
import { PickContext, rankOffers, tierValue } from './ranking';
import type { StreetBrawlHeroStats } from './stats';

const card = (itemId: string | null, extra: Partial<CardReading> = {}): CardReading => ({
  position: 'center',
  itemId,
  distance: 0.01,
  secondDistance: 0.5,
  enhanced: false,
  rare: false,
  hasBonus: Boolean(extra.bonusItemId),
  bonusItemId: null,
  ...extra,
});

// An item of the fixtures: its gain within its tier is its win rate against the hero's 50 % (already centred)
// (uncertainty 0.5 points unless given)
const stat = (winRate: number, gainSd = 0.005) => ({ pickRate: 0.1, winRate, matches: 1000, gain: winRate - 0.5, gainSd });
// Ten items of one tier, gains from -4 to +5 points
const items: StreetBrawlHeroStats['items'] = {};
for (let i = 0; i < 10; i++) items[`item${i}`] = stat(0.46 + i * 0.01);
// Enhanced copies: item5's is measured at 53 %; the others fall back on the tier's gap (+1.5 points)
const stats: StreetBrawlHeroStats = {
  matches: 10000,
  winRate: 0.5,
  items,
  enhancedItems: { item5: { winRate: 0.53, matches: 400 } },
  enhancedTierGain: { 2: 0.015 },
  abilityPlan: [],
  offerOdds: {},
  paths: {},
};
const tierOf = () => 2;

const advise = (cards: CardReading[], context: PickContext) => rankOffers(cards, stats, context, tierOf);
const order = (cards: CardReading[]) => advise(cards, { rerolls: 0, choice: 1 }).ranked.map((r) => r.card.itemId);

describe('Street Brawl offer ranking', () => {
  it('puts the item with the best win rate for the hero first', () => {
    expect(order([card('item2'), card('item9'), card('item5')])).toEqual(['item9', 'item5', 'item2']);
  });

  it('adds the bonus item, but a bad bonus never makes a card worse', () => {
    expect(order([card('item5', { bonusItemId: 'item9' }), card('item8')])).toEqual(['item5', 'item8']);
    const [withBadBonus] = advise([card('item5', { bonusItemId: 'item0' })], { rerolls: 0, choice: 1 }).ranked;
    expect(withBadBonus.bonusGain).toBe(0);
  });

  it('scores an enhanced card with its enhanced copy, measured or from the tier gap', () => {
    const [measured] = advise([card('item5', { enhanced: true })], { rerolls: 0, choice: 1 }).ranked;
    expect(measured.winRate).toBeCloseTo(0.53);
    // item5 +1 pt, its enhanced copy 2 points above its normal one, and its tier's souls
    expect(measured.score).toBeCloseTo(0.03 + tierValue(2), 6);
    const [fromTier] = advise([card('item6', { enhanced: true })], { rerolls: 0, choice: 1 }).ranked;
    expect(fromTier.winRate).toBeCloseTo(0.52 + 0.015);
  });

  it('counts nothing for an item already owned but its bonus, and ranks owned cards last', () => {
    const owned = new Set(['item9', 'item8']);
    const advice = advise([card('item9'), card('item5'), card('item8', { bonusItemId: 'item7' })], {
      rerolls: 0,
      choice: 1,
      owned,
    });
    // item8's bonus (item7, +3 pts) beats item5 (+1 pt), but an owned card brings nothing new: last
    expect(advice.ranked.map((r) => r.card.itemId)).toEqual(['item5', 'item8', 'item9']);
    expect(advice.ranked[2]).toMatchObject({ owned: true, score: 0 });
    expect(advice.ranked[1].score).toBeCloseTo(0.03 + tierValue(2), 6);
  });

  it('adds what a component’s upgrades are worth to the hero', () => {
    // item3 (-1 pt) builds into item9 (+5 pts, +40 points of chance: +2) and item8 (+4 pts, +10 points: +0.4):
    // -1 + 2.4 = +1.4 pts, ahead of item5 (+1 pt). item2 builds into item0 (-4 pts): nothing added
    const withPaths: StreetBrawlHeroStats = {
      ...stats,
      paths: {
        item3: [
          { upgrade: 'item9', extraChance: 0.4 },
          { upgrade: 'item8', extraChance: 0.1 },
        ],
        item2: [{ upgrade: 'item0', extraChance: 0.5 }], // into a bad item: worth nothing
      },
    };
    const tiers = (id: string) => (id === 'item9' || id === 'item8' ? 3 : 2);
    const rank = (context: PickContext) => rankOffers([card('item5'), card('item3'), card('item2')], withPaths, context, tiers);
    const advice = rank({ rerolls: 0, choice: 1 });
    expect(advice.ranked.map((r) => r.card.itemId)).toEqual(['item3', 'item5', 'item2']);
    expect(advice.ranked[0].pathGain).toBeCloseTo(0.4 * 0.05 + 0.1 * 0.04);
    expect(advice.ranked[0].pathTo).toMatchObject({ upgrade: 'item9' });
    expect(advice.ranked[2].pathGain).toBe(0);
    // Upgrade already owned, or its tier no longer offered: no path
    expect(rank({ rerolls: 0, choice: 1, owned: new Set(['item9', 'item8']) }).ranked[0].card.itemId).toBe('item5');
    expect(rank({ rerolls: 0, choice: 1, laterTiers: new Set([2]) }).ranked[0].card.itemId).toBe('item5');
  });

  it('counts what a higher tier’s souls are worth', () => {
    // Two items of the same win rate (+1 pt), one tier 1, one tier 4: the tier 4 one first
    const twin: StreetBrawlHeroStats = { ...stats, items: { ...items, twin5: { ...items.item5 } } };
    const tiers = (id: string) => (id === 'twin5' ? 4 : 1);
    const advice = rankOffers([card('item5'), card('twin5')], twin, { rerolls: 0, choice: 1 }, tiers);
    expect(advice.ranked.map((r) => r.card.itemId)).toEqual(['twin5', 'item5']);
    expect(advice.ranked[0].soulGain - advice.ranked[1].soulGain).toBeCloseTo(tierValue(4) - tierValue(1), 6);
    // An average tier 4 item (item4, +0) against a below-average tier 1 one (item3, -1 pt): the tier 4 one
    const t4 = rankOffers([card('item3'), card('item4')], stats, { rerolls: 0, choice: 1 }, (id) => (id === 'item4' ? 4 : 1));
    expect(t4.ranked[0].card.itemId).toBe('item4');
    // A clearly better tier 1 item still wins: item9 (+5 pts) against the average tier 4
    const strong = rankOffers([card('item9'), card('item4')], stats, { rerolls: 0, choice: 1 }, (id) => (id === 'item9' ? 1 : 4));
    expect(strong.ranked[0].card.itemId).toBe('item9');
  });

  it('ranks nothing, without failing, when no card can be read (the cards animating away after a pick)', () => {
    for (const rerolls of [0, 1] as const) {
      const advice = advise([card(null), card(null), card(null)], { rerolls, choice: 2 });
      expect(advice).toMatchObject({ ranked: [], suggestReroll: false, closeCall: false });
    }
  });

  it('leaves out cards it could not read, and scores items without data as average', () => {
    const advice = advise([card(null), card('unknown_item'), card('item2')], { rerolls: 0, choice: 1 });
    expect(advice.ranked.map((r) => r.card.itemId)).toEqual(['unknown_item', 'item2']);
    expect(advice.ranked[0].itemGain).toBeNull();
  });
});

describe('Street Brawl close calls', () => {
  it('calls it close when the two best cards are within their combined uncertainty', () => {
    // item6 (+2 pts) and item5 (+1 pt), each ±0.5: 1 point apart, more than 0.71 combined: not close
    expect(advise([card('item6'), card('item5')], { rerolls: 0, choice: 1 }).closeCall).toBe(false);
    // The same items known only to ±1 point each: 1.41 combined, so 1 point apart is a close call
    const vague: StreetBrawlHeroStats = { ...stats, items: { ...items, item6: stat(0.52, 0.01), item5: stat(0.51, 0.01) } };
    expect(rankOffers([card('item6'), card('item5')], vague, { rerolls: 0, choice: 1 }, tierOf).closeCall).toBe(true);
  });

  it('never calls it close against an owned card, or with a single card', () => {
    const vague: StreetBrawlHeroStats = { ...stats, items: { ...items, item6: stat(0.52, 0.02), item5: stat(0.51, 0.02) } };
    const owned = new Set(['item5']);
    expect(rankOffers([card('item6'), card('item5')], vague, { rerolls: 0, choice: 1, owned }, tierOf).closeCall).toBe(false);
    expect(advise([card('item6')], { rerolls: 0, choice: 1 }).closeCall).toBe(false);
  });
});

describe('Street Brawl re-roll', () => {
  const middling = [card('item6'), card('item5'), card('item4')]; // best +2 points

  it('never suggests it without a re-roll left', () => {
    expect(advise([card('item0'), card('item1')], { rerolls: 0, choice: 3 }).suggestReroll).toBe(false);
  });

  it('re-rolls a weak offer, keeps a strong one', () => {
    expect(advise([card('item0'), card('item1'), card('item2')], { rerolls: 1, choice: 3 }).suggestReroll).toBe(true);
    expect(advise([card('item9'), card('item1')], { rerolls: 1, choice: 3 }).suggestReroll).toBe(false);
  });

  it('spends a re-roll more readily on the last pick of the round, where it would be lost', () => {
    const first = advise(middling, { rerolls: 1, choice: 1 });
    const last = advise(middling, { rerolls: 1, choice: 3 });
    expect(last.rerollWorth!).toBeGreaterThan(first.rerollWorth!);
    expect(first.suggestReroll).toBe(false);
    expect(last.suggestReroll).toBe(true);
  });

  it('is more liberal with two re-rolls than with one', () => {
    const one = advise(middling, { rerolls: 1, choice: 2 });
    const two = advise(middling, { rerolls: 2, choice: 2 });
    expect(two.rerollWorth!).toBeGreaterThan(one.rerollWorth!);
  });

  it('re-rolls each card within its own tier', () => {
    // Tier 1 items are all weak (-4 to -1), tier 3 items all strong (+2 to +5)
    const tiered: StreetBrawlHeroStats = {
      matches: 10000,
      winRate: 0.5,
      items: Object.fromEntries([
        ...[0, 1, 2, 3, 4, 5].map((i) => [`low${i}`, stat(0.46 + i * 0.006)]),
        ...[0, 1, 2, 3, 4, 5].map((i) => [`high${i}`, stat(0.52 + i * 0.006)]),
      ]),
      enhancedItems: {},
      enhancedTierGain: {},
      abilityPlan: [],
      offerOdds: {},
      paths: {},
    };
    const tierOfTiered = (id: string) => (id.startsWith('low') ? 1 : 3);
    const context: PickContext = { rerolls: 1, choice: 3 };
    const lowOffer = rankOffers([card('low5'), card('low0'), card('low1')], tiered, context, tierOfTiered);
    const highOffer = rankOffers([card('high0'), card('high1'), card('high2')], tiered, context, tierOfTiered);
    // A weak tier 1 offer re-rolls into tier 1 cards: no better on average than the -1 point already offered
    expect(lowOffer.rerollWorth!).toBeLessThan(0);
    expect(highOffer.rerollWorth!).toBeGreaterThan(0.02);
    expect(lowOffer.suggestReroll).toBe(false);
  });

  it('keeps an enhanced card enhanced on the re-roll', () => {
    const plain = advise(middling, { rerolls: 1, choice: 3 });
    const enhanced = advise(
      middling.map((c) => ({ ...c, enhanced: true })),
      { rerolls: 1, choice: 3 }
    );
    // The enhanced slots re-roll into enhanced copies: item5 measured +3 instead of +1, the others + the 1.5 tier gap
    expect(enhanced.rerollWorth!).toBeGreaterThan(plain.rerollWorth! + 0.01);
  });

  it('draws the re-roll with the game’s offer odds', () => {
    // Same items, but the game offers the strong ones (item7-9) far more often: a re-roll is worth more
    const likelyStrong = Object.fromEntries(Object.keys(items).map((id, i) => [id, i >= 7 ? 0.3 : 0.1 / 7]));
    const likelyWeak = Object.fromEntries(Object.keys(items).map((id, i) => [id, i <= 2 ? 0.3 : 0.1 / 7]));
    const worth = (offerOdds: Record<string, number>) =>
      rankOffers(middling, { ...stats, offerOdds }, { rerolls: 1, choice: 3 }, tierOf).rerollWorth!;
    expect(worth(likelyStrong)).toBeGreaterThan(worth({}) + 0.01);
    expect(worth(likelyWeak)).toBeLessThan(worth({}) - 0.01);
  });

  it('weighs a re-roll kept against the real tiers of the round’s later picks', () => {
    // This pick's tier 2 items spread from -4 to +5; the later picks offer tier 3 items that are all alike: a re-roll
    // kept cannot improve them, so it is worth spending now, as on the round's last pick
    const flat: StreetBrawlHeroStats = {
      ...stats,
      items: { ...items, ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [`flat${i}`, stat(0.5)])) },
    };
    const tiers = (id: string) => (id.startsWith('flat') ? 3 : 2);
    const worth = (nextPickTiers?: number[]) =>
      rankOffers(middling, flat, { rerolls: 1, choice: 1, nextPickTiers }, tiers).rerollWorth!;
    const lastPick = rankOffers(middling, flat, { rerolls: 1, choice: 3 }, tiers).rerollWorth!;
    expect(worth([3, 3])).toBeGreaterThan(worth());
    expect(worth([3, 3])).toBeCloseTo(lastPick, 6);
  });

  it('counts an unreadable choice as the round’s last pick', () => {
    expect(advise(middling, { rerolls: 1, choice: null }).rerollWorth).toBeCloseTo(
      advise(middling, { rerolls: 1, choice: 3 }).rerollWorth!
    );
  });
});
