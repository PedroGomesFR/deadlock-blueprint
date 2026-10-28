// What the Street Brawl tab needs to know of an item, from the app's catalogue or the Street Brawl-only legendary items.
import { ITEMS_DB, getItemsDb } from '../data/deadlockData';
import type { Lang } from '../i18n/lang';
import { LEGENDARY_ITEMS, LEGENDARY_TIER } from './stats';

/** An item's tier: the shop's tiers 1-4, LEGENDARY_TIER for the Street Brawl-only items. */
export const tierOf = (itemId: string): number | undefined =>
  LEGENDARY_ITEMS[itemId] ? LEGENDARY_TIER : ITEMS_DB[itemId]?.tier;

/** An item's tier and category, for the inventory slots' badges. */
export const itemInfo = (itemId: string) => {
  const legendary = LEGENDARY_ITEMS[itemId];
  if (legendary) return { tier: LEGENDARY_TIER, category: legendary.category };
  const item = ITEMS_DB[itemId];
  return item ? { tier: item.tier, category: item.category } : undefined;
};

/** An item's artwork (the shop icon, or the legendary item's icon), undefined when there is none. */
export const itemIcon = (itemId: string): string | undefined => LEGENDARY_ITEMS[itemId]?.icon ?? ITEMS_DB[itemId]?.icon;

/** A game name without the app's parenthesised hint ("Spirit Rend (Spirit Damage)" → "Spirit Rend"). */
export const shortName = (name: string) => name.split('(')[0].trim();

/** An item's name in the interface's language (its id when unknown). */
export function itemName(itemId: string, lang: Lang): string {
  const legendary = LEGENDARY_ITEMS[itemId];
  if (legendary) return { fr: legendary.nameFr, en: legendary.nameEn, it: legendary.nameIt }[lang];
  const item = getItemsDb(lang)[itemId];
  return item ? shortName(item.name) : itemId;
}
