import React from 'react';
import { HEROES_DB, ITEMS_DB, ItemCategory, getAbilityIcon } from '../data/deadlockData';
import officialIconsMap from '../data/officialIconsMap.json';

const HERO_ICONS = officialIconsMap.heroes as Record<string, string>;
const ITEM_ICONS = officialIconsMap.items as Record<string, string>;
const ABILITY_ICONS = officialIconsMap.abilities as Record<string, string>;

const ITEM_ID_TO_ICON_KEY: Record<string, string> = {
  high_velocity_mag: 'High-Velocity Mag',
  headshot_booster: 'Headshot Booster',
  restorative_shot: 'Restorative Shot',
  monster_rounds: 'Monster Rounds',
  hollow_point_ward: 'Hollow Point Ward',
  rapid_rounds: 'Rapid Rounds',
  close_quarters: 'Close Quarters',
  active_reload: 'Active Reload',
  kinetic_dash: 'Kinetic Dash',
  slowing_bullets: 'Slowing Bullets',
  mystic_shot: 'Mystic Shot',
  soul_shredder_bullets: 'Soul Shredder Bullets',
  fleetfoot: 'Fleetfoot',
  sharpshooter: 'Sharpshooter',
  toxic_bullets: 'Toxic Bullets',
  pristine_emblem: 'Pristine Emblem',
  alchemical_fire: 'Alchemical Fire',
  tesla_bullets: 'Tesla Bullets',
  headhunter: 'Headhunter',
  burst_fire: 'Burst Fire',
  crippling_headshot: 'Crippling Headshot',
  spiritual_overflow: 'Spiritual Overflow',
  glass_cannon: 'Glass Cannon',
  silencer: 'Silencer',
  extra_regen: 'Extra Regen',
  extra_stamina: 'Extra Stamina',
  sprint_boots: 'Sprint Boots',
  extra_health: 'Extra Health',
  healing_rite: 'Healing Rite',
  enchanters_barrier: "Enchanter's Barrier",
  combat_barrier: 'Combat Barrier',
  reactive_barrier: 'Reactive Barrier',
  healbane: 'Healbane',
  debuff_reducer: 'Debuff Reducer',
  bullet_lifesteal: 'Bullet Lifesteal',
  spirit_lifesteal: 'Spirit Lifesteal',
  enduring_speed: 'Enduring Speed',
  return_fire: 'Return Fire',
  superior_stamina: 'Superior Stamina',
  debuff_remover: 'Debuff Remover',
  metal_skin: 'Metal Skin',
  bullet_resilience: 'Bullet Resilience',
  spirit_resilience: 'Spirit Resilience',
  leech: 'Leech',
  unstoppable: 'Unstoppable',
  extra_charge: 'Extra Charge',
  mystic_burst: 'Mystic Burst',
  mystic_reach: 'Mystic Reach',
  spirit_strike: 'Spirit Strike',
  quicksilver_reload: 'Quicksilver Reload',
  suppressor: 'Suppressor',
  decay: 'Decay',
  slowing_hex: 'Slowing Hex',
  duration_extender: 'Duration Extender',
  improved_cooldown: 'Improved Cooldown',
  rapid_recharge: 'Rapid Recharge',
  improved_burst: 'Improved Burst',
  knockdown: 'Knockdown',
  ethereal_shift: 'Ethereal Shift',
  mystic_vulnerability: 'Mystic Vulnerability',
  surge_of_power: 'Surge of Power',
  superior_cooldown: 'Superior Cooldown',
  boundless_spirit: 'Boundless Spirit',
  mystic_reverb: 'Mystic Reverb',
  curse: 'Curse',
};

/**
 * Official Deadlock Hero Portrait Icon
 */
export const HeroPortraitIcon: React.FC<{ heroId: string; color: string; size?: number }> = ({
  heroId,
  color,
  size = 40,
}) => {
  const hero = HEROES_DB.find((h) => h.id === heroId);
  const heroName = hero?.name || heroId;
  const normalizedFile = heroId === 'mo_and_krill' ? 'mo_krill' : heroId;
  const iconSrc = HERO_ICONS[heroName] || `./icons/heroes/${normalizedFile}.png`;

  return (
    <div
      style={{ width: size, height: size, borderColor: `${color}88` }}
      className="rounded-xl bg-black/80 border-2 flex items-center justify-center shrink-0 shadow-md relative overflow-hidden"
    >
      {iconSrc ? (
        <img
          src={iconSrc}
          alt={heroName}
          className="w-full h-full object-cover object-top"
          draggable={false}
        />
      ) : (
        <span className="text-xs font-bold text-white">{heroName.slice(0, 2)}</span>
      )}
    </div>
  );
};

/**
 * Official Deadlock Ability / Power Icon (Keys 1, 2, 3, 4)
 */
export const PowerIcon: React.FC<{
  heroId: string;
  abilityKey: '1' | '2' | '3' | '4';
  abilityName: string;
  size?: number;
}> = ({ heroId, abilityKey, abilityName, size = 44 }) => {
  // Supports both "Nuée de corneilles (Crow Familiar)" and "Crow Familiar"
  const matchParen = abilityName.match(/\(([^)]+)\)/);
  const candidateEn = matchParen ? matchParen[1].trim() : abilityName.split('(')[0].trim();
  const iconSrc =
    getAbilityIcon(heroId, abilityKey) ||
    ABILITY_ICONS[candidateEn] ||
    ABILITY_ICONS[abilityName.split('(')[0].trim()] ||
    (candidateEn === 'Spirit Snare' ? ABILITY_ICONS['Immobilizing Trap'] : undefined);

  return (
    <div
      style={{ width: size, height: size }}
      className="relative rounded-xl bg-gradient-to-br from-[#231d30] to-[#0f0c14] border border-purple-400/50 flex items-center justify-center shrink-0 shadow-md p-1.5"
    >
      {iconSrc ? (
        <img
          src={iconSrc}
          alt={abilityName}
          className="w-full h-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] brightness-110"
          draggable={false}
        />
      ) : (
        <span className="text-xs font-bold text-purple-300">{abilityKey}</span>
      )}
      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-md bg-amber-500 text-black font-extrabold text-[10px] flex items-center justify-center border border-black shadow">
        {abilityKey}
      </span>
    </div>
  );
};

/**
 * Official Deadlock Shop Item Icon (Weapon, Vitality, Spirit)
 */
export const ItemArtworkIcon: React.FC<{
  itemId: string;
  category: ItemCategory;
  size?: number;
}> = ({ itemId, category, size = 38 }) => {
  const iconKey = ITEM_ID_TO_ICON_KEY[itemId] || '';
  const iconSrc = ITEMS_DB[itemId]?.icon || ITEM_ICONS[iconKey];

  const palette = {
    weapon: {
      bg: 'from-[#ea580c] to-[#7c2d12]',
      border: 'border-orange-400/80',
    },
    vitality: {
      bg: 'from-[#16a34a] to-[#14532d]',
      border: 'border-emerald-400/80',
    },
    spirit: {
      bg: 'from-[#9333ea] to-[#4c1d95]',
      border: 'border-purple-400/80',
    },
  }[category];

  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-xl bg-gradient-to-b ${palette.bg} border ${palette.border} flex items-center justify-center shrink-0 shadow-md p-1.5 relative overflow-hidden`}
    >
      {iconSrc ? (
        <img
          src={iconSrc}
          alt={iconKey || itemId}
          className="w-full h-full object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.75)]"
          draggable={false}
        />
      ) : (
        <span className="text-[10px] font-bold text-white">{itemId.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
};
