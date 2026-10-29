// The Street Brawl tab's look, taken from the game's own pick screen and HUD (see .impeccable.md): cream poster
// capitals on warm near-black, items in round medallions ringed with their category colour, a corner badge for the
// tier, magenta for the pick state, teal for rare, cyan for enhanced, gold for legendary. Tailwind class strings and
// colours, kept here so the tab's components share them without touching the app's theme.
import type { ItemCategory } from './stats';

/** Cream: the game's poster capitals ("SELECT ITEMS"). */
export const BONE = 'text-[#ede3cc]';
/** Magenta: the game's "CHOICE n OF 3". */
export const MAGENTA = 'text-[#e879c9]';

/** Ring colours of the item categories (the app's deadlock.weapon / vitality / spirit). */
export const CATEGORY_RING: Record<ItemCategory, string> = {
  weapon: '#ea580c',
  vitality: '#16a34a',
  spirit: '#9333ea',
};
export const LEGENDARY_GOLD = '#d4af37';
export const RARE_TEAL = '#5eead4';
export const ENHANCED_CYAN = '#67e8f9';

/** Tiers as the game's badges write them. */
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
