// The Street Brawl tab's look, taken from the game's own pick screen and HUD (see .impeccable.md): cream poster
// capitals on warm near-black, items in round medallions ringed with their category colour, a corner badge for the
// tier, magenta for the pick state, teal for rare, cyan for enhanced, gold for legendary. Tailwind class strings and
// colours, kept here so the tab's components share them; the values are design tokens (src/styles/tokens.css).
import type { ItemCategory } from './stats';

/** Cream: the game's poster capitals ("SELECT ITEMS"). */
export const BONE = 'text-bone';
/** Magenta: the game's "CHOICE n OF 3". */
export const MAGENTA = 'text-choice-400';

/** Ring colours of the item categories (inline styles, so CSS colours of the tokens). */
export const CATEGORY_RING: Record<ItemCategory, string> = {
  weapon: 'rgb(var(--weapon-600))',
  vitality: 'rgb(var(--vitality-600))',
  spirit: 'rgb(var(--spirit-600))',
};
export const LEGENDARY_GOLD = 'rgb(var(--legendary))';
export const RARE_TEAL = 'rgb(var(--info-300))';
export const ENHANCED_CYAN = 'rgb(var(--enhanced-300))';

/** Tiers as the game's badges write them. */
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
