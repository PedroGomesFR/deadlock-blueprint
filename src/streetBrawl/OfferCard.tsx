// One offered card of the Street Brawl tab, drawn like the game's: the item in a round medallion ringed with its
// category colour, its tier badge, its rank and the one reason for it. Its full breakdown opens on hover or focus.
import React from 'react';
import { Zap } from 'lucide-react';
import { ITEMS_DB, getAbilityIcon, getHeroImbueTarget, getItemsDb } from '../data/deadlockData';
import { ItemArtworkIcon } from '../components/DeadlockIcons';
import type { Lang } from '../i18n/lang';
import type { RankedCard } from './ranking';
import type { StreetBrawlHeroStats } from './stats';
import { LEGENDARY_ITEMS } from './stats';
import { itemIcon, itemInfo, itemName } from './items';
import { cardReason } from './reasons';
import { BONE, CATEGORY_RING, ENHANCED_CYAN, LEGENDARY_GOLD, RARE_TEAL, ROMAN } from './style';
import { streetBrawlText } from './i18n';

/** Icon of a shop item (the app's component) or of a Street Brawl-only legendary item, for small square uses. */
export const OfferIcon: React.FC<{ itemId: string; lang: Lang; size: number }> = ({ itemId, lang, size }) => {
  const item = getItemsDb(lang)[itemId];
  if (item) return <ItemArtworkIcon itemId={item.id} category={item.category} size={size} />;
  const legendary = LEGENDARY_ITEMS[itemId];
  if (!legendary?.icon) return null;
  return (
    <img
      src={legendary.icon}
      alt=""
      style={{ width: size, height: size }}
      className="rounded-lg border border-amber-300/70 shrink-0 object-cover"
      draggable={false}
    />
  );
};

/**
 * The item in a round medallion, as on the game's pick screen: ringed with its category colour (gold for a legendary
 * item, a second teal ring for a rare card), its tier in a corner badge, a cyan bolt when enhanced.
 */
export const Medallion: React.FC<{ itemId: string; size: number; rare?: boolean; enhanced?: boolean }> = ({
  itemId,
  size,
  rare = false,
  enhanced = false,
}) => {
  const info = itemInfo(itemId);
  const legendary = Boolean(LEGENDARY_ITEMS[itemId]);
  const ring = legendary ? LEGENDARY_GOLD : info ? CATEGORY_RING[info.category as keyof typeof CATEGORY_RING] : '#57534e';
  const icon = itemIcon(itemId);
  const badge = Math.max(14, Math.round(size * 0.32));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full overflow-hidden bg-[#1a1612] flex items-center justify-center"
        style={{ border: `${size >= 48 ? 3 : 2}px solid ${ring}`, boxShadow: rare ? `0 0 0 2px ${RARE_TEAL}` : undefined }}
      >
        {icon && <img src={icon} alt="" className="w-[78%] h-[78%] object-contain" draggable={false} />}
      </div>
      {info && (
        <span
          className="absolute -top-0.5 -right-0.5 rounded-full flex items-center justify-center text-small font-extrabold text-[#1a1612]"
          style={{ width: badge, height: badge, background: ring }}
        >
          {ROMAN[info.tier]}
        </span>
      )}
      {enhanced && (
        <Zap
          className="absolute -bottom-0.5 -right-0.5"
          style={{ width: badge, height: badge, color: ENHANCED_CYAN }}
          fill={ENHANCED_CYAN}
          strokeWidth={1}
          aria-hidden
        />
      )}
    </div>
  );
};

/**
 * "Imbue on [icon] Ability" under an imbue item: where published builds put it (the normal mode's data, see
 * getHeroImbueTarget; published builds are not tied to a game mode, and count popularity, not wins). Compact on the
 * card itself; with the share of builds in the breakdown.
 */
const ImbueHint: React.FC<{ heroId: string; itemId: string; lang: Lang; compact?: boolean }> = ({
  heroId,
  itemId,
  lang,
  compact = false,
}) => {
  const imbue = getHeroImbueTarget(heroId, itemId, lang);
  if (!imbue) return null;
  const text = streetBrawlText(lang);
  const icon = getAbilityIcon(heroId, imbue.ability);
  return (
    <p className={`flex items-center justify-center flex-wrap gap-x-1 text-violet-200 ${compact ? "text-small" : ""}`}>
      <span>{text.imbueOn}</span>
      {icon && <img src={icon} alt="" className="w-3.5 h-3.5 object-contain" draggable={false} />}
      <span className="font-bold">{imbue.abilityName}</span>
      {!compact && <span className="text-violet-300/70">· {text.imbueSource(`${Math.round(imbue.share * 100)}%`)}</span>}
    </p>
  );
};

export const OfferCard: React.FC<{
  ranked: RankedCard;
  /** 1 = the best card for the hero */
  rank: number;
  /** The other cards of the offer, for the card's reason */
  offer: RankedCard[];
  /** The card to take */
  isPick: boolean;
  /** Second card of a close call: as good as the first, as far as the data can tell */
  alsoFine?: boolean;
  /** A re-roll is advised, or the pick screen has closed: every card steps back */
  muted?: boolean;
  stats: StreetBrawlHeroStats;
  /** Items owned this game (as read in the HUD) */
  owned: string[];
  heroId: string;
  heroName: string;
  lang: Lang;
}> = ({ ranked: r, rank, offer, isPick, alsoFine = false, muted = false, stats, owned, heroId, heroName, lang }) => {
  const text = streetBrawlText(lang);
  const name = (id: string) => itemName(id, lang);
  const upgradedOwned = ITEMS_DB[r.itemId]?.upgradesFrom?.find((id) => owned.includes(id));
  const reason = cardReason(r, offer, upgradedOwned);
  const bonusStat = r.card.bonusItemId ? stats.items[r.card.bonusItemId] : undefined;

  let reasonText: string;
  switch (reason.kind) {
    case 'owned':
      reasonText = text.owned;
      break;
    case 'upgrades':
      reasonText = text.reasonUpgrades(name(reason.itemId));
      break;
    case 'path':
      reasonText = text.reasonPath(name(reason.upgradeId));
      break;
    case 'twoItems':
      reasonText = text.reasonTwoItems;
      break;
    case 'tier':
      reasonText = text.reasonTier(reason.value, lang);
      break;
    case 'item':
      reasonText = text.reasonItem(reason.gain, lang);
      break;
    case 'noData':
      reasonText = text.reasonNoData;
      break;
  }
  const reasonGood = !(reason.kind === 'owned' || reason.kind === 'noData' || (reason.kind === 'item' && reason.gain < 0));
  const frame = isPick
    ? 'bg-emerald-950/40 border-2 border-emerald-400'
    : alsoFine
      ? 'bg-emerald-950/20 border-2 border-emerald-400/60'
      : 'bg-[#16130f] border border-white/10';
  const stepBack = muted || r.owned || (!isPick && !alsoFine && rank === 3);

  return (
    <div
      tabIndex={0}
      className={`group relative h-full flex flex-col items-center text-center gap-1.5 rounded-xl px-2 pt-2 pb-2.5 outline-none transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-[#ede3cc]/60 ${frame} ${
        stepBack ? 'opacity-55 hover:opacity-100 focus:opacity-100' : ''
      }`}
    >
      <span className="text-small uppercase tracking-[0.14em] text-stone-500">{text.position[r.card.position]}</span>

      <div className="flex items-center gap-1">
        <Medallion itemId={r.itemId} size={56} rare={r.card.rare} enhanced={r.card.enhanced} />
        {r.card.hasBonus && (
          <>
            <span className="text-title font-extrabold text-violet-300">+</span>
            {r.card.bonusItemId ? (
              <Medallion itemId={r.card.bonusItemId} size={40} />
            ) : (
              <span className="w-10 h-10 rounded-full border-2 border-dashed border-violet-400/60 text-violet-300 font-extrabold flex items-center justify-center">
                ?
              </span>
            )}
          </>
        )}
      </div>

      <p className={`text-title font-extrabold leading-tight ${BONE} line-clamp-2 min-h-[2.5rem] flex items-center justify-center`}>
        <span>
          {name(r.itemId)}
          {r.card.bonusItemId && <span className="text-violet-200"> + {name(r.card.bonusItemId)}</span>}
        </span>
      </p>

      <span
        className={`mt-auto px-2 py-0.5 rounded-full text-small font-extrabold ${
          isPick
            ? 'bg-emerald-400 text-emerald-950'
            : alsoFine
              ? 'border border-emerald-400 text-emerald-200'
              : 'border border-white/15 text-stone-400'
        }`}
      >
        #{rank}
        {isPick && ` · ${text.take}`}
        {alsoFine && ` · ${text.alsoFine}`}
      </span>

      <span className={`text-small font-bold ${reasonGood ? 'text-amber-200' : 'text-stone-400'}`}>{reasonText}</span>
      <ImbueHint heroId={heroId} itemId={r.itemId} lang={lang} compact />

      {/* The full breakdown: floats under the card on hover or keyboard focus, so the three cards keep one height */}
      <div className="pointer-events-none invisible opacity-0 translate-y-1 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:visible group-focus-within:opacity-100 group-focus-within:translate-y-0 transition duration-150 ease-out motion-reduce:transition-none absolute left-0 right-0 top-full z-20 mt-1">
        <div className="rounded-xl border border-white/15 bg-[#1a1612] p-2.5 text-small text-stone-300 space-y-1">
          <p>{r.winRate !== null && r.itemGain !== null ? text.winRate(r.winRate, r.itemGain, lang) : text.noData}</p>
          {r.card.enhanced && r.winRate !== null && <p className="text-cyan-200">{text.enhancedCopy}</p>}
          {r.soulGain > 0 && <p className="text-amber-200/80">{text.tierWorth(r.soulGain, lang)}</p>}
          {r.pathTo && (
            <p className="text-emerald-200/90">
              {text.path(name(r.pathTo.upgrade), r.pathTo.gain, r.pathTo.extraChance, r.pathGain, heroName, lang)}
            </p>
          )}
          {r.card.bonusItemId && (
            <p className="text-violet-200/80">
              {name(r.card.bonusItemId)}: {bonusStat ? text.winRate(bonusStat.winRate, bonusStat.gain, lang) : text.noData}
            </p>
          )}
          {(LEGENDARY_ITEMS[r.itemId] || r.card.rare || r.card.enhanced) && (
            <p className="flex justify-center gap-2 font-bold">
              {LEGENDARY_ITEMS[r.itemId] && <span style={{ color: LEGENDARY_GOLD }}>{text.legendary}</span>}
              {r.card.rare && <span style={{ color: RARE_TEAL }}>{text.rare}</span>}
              {r.card.enhanced && <span style={{ color: ENHANCED_CYAN }}>{text.enhanced}</span>}
            </p>
          )}
          <ImbueHint heroId={heroId} itemId={r.itemId} lang={lang} />
        </div>
      </div>
    </div>
  );
};
