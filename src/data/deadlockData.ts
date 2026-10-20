import { getCatalogData, getMetaData } from './dataSource';
import { EN_GENERIC_BUILD, EN_HEROES, EN_LANES, type TranslatedHeroText } from './deadlockData.en';
import { IT_GENERIC_BUILD, IT_HEROES, IT_LANES } from './deadlockData.it';
import type { Lang } from '../i18n/lang';

// The data below is written in French (HEROES_DB, ITEMS_DB, DEADLOCK_LANES: used by the scanner and the
// application logic). getHeroesDb / getItemsDb / getLanes give the same data, same ids, in the interface
// language: English and Italian names and descriptions come from the generated catalogue (official game texts),
// the English and Italian text of the hand-written guides from deadlockData.en.ts / deadlockData.it.ts.

export type ItemCategory = 'weapon' | 'vitality' | 'spirit';

/**
 * Item and ability names in the Italian guides are written in English: each one the game data knows is replaced by
 * its official Italian name ("Reactive Barrier" -> "Barriera reattiva"), longest names first, whole names only.
 */
let italianGameNames: { names: Map<string, string>; re: RegExp | null } | null = null;

function localizeGameNames(text: string): string {
  if (!italianGameNames) {
    const names = new Map<string, string>();
    const items = (getCatalogData() as unknown as { items?: Record<string, { nameEn: string; nameIt?: string }> }).items ?? {};
    for (const c of Object.values(items)) if (c.nameIt && c.nameIt !== c.nameEn) names.set(c.nameEn, c.nameIt);
    const heroes =
      (getMetaData() as unknown as { heroes?: Record<string, { abilities: { nameEn: string; nameIt?: string }[] }> }).heroes ?? {};
    for (const meta of Object.values(heroes)) {
      for (const a of meta.abilities) if (a.nameIt && a.nameIt !== a.nameEn && !names.has(a.nameEn)) names.set(a.nameEn, a.nameIt);
    }
    const alternatives = [...names.keys()]
      .sort((a, b) => b.length - a.length)
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    italianGameNames = { names, re: alternatives.length > 0 ? new RegExp(`(?<![\\w'])(${alternatives.join('|')})(?![\\w])`, 'g') : null };
  }
  const { names, re } = italianGameNames;
  return re ? text.replace(re, (name) => names.get(name) ?? name) : text;
}
export type ItemTier = 1 | 2 | 3 | 4; // 800, 1600, 3200, 6400 souls
export type LaneColor = 'yellow' | 'orange' | 'blue' | 'purple';
export type LaneMode = 'solo' | 'duo';

export type ThreatTag =
  | 'healer'         // Abrams, Kelvin, Lady Geist, McGinnis, Mo & Krill, Infernus
  | 'cc_catch'       // Bebop, Lash, Mo & Krill, Paradox, Warden, Dynamo
  | 'spirit_burst'   // Grey Talon, Pocket, Yamato, Lash, Lady Geist, Seven
  | 'bullet_hose'    // Haze, Wraith, McGinnis, Ivy, Infernus, Warden
  | 'tank_frontline' // Abrams, Mo & Krill, Shiv, Kelvin, Dynamo
  | 'flier_mobility' // Vindicta, Grey Talon, Lash, Pocket, Mirage
  | 'sniper_poke'    // Vindicta, Grey Talon, Paradox, Mirage
  | 'close_assassin';// Haze, Shiv, Yamato, Pocket, Lash

export interface DeadlockItem {
  id: string;
  name: string; // in the data's language; the French data adds the English name: "Chargeur XL (Extended Magazine)"
  nameFr: string;
  nameEn: string;
  hint: string;
  category: ItemCategory;
  tier: ItemTier;
  cost: number;
  isActive?: boolean;
  stats: string[];
  description: string;
  countersTags?: ThreatTag[];
  upgradesFrom?: string[]; // ids des composants consommés lors de l'achat de cet objet
  icon?: string; // icône officielle actuelle (catalogue généré)
  legacyIcon?: string; // ancienne icône locale, gardée comme 2e modèle pour le scanner
}

export interface AbilityUpgradeInfo {
  name: string;
  key: '1' | '2' | '3' | '4';
  description: string;
  priorityTip: string;
}

export interface HeroBuildArchetype {
  id: string;
  name: string;
  subtitle: string;
  playstyle: string;
  recommendedForLanes: LaneMode[];
  abilitiesOrder: ('1' | '2' | '3' | '4')[];
  abilitiesDetails: AbilityUpgradeInfo[];
  phases: {
    early: string[];       // 500 - 1250 items
    mid: string[];         // 1250 - 3000 items
    late: string[];        // 3000 - 6200+ items
    situational: string[]; // Flex slots
  };
  laneTips: {
    solo: string;
    duo: string;
    yellow_purple: string; // Outer solo lanes
    orange_blue: string;   // Inner duo/roam lanes
  };
}

export interface HeroMatchupAdvice {
  enemyId: string;
  dangerLevel: 'Low' | 'Medium' | 'High' | 'Extreme';
  summary: string;
  mustBuyItems: string[];
  laneRule: string;
}

export interface DeadlockHero {
  id: string;
  name: string;
  role: string;
  archetype: 'Sniper / Pick' | 'Assassin' | 'Bruiser / Tank' | 'Carry DPS' | 'Control / Support' | 'Artillery Spirit';
  accentColor: string;
  avatarBg: string;
  threatTags: ThreatTag[];
  baseTips: string;
  builds: HeroBuildArchetype[];
  specificMatchups?: Record<string, HeroMatchupAdvice>;
}

export const DEADLOCK_LANES: {
  id: LaneColor;
  name: string;
  defaultMode: LaneMode;
  colorHex: string;
  bgClass: string;
  borderClass: string;
  description: string;
  tacticalNote: string;
}[] = [
  {
    id: 'yellow',
    name: 'York Avenue (Jaune)',
    defaultMode: 'solo',
    colorHex: '#eab308',
    bgClass: 'bg-yellow-500/15 text-yellow-300',
    borderClass: 'border-yellow-500/50',
    description: 'Lane extérieure (Souvent Solo 1v1)',
    tacticalNote: 'Longue ligne de vue et peu de couvertures centrales. La gestion de la stamina et le sustain (Restorative Shot / Extra Regen) sont décisifs car le jungler allié est loin.',
  },
  {
    id: 'orange',
    name: 'Orchard Street (Orange)',
    defaultMode: 'duo',
    colorHex: '#f97316',
    bgClass: 'bg-orange-500/15 text-orange-300',
    borderClass: 'border-orange-500/50',
    description: 'Lane intérieure centrale (Souvent Duo 2v2)',
    tacticalNote: 'Forte pression de tir croisé et rotations rapides depuis le Mid-Boss / Urne. Privilégiez le push rapide (Monster Rounds) et les boucliers réactifs.',
  },
  {
    id: 'blue',
    name: 'Broadway (Bleue)',
    defaultMode: 'duo',
    colorHex: '#3b82f6',
    bgClass: 'bg-blue-500/15 text-blue-300',
    borderClass: 'border-blue-500/50',
    description: 'Lane intérieure centrale (Souvent Duo 2v2)',
    tacticalNote: 'Beaucoup de verticalité (toits et ponts) propice aux embuscades de Lash/Pocket et au sniping aérien de Vindicta. Surveillez les timings de gank à 5:00.',
  },
  {
    id: 'purple',
    name: 'Park Avenue (Violette)',
    defaultMode: 'solo',
    colorHex: '#a855f7',
    bgClass: 'bg-purple-500/15 text-purple-300',
    borderClass: 'border-purple-500/50',
    description: 'Lane extérieure (Souvent Solo 1v1)',
    tacticalNote: 'Duel isolé à haute intensité. Une mort précoce coûte immédiatement le Guardian. Investissez dans un item défensif à 500/1250 Souls dès le premier pic ennemi.',
  },
];

const LANES_BY_LANG: Record<Lang, typeof DEADLOCK_LANES> = {
  fr: DEADLOCK_LANES,
  en: DEADLOCK_LANES.map((lane) => ({ ...lane, ...EN_LANES[lane.id] })),
  it: DEADLOCK_LANES.map((lane) => ({
    ...lane,
    ...IT_LANES[lane.id],
    tacticalNote: localizeGameNames(IT_LANES[lane.id].tacticalNote),
  })),
};

export const getLanes = (lang: Lang) => LANES_BY_LANG[lang];

/** Hand-written item texts of an older patch (prices 500/1250/3000/6200), kept for the items not renamed since. */
type LegacyItem = Omit<DeadlockItem, 'nameFr' | 'nameEn' | 'hint'> & { frHint: string };

const LEGACY_ITEMS_DB: Record<string, LegacyItem> = {
  // ================= WEAPON (ORANGE) =================
  high_velocity_mag: {
    id: 'high_velocity_mag',
    name: 'Balles véloces (High-Velocity Rounds)',
    frHint: 'Vitesse des balles +30% (Indispensable pour last-hit / deny les âmes)',
    category: 'weapon',
    tier: 1,
    cost: 500,
    stats: ['+30% Vitesse des projectiles', '+12% Dégâts d\'arme', '+50 Bouclier Balles'],
    description: 'Permet de sécuriser et deny toutes les orbes d\'âmes en lane, surtout avec Vindicta, Grey Talon ou Paradox.',
  },
  headshot_booster: {
    id: 'headshot_booster',
    name: 'Explose-tête (Headshot Booster)',
    frHint: 'Poke dévastateur en lane sur chaque tir à la tête',
    category: 'weapon',
    tier: 1,
    cost: 500,
    stats: ['+40 Dégâts bonus Headshot (CD 7.5s)', '+5% Cadence de tir', '+40 Bouclier Balles'],
    description: 'Excellent outil de harcèlement en lane pour punir l\'adversaire dès qu\'il s\'approche d\'un creep.',
  },
  restorative_shot: {
    id: 'restorative_shot',
    name: 'Tir curatif (Restorative Shot)',
    frHint: 'Soin à l\'impact sur héros ou troupe',
    category: 'weapon',
    tier: 1,
    cost: 500,
    stats: ['+45 PV sur tir contre Héros (CD 6s)', '+7% Dégâts d\'arme'],
    description: 'Idéal contre les lanes agressives de poke (Sniper, Geist, Infernus) pour tenir sans rentrer à la base.',
    countersTags: ['sniper_poke'],
  },
  monster_rounds: {
    id: 'monster_rounds',
    name: 'Balles antimonstres (Monster Rounds)',
    frHint: '+30% dégâts sur les Troopers, Guardians et camps neutres',
    category: 'weapon',
    tier: 1,
    cost: 500,
    stats: ['+30% Dégâts d\'arme vs PNJ', '+25% Résistance aux PNJ', '+1 PV/s Régén'],
    description: 'Permet de dépusher instantanément une vague de creeps sous votre tour ou de prendre l\'avantage de tempo.',
  },
  hollow_point_ward: {
    id: 'hollow_point_ward',
    name: 'Pointe creuse (Hollow Point)',
    frHint: 'Bouclier Spirituel + gros dégâts tant que vos PV sont > 60%',
    category: 'weapon',
    tier: 1,
    cost: 500,
    stats: ['+95 Bouclier Spirituel', '+22% Dégâts d\'arme au-dessus de 60% PV'],
    description: 'Parfait pour les héros longue portée comme Vindicta qui restent hors de mêlée tout en encaissant du poke spirituel.',
    countersTags: ['spirit_burst'],
  },
  rapid_rounds: {
    id: 'rapid_rounds',
    name: 'Cadence infernale (Rapid Rounds)',
    frHint: 'Cadence de tir +10% & Vitesse de sprint',
    category: 'weapon',
    tier: 1,
    cost: 500,
    stats: ['+10% Cadence de tir', '+1m/s Vitesse de sprint'],
    description: 'Fluidifie les tirs et aide à appliquer rapidement les effets à l\'impact.',
  },
  close_quarters: {
    id: 'close_quarters',
    name: 'Tir rapproché (Close Quarters)',
    frHint: '+25% dégâts d\'arme à moins de 15m + Bouclier Balles',
    category: 'weapon',
    tier: 1,
    cost: 500,
    stats: ['+25% Dégâts d\'arme à courte portée', '+85 Bouclier Balles'],
    description: 'Incontournable pour les brawlers (Abrams, Shiv, Mo & Krill, Yamato).',
  },
  active_reload: {
    id: 'active_reload',
    name: 'Recharge manuelle (Active Reload)',
    frHint: 'Rechargement instantané + cadence et vol de vie en pressant R au bon timing',
    category: 'weapon',
    tier: 2,
    cost: 1250,
    stats: ['+20% Cadence de tir après reload parfait', '+18% Vol de vie Balles'],
    description: 'Maintient une pression constante en duel et évite de se faire punir pendant un rechargement.',
  },
  kinetic_dash: {
    id: 'kinetic_dash',
    name: 'Élan cinétique (Kinetic Dash)',
    frHint: 'Le Dash-Jump ne coûte pas de stamina et donne cadence + munitions',
    category: 'weapon',
    tier: 2,
    cost: 1250,
    stats: ['+100 PV Max', '+15% Cadence de tir temporaire', '+5 Munitions temporaires'],
    description: 'Mobilité exceptionnelle pour s\'échapper des ganks ou poursuivre une cible.',
    countersTags: ['cc_catch', 'close_assassin'],
  },
  slowing_bullets: {
    id: 'slowing_bullets',
    name: 'Balles ralentissantes (Slowing Bullets)',
    frHint: 'Vos tirs ralentissent la cible de 25% et augmentent vos dégâts',
    category: 'weapon',
    tier: 2,
    cost: 1250,
    stats: ['+16% Dégâts d\'arme', '+5 Pouvoir Spirituel', 'Ralentissement 25%'],
    description: 'Facilite énormément les Headshots et le suivi de l\'Assassinate de Vindicta.',
    countersTags: ['flier_mobility', 'close_assassin'],
  },
  mystic_shot: {
    id: 'mystic_shot',
    name: 'Tir mystique (Mystic Shot)',
    frHint: 'Proc de dégâts Spirituels périodiques sur vos tirs',
    category: 'weapon',
    tier: 2,
    cost: 1250,
    stats: ['+65 Dégâts Spirituels bonus (scale avec Spirit)', '+12% Dégâts d\'arme'],
    description: 'Combine le poke d\'arme et le burst spirituel, redoutable en fin de phase de lane.',
  },
  soul_shredder_bullets: {
    id: 'soul_shredder_bullets',
    name: 'Entaille spirituelle (Spirit Rend)',
    frHint: 'Amplifie vos dégâts Spirituels de +10% et vous donne du Vol de vie Spirituel',
    category: 'weapon',
    tier: 2,
    cost: 1250,
    stats: ['+10% Amp Spirituelle sur cible', '+20% Vol de vie Spirituel vs cible'],
    description: 'Pivot essentiel pour les builds hybrides ou Spirit (Corbeaux + Snipe de Vindicta, Pocket, Geist, Yamato).',
  },
  fleetfoot: {
    id: 'fleetfoot',
    name: 'Pied plume (Fleetfoot)',
    frHint: 'Actif : Supprime la pénalité de vitesse en tirant + Vitesse de déplacement',
    category: 'weapon',
    tier: 2,
    cost: 1250,
    isActive: true,
    stats: ['+75 PV Bonus', '+3m/s Vitesse à l\'activation (4s)', '+30% Munitions temporaires'],
    description: 'Permet de kiter les tanks/assassins ou de se repositionner en plein vol.',
    countersTags: ['tank_frontline', 'close_assassin'],
  },
  sharpshooter: {
    id: 'sharpshooter',
    name: 'Tir d\'élite (Sharpshooter)',
    frHint: '+70% Dégâts d\'arme à longue distance (>15m)',
    category: 'weapon',
    tier: 3,
    cost: 3000,
    upgradesFrom: ['Long Range'],
    stats: ['+70% Dégâts longue portée', '+20% Munitions', '-15% Temps de rechargement', '+175 Bouclier Balles'],
    description: 'L\'item signature de Vindicta Gun/Hybride : transforme vos tirs en vol en artillerie lourde.',
  },
  toxic_bullets: {
    id: 'toxic_bullets',
    name: 'Balles toxiques (Toxic Bullets)',
    frHint: 'Saignement en % PV max + Anti-Soin (-65% régénération ennemie)',
    category: 'weapon',
    tier: 3,
    cost: 3000,
    stats: ['5%/s Saignement PV Max', '-65% Soins reçus par la cible', '+100 PV Bonus'],
    description: 'Contre absolu aux sacs à PV et régénérateurs (Abrams, Mo & Krill, Infernus, Lady Geist, Kelvin).',
    countersTags: ['healer', 'tank_frontline'],
  },
  pristine_emblem: {
    id: 'pristine_emblem',
    name: 'Balles ouvrantes (Opening Rounds)',
    frHint: '+25% Dégâts d\'arme supplémentaires contre les cibles à > 50% PV',
    category: 'weapon',
    tier: 3,
    cost: 3000,
    upgradesFrom: ['high_velocity_mag'],
    stats: ['+25% Dégâts d\'arme', '+12 Pouvoir Spirituel', '+12% Résistance Spirituelle'],
    description: 'Permet de mettre instantanément un ennemi sous le seuil des 50% PV pour activer l\'Assassinate de Vindicta.',
  },
  alchemical_fire: {
    id: 'alchemical_fire',
    name: 'Pyroalchimie (Alchemical Fire)',
    frHint: 'Actif : Grenade de zone qui brûle et augmente les dégâts d\'arme de +50%',
    category: 'weapon',
    tier: 3,
    cost: 3000,
    isActive: true,
    stats: ['+225 Bouclier Balles', '+14% Dégâts d\'arme', '+7 Pouvoir Spirituel'],
    description: 'Combo dévastateur avec le Stake (Pieu) de Vindicta : bloque les ennemis dans le feu et fond leurs PV.',
  },
  tesla_bullets: {
    id: 'tesla_bullets',
    name: 'Balles teslas (Tesla Bullets)',
    frHint: 'Éclairs en chaîne sur vos balles pour farm et teamfight',
    category: 'weapon',
    tier: 3,
    cost: 3000,
    stats: ['+14% Cadence de tir', 'Proc éclair 30-60 dégâts Spirituels'],
    description: 'Accélère énormément le farm de la jungle et punit les ennemis groupés.',
  },
  headhunter: {
    id: 'headhunter',
    name: 'Chasseur de têtes (Headhunter)',
    frHint: 'Headshot = Gros dégâts bonus + Soin en % PV + Boost de vitesse',
    category: 'weapon',
    tier: 3,
    cost: 3000,
    upgradesFrom: ['headshot_booster'],
    stats: ['+140 Dégâts Headshot', '+8% PV Max soignés sur Headshot', '+2m/s Vitesse (3s)'],
    description: 'Sustain et mobilité infinis tant que vous touchez des têtes à mi-distance.',
  },
  burst_fire: {
    id: 'burst_fire',
    name: 'Rafale (Burst Fire)',
    frHint: '+30% Cadence de tir et vitesse de glissade en touchant un héros',
    category: 'weapon',
    tier: 3,
    cost: 3000,
    stats: ['+12% Cadence de tir de base', '+30% Cadence proc (4s)', '+70 PV'],
    description: 'Donne un pic de DPS explosif dès l\'ouverture du combat.',
  },
  crippling_headshot: {
    id: 'crippling_headshot',
    name: 'Brise-tête (Crippling Headshot)',
    frHint: 'Un Headshot réduit la résistance Balles ET Spirituelle de la cible de -24%',
    category: 'weapon',
    tier: 4,
    cost: 6200,
    stats: ['+20% Dégâts d\'arme', '+10% Vol de vie Balles & Spirit', '-24% Résistances ennemies (5s)'],
    description: 'L\'objet Late Game ultime : détruit n\'importe quel tank ou carry après un seul tir à la tête.',
    countersTags: ['tank_frontline'],
  },
  spiritual_overflow: {
    id: 'spiritual_overflow',
    name: 'Saturation spirituelle (Spiritual Overflow)',
    frHint: 'Tirer charge votre Pouvoir Spirituel (+45 Spirit) et Réduction de CD',
    category: 'weapon',
    tier: 4,
    cost: 6200,
    stats: ['+20% Cadence de tir', '+45 Pouvoir Spirituel chargé', '+15% Réduction de Cooldown'],
    description: 'Idéal pour les builds Hybrides : vos balles chargent vos compétences à des niveaux absurdes.',
  },
  glass_cannon: {
    id: 'glass_cannon',
    name: 'Canon de verre (Glass Cannon)',
    frHint: '+70% Dégâts d\'arme (+10% par kill jusqu\'à +140%), mais -15% PV Max',
    category: 'weapon',
    tier: 4,
    cost: 6200,
    stats: ['+70% Dégâts d\'arme', '+10% Cadence de tir', '-15% PV Max'],
    description: 'Pour snowball une partie lorsque votre positionnement aérien est intouchable.',
  },
  silencer: {
    id: 'silencer',
    name: 'Sourdine (Silencer)',
    frHint: 'Actif : Vos balles réduisent au silence les compétences ennemies pendant 4s',
    category: 'weapon',
    tier: 4,
    cost: 6200,
    isActive: true,
    upgradesFrom: ['slowing_bullets'],
    stats: ['+25% Dégâts d\'arme', 'Silence à l\'impact'],
    description: 'Neutralise totalement Yamato, Pocket, Lash ou Lady Geist avant qu\'ils ne lancent leur ultime.',
    countersTags: ['spirit_burst', 'close_assassin'],
  },

  // ================= VITALITY (GREEN) =================
  extra_regen: {
    id: 'extra_regen',
    name: 'Surplus de régénération (Extra Regen)',
    frHint: '+2.8 PV/s de régénération constante en lane',
    category: 'vitality',
    tier: 1,
    cost: 500,
    stats: ['+2.8 Régén PV/s', '+8% Munitions', '+25 PV'],
    description: 'L\'assurance-vie contre le harcèlement continu en lane Solo ou Duo.',
    countersTags: ['sniper_poke'],
  },
  extra_stamina: {
    id: 'extra_stamina',
    name: 'Surplus d\'endurance (Extra Stamina)',
    frHint: '+1 Barre de Stamina + régénération de stamina accélérée',
    category: 'vitality',
    tier: 1,
    cost: 500,
    stats: ['+1 Stamina', '+14% Régén Stamina', '+7% Cadence de tir'],
    description: 'Vital pour les héros fragiles comme Vindicta lorsque son Vol (Flight) est en cooldown.',
    countersTags: ['cc_catch', 'close_assassin'],
  },
  sprint_boots: {
    id: 'sprint_boots',
    name: 'Bottes de course (Sprint Boots)',
    frHint: '+2m/s Vitesse de sprint pour décale, urne et esquive',
    category: 'vitality',
    tier: 1,
    cost: 500,
    stats: ['+2m/s Vitesse de sprint', '+1 PV/s Régén', '+4% Dégâts d\'arme'],
    description: 'Permet de revenir vite en lane et de tourner autour de la carte pour achever des cibles avec Assassinate.',
  },
  extra_health: {
    id: 'extra_health',
    name: 'Surplus de PV (Extra Health)',
    frHint: '+160 PV Bonus immédiats pour survivre aux all-in',
    category: 'vitality',
    tier: 1,
    cost: 500,
    stats: ['+160 PV Bonus', '+5% Dégâts d\'arme'],
    description: 'Empêche de tomber trop vite sous le seuil d\'exécution adverse.',
  },
  healing_rite: {
    id: 'healing_rite',
    name: 'Rite de guérison (Healing Rite)',
    frHint: 'Actif : Soigne 370 PV hors combat + Sprint',
    category: 'vitality',
    tier: 1,
    cost: 500,
    isActive: true,
    stats: ['+45 PV Bonus', 'Actif : +370 PV sur 17s'],
    description: 'Sauve votre lane si vous prenez un mauvais trade au niveau 1-3 sans perdre une seule vague de creeps.',
  },
  enchanters_barrier: {
    id: 'enchanters_barrier',
    name: 'Emblème enchanteur (Enchanter\'s Emblem)',
    frHint: '+300 Bouclier Spirituel + +20 Pouvoir Spirituel et Réduction CD tant que le bouclier tient',
    category: 'vitality',
    tier: 2,
    cost: 1250,
    stats: ['+300 Bouclier Spirituel', '+20 Pouvoir Spirituel (sous bouclier)', '+8% Réduction CD'],
    description: 'Item extraordinaire sur Vindicta, Grey Talon et Pocket : vous donne de la survie ET un énorme boost de dégâts Spirit.',
    countersTags: ['spirit_burst'],
  },
  combat_barrier: {
    id: 'combat_barrier',
    name: 'Protection de combat (Combat Barrier)',
    frHint: '+325 Bouclier Balles + +25% Dégâts d\'arme et Cadence tant que le bouclier tient',
    category: 'vitality',
    tier: 2,
    cost: 1250,
    stats: ['+325 Bouclier Balles', '+25% Dégâts d\'arme (sous bouclier)', '+6% Cadence de tir'],
    description: 'Vous fait gagner tous les échanges de tir contre les tireurs (Haze, Wraith, McGinnis, Vindicta).',
    countersTags: ['bullet_hose', 'sniper_poke'],
  },
  reactive_barrier: {
    id: 'reactive_barrier',
    name: 'Protection d\'urgence (Reactive Barrier)',
    frHint: 'Déclenche automatiquement +400 Bouclier Balles & +200 Spirituel si vous subissez un CC / Hook / Stun',
    category: 'vitality',
    tier: 2,
    cost: 1250,
    stats: ['+75 PV', '+400 Bouclier Balles & +200 Spirit sur immobilisation (CD 32s)'],
    description: 'LE contre numéro 1 en lane contre Bebop (Hook), Mo & Krill, Lash, Warden, Abrams ou le Stake de Vindicta !',
    countersTags: ['cc_catch'],
  },
  healbane: {
    id: 'healbane',
    name: 'Châtiment curatif (Healbane)',
    frHint: 'Vos dégâts Spirituels réduisent les soins ennemis de -40% + vous soignent sur kill',
    category: 'vitality',
    tier: 2,
    cost: 1250,
    stats: ['+75 PV', '-40% Soins ennemis sur dégât Spirit', '+350 PV sur assist/kill'],
    description: 'Anti-soin économique dès 1250 âmes : les corbeaux de Vindicta appliquent l\'anti-heal à toute l\'équipe ennemie.',
    countersTags: ['healer'],
  },
  debuff_reducer: {
    id: 'debuff_reducer',
    name: 'Atténuateur d\'effets négatifs (Debuff Reducer)',
    frHint: 'Réduit la durée de tous les stuns, ralentissements, brûlures et silences de 28%',
    category: 'vitality',
    tier: 2,
    cost: 1250,
    stats: ['+75 PV', '+28% Résistance aux Debuffs', '+6% Dégâts d\'arme'],
    description: 'Se combine plus tard en Debuff Remover pour purger les bombes de Bebop ou la marque de Mirage/Pocket.',
    countersTags: ['cc_catch', 'spirit_burst'],
  },
  bullet_lifesteal: {
    id: 'bullet_lifesteal',
    name: 'Balles vampiriques (Bullet Lifesteal)',
    frHint: '+28% Vol de vie sur vos balles',
    category: 'vitality',
    tier: 2,
    cost: 1250,
    stats: ['+28% Vol de vie Balles', '+75 PV Bonus'],
    description: 'Sustain puissant pour les builds orientés arme à feu.',
  },
  spirit_lifesteal: {
    id: 'spirit_lifesteal',
    name: 'Vol de vie spirituel (Spirit Lifesteal)',
    frHint: '+23% Vol de vie sur toutes vos compétences et dégâts Spirituels',
    category: 'vitality',
    tier: 2,
    cost: 1250,
    stats: ['+23% Vol de vie Spirituel', '+75 PV Bonus'],
    description: 'Chaque tir d\'Assassinate ou rebond de Corbeau vous rend une énorme portion de vie.',
  },
  enduring_speed: {
    id: 'enduring_speed',
    name: 'Vitesse persistante (Enduring Speed)',
    frHint: '+1.4m/s Vitesse de déplacement + 35% résistance aux ralentissements',
    category: 'vitality',
    tier: 2,
    cost: 1250,
    upgradesFrom: ['sprint_boots'],
    stats: ['+1.4m/s Vitesse de déplacement en combat', '+2m/s Sprint', '+35% Résist Slow'],
    description: 'Indispensable contre Kelvin, McGinnis ou Warden qui comptent sur leurs ralentissements.',
    countersTags: ['cc_catch'],
  },
  return_fire: {
    id: 'return_fire',
    name: 'Retour de balle (Return Fire)',
    frHint: 'Actif : Renvoie 60% des balles et 30% des dégâts Spirituels à l\'attaquant pendant 7s',
    category: 'vitality',
    tier: 2,
    cost: 1250,
    isActive: true,
    stats: ['+125 PV', '+9 Pouvoir Spirituel', 'Actif : Renvoi de dégâts'],
    description: 'Force Haze, Wraith ou un tireur ennemi à arrêter de vous tirer dessus sous peine de se tuer lui-même.',
    countersTags: ['bullet_hose'],
  },
  superior_stamina: {
    id: 'superior_stamina',
    name: 'Maîtrise d\'endurance (Stamina Mastery)',
    frHint: '+3 Barres de Stamina + Permet de faire 2 Dash-Jumps ou sauts dans les airs !',
    category: 'vitality',
    tier: 3,
    cost: 3000,
    upgradesFrom: ['extra_stamina'],
    stats: ['+3 Stamina', '+25% Régén Stamina', '+30% Distance de saut/dash aérien'],
    description: 'Mobilité aérienne inégalée : sur Vindicta ou Grey Talon, vous devenez quasiment impossible à attraper.',
    countersTags: ['cc_catch', 'close_assassin'],
  },
  debuff_remover: {
    id: 'debuff_remover',
    name: 'Dissipateur de magie (Debuff Remover)',
    frHint: 'Actif : Purge TOUS les effets négatifs (Bombes de Bebop, Silences, Brûlures, Chaînes) + Vitesse',
    category: 'vitality',
    tier: 3,
    cost: 3000,
    isActive: true,
    upgradesFrom: ['debuff_reducer'],
    stats: ['+125 PV', '+35% Résistance passive aux Debuffs', 'Actif : Purge totale + +3m/s'],
    description: 'Supprime les bombes de Bebop, l\'ultime de Pocket (Affliction), le piège de Warden ou le silence.',
    countersTags: ['cc_catch', 'spirit_burst'],
  },
  metal_skin: {
    id: 'metal_skin',
    name: 'Cuir blindé (Metal Skin)',
    frHint: 'Actif : Immunité TOTALE aux balles et aux attaques de mêlée pendant 3.5s',
    category: 'vitality',
    tier: 3,
    cost: 3000,
    isActive: true,
    stats: ['+125 PV', '+8 Pouvoir Spirituel', '+8% Cadence de tir', 'Actif : 100% Immunité Balles'],
    description: 'Annule complètement l\'ultime de Haze (Bullet Dance), les poings d\'Abrams ou le burst de Wraith.',
    countersTags: ['bullet_hose', 'close_assassin'],
  },
  bullet_resilience: {
    id: 'bullet_resilience',
    name: 'Résilience balistique (Bullet Resilience)',
    frHint: '+30% Résistance aux Balles (+60% sous 30% PV)',
    category: 'vitality',
    tier: 3,
    cost: 3000,
    stats: ['+30% Résist Balles', '+10% Dégâts d\'arme'],
    description: 'Protection massive contre les compositions à plusieurs tireurs.',
    countersTags: ['bullet_hose'],
  },
  spirit_resilience: {
    id: 'spirit_resilience',
    name: 'Résilience spirituelle (Spirit Resilience)',
    frHint: '+30% Résistance Spirituelle (+60% sous 30% PV)',
    category: 'vitality',
    tier: 3,
    cost: 3000,
    stats: ['+30% Résist Spirituelle', '+100 PV Bonus'],
    description: 'Empêche de se faire exécuter par un tir de Grey Talon, Vindicta, Seven ou Yamato.',
    countersTags: ['spirit_burst', 'sniper_poke'],
  },
  leech: {
    id: 'leech',
    name: 'Sangsue (Leech)',
    frHint: '+35% Vol de vie Spirituel ET +35% Vol de vie Balles',
    category: 'vitality',
    tier: 4,
    cost: 6200,
    stats: ['+35% Vol de vie Balles', '+35% Vol de vie Spirituel', '+175 PV', '+12 Pouvoir Spirituel'],
    description: 'Vous rend immortel tant que vous infligez des dégâts en fin de partie.',
  },
  unstoppable: {
    id: 'unstoppable',
    name: 'Intouchable (Unstoppable)',
    frHint: 'Actif : Immunité TOTALE à tous les contrôles de foule (Stun, Silence, Sleep, Hook) pendant 6s',
    category: 'vitality',
    tier: 4,
    cost: 6200,
    isActive: true,
    stats: ['+150 PV', '+15% Résistance Spirituelle', '+12 Pouvoir Spirituel'],
    description: 'Indispensable en fin de partie contre Dynamo, Lash, Mo & Krill ou Wraith.',
    countersTags: ['cc_catch'],
  },

  // ================= SPIRIT (PURPLE) =================
  extra_charge: {
    id: 'extra_charge',
    name: 'Surplus de charge (Extra Charge)',
    frHint: '+1 Charge supplémentaire sur vos compétences à charges (Assassinate de Vindicta, Flèches de Talon...)',
    category: 'spirit',
    tier: 1,
    cost: 500,
    stats: ['+1 Charge de compétence', '+10% Réduction CD des charges', '+6% Dégâts d\'arme'],
    description: 'Achat prioritaire dès que vous débloquez votre Ultime sur Vindicta : passe vos tirs de sniper de 2 à 3 charges !',
  },
  mystic_burst: {
    id: 'mystic_burst',
    name: 'Choc mystique (Mystic Burst)',
    frHint: '+35 Dégâts Spirituels bonus sur toute compétence infligeant > 80 dégâts',
    category: 'spirit',
    tier: 1,
    cost: 500,
    stats: ['+35 Dégâts Burst (CD 6s)', '+40 Bouclier Spirituel', '+6% Dégâts d\'arme'],
    description: 'Boost immédiat sur le Corbeau (Crow Familiar) et le Snipe (Assassinate) dès la phase de lane.',
  },
  mystic_reach: {
    id: 'mystic_reach',
    name: 'Expansion mystique (Mystic Expansion)',
    frHint: '+18% Portée et Rayon des compétences (Stake plus large, Corbeau plus loin)',
    category: 'spirit',
    tier: 1,
    cost: 500,
    stats: ['+18% Portée/Rayon Spirituel', '+7% Résistance Spirituelle'],
    description: 'Rend le Stake (Pieu) de Vindicta presque impossible à esquiver.',
  },
  spirit_strike: {
    id: 'spirit_strike',
    name: 'Frappe spirituelle (Spirit Strike)',
    frHint: 'Vos coups de mêlée infligent des dégâts Spirituels et réduisent la résistance Spirit de -12%',
    category: 'spirit',
    tier: 1,
    cost: 500,
    stats: ['+12% Dégâts de mêlée', '+80 Bouclier Spirituel', '-12% Résist Spirit ennemie'],
    description: 'Très fort sur Abrams, Shiv, Lash, Yamato et Pocket.',
  },
  quicksilver_reload: {
    id: 'quicksilver_reload',
    name: 'Rechargement éclair (Quicksilver Reload)',
    frHint: 'Utiliser la compétence associée recharge instantanément votre arme + +65 Dégâts Spirituels + Cadence',
    category: 'spirit',
    tier: 2,
    cost: 1250,
    stats: ['+65 Dégâts Spirituels sur proc', '+15% Cadence de tir', 'Rechargement instantané'],
    description: 'À lier au Corbeau (3) de Vindicta : vous videz votre chargeur en vol, lancez le Corbeau, et votre arme est rechargée instantanément !',
  },
  suppressor: {
    id: 'suppressor',
    name: 'Sabotage (Suppressor)',
    frHint: 'Vos dégâts Spirituels réduisent la Cadence de tir ennemie de -25%',
    category: 'spirit',
    tier: 2,
    cost: 1250,
    stats: ['+50 PV', '+2.5 PV/s Régén', '-25% Cadence de tir ennemie (3s)'],
    description: 'Détruit le DPS de Haze, Wraith, Infernus et McGinnis dès qu\'une compétence les touche.',
    countersTags: ['bullet_hose'],
  },
  decay: {
    id: 'decay',
    name: 'Décomposition (Decay)',
    frHint: 'Actif : Malédiction ciblée qui inflige un saignement en % PV et réduit les soins de -50%',
    category: 'spirit',
    tier: 2,
    cost: 1250,
    isActive: true,
    stats: ['+7 Pouvoir Spirituel', '-50% Soins reçus par la cible (10s)', '3.1%/s Dégâts PV actuels'],
    description: 'Détruit Abrams, Lady Geist, Mo & Krill ou Infernus en duel.',
    countersTags: ['healer', 'tank_frontline'],
  },
  slowing_hex: {
    id: 'slowing_hex',
    name: 'Malédiction de ralentissement (Slowing Hex)',
    frHint: 'Actif : Projectile qui ralentit de 30% ET Silence toutes les compétences de mobilité (Vol, Dash, TP) pendant 3s !',
    category: 'spirit',
    tier: 2,
    cost: 1250,
    isActive: true,
    stats: ['+1m/s Sprint', '+70 Dégâts Spirituels', 'Silence des sorts de mouvement (3s)'],
    description: 'Empêche Wraith de se téléporter, Pocket/Lash/Yamato de s\'enfuir, ou une Vindicta ennemie de s\'envoler.',
    countersTags: ['flier_mobility', 'close_assassin'],
  },
  duration_extender: {
    id: 'duration_extender',
    name: 'Prolongation (Duration Extender)',
    frHint: '+16% Durée des compétences (Vol plus long, Stake plus long, Saignement du Corbeau plus long)',
    category: 'spirit',
    tier: 2,
    cost: 1250,
    stats: ['+16% Durée des compétences', '+100 PV', '+1.75 PV/s Régén'],
    description: 'Augmente à la fois la durée de votre Vol (Flight), l\'immobilisation du Stake et le DoT du Corbeau.',
  },
  improved_cooldown: {
    id: 'improved_cooldown',
    name: 'Récupération comprimée (Compress Cooldown)',
    frHint: '+16% Réduction de Cooldown sur toutes vos compétences et objets',
    category: 'spirit',
    tier: 2,
    cost: 1250,
    stats: ['+16% Réduction CD', '+75 Bouclier Spirituel'],
    description: 'Permet d\'avoir le Vol et le Corbeau disponibles presque en permanence.',
  },
  rapid_recharge: {
    id: 'rapid_recharge',
    name: 'Recharge rapide (Rapid Recharge)',
    frHint: '+2 Charges supplémentaires + 55% Réduction du temps entre les charges !',
    category: 'spirit',
    tier: 3,
    cost: 3000,
    upgradesFrom: ['extra_charge'],
    stats: ['+2 Charges de compétence', '+55% Réduction délai entre charges', '+12 Pouvoir Spirituel'],
    description: 'Donne à Vindicta 4 charges d\'Assassinate (Snipe) tirables en rafale quasi-instantanée.',
  },
  improved_burst: {
    id: 'improved_burst',
    name: 'Choc amélioré / Tankbuster (Improved Burst)',
    frHint: 'Les compétences infligent +7% des PV Max de la cible en dégâts Spirituels supplémentaires',
    category: 'spirit',
    tier: 3,
    cost: 3000,
    upgradesFrom: ['mystic_burst'],
    stats: ['+7% PV Max en Burst Spirituel', '+100 Bouclier Spirituel', '+8% Dégâts d\'arme'],
    description: 'Le Corbeau (qui enlève déjà des % PV) + Improved Burst retire près de 35% de la vie d\'un tank en un seul impact.',
    countersTags: ['tank_frontline'],
  },
  knockdown: {
    id: 'knockdown',
    name: 'Coup d\'enclume (Knockdown)',
    frHint: 'Actif : Enclume céleste qui étourdit la cible après 2s et la fait tomber du ciel !',
    category: 'spirit',
    tier: 3,
    cost: 3000,
    isActive: true,
    stats: ['+200 Bouclier Spirituel', '+1 Stamina', 'Stun de 0.9s à très longue portée'],
    description: 'Fait s\'écraser Vindicta, Grey Talon ou Seven hors du ciel, et garantit un Headshot + Assassinate gratuit sur la cible étourdie.',
    countersTags: ['flier_mobility', 'sniper_poke'],
  },
  ethereal_shift: {
    id: 'ethereal_shift',
    name: 'Refuge céleste (Ethereal Shift)',
    frHint: 'Actif : Vous devenez totalement intouchable et invulnérable pendant 3.5s',
    category: 'spirit',
    tier: 3,
    cost: 3000,
    isActive: true,
    stats: ['+14 Pouvoir Spirituel bonus après sortie', '+2m/s Vitesse après sortie'],
    description: 'Esquive l\'ultime de Lash, la bombe de Bebop, l\'Assassinate adverse ou l\'ultime de Wraith.',
    countersTags: ['spirit_burst', 'cc_catch', 'close_assassin'],
  },
  mystic_vulnerability: {
    id: 'mystic_vulnerability',
    name: 'Vulnérabilité mystique (Mystic Vulnerability)',
    frHint: 'Vos dégâts Spirituels réduisent la Résistance Spirituelle ennemie de -12%',
    category: 'spirit',
    tier: 2,
    cost: 1250,
    stats: ['+6% Résistance Spirituelle', '-12% Résistance Spirit ennemie (6s)'],
    description: 'Se combine parfaitement avec le Corbeau de Vindicta (qui réduit déjà la résistance au niveau max) pour faire des dégâts purs.',
  },
  surge_of_power: {
    id: 'surge_of_power',
    name: 'Regain de puissance (Surge of Power)',
    frHint: 'Donne +34 Pouvoir Spirituel à une compétence + Cadence de tir et Vitesse à l\'utilisation',
    category: 'spirit',
    tier: 3,
    cost: 3000,
    stats: ['+75 PV', '+34 Pouvoir Spirituel sur la compétence choisie', '+10% Cadence de tir'],
    description: 'À placer sur Crow Familiar (3) ou Assassinate (4) pour maximiser les dégâts d\'exécution.',
  },
  superior_cooldown: {
    id: 'superior_cooldown',
    name: 'Récupération supérieure (Superior Cooldown)',
    frHint: '+32% Réduction de Cooldown sur la compétence choisie (+24% sur toutes les autres)',
    category: 'spirit',
    tier: 3,
    cost: 3000,
    upgradesFrom: ['improved_cooldown'],
    stats: ['+32% Réduction CD ciblée', '+24% Réduction CD globale', '+100 Bouclier Spirituel'],
    description: 'Permet de rester en vol (Flight) quasiment en permanence.',
  },
  boundless_spirit: {
    id: 'boundless_spirit',
    name: 'Profusion spirituelle (Boundless Spirit)',
    frHint: '+60 Pouvoir Spirituel massif + PV et Régénération',
    category: 'spirit',
    tier: 4,
    cost: 6200,
    stats: ['+60 Pouvoir Spirituel', '+300 PV Bonus', '+15 PV/s Régén', '+25% Dégâts d\'arme'],
    description: 'Augmente drastiquement les dégâts de votre Assassinate, de vos balles spirituelles en vol et du saignement des Corbeaux.',
  },
  mystic_reverb: {
    id: 'mystic_reverb',
    name: 'Réverbération mystique (Mystic Reverb)',
    frHint: 'La compétence choisie ralentit de 40% et explose une 2e fois en zone pour 40% des dégâts infligés !',
    category: 'spirit',
    tier: 4,
    cost: 6200,
    stats: ['+15% Vol de vie Spirituel', '+15% Résistance Spirituelle', '+15% Portée'],
    description: 'Sur Assassinate (4) ou Crow Familiar (3) : un seul tir de sniper fait exploser toute l\'équipe ennemie autour de la cible.',
  },
  curse: {
    id: 'curse',
    name: 'Malédiction (Curse)',
    frHint: 'Actif : Transforme un ennemi en maudit pendant 3.25s (Interdit Tir, Compétences ET Objets actifs !)',
    category: 'spirit',
    tier: 4,
    cost: 6200,
    isActive: true,
    stats: ['+20% Dégâts d\'arme', '+8 Pouvoir Spirituel'],
    description: 'Le contrôle ultime de fin de partie : empêche même l\'utilisation d\'Unstoppable ou d\'Ethereal Shift.',
    countersTags: ['close_assassin', 'spirit_burst', 'bullet_hose'],
  },
};

// ================= CATALOGUE GÉNÉRÉ (npm run update-builds) =================
interface GeneratedCatalogItem {
  id: string;
  nameFr: string;
  nameEn: string;
  category: ItemCategory;
  tier: ItemTier;
  cost: number;
  isActive: boolean;
  upgradesFrom: string[];
  descriptionFr: string;
  descriptionEn?: string;
  statsFr?: string[];
  statsEn?: string[];
  // Italian: in the generated data since 1.4.2 (an older cached file has none: English instead)
  nameIt?: string;
  descriptionIt?: string;
  statsIt?: string[];
  icon?: string;
  legacyIcon?: string;
}

const englishPart = (name: string) => (name.match(/\(([^)]+)\)/)?.[1] ?? name).trim();

/**
 * Le catalogue généré (prix, paliers, noms officiels, stats actuelles) fait autorité. En français, les
 * textes écrits à la main sont conservés quand l'objet n'a pas été renommé depuis (sinon ils décrivent un
 * autre effet) ; en anglais, la description officielle du jeu est utilisée.
 * Les objets retirés du jeu disparaissent ; sans catalogue, on retombe sur l'ancienne liste.
 */
function buildItemsDb(lang: Lang): Record<string, DeadlockItem> {
  const catalog = Object.values(
    (getCatalogData() as unknown as { items: Record<string, GeneratedCatalogItem> }).items ?? {}
  );
  const db: Record<string, DeadlockItem> = {};

  if (catalog.length === 0) {
    for (const legacy of Object.values(LEGACY_ITEMS_DB)) {
      const { frHint, ...rest } = legacy;
      const nameEn = englishPart(legacy.name);
      db[legacy.id] = {
        ...rest,
        name: lang === 'fr' ? legacy.name : nameEn,
        nameFr: legacy.name.split('(')[0].trim(),
        nameEn,
        hint: lang === 'fr' ? frHint : '',
        stats: lang === 'fr' ? legacy.stats : [],
      };
    }
    return db;
  }

  for (const c of catalog) {
    const legacy = LEGACY_ITEMS_DB[c.id];
    const sameItem = legacy !== undefined && englishPart(legacy.name).toLowerCase() === c.nameEn.toLowerCase();
    const keepLegacyText = sameItem || (legacy !== undefined && !c.descriptionFr);
    const fr = {
      name: c.nameFr !== c.nameEn ? `${c.nameFr} (${c.nameEn})` : c.nameFr,
      hint: keepLegacyText ? legacy.frHint : c.descriptionFr,
      // Current values from the game data first: the hand-written stats date from an older patch
      stats: c.statsFr?.length ? c.statsFr : sameItem ? legacy.stats : [],
      description: keepLegacyText ? legacy.description : c.descriptionFr,
    };
    const en = {
      name: c.nameEn,
      hint: c.descriptionEn ?? '',
      stats: c.statsEn ?? [],
      description: c.descriptionEn ?? '',
    };
    const it = {
      name: c.nameIt ?? c.nameEn,
      hint: c.descriptionIt || en.hint,
      stats: c.statsIt?.length ? c.statsIt : en.stats,
      description: c.descriptionIt || en.description,
    };
    db[c.id] = {
      id: c.id,
      ...{ fr, en, it }[lang],
      nameFr: c.nameFr,
      nameEn: c.nameEn,
      category: c.category,
      tier: c.tier,
      cost: c.cost,
      isActive: c.isActive,
      countersTags: legacy?.countersTags,
      upgradesFrom: c.upgradesFrom.length > 0 ? c.upgradesFrom : undefined,
      icon: c.icon,
      legacyIcon: c.legacyIcon,
    };
  }
  return db;
}

export const ITEMS_DB: Record<string, DeadlockItem> = buildItemsDb('fr');
const ITEMS_BY_LANG: Record<Lang, Record<string, DeadlockItem>> = {
  fr: ITEMS_DB,
  en: buildItemsDb('en'),
  it: buildItemsDb('it'),
};

/** Item catalogue in the interface language (same ids, prices and tiers as ITEMS_DB). */
export const getItemsDb = (lang: Lang) => ITEMS_BY_LANG[lang];

const BASE_HEROES_DB: DeadlockHero[] = [
  // ================= 1. VINDICTA (VEDETTE AVEC FOCUS COMPLET) =================
  {
    id: 'vindicta',
    name: 'Vindicta',
    role: 'Tireuse d\'élite aérienne & Exécutrice d\'Âmes',
    archetype: 'Sniper / Pick',
    accentColor: '#c084fc',
    avatarBg: 'from-purple-900/80 via-indigo-950 to-slate-950',
    threatTags: ['flier_mobility', 'sniper_poke', 'spirit_burst'],
    baseTips:
      'Votre force réside dans le contrôle de l\'espace aérien (Flight) et l\'économie d\'âmes bonus générée par Assassinate (T3). Ne gaspillez jamais votre Vol sans avoir repéré les menaces de CC (Knockdown, Hook de Bebop, Plongeon de Lash).',
    builds: [
      {
        id: 'vindicta_crow_executor',
        name: 'Sniper Spirit & Crow Bleed (Méta Exécution)',
        subtitle: 'Saignement en % PV via les Corbeaux + Rafale de 4 Snipes explosifs',
        playstyle: 'Harcelez à longue distance avec Crow Familiar (qui rebondit sur 3 ennemis au niveau max) pour faire fondre leurs PV sous les 50%, puis enchaînez les exécutions avec Assassinate pour générer des milliers d\'âmes bonus.',
        recommendedForLanes: ['solo', 'duo'],
        abilitiesOrder: ['3', '4', '2', '1'],
        abilitiesDetails: [
          {
            key: '3',
            name: 'Nuée de corneilles (Crow Familiar)',
            description: 'Envoie un corbeau qui inflige un saignement en % des PV actuels.',
            priorityTip: 'MAXER EN 1ER (5 pts) : Au niveau max, le corbeau rebondit sur 2 cibles supplémentaires, applique un saignement en % PV et réduit leur résistance Spirit et Balles de -12% !',
          },
          {
            key: '4',
            name: 'Assassinat (Assassinate)',
            description: 'Tir de sniper longue portée qui inflige d\'énormes dégâts bonus aux ennemis sous 50% PV.',
            priorityTip: 'MAXER EN 2E (5 pts) : Le dernier palier (+155 dégâts & +850 Âmes bonus par kill) vous fait snowball toute la partie.',
          },
          {
            key: '2',
            name: 'Envol (Flight)',
            description: 'S\'envole dans les airs et ajoute des dégâts Spirituels à chaque balle tirée.',
            priorityTip: 'Mettre 1 point tôt pour la durée, puis maxer après Corbeau/Snipe.',
          },
          {
            key: '1',
            name: 'Entrave (Stake)',
            description: 'Attache les ennemis dans la zone d\'impact.',
            priorityTip: 'Garder pour bloquer un assassin qui vous fonce dessus ou garantir votre tir d\'Assassinate.',
          },
        ],
        phases: {
          early: ['high_velocity_mag', 'mystic_burst', 'extra_charge', 'extra_stamina', 'hollow_point_ward'],
          mid: ['quicksilver_reload', 'soul_shredder_bullets', 'enchanters_barrier', 'mystic_vulnerability', 'improved_cooldown'],
          late: ['rapid_recharge', 'improved_burst', 'sharpshooter', 'boundless_spirit', 'mystic_reverb'],
          situational: ['reactive_barrier', 'debuff_remover', 'superior_stamina', 'knockdown', 'ethereal_shift'],
        },
        laneTips: {
          solo: 'En Solo 1v1, utilisez High-Velocity Mag pour deny les âmes ennemies. Lancez votre Corbeau dès que l\'adversaire s\'aligne avec sa bannière de soin pour le forcer à reculer.',
          duo: 'En Duo 2v2, économisez votre Stake (1) pour enchaîner sur le contrôle de votre allié. Dès que votre Corbeau a 5 points, il rebondira sur les 2 ennemis de la lane à chaque lancer !',
          yellow_purple: 'Sur les lanes extérieures (Jaune/Violette), gardez toujours 1 barre de stamina ou votre Vol pour survivre aux ganks longs.',
          orange_blue: 'Sur les lanes centrales (Orange/Bleue), profitez des toits élevés pour sniper la lane voisine dès que vous avez votre Ultime à 3000 âmes.',
        },
      },
      {
        id: 'vindicta_ac130_gun',
        name: 'AC-130 Hybride Gun & Flight (DPS Aérien)',
        subtitle: 'Mitraillage aérien continu sous Flight + balles Spirituelles',
        playstyle: 'Transforme Vindicta en hélicoptère de combat : tant que vous êtes en Vol (2), chacune de vos balles inflige des dégâts d\'arme massifs (Sharpshooter) + des dégâts Spirituels à l\'impact.',
        recommendedForLanes: ['duo', 'solo'],
        abilitiesOrder: ['2', '3', '4', '1'],
        abilitiesDetails: [
          {
            key: '2',
            name: 'Envol (Flight)',
            description: 'S\'envole et imprègne vos balles de dégâts Spirituels.',
            priorityTip: 'MAXER EN 1ER : +6s de durée de vol et gros bonus de dégâts Spirituels par balle tirée.',
          },
          {
            key: '3',
            name: 'Nuée de corneilles (Crow Familiar)',
            description: 'Réduit les résistances ennemies pour amplifier vos tirs en vol.',
            priorityTip: 'MAXER EN 2E pour le shred d\'armure (-12% Bullet & Spirit Resist).',
          },
          {
            key: '4',
            name: 'Assassinat (Assassinate)',
            description: 'Achevez les cibles qui tentent de fuir derrière un mur.',
            priorityTip: 'Prendre le palier T2/T3 dès que vous commencez à ganker.',
          },
          {
            key: '1',
            name: 'Entrave (Stake)',
            description: 'Immobilise les cibles au sol pour les mitrailler depuis les airs.',
            priorityTip: 'Combo parfait avec Alchemical Fire.',
          },
        ],
        phases: {
          early: ['high_velocity_mag', 'headshot_booster', 'rapid_rounds', 'extra_stamina', 'extra_regen'],
          mid: ['slowing_bullets', 'soul_shredder_bullets', 'combat_barrier', 'quicksilver_reload', 'duration_extender'],
          late: ['sharpshooter', 'pristine_emblem', 'alchemical_fire', 'spiritual_overflow', 'crippling_headshot'],
          situational: ['toxic_bullets', 'superior_stamina', 'metal_skin', 'debuff_remover', 'silencer'],
        },
        laneTips: {
          solo: 'Punissez chaque tentative de last-hit avec Headshot Booster. Activez le Vol uniquement quand l\'ennemi a utilisé son dash pour lui retirer 60% de ses PV en un chargeur.',
          duo: 'Combinez Stake (1) + Alchemical Fire sur les deux ennemis groupés : ils fondent en moins de 3 secondes.',
          yellow_purple: 'Prenez Monster Rounds si l\'adversaire pousse trop vite sous votre Guardian.',
          orange_blue: 'Excellent build pour sécuriser le Mid-Boss et l\'Urne grâce au DPS soutenu.',
        },
      },
    ],
    specificMatchups: {
      bebop: {
        enemyId: 'bebop',
        dangerLevel: 'Extreme',
        summary: 'Son Hook (Grappin) a une portée énorme et vous cueille facilement quand vous flottez lentement en l\'air.',
        mustBuyItems: ['reactive_barrier', 'debuff_remover', 'extra_stamina'],
        laneRule: 'Achetez Reactive Barrier dès 1250 âmes (annule totalement les dégâts de son combo Hook + Bombe) puis Debuff Remover à 3000 âmes pour purger ses bombes collantes.',
      },
      lash: {
        enemyId: 'lash',
        dangerLevel: 'Extreme',
        summary: 'Lash peut sauter plus haut que votre Vol et vous écraser au sol avec Ground Strike et son Ultime.',
        mustBuyItems: ['ethereal_shift', 'reactive_barrier', 'slowing_hex'],
        laneRule: 'Ne volez jamais au milieu de la lane s\'il a sa hauteur sous les toits. Utilisez Slowing Hex sur lui avant qu\'il ne s\'envole ou Ethereal Shift quand il lance son Ultime.',
      },
      grey_talon: {
        enemyId: 'grey_talon',
        dangerLevel: 'High',
        summary: 'Duel de snipers aériens : ses Charged Shots font extrêmement mal si vous restez stationnaire en vol.',
        mustBuyItems: ['spirit_shielding', 'knockdown', 'spellbreaker'],
        laneRule: 'Prenez Bouclier spirituel (Spirit Shielding) pour absorber ses flèches chargées, puis Brise-magie (Spellbreaker) en fin de partie, tout en gagnant le duel d\'Assassinate.',
      },
      haze: {
        enemyId: 'haze',
        dangerLevel: 'High',
        summary: 'Elle peut vous endormir (Sleep Dagger) à distance ou s\'infiltrer invisible dans votre dos.',
        mustBuyItems: ['metal_skin', 'return_fire', 'weapon_shielding'],
        laneRule: 'Gardez votre Stake (1) pour le jeter à vos pieds dès qu\'elle sort d\'invisibilité, et activez Metal Skin pendant son Bullet Dance.',
      },
      abrams: {
        enemyId: 'abrams',
        dangerLevel: 'Medium',
        summary: 'Tank à forte régénération qui cherchera à plonger sous votre tour.',
        mustBuyItems: ['healbane', 'toxic_bullets', 'decay'],
        laneRule: 'Vous le dominez à distance si vous coupez sa régénération avec Healbane (appliqué par votre Corbeau) ou Toxic Bullets.',
      },
      pocket: {
        enemyId: 'pocket',
        dangerLevel: 'High',
        summary: 'Très mobile avec son manteau et sa mallette, son ultime Affliction applique un poison mortel.',
        mustBuyItems: ['debuff_remover', 'slowing_hex', 'spirit_shielding'],
        laneRule: 'Slowing Hex l\'empêche de se téléporter dans son manteau. Debuff Remover purge son ultime Affliction instantanément !',
      },
    },
  },

  // ================= 2. GREY TALON =================
  {
    id: 'grey_talon',
    name: 'Grey Talon',
    role: 'Archer Spirituel & Artillerie aérienne',
    archetype: 'Sniper / Pick',
    accentColor: '#34d399',
    avatarBg: 'from-emerald-900/80 via-teal-950 to-slate-950',
    threatTags: ['flier_mobility', 'sniper_poke', 'spirit_burst'],
    baseTips: 'Vos flèches chargées (Charged Shot) traversent plusieurs cibles et ont une hitbox généreuse. Utilisez votre Hibou (Guided Owl) pour exécuter à travers toute la carte et gagner du Pouvoir Spirituel permanent.',
    builds: [
      {
        id: 'talon_charged_spirit',
        name: 'Artilleur Spirituel Charged Shot',
        subtitle: '4 Flèches Chargées dévastatrices + Hibou nucléaire',
        playstyle: 'Maximise le Pouvoir Spirituel et le nombre de charges pour infliger 600 à 1200 dégâts par flèche chargée à distance de sécurité.',
        recommendedForLanes: ['solo', 'duo'],
        abilitiesOrder: ['1', '4', '2', '3'],
        abilitiesDetails: [
          { key: '1', name: 'Tir chargé (Charged Shot)', description: 'Tir spirituel perforant à haute puissance.', priorityTip: 'MAXER EN 1ER : le scaling Spirituel double au dernier niveau.' },
          { key: '4', name: 'Hibou guidé (Guided Owl)', description: 'Hibou téléguidé qui étourdit et exécute sous 22% PV.', priorityTip: 'Chaque kill au Hibou vous donne +5 Pouvoir Spirituel permanent !' },
          { key: '2', name: 'Pluie de flèches (Rain of Arrows)', description: 'Saut aérien et tir multishot.', priorityTip: 'Utilisez les dash aériens pour esquiver tout en tirant.' },
          { key: '3', name: 'Collet spirituel (Spirit Snare)', description: 'Piège au sol qui ralentit et désarme/silence.', priorityTip: 'Placez-le dans les escaliers ou sous vos pieds contre les assassins.' },
        ],
        phases: {
          early: ['extra_charge', 'mystic_burst', 'high_velocity_mag', 'extra_stamina', 'hollow_point_ward'],
          mid: ['quicksilver_reload', 'enchanters_barrier', 'soul_shredder_bullets', 'improved_cooldown'],
          late: ['rapid_recharge', 'improved_burst', 'surge_of_power', 'boundless_spirit', 'mystic_reverb'],
          situational: ['superior_stamina', 'debuff_remover', 'ethereal_shift', 'healbane'],
        },
        laneTips: {
          solo: 'Tirez vos Charged Shots à travers la vague de creeps pour toucher le héros adverse en même temps.',
          duo: 'Placez votre piège (3) devant le Guardian ennemi pour punir toute avancée.',
          yellow_purple: 'Conservez Rain of Arrows pour fuir par-dessus les bâtiments en cas de gank.',
          orange_blue: 'Envoyez votre Hibou (4) sur la lane voisine sans même quitter votre tour.',
        },
      },
    ],
  },

  // ================= 3. HAZE =================
  {
    id: 'haze',
    name: 'Haze',
    role: 'Assassine furtive & Hyper-Carry Fixation',
    archetype: 'Carry DPS',
    accentColor: '#fb923c',
    avatarBg: 'from-orange-900/80 via-amber-950 to-slate-950',
    threatTags: ['bullet_hose', 'close_assassin'],
    baseTips: 'Accumulez les stacks de Fixation sur une même cible avant d\'utiliser vos compétences. Sleep Dagger vous garantit un tir lourd ou un engagement gratuit.',
    builds: [
      {
        id: 'haze_fixation_shredder',
        name: 'Hyper-Carry Fixation & Bullet Dance',
        subtitle: 'Cadence de tir extrême + Ultime inarrêtable en teamfight',
        playstyle: 'Farm rapide avec Smoke Bomb, ganks furtifs avec Sleep Dagger, et nettoyage d\'équipe avec Bullet Dance + Unstoppable.',
        recommendedForLanes: ['duo', 'solo'],
        abilitiesOrder: ['3', '4', '1', '2'],
        abilitiesDetails: [
          { key: '3', name: 'Fixation (Fixation)', description: 'Passif : chaque balle augmente vos dégâts sur la cible.', priorityTip: 'MAXER EN 1ER : la cadence de tir fait monter les stacks instantanément.' },
          { key: '4', name: 'Danse balistique (Bullet Dance)', description: 'Tourbillon de balles à haute esquive.', priorityTip: 'Activez Unstoppable ou Silencer juste avant de lancer l\'Ultime.' },
          { key: '1', name: 'Dague de sommeil (Sleep Dagger)', description: 'Dague qui endort la cible.', priorityTip: 'Le sommeil ne se casse pas tout de suite : faites un Heavy Melee gratuit avant de tirer !' },
          { key: '2', name: 'Fumibombe (Smoke Bomb)', description: 'Invisibilité et vitesse de sprint.', priorityTip: 'Idéal pour traverser la carte et surprendre les snipers.' },
        ],
        phases: {
          early: ['rapid_rounds', 'ammo_scavenger' in ITEMS_DB ? 'high_velocity_mag' : 'high_velocity_mag', 'extra_regen', 'sprint_boots'],
          mid: ['active_reload', 'bullet_lifesteal', 'slowing_bullets', 'quicksilver_reload'],
          late: ['burst_fire', 'tesla_bullets', 'toxic_bullets', 'silencer', 'unstoppable'],
          situational: ['knockdown', 'debuff_remover', 'metal_skin', 'leech'],
        },
        laneTips: {
          solo: 'Jouez prudemment les 4 premières minutes : Haze est fragile au niveau 1. Utilisez Sleep Dagger pour interrompre les compétences ennemies.',
          duo: 'Laissez votre partenaire engager et empilez 40+ stacks de Fixation sur la cible bloquée.',
          yellow_purple: 'Prenez Extra Regen dès le début pour tenir le poke en Solo lane.',
          orange_blue: 'Dès que vous avez Smoke Bomb niv. 2, décalez sur la lane d\'à côté après chaque vague.',
        },
      },
    ],
  },

  // ================= 4. BEBOP =================
  {
    id: 'bebop',
    name: 'Bebop',
    role: 'Spécialiste du Grappin & Bombes Spirituelles',
    archetype: 'Control / Support',
    accentColor: '#ef4444',
    avatarBg: 'from-red-900/80 via-rose-950 to-slate-950',
    threatTags: ['cc_catch', 'spirit_burst'],
    baseTips: 'Chaque Sticky Bomb qui touche un héros augmente ses dégâts de façon permanente (+1.5% par stack). Utilisez Uppercut sur un creep avec une bombe collée pour l\'envoyer exploser sur l\'ennemi !',
    builds: [
      {
        id: 'bebop_double_bomb',
        name: 'Artificier Hook & Bombes Empilées',
        subtitle: 'Contrôle fatal au Hook + Scaling infini des Sticky Bombs',
        playstyle: 'Attrapez une cible isolée avec Hook (3), collez Sticky Bomb (2), et renvoyez-la vers votre équipe avec Exploding Uppercut (1).',
        recommendedForLanes: ['duo', 'solo'],
        abilitiesOrder: ['2', '3', '4', '1'],
        abilitiesDetails: [
          { key: '2', name: 'Bombe collante (Sticky Bomb)', description: 'Gagne des dégâts permanents à chaque héros touché.', priorityTip: 'Collez-la sur les creeps et faites un Uppercut pour harceler sans risque.' },
          { key: '3', name: 'Crochet (Hook)', description: 'Grappin longue portée.', priorityTip: 'Niveau 2 double la portée (60m), mortel contre les snipers.' },
          { key: '4', name: 'Hyperlaser (Hyper Beam)', description: 'Rayon laser orbital qui ralentit massivement.', priorityTip: 'Utilisez-le depuis les airs pour dominer un teamfight.' },
          { key: '1', name: 'Uppercut explosif (Exploding Uppercut)', description: 'Projette les unités et recharge votre arme.', priorityTip: 'Réinitialise le cooldown du Hook au niveau max.' },
        ],
        phases: {
          early: ['mystic_reach', 'mystic_burst', 'extra_stamina', 'sprint_boots'],
          mid: ['improved_cooldown', 'enchanters_barrier', 'slowing_hex', 'mystic_vulnerability'],
          late: ['improved_burst', 'surge_of_power', 'superior_cooldown', 'boundless_spirit', 'mystic_reverb'],
          situational: ['reactive_barrier', 'knockdown', 'healbane', 'curse'],
        },
        laneTips: {
          solo: 'Votre laser de base est hitscan (instantané) : vous pouvez deny 80% des âmes adverses sans même acheter High-Velocity Mag !',
          duo: 'Un seul Hook sous votre Guardian au niveau 2 équivaut à un kill garanti.',
          yellow_purple: 'Placez-vous derrière le pilier central pour lancer des Hooks surprises.',
          orange_blue: 'Roamez entre Orange et Bleue avec la portée améliorée du Hook.',
        },
      },
    ],
  },

  // ================= 5. ABRAMS =================
  {
    id: 'abrams',
    name: 'Abrams',
    role: 'Colosse de mêlée & Régénération infernale',
    archetype: 'Bruiser / Tank',
    accentColor: '#3b82f6',
    avatarBg: 'from-blue-900/80 via-slate-900 to-slate-950',
    threatTags: ['tank_frontline', 'healer', 'cc_catch'],
    baseTips: 'Après un Shoulder Charge contre un mur, vous avez un Heavy Melee garanti sans que l\'ennemi puisse parer (Parry). Attention aux feintes de parade à bas et haut niveau !',
    builds: [
      {
        id: 'abrams_immortal_brawler',
        name: 'Juggernaut Siphon & Mêlée Lourde',
        subtitle: 'Frontlane inépuisable qui écrase les lignes arrières',
        playstyle: 'Foncez au cœur de la mêlée avec Siphon Life activé, bloquez la cible principale contre un mur et absorbez tous les dégâts.',
        recommendedForLanes: ['duo', 'solo'],
        abilitiesOrder: ['3', '2', '1', '4'],
        abilitiesDetails: [
          { key: '3', name: 'Résilience infernale (Infernal Resilience)', description: 'Régénère une partie de tous les dégâts subis.', priorityTip: 'Vous permet de gagner tous les trades courts en lane.' },
          { key: '2', name: 'Charge taurine (Shoulder Charge)', description: 'Charge qui étourdit contre un mur.', priorityTip: 'Duration Extender vous garantit un coup de poing chargé pendant le stun.' },
          { key: '1', name: 'Siphonnage (Siphon Life)', description: 'Draine la vie des ennemis proches.', priorityTip: 'Activez-le avant de plonger dans la mêlée.' },
          { key: '4', name: 'Impact sismique (Seismic Impact)', description: 'Saut céleste et écrasement de zone.', priorityTip: 'Donne l\'immunité aux CC au niveau max !' },
        ],
        phases: {
          early: ['close_quarters', 'spirit_strike', 'extra_regen', 'extra_health'],
          mid: ['kinetic_dash', 'duration_extender', 'combat_barrier', 'debuff_reducer'],
          late: ['debuff_remover', 'bullet_resilience', 'spirit_resilience', 'leech', 'unstoppable'],
          situational: ['knockdown', 'metal_skin', 'return_fire', 'decay'],
        },
        laneTips: {
          solo: 'Contre un sniper (Vindicta / Talon), jouez autour du voile et des couvertures et utilisez votre passif pour régénérer leur poke.',
          duo: 'Punissez le moindre avancement ennemi avec Shoulder Charge contre le pont central.',
          yellow_purple: 'Poussez la vague et volez le camp neutre ennemi juste à côté.',
          orange_blue: 'Plongez avec Seismic Impact depuis les toits sur la lane voisine.',
        },
      },
    ],
  },

  // ================= 6. LASH =================
  {
    id: 'lash',
    name: 'Lash',
    role: 'Assassin aérien & Initiateur de Teamfight',
    archetype: 'Assassin',
    accentColor: '#eab308',
    avatarBg: 'from-yellow-900/80 via-stone-900 to-slate-950',
    threatTags: ['flier_mobility', 'cc_catch', 'spirit_burst', 'close_assassin'],
    baseTips: 'Plus vous tombez de haut avec Ground Strike (1), plus les dégâts sont colossaux. Vous êtes le cauchemar naturel des tireurs fragiles s\'ils n\'ont pas Ethereal Shift.',
    builds: [
      {
        id: 'lash_sky_slam',
        name: 'Météore Spirituel Ground Strike',
        subtitle: 'Burst vertical instantané + Death Slam multi-cibles',
        playstyle: 'Prenez de la hauteur avec Grapple (2), plongez avec Ground Strike (1), drainez avec Flog (3) et ressortez avant la riposte.',
        recommendedForLanes: ['duo', 'solo'],
        abilitiesOrder: ['1', '3', '2', '4'],
        abilitiesDetails: [
          { key: '1', name: 'Frappe au sol (Ground Strike)', description: 'Plongeon dont les dégâts scalent avec la hauteur de chute.', priorityTip: 'MAXER EN 1ER : les dégâts doublent au dernier palier.' },
          { key: '3', name: 'Flagellation (Flog)', description: 'Coup de fouet qui soigne et ralentit.', priorityTip: 'Votre outil principal pour tenir la lane et réduire la cadence ennemie.' },
          { key: '2', name: 'Grappin (Grapple)', description: 'Propulsion aérienne et bonus d\'arme.', priorityTip: 'Se recharge sur les troupes alliées ou ennemies.' },
          { key: '4', name: 'Placage mortel (Death Slam)', description: 'Attrape plusieurs ennemis et les projette violemment.', priorityTip: 'Jetez les ennemis directement sous votre Walker ou dans votre équipe.' },
        ],
        phases: {
          early: ['mystic_burst', 'extra_stamina', 'mystic_reach', 'extra_regen'],
          mid: ['enchanters_barrier', 'slowing_hex', 'mystic_vulnerability', 'improved_cooldown'],
          late: ['superior_stamina', 'improved_burst', 'ethereal_shift', 'boundless_spirit', 'unstoppable'],
          situational: ['reactive_barrier', 'debuff_remover', 'healbane', 'curse'],
        },
        laneTips: {
          solo: 'Utilisez Flog (3) à travers les murs/couvertures pour vous soigner tout en harcelant.',
          duo: 'Sautez depuis le pont central pour écraser les deux ennemis d\'un coup.',
          yellow_purple: 'Superior Stamina vous permet de traverser toute la lane en 2 secondes.',
          orange_blue: 'Broadway (Bleue) et Orchard (Orange) ont les meilleurs toits du jeu pour maximiser les dégâts de chute de Ground Strike.',
        },
      },
    ],
  },

  // ================= 7. WRAITH =================
  {
    id: 'wraith',
    name: 'Wraith',
    role: 'Duelliste Télékinésique & Split-Pusher',
    archetype: 'Carry DPS',
    accentColor: '#a855f7',
    avatarBg: 'from-fuchsia-900/80 via-purple-950 to-slate-950',
    threatTags: ['bullet_hose', 'cc_catch', 'close_assassin'],
    baseTips: 'Vos tirs chargent vos cartes (Card Trick). Téléportez-vous sur une cible isolée et bloquez-la avec Telekinesis (4) pour l\'éliminer en un seul chargeur.',
    builds: [
      {
        id: 'wraith_hybrid_cards',
        name: 'Duelliste Full Auto & Cartes Spirituelles',
        subtitle: 'Haute cadence de tir + Rafale de cartes et Ultime ciblé',
        playstyle: 'Domine tous les 1v1 en milieu de partie grâce à Telekinesis et fait fondre les objectifs (Guardians/Walkers) en quelques secondes.',
        recommendedForLanes: ['solo', 'duo'],
        abilitiesOrder: ['3', '1', '4', '2'],
        abilitiesDetails: [
          { key: '3', name: 'Salve automatique (Full Auto)', description: 'Boost massif de cadence de tir et balles spirituelles.', priorityTip: 'MAXER EN 1ER pour le vol de vie spirituel et le DPS.' },
          { key: '1', name: 'Tour de cartes (Card Trick)', description: 'Lance une carte explosive chargée par vos balles.', priorityTip: 'Active Quicksilver Reload instantanément.' },
          { key: '4', name: 'Psychokinésie (Telekinesis)', description: 'Soulève et silence un ennemi.', priorityTip: 'Garantit 100% de Headshots pendant que la cible lévite.' },
          { key: '2', name: 'Projection mentale (Project Mind)', description: 'Téléportation longue portée avec bouclier.', priorityTip: 'Pour s\'échapper ou sauter sur un sniper en hauteur.' },
        ],
        phases: {
          early: ['rapid_rounds', 'mystic_burst', 'extra_stamina', 'extra_regen'],
          mid: ['quicksilver_reload', 'active_reload', 'slowing_bullets', 'combat_barrier'],
          late: ['tesla_bullets', 'burst_fire', 'toxic_bullets', 'crippling_headshot', 'silencer'],
          situational: ['debuff_remover', 'metal_skin', 'knockdown', 'curse'],
        },
        laneTips: {
          solo: 'Lancez vos cartes derrière les piliers où l\'ennemi se cache : la boîte de collision est très large.',
          duo: 'Full Auto donne aussi de la cadence de tir à votre allié proche !',
          yellow_purple: 'Idéale en Solo lane pour détruire le Guardian dès que l\'ennemi rentre à la base.',
          orange_blue: 'Téléportez-vous par-dessus les toits pour flanquer les snipers.',
        },
      },
    ],
  },

  // ================= 8. POCKET =================
  {
    id: 'pocket',
    name: 'Pocket',
    role: 'Mage d\'embuscade insaisissable & Burst AoE',
    archetype: 'Assassin',
    accentColor: '#2dd4bf',
    avatarBg: 'from-teal-900/80 via-cyan-950 to-slate-950',
    threatTags: ['spirit_burst', 'flier_mobility', 'close_assassin'],
    baseTips: 'Maintenez des stacks d\'Amplification avec Barrage (1) avant de plonger avec Flying Cloak (2) et Enchanter\'s Satchel (3). Attention : Pocket a une résistance Spirituelle de base négative (-15%) !',
    builds: [
      {
        id: 'pocket_affliction_burst',
        name: 'Artiste de l\'Évasion & Affliction AoE',
        subtitle: 'Combo AoE explosif + Invulnérabilité en mallette',
        playstyle: 'Flottez au-dessus de l\'équipe ennemie avec Barrage, téléportez-vous au milieu, lancez Affliction (4), cachez-vous dans la Mallette (3) puis Ethereal Shift.',
        recommendedForLanes: ['solo', 'duo'],
        abilitiesOrder: ['1', '3', '4', '2'],
        abilitiesDetails: [
          { key: '1', name: 'Tirs de couverture (Barrage)', description: 'Projectiles qui amplifient tous vos dégâts de +6% par stack.', priorityTip: 'Maintenez-vous en l\'air tout en tirant vos 4 projectiles.' },
          { key: '3', name: 'Mallette de passepasse (Enchanter\'s Satchel)', description: 'Invulnérabilité dans la mallette puis explosion.', priorityTip: 'Esquive l\'Assassinate de Vindicta ou la bombe de Bebop.' },
          { key: '4', name: 'Fléau (Affliction)', description: 'Poison massif en % PV sur toute la zone.', priorityTip: 'Applique Healbane et Suppressor à toute l\'équipe adverse.' },
          { key: '2', name: 'Redingote volante (Flying Cloak)', description: 'Manteau projeté vers lequel vous pouvez vous téléporter.', priorityTip: 'Lancez le manteau en lieu sûr AVANT d\'entrer en mallette.' },
        ],
        phases: {
          early: ['mystic_burst', 'hollow_point_ward', 'extra_stamina', 'extra_regen'],
          mid: ['kinetic_dash', 'enchanters_barrier', 'soul_shredder_bullets', 'mystic_vulnerability'],
          late: ['improved_burst', 'ethereal_shift', 'superior_stamina', 'spirit_resilience', 'boundless_spirit'],
          situational: ['debuff_remover', 'healbane', 'suppressor', 'mystic_reverb'],
        },
        laneTips: {
          solo: 'Achetez impérativement Hollow Point Ward et Enchanter\'s Barrier pour compenser votre faiblesse naturelle aux dégâts Spirituels.',
          duo: 'Barrage depuis un toit donne +24% d\'amplification de dégâts avant même d\'engager.',
          yellow_purple: 'Utilisez Kinetic Dash + Barrage pour traverser toute la lane en flottant.',
          orange_blue: 'Plongez depuis les toits centraux et appliquez Affliction aux 2 joueurs adverses.',
        },
      },
    ],
  },

  // ================= 9. LADY GEIST =================
  {
    id: 'lady_geist',
    name: 'Lady Geist',
    role: 'Mage de siège Spirituel & Échange d\'Âme',
    archetype: 'Artillery Spirit',
    accentColor: '#10b981',
    avatarBg: 'from-emerald-950 via-green-950 to-slate-950',
    threatTags: ['spirit_burst', 'healer', 'sniper_poke'],
    baseTips: 'Vos compétences coûtent vos propres PV mais infligent des dégâts de zone gigantesques. Si un assassin vous saute dessus à 10% PV, utilisez Soul Exchange (4) pour inverser vos barres de vie !',
    builds: [
      {
        id: 'geist_essence_artillery',
        name: 'Impératrice Essence Bomb & Malice',
        subtitle: 'Bombes de zone gigantesques + Vol de vie Spirituel',
        playstyle: 'Contrôle total des zones avec Essence Bomb (1) et amplification de dégâts avec les éclats de Malice (3).',
        recommendedForLanes: ['solo', 'duo'],
        abilitiesOrder: ['1', '3', '2', '4'],
        abilitiesDetails: [
          { key: '1', name: 'Bombe de quintessence (Essence Bomb)', description: 'Bombe à large rayon qui laisse une flaque toxique au niveau max.', priorityTip: 'MAXER EN 1ER : détruit les vagues et les héros cachés derrière un mur.' },
          { key: '3', name: 'Malice (Malice)', description: 'Éclats sanglants qui ralentissent et amplifient vos dégâts.', priorityTip: 'Lancez Malice avant Essence Bomb pour +15% à +30% de dégâts.' },
          { key: '2', name: 'Transfert vital (Life Drain)', description: 'Lien qui draine la vie et silence au niveau max.', priorityTip: 'Vous pouvez bouger et tirer tout en drainant.' },
          { key: '4', name: 'Échange d\'âmes (Soul Exchange)', description: 'Échange votre % de PV avec celui d\'un ennemi proche.', priorityTip: 'Silence de 3s en zone au niveau max.' },
        ],
        phases: {
          early: ['mystic_burst', 'mystic_reach', 'extra_regen', 'high_velocity_mag'],
          mid: ['spirit_lifesteal', 'soul_shredder_bullets', 'enchanters_barrier', 'mystic_vulnerability'],
          late: ['improved_burst', 'surge_of_power', 'spirit_resilience', 'leech', 'boundless_spirit'],
          situational: ['healbane', 'debuff_remover', 'kinetic_dash', 'mystic_reverb'],
        },
        laneTips: {
          solo: 'Lady Geist est l\'une des reines du 1v1 grâce au rayon d\'Essence Bomb qui touche même derrière la couverture du Guardian.',
          duo: 'Malice + Essence Bomb punit sévèrement les duos qui restent proches.',
          yellow_purple: 'Prenez Extra Regen dès 500 âmes pour compenser le coût en PV de vos sorts.',
          orange_blue: 'Attention aux Silences (Slowing Hex / Silencer) qui vous empêchent de lancer Soul Exchange.',
        },
      },
    ],
  },

  // ================= 10. INFERNUS =================
  {
    id: 'infernus',
    name: 'Infernus',
    role: 'Tirailleur incendiaire & DoT Lifesteal',
    archetype: 'Carry DPS',
    accentColor: '#f97316',
    avatarBg: 'from-orange-950 via-red-950 to-slate-950',
    threatTags: ['bullet_hose', 'healer', 'spirit_burst'],
    baseTips: 'Vos tirs appliquent Afterburn (3). Une fois que l\'ennemi brûle, chaque balle supplémentaire rafraîchit entièrement la durée de la brûlure et vous soigne via le Vol de vie Spirituel !',
    builds: [
      {
        id: 'infernus_afterburn_drainer',
        name: 'Pyromane Afterburn & Flame Dash',
        subtitle: 'Brûlure éternelle + Régénération massive en combat',
        playstyle: 'Appliquez Catalyst (1) pour augmenter tous vos dégâts de 40%, enflammez la cible avec vos tirs, et traversez le combat avec Flame Dash (2).',
        recommendedForLanes: ['solo', 'duo'],
        abilitiesOrder: ['3', '1', '2', '4'],
        abilitiesDetails: [
          { key: '3', name: 'Ignition persistante (Afterburn)', description: 'Brûlure spirituelle déclenchée par vos tirs et Headshots.', priorityTip: 'MAXER EN 1ER : réduit aussi les dégâts des ennemis brûlés de -30%.' },
          { key: '1', name: 'Napalm (Catalyst)', description: 'Crachat de napalm qui ralentit et amplifie vos dégâts.', priorityTip: '+20% de Vol de vie et réduction de soins au niveau max.' },
          { key: '2', name: 'Élanflammé (Flame Dash)', description: 'Sprint de feu qui laisse une traînée brûlante.', priorityTip: 'Réduit la cadence de tir ennemie au niveau 2.' },
          { key: '4', name: 'Combustion explosive (Concussive Combustion)', description: 'Explosion autour de vous qui étourdit pendant 1.25s.', priorityTip: 'Combinez avec Flame Dash pour plonger au centre de l\'équipe adverse.' },
        ],
        phases: {
          early: ['rapid_rounds', 'extra_regen', 'extra_stamina', 'restorative_shot'],
          mid: ['spirit_lifesteal', 'soul_shredder_bullets', 'slowing_bullets', 'duration_extender'],
          late: ['toxic_bullets', 'ricochet' in ITEMS_DB ? 'tesla_bullets' : 'tesla_bullets', 'leech', 'boundless_spirit', 'crippling_headshot'],
          situational: ['debuff_remover', 'healbane', 'bullet_resilience', 'spirit_resilience'],
        },
        laneTips: {
          solo: 'Visez la tête : les Headshots chargent la jauge d\'Afterburn deux fois plus vite.',
          duo: 'Flame Dash à travers la vague de creeps et les deux ennemis vous rend toute votre vie avec Spirit Lifesteal.',
          yellow_purple: 'Excellent duelliste de lane extérieure grâce à sa vitesse de rotation.',
          orange_blue: 'Son Ultime retourne instantanément les escarmouches en 2v2.',
        },
      },
    ],
  },

  // ================= 11. MO & KRILL =================
  {
    id: 'mo_and_krill',
    name: 'Mo & Krill',
    role: 'Tank Fouisseur & Neutralisation ciblée',
    archetype: 'Bruiser / Tank',
    accentColor: '#d97706',
    avatarBg: 'from-amber-950 via-yellow-950 to-slate-950',
    threatTags: ['tank_frontline', 'healer', 'cc_catch'],
    baseTips: 'Scorn (1) vous soigne énormément si vous le lancez au milieu des creeps et des héros. Combo (4) neutralise n\'importe quel carry pendant plus de 3 secondes.',
    builds: [
      {
        id: 'mo_burrow_lockdown',
        name: 'Fouisseur Tank & Lockdown Combo',
        subtitle: 'Sustain infini en lane + Suppression du Carry ennemi',
        playstyle: 'Incorporez-vous sous terre avec Burrow (2) pour gagner vitesse et résistances, surgissez sous le carry adverse, désarmez avec Sand Blast (3) et verrouillez avec Combo (4).',
        recommendedForLanes: ['duo', 'solo'],
        abilitiesOrder: ['1', '2', '4', '3'],
        abilitiesDetails: [
          { key: '1', name: 'Intimidation (Scorn)', description: 'Frappe de zone qui vous soigne (x2 sur les héros).', priorityTip: 'Vous rend quasiment impossible à sortir de lane.' },
          { key: '2', name: 'Forage (Burrow)', description: 'Plonge sous terre avec +80% Résistance Balles.', priorityTip: 'Idéal pour roamer et engager sous les tours.' },
          { key: '4', name: 'Dérouillée (Combo)', description: 'Maintient et supprime un ennemi, gagne des PV max permanents par kill.', priorityTip: 'Duration Extender augmente la durée de ce contrôle mortel !' },
          { key: '3', name: 'Jet de sable (Sand Blast)', description: 'Jet de sable à longue portée qui désarme pendant 3.5s.', priorityTip: 'Annule totalement les tireurs en un clic.' },
        ],
        phases: {
          early: ['monster_rounds', 'close_quarters', 'extra_regen', 'sprint_boots'],
          mid: ['duration_extender', 'enduring_speed', 'spirit_lifesteal', 'combat_barrier'],
          late: ['torment_pulse' in ITEMS_DB ? 'improved_burst' : 'improved_burst', 'bullet_resilience', 'spirit_resilience', 'unstoppable'],
          situational: ['knockdown', 'decay', 'healbane', 'curse'],
        },
        laneTips: {
          solo: 'Approchez-vous de la vague, appuyez sur Scorn (1) et vous regagnez 250 PV toutes les 10 secondes.',
          duo: 'Dès que vous avez votre Ultime (Combo), votre partenaire (ex: Vindicta) a un Assassinate 100% garanti sur la cible immobilisée.',
          yellow_purple: 'Sand Blast empêche l\'ennemi de last-hit ou de vous tirer dessus pendant 3.5s.',
          orange_blue: 'Utilisez Burrow pour ganker d\'une lane centrale à l\'autre en quelques secondes.',
        },
      },
    ],
  },

  // ================= 12. SEVEN =================
  {
    id: 'seven',
    name: 'Seven',
    role: 'Mage Électrique de Zone & Hyper-Farmer',
    archetype: 'Artillery Spirit',
    accentColor: '#facc15',
    avatarBg: 'from-yellow-900/80 via-amber-950 to-slate-950',
    threatTags: ['spirit_burst', 'bullet_hose'],
    baseTips: 'Power Surge (3) transforme vos balles en éclairs en chaîne qui réduisent la résistance Spirituelle ennemie. Attention à Knockdown quand vous canalisez Storm Cloud (4) !',
    builds: [
      {
        id: 'seven_power_surge',
        name: 'Tempête Power Surge & Éclairs en Chaîne',
        subtitle: 'Farm ultra-rapide + Dégâts hybrides électriques',
        playstyle: 'Utilisez Static Charge (2) pour forcer l\'ennemi à reculer, nettoyez toute la jungle avec Lightning Ball (1) et électrocutez l\'équipe adverse avec Power Surge (3).',
        recommendedForLanes: ['duo', 'solo'],
        abilitiesOrder: ['3', '1', '2', '4'],
        abilitiesDetails: [
          { key: '3', name: 'Surtension (Power Surge)', description: 'Imprègne vos balles d\'éclairs rebondissants.', priorityTip: 'MAXER EN 1ER : réduit la résistance Spirituelle ennemie de -15%.' },
          { key: '1', name: 'Boule de foudre (Lightning Ball)', description: 'Sphère électrique qui traverse et nettoie les vagues.', priorityTip: 'Parfait pour pousser la lane et prendre les camps neutres.' },
          { key: '2', name: 'Charge statique (Static Charge)', description: 'Étourdit la cible et les ennemis proches après un délai.', priorityTip: 'Force l\'adversaire à dasher ou à se faire stun.' },
          { key: '4', name: 'Orage magnétique (Storm Cloud)', description: 'Tempête électrique géante autour de Seven.', priorityTip: 'Achetez Unstoppable si l\'ennemi possède Knockdown.' },
        ],
        phases: {
          early: ['monster_rounds', 'mystic_burst', 'extra_stamina', 'sprint_boots'],
          mid: ['soul_shredder_bullets', 'fleetfoot', 'spirit_lifesteal', 'enduring_speed'],
          late: ['surge_of_power', 'superior_cooldown', 'boundless_spirit', 'leech', 'unstoppable'],
          situational: ['debuff_remover', 'spirit_resilience', 'bullet_resilience', 'ethereal_shift'],
        },
        laneTips: {
          solo: 'Votre tête a une grande hitbox : ne restez pas immobile face à Vindicta ou Grey Talon.',
          duo: 'Static Charge sur un ennemi l\'oblige à s\'éloigner de son allié sous peine d\'étourdir les deux.',
          yellow_purple: 'Poussez la vague en 2 secondes avec Lightning Ball et prenez tous les camps neutres.',
          orange_blue: 'Domine les combats d\'Urne et de Mid-Boss grâce à ses dégâts de zone.',
        },
      },
    ],
  },

  // ================= 13. SHIV =================
  {
    id: 'shiv',
    name: 'Shiv',
    role: 'Duelliste Rage Sanguinaire & Exécuteur',
    archetype: 'Bruiser / Tank',
    accentColor: '#dc2626',
    avatarBg: 'from-red-950 via-stone-900 to-slate-950',
    threatTags: ['tank_frontline', 'close_assassin', 'healer'],
    baseTips: 'Bloodletting (3) diffère une grande partie des dégâts que vous subissez, et Killing Blow (4) exécute instantanément tout ennemi sous 28% PV en réinitialisant son propre cooldown !',
    builds: [
      {
        id: 'shiv_rage_brawler',
        name: 'Exécuteur Rage & Slice and Dice',
        subtitle: 'Dégâts différés + Reset d\'exécution en série',
        playstyle: 'Maintenez votre jauge de Rage à 100% sur les creeps, foncez avec Slice and Dice (2) qui se répète grâce à la Rage, et achevez avec Killing Blow (4).',
        recommendedForLanes: ['solo', 'duo'],
        abilitiesOrder: ['2', '4', '3', '1'],
        abilitiesDetails: [
          { key: '2', name: 'Élan incisif (Slice and Dice)', description: 'Dash tranchant qui frappe une 2e fois sous Rage pleine.', priorityTip: 'MAXER EN 1ER : réduit son cooldown par ennemi touché.' },
          { key: '4', name: 'Coup de grâce (Killing Blow)', description: 'Exécution instantanée sous 28% PV + Reset sur kill.', priorityTip: 'Donne passivement la mécanique de Rage.' },
          { key: '3', name: 'Saignée (Bloodletting)', description: 'Diffère les dégâts subis et permet d\'en effacer une partie.', priorityTip: 'Vous empêche de mourir d\'un burst soudain.' },
          { key: '1', name: 'Couteau de chasse (Serrated Knives)', description: 'Couteaux de lancer qui appliquent un saignement cumulable.', priorityTip: 'Maintient votre jauge de Rage à distance.' },
        ],
        phases: {
          early: ['close_quarters', 'extra_regen', 'extra_stamina', 'restorative_shot'],
          mid: ['kinetic_dash', 'spirit_lifesteal', 'decay', 'combat_barrier'],
          late: ['improved_burst', 'debuff_remover', 'bullet_resilience', 'spirit_resilience', 'leech'],
          situational: ['healbane', 'metal_skin', 'unstoppable', 'toxic_bullets'],
        },
        laneTips: {
          solo: 'Votre clic droit (tir alternatif du fusil à pompe) vous propulse en arrière dans les airs : utilisez-le pour esquiver ou vous replacer.',
          duo: 'Attendez d\'avoir votre jauge de Rage pleine à 3000 âmes pour plonger et enchaîner deux Killing Blow.',
          yellow_purple: 'Harcelez au couteau (1) jusqu\'à ce que l\'adversaire soit à portée de double dash.',
          orange_blue: 'Redoutable dans les couloirs étroits autour des ponts centraux.',
        },
      },
    ],
  },

  // ================= 14. YAMATO =================
  {
    id: 'yamato',
    name: 'Yamato',
    role: 'Samouraï Spirituel & Duelliste Inarrêtable',
    archetype: 'Assassin',
    accentColor: '#e11d48',
    avatarBg: 'from-rose-950 via-purple-950 to-slate-950',
    threatTags: ['spirit_burst', 'close_assassin', 'flier_mobility'],
    baseTips: 'Power Slash (1) traverse les couvertures et inflige d\'immenses dégâts. Shadow Transformation (4) vous rend immunisée aux contrôles et à la mort tout en réinitialisant toutes vos compétences.',
    builds: [
      {
        id: 'yamato_power_slash',
        name: 'Lame Spirituelle Power Slash & Ombre',
        subtitle: 'Tranchant Spirituel massif + Double rotation sous Ultime',
        playstyle: 'Accrochez-vous aux cibles (même en plein vol !) avec Flying Strike (2), tranchez avec Power Slash (1), soignez-vous avec Crimson Slash (3), puis lancez Shadow Transformation (4) pour tout recommencer.',
        recommendedForLanes: ['solo', 'duo'],
        abilitiesOrder: ['1', '3', '4', '2'],
        abilitiesDetails: [
          { key: '1', name: 'Estafilade (Power Slash)', description: 'Frappe chargée à très haut dégâts Spirituels.', priorityTip: 'MAXER EN 1ER : traverse les murs et les piliers de lane.' },
          { key: '3', name: 'Shomen écarlate (Crimson Slash)', description: 'Frappe en cône qui vous soigne et ralentit la cadence ennemie.', priorityTip: 'Donne un énorme sustain au corps-à-corps.' },
          { key: '4', name: 'Transformation sépulcrale (Shadow Transformation)', description: 'Réinitialise vos sorts et empêche de mourir pendant la durée.', priorityTip: 'Purge également les effets négatifs à l\'activation.' },
          { key: '2', name: 'Accroche tranchante (Flying Strike)', description: 'Grappin ciblé qui vous amène directement sur un ennemi.', priorityTip: 'Permet de suivre Vindicta ou Grey Talon jusque dans le ciel !' },
        ],
        phases: {
          early: ['mystic_burst', 'spirit_strike', 'extra_regen', 'extra_stamina'],
          mid: ['soul_shredder_bullets', 'spirit_lifesteal', 'slowing_hex', 'mystic_vulnerability'],
          late: ['improved_burst', 'Duration Extender' in ITEMS_DB ? 'duration_extender' : 'duration_extender', 'spirit_resilience', 'boundless_spirit', 'mystic_reverb'],
          situational: ['healbane', 'debuff_remover', 'metal_skin', 'curse'],
        },
        laneTips: {
          solo: 'Chargez Power Slash derrière un mur et décalez au dernier instant pour toucher l\'ennemi sans qu\'il puisse vous tirer dessus.',
          duo: 'Flying Strike vous permet de punir instantanément un sniper qui utilise son Vol.',
          yellow_purple: 'Dominante en 1v1 dès le niveau 2 de Power Slash.',
          orange_blue: 'Peut plonger sous le Guardian ennemi avec Shadow Transformation sans mourir.',
        },
      },
    ],
  },

  // ================= 15. PARADOX =================
  {
    id: 'paradox',
    name: 'Paradox',
    role: 'Manipulatrice Temporelle & Pick-Off',
    archetype: 'Sniper / Pick',
    accentColor: '#6366f1',
    avatarBg: 'from-indigo-950 via-blue-950 to-slate-950',
    threatTags: ['cc_catch', 'sniper_poke'],
    baseTips: 'Le combo signature : chargez Kinetic Carbine (3), tirez pour figer le temps de la cible, posez votre Time Wall (2) devant vous et lancez Paradoxical Swap (4) pour faire traverser le mur à l\'ennemi (-10% PV max + Silence) !',
    builds: [
      {
        id: 'paradox_carbine_swap',
        name: 'Sniper Temporel Kinetic Carbine & Swap',
        subtitle: 'Tir figé à haute vélocité + Échange de position mortel',
        playstyle: 'Contrôlez le tempo des escarmouches avec Kinetic Carbine et condamnez un carry ennemi en l\'échangeant au milieu de votre équipe à travers votre mur temporel.',
        recommendedForLanes: ['duo', 'solo'],
        abilitiesOrder: ['3', '2', '4', '1'],
        abilitiesDetails: [
          { key: '3', name: 'Carabine cinétique (Kinetic Carbine)', description: 'Charge un tir puissant qui fige la cible dans le temps.', priorityTip: 'MAXER EN 1ER : donne aussi un gros boost de vitesse de déplacement.' },
          { key: '2', name: 'Écran temporel (Time Wall)', description: 'Bloque tous les projectiles ennemis et enlève 10% PV max aux traversants.', priorityTip: 'Silence de 3s au niveau max pour toute cible qui traverse le mur !' },
          { key: '4', name: 'Permutation paradoxale (Paradoxical Swap)', description: 'Échange votre position avec un héros ennemi.', priorityTip: 'Lancez votre Mur (2) pendant que le projectile de Swap est en vol.' },
          { key: '1', name: 'Grenade à impulsion (Pulse Grenade)', description: 'Grenade à impulsions qui amplifie vos dégâts par vague.', priorityTip: 'Jetez-la à vos pieds avant de Swap un ennemi sur votre position.' },
        ],
        phases: {
          early: ['high_velocity_mag', 'headshot_booster', 'hollow_point_ward', 'sprint_boots'],
          mid: ['combat_barrier', 'mystic_shot', 'slowing_bullets', 'improved_cooldown'],
          late: ['sharpshooter', 'pristine_emblem', 'headhunter', 'crippling_headshot', 'superior_cooldown'],
          situational: ['reactive_barrier', 'debuff_remover', 'knockdown', 'toxic_bullets'],
        },
        laneTips: {
          solo: 'Votre Time Wall (2) bloque l\'Assassinate de Vindicta, la flèche de Grey Talon et la bombe de Lady Geist !',
          duo: 'Un Swap à travers Time Wall sous votre Guardian garantit le premier sang.',
          yellow_purple: 'Utilisez le boost de vitesse de Kinetic Carbine pour esquiver et repositionner.',
          orange_blue: 'Reine des ganks entre les lanes centrales dès 3000 âmes.',
        },
      },
    ],
  },

  // ================= 16. WARDEN =================
  {
    id: 'warden',
    name: 'Warden',
    role: 'Patrouilleur Anti-Mobilité & Bruiser',
    archetype: 'Bruiser / Tank',
    accentColor: '#38bdf8',
    avatarBg: 'from-sky-950 via-blue-950 to-slate-950',
    threatTags: ['cc_catch', 'bullet_hose', 'tank_frontline'],
    baseTips: 'Alchemical Flask (1) retire 1 barre de Stamina à l\'ennemi touché : lancez votre flasque AVANT de poser Binding Word (3) pour qu\'il n\'ait plus de dash pour sortir de la cage !',
    builds: [
      {
        id: 'warden_cage_enforcer',
        name: 'Inquisiteur Cage & Last Stand',
        subtitle: 'Punition de stamina + Cage immobilisante',
        playstyle: 'Courez plus vite que tout le monde avec Willpower (2), retirez la stamina ennemie avec la flasque (1), enfermez avec Binding Word (3) et drainez toute l\'équipe avec Last Stand (4).',
        recommendedForLanes: ['duo', 'solo'],
        abilitiesOrder: ['3', '1', '4', '2'],
        abilitiesDetails: [
          { key: '3', name: 'Mitard (Binding Word)', description: 'Immobilise la cible si elle ne sort pas du cercle à temps.', priorityTip: 'Donne +25% de dégâts d\'arme bonus sur la cible piégée.' },
          { key: '1', name: 'Flasque alchimique (Alchemical Flask)', description: 'Réduit les dégâts d\'arme ennemis et retire 1 Stamina.', priorityTip: 'Lancez-la toujours juste avant Binding Word.' },
          { key: '4', name: 'Charge ultime (Last Stand)', description: 'Onde de choc en cône avec 80% de vol de vie héroïque.', priorityTip: 'Donne +50% de résistances pendant l\'incantation.' },
          { key: '2', name: 'Bravoure (Willpower)', description: 'Bouclier Spirituel et boost de vitesse de déplacement.', priorityTip: 'Permet de rattraper n\'importe quelle cible.' },
        ],
        phases: {
          early: ['high_velocity_mag', 'close_quarters', 'sprint_boots', 'extra_regen'],
          mid: ['slowing_hex', 'fleetfoot', 'slowing_bullets', 'enduring_speed'],
          late: ['burst_fire', 'headhunter', 'toxic_bullets', 'crippling_headshot', 'unstoppable'],
          situational: ['debuff_remover', 'knockdown', 'bullet_resilience', 'spirit_resilience'],
        },
        laneTips: {
          solo: 'La flasque (1) a un cooldown très court et réduit les dégâts de tir ennemis : lancez-la à chaque échange.',
          duo: 'Slowing Hex + Binding Word garantit l\'immobilisation à 100% sans échappatoire.',
          yellow_purple: 'Avec Willpower et Sprint Boots, personne ne peut vous semer sur une longue lane.',
          orange_blue: 'Last Stand retournant les 2v2 dans les espaces clos.',
        },
      },
    ],
  },

  // ================= 17. MCGINNIS =================
  {
    id: 'mcginnis',
    name: 'McGinnis',
    role: 'Ingénieure de Siège, Tourelles & Mur',
    archetype: 'Control / Support',
    accentColor: '#60a5fa',
    avatarBg: 'from-blue-900/80 via-indigo-950 to-slate-950',
    threatTags: ['bullet_hose', 'healer', 'cc_catch'],
    baseTips: 'Spectral Wall (3) coupe l\'équipe ennemie en deux et étourdit au niveau max. Votre Medicinal Specter (2) soigne en % des PV max et donne une énorme cadence de tir.',
    builds: [
      {
        id: 'mcginnis_siege_fortress',
        name: 'Forteresse de Siège & Minigun',
        subtitle: 'Mur tactique + Soin de zone et Destruction d\'objectifs',
        playstyle: 'Contrôlez la lane avec Spectral Wall et Medicinal Specter, et faites fondre les Guardians/Walkers en quelques secondes avec votre Minigun.',
        recommendedForLanes: ['duo', 'solo'],
        abilitiesOrder: ['2', '3', '1', '4'],
        abilitiesDetails: [
          { key: '2', name: 'Vaporisateur médicinal (Medicinal Specter)', description: 'Totem qui soigne en % PV et booste la cadence de tir.', priorityTip: 'MAXER EN 1ER pour tenir votre lane indéfiniment.' },
          { key: '3', name: 'Mur spectral (Spectral Wall)', description: 'Mur bloquant qui retire de la stamina et étourdit.', priorityTip: 'Vous pouvez réactiver (3) pour faire surgir le mur plus tôt !' },
          { key: '1', name: 'Minitourelle (Mini Turret)', description: 'Tourelles qui appliquent les effets Spirituels (Slow, Suppressor).', priorityTip: 'Idéales pour couvrir vos flancs.' },
          { key: '4', name: 'Tir de barrage (Heavy Barrage)', description: 'Pluie de roquettes à longue portée.', priorityTip: 'Détruit les vagues et les ennemis coincés derrière un mur.' },
        ],
        phases: {
          early: ['monster_rounds', 'rapid_rounds', 'extra_stamina', 'extra_regen'],
          mid: ['active_reload', 'bullet_lifesteal', 'suppressor', 'fleetfoot'],
          late: ['tesla_bullets', 'burst_fire', 'toxic_bullets', 'crippling_headshot', 'leech'],
          situational: ['superior_stamina', 'debuff_remover', 'bullet_resilience', 'healbane'],
        },
        laneTips: {
          solo: 'Vous n\'avez que 2 barres de Stamina de base : achetez Extra Stamina très tôt !',
          duo: 'Un Spectral Wall placé derrière un ennemi avancé lui coupe toute retraite.',
          yellow_purple: 'Avec Monster Rounds, vous prenez le Guardian adverse à la moindre absence.',
          orange_blue: 'Votre soin (2) maintient votre partenaire à 100% PV en permanence.',
        },
      },
    ],
  },

  // ================= 18. KELVIN =================
  {
    id: 'kelvin',
    name: 'Kelvin',
    role: 'Cryomancien de Contrôle & Support Aérien',
    archetype: 'Control / Support',
    accentColor: '#22d3ee',
    avatarBg: 'from-cyan-900/80 via-sky-950 to-slate-950',
    threatTags: ['healer', 'cc_catch', 'tank_frontline'],
    baseTips: 'Arctic Beam (3) ralentit à la fois le déplacement et la cadence de tir ennemie de 80%. Frozen Shelter (4) sauve toute votre équipe et soigne massivement.',
    builds: [
      {
        id: 'kelvin_arctic_beam',
        name: 'Cryomancien Arctic Beam & Grenades de Soin',
        subtitle: 'Ralentissement total + Soin de groupe et Dôme de Glace',
        playstyle: 'Patinez dans les airs avec Ice Path (2), soignez vos alliés tout en blessant les ennemis avec Frost Grenade (1) et neutralisez les tireurs avec Arctic Beam (3).',
        recommendedForLanes: ['duo', 'solo'],
        abilitiesOrder: ['1', '3', '2', '4'],
        abilitiesDetails: [
          { key: '1', name: 'Grenade de givre (Frost Grenade)', description: 'Grenade qui blesse les ennemis et soigne les alliés (niveau 2).', priorityTip: 'MAXER EN 1ER pour le soin et les dégâts de zone.' },
          { key: '3', name: 'Rayon arctique (Arctic Beam)', description: 'Rayon de glace qui se propage aux ennemis proches.', priorityTip: 'Détruit la cadence de tir des carrys.' },
          { key: '2', name: 'Voie glacée (Ice Path)', description: 'Crée une piste de glace aérienne pour vous et vos alliés.', priorityTip: 'Permet de monter chercher Vindicta ou Grey Talon dans le ciel.' },
          { key: '4', name: 'Dôme gelé (Frozen Shelter)', description: 'Dôme de glace impénétrable qui régénère massivement.', priorityTip: 'Peut être désactivé à tout moment.' },
        ],
        phases: {
          early: ['mystic_burst', 'extra_charge', 'sprint_boots', 'extra_regen'],
          mid: ['suppressor', 'healbane', 'fleetfoot', 'enduring_speed'],
          late: ['rapid_recharge', 'improved_burst', 'superior_cooldown', 'spirit_resilience', 'boundless_spirit'],
          situational: ['knockdown', 'debuff_remover', 'bullet_resilience', 'curse'],
        },
        laneTips: {
          solo: 'Dès que Frost Grenade est niveau 2, lancez-la à vos pieds au corps-à-corps : elle vous soigne ET blesse l\'ennemi.',
          duo: 'Un des meilleurs héros de Duo lane du jeu grâce au soin et au ralentissement d\'Arctic Beam.',
          yellow_purple: 'Ice Path vous permet de fuir n\'importe quel gank.',
          orange_blue: 'Traversez la carte sur votre piste de glace pour voler l\'Urne.',
        },
      },
    ],
  },
  ...[
    {
      id: 'viscous',
      name: 'Viscous',
      role: 'Tank Gluant, Sauvetage Cube & Contrôle',
      archetype: 'Control / Support' as const,
      accentColor: '#4ade80',
      threatTags: ['tank_frontline', 'healer', 'cc_catch'] as ThreatTag[],
      baseTips: 'Le Cube (2) purge tous les effets négatifs et régénère massivement. Puddle Punch (3) projette les ennemis dans les airs.',
      s1: 'Éclaboussure (Splatter)',
      s2: 'Le Cube (The Cube)',
      s3: 'Poing de flaque (Puddle Punch)',
      s4: 'Boule gluante (Goo Ball)',
      early: ['mystic_burst', 'extra_charge', 'extra_regen', 'sprint_boots'],
      mid: ['improved_burst', 'spirit_lifesteal', 'suppressor', 'enduring_speed'],
      late: ['rapid_recharge', 'boundless_spirit', 'superior_cooldown', 'spirit_resilience'],
    },
    {
      id: 'ivy',
      name: 'Ivy',
      role: 'Gargouille de Soutien, Lien Vital & Bombardement',
      archetype: 'Control / Support' as const,
      accentColor: '#84cc16',
      threatTags: ['flier_mobility', 'healer', 'bullet_hose'] as ThreatTag[],
      baseTips: 'Stone Form (3) vous rend invulnérable, vous soigne et étourdit autour de vous. Watcher\'s Covenant (2) partage le vol de vie et la cadence avec votre allié.',
      s1: 'Bombe de ronces (Kudzu Bomb)',
      s2: 'Pacte de la sentinelle (Watcher\'s Covenant)',
      s3: 'Forme de pierre (Stone Form)',
      s4: 'Largage aérien (Air Drop)',
      early: ['rapid_rounds', 'monster_rounds', 'extra_stamina', 'extra_regen'],
      mid: ['tesla_bullets', 'bullet_lifesteal', 'fleetfoot', 'slowing_bullets'],
      late: ['burst_fire', 'toxic_bullets', 'crippling_headshot', 'leech'],
    },
    {
      id: 'dynamo',
      name: 'Dynamo',
      role: 'Initiateur Trou Noir & Soigneur d\'Équipe',
      archetype: 'Control / Support' as const,
      accentColor: '#38bdf8',
      threatTags: ['cc_catch', 'healer', 'tank_frontline'] as ThreatTag[],
      baseTips: 'Quantum Entanglement (2) rend toute votre équipe brièvement intouchable. Singularity (4) aspire et bloque tous les ennemis proches.',
      s1: 'Impulsion cinétique (Kinetic Pulse)',
      s2: 'Intrication quantique (Quantum Entanglement)',
      s3: 'Aurore régénérante (Rejuvenating Aurora)',
      s4: 'Singularité (Singularity)',
      early: ['high_velocity_mag', 'extra_regen', 'sprint_boots', 'mystic_reach'],
      mid: ['kinetic_dash', 'improved_cooldown', 'combat_barrier', 'enduring_speed'],
      late: ['superior_cooldown', 'unstoppable', 'duration_extender', 'boundless_spirit'],
    },
    {
      id: 'mirage',
      name: 'Mirage',
      role: 'Duelliste Djinn, Tornade & Téléportation',
      archetype: 'Assassin' as const,
      accentColor: '#f59e0b',
      threatTags: ['cc_catch', 'bullet_hose', 'sniper_poke'] as ThreatTag[],
      baseTips: 'Tornado (1) vous rend invulnérable tout en soulevant les ennemis. Djinn\'s Mark (3) multiplie ses dégâts à chaque tir espacé.',
      s1: 'Tornade (Tornado)',
      s2: 'Scarabées de feu (Fire Scarabs)',
      s3: 'Marque du Djinn (Djinn\'s Mark)',
      s4: 'Voyageur (Traveler)',
      early: ['high_velocity_mag', 'headshot_booster', 'extra_stamina', 'restorative_shot'],
      mid: ['mystic_shot', 'toxic_bullets', 'active_reload', 'bullet_lifesteal'],
      late: ['headhunter', 'crippling_headshot', 'burst_fire', 'leech'],
    },
    {
      id: 'calico',
      name: 'Calico',
      role: 'Assassine Féline Furtive & Embuscade',
      archetype: 'Assassin' as const,
      accentColor: '#f472b6',
      threatTags: ['close_assassin', 'spirit_burst', 'healer'] as ThreatTag[],
      baseTips: 'Bondissez au corps-à-corps, utilisez votre ultime pour devenir intouchable et ressortez avec votre forme féline.',
      s1: 'Bombes lugubres (Gloom Bombs)',
      s2: 'Entaille bondissante (Leaping Slash)',
      s3: 'Ava (Ava)',
      s4: 'Retour dans les ombres (Return to Shadows)',
      early: ['close_quarters', 'spirit_strike', 'extra_regen', 'extra_stamina'],
      mid: ['kinetic_dash', 'spirit_lifesteal', 'slowing_hex', 'combat_barrier'],
      late: ['improved_burst', 'superior_cooldown', 'boundless_spirit', 'ethereal_shift'],
    },
    {
      id: 'vyper',
      name: 'Vyper',
      role: 'Tireuse Glissante à Cadence Extrême & Pétrification',
      archetype: 'Assassin' as const,
      accentColor: '#a3e635',
      threatTags: ['bullet_hose', 'close_assassin', 'cc_catch'] as ThreatTag[],
      baseTips: 'Vous avez des munitions infinies ou une résistance accrue pendant vos glissades (Slide) ! Bola (4) pétrifie les cibles.',
      s1: 'Dague empoisonnée (Screwjab Dagger)',
      s2: 'Venin mortel (Lethal Venom)',
      s3: 'Glissade reptilienne (Slither)',
      s4: 'Bola pétrifiante (Petrifying Bola)',
      early: ['close_quarters', 'rapid_rounds', 'extra_stamina', 'sprint_boots'],
      mid: ['burst_fire', 'bullet_lifesteal', 'fleetfoot', 'slowing_bullets'],
      late: ['superior_stamina', 'crippling_headshot', 'glass_cannon', 'unstoppable'],
    },
    {
      id: 'holliday',
      name: 'Holliday',
      role: 'Shérif Tireuse d\'Élite, Tonneaux Explosifs & Lasso',
      archetype: 'Sniper / Pick' as const,
      accentColor: '#fb923c',
      threatTags: ['sniper_poke', 'cc_catch', 'spirit_burst'] as ThreatTag[],
      baseTips: 'Crack Shot (3) garantit un tir critique ralentissant. Bounce Pad (2) vous propulse et vous permet de capturer un ennemi au Lasso (4).',
      s1: 'Tonneau de poudre (Powder Keg)',
      s2: 'Tremplin (Bounce Pad)',
      s3: 'Tir de maître (Crack Shot)',
      s4: 'Lasso spirituel (Spirit Lasso)',
      early: ['high_velocity_mag', 'headshot_booster', 'extra_stamina', 'mystic_burst'],
      mid: ['mystic_shot', 'headhunter', 'slowing_bullets', 'superior_stamina'],
      late: ['crippling_headshot', 'improved_burst', 'sharpshooter', 'superior_cooldown'],
    },
    {
      id: 'sinclair',
      name: 'Sinclair',
      role: 'Illusionniste Astral, Polymorphe & Copie d\'Ultime',
      archetype: 'Artillery Spirit' as const,
      accentColor: '#c084fc',
      threatTags: ['spirit_burst', 'cc_catch', 'sniper_poke'] as ThreatTag[],
      baseTips: 'Vexing Bolt (1) inflige des dégâts massifs redirigés par votre Assistant (2). Rabbit Hex (3) transforme les ennemis en lapin et Audience Participation (4) vole l\'ultime adverse !',
      s1: 'Éclair vexant (Vexing Bolt)',
      s2: 'Assistant spectral (Spectral Assistant)',
      s3: 'Malédiction du lapin (Rabbit Hex)',
      s4: 'Participation du public (Audience Participation)',
      early: ['mystic_burst', 'high_velocity_mag', 'extra_regen', 'sprint_boots'],
      mid: ['mystic_shot', 'slowing_hex', 'improved_cooldown', 'spirit_lifesteal'],
      late: ['improved_burst', 'boundless_spirit', 'superior_cooldown', 'mystic_reverb'],
    },
    {
      id: 'baba',
      name: 'Baba',
      role: 'Sorcière Spirituelle & Contrôle de Zone',
      archetype: 'Control / Support' as const,
      accentColor: '#f87171',
      threatTags: ['spirit_burst', 'cc_catch', 'healer'] as ThreatTag[],
      baseTips: 'Contrôlez l\'espace avec vos maléfices de zone et soutenez votre partenaire de lane avec vos barrières et ralentissements.',
      s1: 'Maléfice (Spell 1)',
      s2: 'Protection (Spell 2)',
      s3: 'Enchantement (Spell 3)',
      s4: 'Grand Rituel (Ultimate 4)',
      early: ['mystic_burst', 'extra_regen', 'sprint_boots', 'hollow_point_ward'],
      mid: ['suppressor', 'spirit_lifesteal', 'improved_cooldown', 'enchanters_barrier'],
      late: ['improved_burst', 'superior_cooldown', 'boundless_spirit', 'spirit_resilience'],
    },
    {
      id: 'rem',
      name: 'Rem',
      role: 'Mage Cosmique, Mobilité & Rafale Spirituelle',
      archetype: 'Artillery Spirit' as const,
      accentColor: '#60a5fa',
      threatTags: ['spirit_burst', 'flier_mobility', 'cc_catch'] as ThreatTag[],
      baseTips: 'Harcelez à moyenne portée avec vos projectiles spirituels et utilisez votre mobilité pour esquiver les contrôles.',
      s1: 'Étoile filante (Spell 1)',
      s2: 'Bond astral (Spell 2)',
      s3: 'Aura lunaire (Spell 3)',
      s4: 'Nébuleuse (Ultimate 4)',
      early: ['mystic_burst', 'extra_charge', 'extra_stamina', 'sprint_boots'],
      mid: ['quicksilver_reload', 'spirit_lifesteal', 'slowing_hex', 'improved_cooldown'],
      late: ['improved_burst', 'boundless_spirit', 'superior_cooldown', 'ethereal_shift'],
    },
    {
      id: 'solomon',
      name: 'Solomon',
      role: 'Stratège de Frontline, Soutien & Contrôle',
      archetype: 'Bruiser / Tank' as const,
      accentColor: '#facc15',
      threatTags: ['tank_frontline', 'cc_catch', 'healer'] as ThreatTag[],
      baseTips: 'Absorbez la pression en première ligne et punissez les ennemis qui s\'avancent trop sur votre lane.',
      s1: 'Frappe tactique (Spell 1)',
      s2: 'Bastion (Spell 2)',
      s3: 'Décret (Spell 3)',
      s4: 'Jugement (Ultimate 4)',
      early: ['monster_rounds', 'extra_regen', 'extra_health', 'sprint_boots'],
      mid: ['combat_barrier', 'spirit_lifesteal', 'enduring_speed', 'suppressor'],
      late: ['bullet_resilience', 'spirit_resilience', 'unstoppable', 'leech'],
    },
    {
      id: 'paige',
      name: 'Paige',
      role: 'Érudite Occulte, Grimoire & Burst Spirituel',
      archetype: 'Artillery Spirit' as const,
      accentColor: '#fb923c',
      threatTags: ['spirit_burst', 'sniper_poke', 'cc_catch'] as ThreatTag[],
      baseTips: 'Utilisez la portée de vos incantations pour zoner les adversaires et réduire leur résistance spirituelle.',
      s1: 'Page incandescente (Spell 1)',
      s2: 'Sceau mystique (Spell 2)',
      s3: 'Lecture arcanique (Spell 3)',
      s4: 'Chapitre final (Ultimate 4)',
      early: ['mystic_burst', 'hollow_point_ward', 'extra_regen', 'sprint_boots'],
      mid: ['mystic_vulnerability', 'enchanters_barrier', 'improved_cooldown', 'spirit_lifesteal'],
      late: ['improved_burst', 'boundless_spirit', 'mystic_reverb', 'superior_cooldown'],
    },
    {
      id: 'billy',
      name: 'Billy',
      role: 'Bagarreur Agressif & Pression de Lane',
      archetype: 'Bruiser / Tank' as const,
      accentColor: '#ef4444',
      threatTags: ['tank_frontline', 'close_assassin', 'bullet_hose'] as ThreatTag[],
      baseTips: 'Forcez les combats rapprochés et utilisez votre résistance naturelle pour dominer les échanges.',
      s1: 'Impact (Spell 1)',
      s2: 'Ruée (Spell 2)',
      s3: 'Rage (Spell 3)',
      s4: 'Carnage (Ultimate 4)',
      early: ['close_quarters', 'restorative_shot', 'extra_regen', 'extra_stamina'],
      mid: ['kinetic_dash', 'combat_barrier', 'bullet_lifesteal', 'slowing_bullets'],
      late: ['burst_fire', 'bullet_resilience', 'spirit_resilience', 'unstoppable'],
    },
    {
      id: 'doorman',
      name: 'The Doorman',
      role: 'Gardien des Portails & Contrôleur',
      archetype: 'Control / Support' as const,
      accentColor: '#a855f7',
      threatTags: ['cc_catch', 'tank_frontline', 'spirit_burst'] as ThreatTag[],
      baseTips: 'Contrôlez les accès et surprenez vos adversaires avec des déplacements et blocages tactiques.',
      s1: 'Seuil (Spell 1)',
      s2: 'Verrouillage (Spell 2)',
      s3: 'Passage (Spell 3)',
      s4: 'Exclusion (Ultimate 4)',
      early: ['mystic_burst', 'extra_regen', 'extra_health', 'sprint_boots'],
      mid: ['slowing_hex', 'combat_barrier', 'improved_cooldown', 'enduring_speed'],
      late: ['superior_cooldown', 'bullet_resilience', 'spirit_resilience', 'knockdown'],
    },
    {
      id: 'drifter',
      name: 'Drifter',
      role: 'Franc-Tireur Nomade & Escarmoucheur',
      archetype: 'Sniper / Pick' as const,
      accentColor: '#eab308',
      threatTags: ['bullet_hose', 'sniper_poke', 'close_assassin'] as ThreatTag[],
      baseTips: 'Profitez de votre mobilité pour punir les cibles isolées et enchaîner les tirs à la tête.',
      s1: 'Tir rapide (Spell 1)',
      s2: 'Esquive (Spell 2)',
      s3: 'Traque (Spell 3)',
      s4: 'Duel (Ultimate 4)',
      early: ['high_velocity_mag', 'headshot_booster', 'extra_stamina', 'sprint_boots'],
      mid: ['active_reload', 'fleetfoot', 'slowing_bullets', 'bullet_lifesteal'],
      late: ['headhunter', 'crippling_headshot', 'burst_fire', 'glass_cannon'],
    },
    {
      id: 'victor',
      name: 'Victor',
      role: 'Commandant Lourd & Assaut',
      archetype: 'Bruiser / Tank' as const,
      accentColor: '#3b82f6',
      threatTags: ['tank_frontline', 'bullet_hose', 'cc_catch'] as ThreatTag[],
      baseTips: 'Tenez le centre de la lane et réduisez l\'armure des cibles prioritaires.',
      s1: 'Salve (Spell 1)',
      s2: 'Blindage (Spell 2)',
      s3: 'Ordre (Spell 3)',
      s4: 'Frappe orbitale (Ultimate 4)',
      early: ['monster_rounds', 'high_velocity_mag', 'extra_health', 'extra_regen'],
      mid: ['combat_barrier', 'bullet_lifesteal', 'slowing_bullets', 'enduring_speed'],
      late: ['crippling_headshot', 'bullet_resilience', 'spirit_resilience', 'unstoppable'],
    },
    {
      id: 'mina',
      name: 'Mina',
      role: 'Duelliste Agile & Burst Rapide',
      archetype: 'Assassin' as const,
      accentColor: '#ec4899',
      threatTags: ['close_assassin', 'spirit_burst', 'flier_mobility'] as ThreatTag[],
      baseTips: 'Entrez et sortez des combats en quelques secondes après avoir éliminé le tireur adverse.',
      s1: 'Lame vive (Spell 1)',
      s2: 'Pas d\'ombre (Spell 2)',
      s3: 'Marque (Spell 3)',
      s4: 'Exécution (Ultimate 4)',
      early: ['mystic_burst', 'spirit_strike', 'extra_stamina', 'sprint_boots'],
      mid: ['slowing_hex', 'spirit_lifesteal', 'quicksilver_reload', 'improved_cooldown'],
      late: ['improved_burst', 'boundless_spirit', 'ethereal_shift', 'superior_stamina'],
    },
    {
      id: 'silver',
      name: 'Silver',
      role: 'Tireur de Précision & Dégâts d\'Arme',
      archetype: 'Sniper / Pick' as const,
      accentColor: '#94a3b8',
      threatTags: ['sniper_poke', 'bullet_hose'] as ThreatTag[],
      baseTips: 'Gardez la distance maximale et punissez chaque erreur de placement avec vos tirs critiques.',
      s1: 'Tir perforant (Spell 1)',
      s2: 'Piège (Spell 2)',
      s3: 'Concentration (Spell 3)',
      s4: 'Balle d\'argent (Ultimate 4)',
      early: ['high_velocity_mag', 'headshot_booster', 'hollow_point_ward', 'extra_stamina'],
      mid: ['sharpshooter', 'pristine_emblem', 'slowing_bullets', 'fleetfoot'],
      late: ['headhunter', 'crippling_headshot', 'glass_cannon', 'silencer'],
    },
    {
      id: 'apollo',
      name: 'Apollo',
      role: 'Combattant Solaires & Rafale Hybride',
      archetype: 'Bruiser / Tank' as const,
      accentColor: '#f59e0b',
      threatTags: ['spirit_burst', 'bullet_hose', 'flier_mobility'] as ThreatTag[],
      baseTips: 'Combinez tirs soutenus et compétences lumineuses pour dominer les escarmouches.',
      s1: 'Rayon solaire (Spell 1)',
      s2: 'Ascension (Spell 2)',
      s3: 'Éclat (Spell 3)',
      s4: 'Supernova (Ultimate 4)',
      early: ['high_velocity_mag', 'mystic_burst', 'extra_stamina', 'extra_regen'],
      mid: ['mystic_shot', 'soul_shredder_bullets', 'spirit_lifesteal', 'fleetfoot'],
      late: ['improved_burst', 'crippling_headshot', 'boundless_spirit', 'leech'],
    },
    {
      id: 'celeste',
      name: 'Celeste',
      role: 'Enchanteresse Céleste & Soutien',
      archetype: 'Control / Support' as const,
      accentColor: '#38bdf8',
      threatTags: ['healer', 'spirit_burst', 'cc_catch'] as ThreatTag[],
      baseTips: 'Protégez votre allié en lane et interrompez les engagements ennemis.',
      s1: 'Lumière (Spell 1)',
      s2: 'Bénédiction (Spell 2)',
      s3: 'Entrave céleste (Spell 3)',
      s4: 'Sanctuaire (Ultimate 4)',
      early: ['mystic_burst', 'extra_regen', 'sprint_boots', 'extra_charge'],
      mid: ['enchanters_barrier', 'suppressor', 'improved_cooldown', 'enduring_speed'],
      late: ['superior_cooldown', 'boundless_spirit', 'spirit_resilience', 'knockdown'],
    },
    {
      id: 'graves',
      name: 'Graves',
      role: 'Mercenaire au Fusil & Burst Rapproché',
      archetype: 'Bruiser / Tank' as const,
      accentColor: '#ef4444',
      threatTags: ['bullet_hose', 'tank_frontline', 'close_assassin'] as ThreatTag[],
      baseTips: 'Dominez les combats à courte portée grâce à vos dégâts de chevrotine et votre robustesse.',
      s1: 'Chevrotine (Spell 1)',
      s2: 'Fumigène (Spell 2)',
      s3: 'Ruée (Spell 3)',
      s4: 'Charge explosive (Ultimate 4)',
      early: ['close_quarters', 'restorative_shot', 'extra_regen', 'extra_stamina'],
      mid: ['kinetic_dash', 'combat_barrier', 'bullet_lifesteal', 'slowing_bullets'],
      late: ['headhunter', 'crippling_headshot', 'bullet_resilience', 'unstoppable'],
    },
    {
      id: 'venator',
      name: 'Venator',
      role: 'Chasseur de Primes & Traqueur',
      archetype: 'Assassin' as const,
      accentColor: '#10b981',
      threatTags: ['close_assassin', 'cc_catch', 'bullet_hose'] as ThreatTag[],
      baseTips: 'Isolez les cibles affaiblies et empêchez leur fuite avec vos outils de chasse.',
      s1: 'Filet (Spell 1)',
      s2: 'Traque (Spell 2)',
      s3: 'Point faible (Spell 3)',
      s4: 'Mise à mort (Ultimate 4)',
      early: ['high_velocity_mag', 'close_quarters', 'extra_stamina', 'sprint_boots'],
      mid: ['slowing_hex', 'toxic_bullets', 'fleetfoot', 'bullet_lifesteal'],
      late: ['crippling_headshot', 'burst_fire', 'headhunter', 'leech'],
    },
    {
      id: 'violet',
      name: 'Violet',
      role: 'Mage d\'Énergie Violette & Dégâts Spirituels',
      archetype: 'Artillery Spirit' as const,
      accentColor: '#a855f7',
      threatTags: ['spirit_burst', 'sniper_poke'] as ThreatTag[],
      baseTips: 'Accumulez la puissance spirituelle pour décimer les lignes ennemies à distance.',
      s1: 'Orbe violet (Spell 1)',
      s2: 'Distorsion (Spell 2)',
      s3: 'Surcharge (Spell 3)',
      s4: 'Cataclysme (Ultimate 4)',
      early: ['mystic_burst', 'extra_charge', 'hollow_point_ward', 'sprint_boots'],
      mid: ['mystic_vulnerability', 'enchanters_barrier', 'improved_cooldown', 'spirit_lifesteal'],
      late: ['improved_burst', 'boundless_spirit', 'mystic_reverb', 'superior_cooldown'],
    },
    {
      id: 'rat_king',
      name: 'Rat King',
      role: 'Bagarreur Royal, Nuée de Rats & Bannière d\'Équipe',
      archetype: 'Bruiser / Tank' as const,
      accentColor: '#b45309',
      threatTags: ['tank_frontline', 'spirit_burst', 'cc_catch'] as ThreatTag[],
      baseTips: 'Apparat royal (3) vous donne une barrière qui renvoie des balles : engagez quand elle est active. Gloire à la Ratannie ! (4) rend vos alliés proches insensibles aux ralentissements et réduit leurs dégâts subis.',
      s1: 'Grenade de ferraille (Scrap Grenade)',
      s2: 'Horde de rats (Rat Swarm)',
      s3: 'Apparat royal (Royal Pestments)',
      s4: 'Gloire à la Ratannie ! (Rule, Ratannia!)',
      early: ['high_velocity_mag', 'monster_rounds', 'extra_health', 'sprint_boots'],
      mid: ['pristine_emblem', 'enduring_speed', 'fleetfoot', 'improved_cooldown'],
      late: ['spirit_resilience', 'superior_cooldown', 'leech', 'unstoppable'],
    },
    {
      id: 'deadman_danny',
      name: 'Deadman Danny',
      role: 'Tireur Volant au Jetpack & Missiles Spirituels',
      archetype: 'Sniper / Pick' as const,
      accentColor: '#f59e0b',
      threatTags: ['flier_mobility', 'sniper_poke', 'cc_catch'] as ThreatTag[],
      baseTips: 'Posez Salve Strix (1) puis achevez les cibles marquées avec un tir chargé. Le jetpack (2) surchauffe : prévoyez votre chute explosive au milieu des ennemis.',
      s1: 'Salve Strix (Strix Salvo)',
      s2: 'Chimère 1re gén. (Chimera Mk1)',
      s3: 'Largage de kérosène (Jettison Fuel)',
      s4: 'Affaire conclue (Close The Deal)',
      early: ['high_velocity_mag', 'headshot_booster', 'extra_stamina', 'extra_charge'],
      mid: ['quicksilver_reload', 'slowing_bullets', 'enduring_speed', 'mystic_vulnerability'],
      late: ['sharpshooter', 'crippling_headshot', 'superior_cooldown', 'boundless_spirit'],
    },
  ].map((h) => ({
    id: h.id,
    name: h.name,
    role: h.role,
    archetype: h.archetype,
    accentColor: h.accentColor,
    avatarBg: 'from-slate-900 via-zinc-900 to-slate-950',
    threatTags: h.threatTags,
    baseTips: h.baseTips,
    builds: [
      {
        id: `${h.id}_meta_build`,
        name: `Build Méta ${h.name} (Polyvalent)`,
        subtitle: h.role,
        playstyle: h.baseTips,
        recommendedForLanes: ['duo', 'solo'] as LaneMode[],
        abilitiesOrder: ['1', '3', '2', '4'] as ('1' | '2' | '3' | '4')[],
        abilitiesDetails: [
          { key: '1' as const, name: h.s1, description: 'Compétence principale de dégâts et de contrôle de vague.', priorityTip: 'MAXER EN 1ER pour dominer la lane.' },
          { key: '3' as const, name: h.s3, description: 'Compétence clé de synergie et d\'amplification.', priorityTip: 'Maximiser en 2e pour le pic de puissance Mid Game.' },
          { key: '2' as const, name: h.s2, description: 'Outil de mobilité, survie ou soutien.', priorityTip: 'Gardez-le pour esquiver ou engager.' },
          { key: '4' as const, name: h.s4, description: 'Compétence Ultime à fort impact en combat d\'équipe.', priorityTip: 'Utilisez-la sur les objectifs et en 2v2.' },
        ],
        phases: {
          early: h.early,
          mid: h.mid,
          late: h.late,
          situational: ['debuff_remover', 'healbane', 'knockdown', 'reactive_barrier'],
        },
        laneTips: {
          solo: h.baseTips,
          duo: `Coordonnez vos compétences avec votre partenaire de lane pour punir les cibles avancées.`,
          yellow_purple: 'Surveillez les rotations adverses et gérez votre Stamina.',
          orange_blue: 'Poussez la vague avant d\'aider sur l\'Urne ou les camps neutres.',
        },
      },
    ],
  })),
];

// ================= BUILDS MÉTA GÉNÉRÉS (statistiques haut rang, npm run update-builds) =================
type AbilityKey = '1' | '2' | '3' | '4';

interface GeneratedBuild {
  kind: 'stats' | 'published';
  sourceName?: string; // title of the published build, as written by its author
  winRate: number;
  matches: number;
  badgeMin: number;
  abilitiesOrder?: AbilityKey[];
  phases: HeroBuildArchetype['phases'];
}

interface GeneratedHeroMeta {
  matches: number;
  winRate: number;
  badgeMin: number;
  abilities: {
    key: AbilityKey;
    nameFr: string;
    nameEn: string;
    descriptionFr?: string;
    descriptionEn?: string;
    nameIt?: string; // since 1.4.2, see GeneratedCatalogItem
    descriptionIt?: string;
    icon?: string; // official icon (public/icons/abilities/api)
  }[];
  builds: GeneratedBuild[];
  /** itemId -> [share of the games where it was bought, smoothed win rate, average buy time (s)] */
  itemStats?: Record<string, [number, number, number]>;
}

const generatedHeroes = () =>
  (getMetaData() as unknown as { heroes: Record<string, GeneratedHeroMeta> }).heroes ?? {};

const BADGE_LABELS: Record<number, string> = { 81: 'Oracle+', 71: 'Archon+', 51: 'Ritualist+' };

/** Rank bracket of the generated statistics ("Oracle+"). */
export const rankLabel = (badgeMin: number, lang: Lang) =>
  BADGE_LABELS[badgeMin] ?? { fr: 'tous rangs', en: 'all ranks', it: 'tutti i ranghi' }[lang];

/** "47,5 %" / "47.5%" / "47,5%" */
export const formatPercent = (x: number, lang: Lang) => {
  const value = (x * 100).toFixed(1);
  return { fr: `${value.replace('.', ',')} %`, en: `${value}%`, it: `${value.replace('.', ',')}%` }[lang];
};

const formatCount = (n: number, lang: Lang) => n.toLocaleString({ fr: 'fr-FR', en: 'en-US', it: 'it-IT' }[lang]);

const META_TEXT = {
  fr: {
    statsTitle: (rank: string) => `Méta ${rank} — objets les plus achetés`,
    statsSubtitle: (matches: string, rank: string, days: number, wr: string) =>
      `${matches} parties ${rank} sur ${days} jours • ${wr} de victoires pour le héros`,
    publishedTitle: (wr: string) => `Meilleur build publié — ${wr} de victoires`,
    publishedSubtitle: (name: string, matches: string, rank: string) => `« ${name} » • ${matches} parties ${rank}`,
    maxTip: (rank: number, label: string) => `MAXER EN ${['1ER', '2E', '3E', '4E'][rank] ?? '4E'} (ordre des joueurs ${label}).`,
    // Hand-written tips about the max order would contradict the real data
    maxOrderTip: /max|1er|2e|premier|second/i,
  },
  en: {
    statsTitle: (rank: string) => `${rank} meta — most bought items`,
    statsSubtitle: (matches: string, rank: string, days: number, wr: string) =>
      `${matches} ${rank} games over ${days} days • hero win rate ${wr}`,
    publishedTitle: (wr: string) => `Best published build — ${wr} win rate`,
    publishedSubtitle: (name: string, matches: string, rank: string) => `"${name}" • ${matches} ${rank} games`,
    maxTip: (rank: number, label: string) => `MAX ${['1ST', '2ND', '3RD', '4TH'][rank] ?? '4TH'} (order played by ${label} players).`,
    maxOrderTip: /max|1st|2nd|first|second/i,
  },
  it: {
    statsTitle: (rank: string) => `Meta ${rank} — oggetti più comprati`,
    statsSubtitle: (matches: string, rank: string, days: number, wr: string) =>
      `${matches} partite ${rank} in ${days} giorni • ${wr} di vittorie per l'eroe`,
    publishedTitle: (wr: string) => `Miglior build pubblicata — ${wr} di vittorie`,
    publishedSubtitle: (name: string, matches: string, rank: string) => `"${name}" • ${matches} partite ${rank}`,
    maxTip: (rank: number, label: string) => `MAX ${['1°', '2°', '3°', '4°'][rank] ?? '4°'} (ordine dei giocatori ${label}).`,
    maxOrderTip: /max|massim|1°|2°|prim[oa]|second[oa]/i,
  },
};

/** Official name of an ability in the interface language, from the generated data. */
function officialAbilityName(a: GeneratedHeroMeta['abilities'][number], lang: Lang): string {
  if (lang === 'it') return a.nameIt ?? a.nameEn;
  if (lang === 'en') return a.nameEn;
  return a.nameFr !== a.nameEn ? `${a.nameFr} (${a.nameEn})` : a.nameFr;
}

function withMetaBuilds(hero: DeadlockHero, lang: Lang): DeadlockHero {
  const meta = generatedHeroes()[hero.id];
  const base = hero.builds[0];
  if (!meta || meta.builds.length === 0 || !base) return hero;

  const text = META_TEXT[lang];
  const windowDays = (getMetaData() as { windowDays?: number }).windowDays ?? 30;
  // Les héros sans build écrit à la main avaient des noms de sorts inventés : on prend les noms officiels
  const isGenericHero = base.id.endsWith('_meta_build');
  const baseDetails: AbilityUpgradeInfo[] = isGenericHero
    ? meta.abilities.map((a) => ({
        key: a.key,
        name: officialAbilityName(a, lang),
        description: { fr: a.descriptionFr, en: a.descriptionEn, it: a.descriptionIt || a.descriptionEn }[lang] || '',
        priorityTip: '',
      }))
    : base.abilitiesDetails;

  const generated: HeroBuildArchetype[] = meta.builds.map((b) => {
    const order = b.abilitiesOrder && b.abilitiesOrder.length === 4 ? b.abilitiesOrder : base.abilitiesOrder;
    const rank = rankLabel(b.badgeMin, lang);
    const wr = formatPercent(b.winRate, lang);
    const matches = formatCount(b.matches, lang);
    const keepKnown = (ids: string[]) => ids.filter((id) => ITEMS_DB[id]);
    return {
      id: `${hero.id}_${b.kind}_meta`,
      name: b.kind === 'stats' ? text.statsTitle(rank) : text.publishedTitle(wr),
      subtitle:
        b.kind === 'stats'
          ? text.statsSubtitle(matches, rank, windowDays, wr)
          : text.publishedSubtitle(b.sourceName ?? '', matches, rank),
      playstyle: base.playstyle,
      recommendedForLanes: ['solo', 'duo'],
      abilitiesOrder: order,
      abilitiesDetails: baseDetails.map((d) => {
        const handTip = text.maxOrderTip.test(d.priorityTip) ? '' : d.priorityTip;
        return { ...d, priorityTip: `${text.maxTip(order.indexOf(d.key), rank)}${handTip ? ` ${handTip}` : ''}` };
      }),
      phases: {
        early: keepKnown(b.phases.early),
        mid: keepKnown(b.phases.mid),
        late: keepKnown(b.phases.late),
        situational: keepKnown(b.phases.situational),
      },
      laneTips: base.laneTips,
    };
  });

  const builds = isGenericHero ? generated : [...generated, ...hero.builds];
  // English, Italian: the current official ability names (the hand-written ones date from an older patch: Catalyst -> Napalm)
  const officialName = (key: AbilityKey) => {
    const a = meta.abilities.find((x) => x.key === key);
    return a && officialAbilityName(a, lang);
  };
  return {
    ...hero,
    // Un héros générique n'a qu'un build inventé : on le remplace par les builds réels
    builds:
      lang !== 'fr'
        ? builds.map((b) => ({
            ...b,
            abilitiesDetails: b.abilitiesDetails.map((d) => ({ ...d, name: officialName(d.key) ?? d.name })),
          }))
        : builds,
  };
}

/** Official icon of a hero's ability (downloaded by npm run update-builds), if any. */
export function getAbilityIcon(heroId: string, key: AbilityKey): string | undefined {
  return generatedHeroes()[heroId]?.abilities.find((a) => a.key === key)?.icon;
}

const TRANSLATIONS = {
  en: { heroes: EN_HEROES, genericBuild: EN_GENERIC_BUILD },
  it: { heroes: IT_HEROES, genericBuild: IT_GENERIC_BUILD },
};

/** Applies localizeGameNames to every text of an Italian hero text. */
function localizeHeroText(text: TranslatedHeroText): TranslatedHeroText {
  const l = localizeGameNames;
  return {
    role: l(text.role),
    baseTips: l(text.baseTips),
    builds:
      text.builds &&
      Object.fromEntries(
        Object.entries(text.builds).map(([id, b]) => [
          id,
          {
            name: l(b.name),
            subtitle: l(b.subtitle),
            playstyle: l(b.playstyle),
            abilities: Object.fromEntries(
              Object.entries(b.abilities).map(([k, a]) => [k, { description: l(a.description), priorityTip: l(a.priorityTip) }])
            ) as typeof b.abilities,
            laneTips: Object.fromEntries(Object.entries(b.laneTips).map(([k, v]) => [k, l(v)])) as typeof b.laneTips,
          },
        ])
      ),
    matchups:
      text.matchups &&
      Object.fromEntries(Object.entries(text.matchups).map(([id, m]) => [id, { summary: l(m.summary), laneRule: l(m.laneRule) }])),
  };
}

/** Text of a hand-written hero in English or Italian (deadlockData.en.ts / .it.ts); ability names keep their English part. */
function translateHero(hero: DeadlockHero, lang: 'en' | 'it'): DeadlockHero {
  const raw = TRANSLATIONS[lang].heroes[hero.id];
  const en = raw && lang === 'it' ? localizeHeroText(raw) : raw;
  const genericBuild = TRANSLATIONS[lang].genericBuild;
  const englishName = (name: string) => englishPart(name);
  return {
    ...hero,
    role: en?.role ?? hero.role,
    baseTips: en?.baseTips ?? hero.baseTips,
    builds: hero.builds.map((build) => {
      if (build.id.endsWith('_meta_build')) {
        return genericBuild(hero.name, en?.role ?? hero.role, en?.baseTips ?? hero.baseTips, build);
      }
      const b = en?.builds?.[build.id];
      return {
        ...build,
        name: b?.name ?? build.name,
        subtitle: b?.subtitle ?? build.subtitle,
        playstyle: b?.playstyle ?? build.playstyle,
        abilitiesDetails: build.abilitiesDetails.map((d) => ({
          ...d,
          name: englishName(d.name),
          description: b?.abilities[d.key]?.description ?? d.description,
          priorityTip: b?.abilities[d.key]?.priorityTip ?? d.priorityTip,
        })),
        laneTips: b?.laneTips ?? build.laneTips,
      };
    }),
    specificMatchups: hero.specificMatchups
      ? Object.fromEntries(
          Object.entries(hero.specificMatchups).map(([enemyId, m]) => [
            enemyId,
            { ...m, summary: en?.matchups?.[enemyId]?.summary ?? m.summary, laneRule: en?.matchups?.[enemyId]?.laneRule ?? m.laneRule },
          ])
        )
      : undefined,
  };
}

export const HEROES_DB: DeadlockHero[] = BASE_HEROES_DB.map((h) => withMetaBuilds(h, 'fr'));
const HEROES_BY_LANG: Record<Lang, DeadlockHero[]> = {
  fr: HEROES_DB,
  en: BASE_HEROES_DB.map((h) => withMetaBuilds(translateHero(h, 'en'), 'en')),
  it: BASE_HEROES_DB.map((h) => withMetaBuilds(translateHero(h, 'it'), 'it')),
};

/** Heroes in the interface language (same ids, builds and items as HEROES_DB). */
export const getHeroesDb = (lang: Lang) => HEROES_BY_LANG[lang];

export interface HeroItemStat {
  pickRate: number; // share of the hero's games where the item was bought
  winRate: number; // smoothed towards the hero's win rate
  buyTimeS: number; // average buy time
}

/** Statistics of an item on this hero, for the rank bracket of the meta build. */
export function getHeroItemStat(heroId: string, itemId: string): HeroItemStat | undefined {
  const row = generatedHeroes()[heroId]?.itemStats?.[itemId];
  return row ? { pickRate: row[0], winRate: row[1], buyTimeS: row[2] } : undefined;
}

/** Rank bracket, games and win rate of the hero in the generated statistics. */
export function getHeroMetaInfo(heroId: string): { badgeMin: number; matches: number; winRate: number } | undefined {
  const meta = generatedHeroes()[heroId];
  return meta ? { badgeMin: meta.badgeMin, matches: meta.matches, winRate: meta.winRate } : undefined;
}

// ================= TACTICAL COUNTER ENGINE =================
export interface TacticalRecommendation {
  priorityItems: {
    item: DeadlockItem;
    reasons: string[];
    urgency: 'Critique (En Face / Lane)' | 'Haute (Teamfight / Mid)' | 'Moyenne (Late Game)';
  }[];
  matchupAlerts: {
    enemyId: string;
    enemyName: string;
    enemyColor: string;
    isInMyLane: boolean;
    dangerLevel: 'Low' | 'Medium' | 'High' | 'Extreme';
    advice: string;
    keyRule: string;
  }[];
  laneStrategy: {
    laneTitle: string;
    modeTitle: string;
    economyTip: string;
    positioningTip: string;
    allySynergyTip?: string;
  };
}

type Urgency = TacticalRecommendation['priorityItems'][number]['urgency'];

/** Texts of the counter engine. Item names in the rules are the English ones in French and English (as in the shop search), the official Italian ones in Italian. */
const TACTICAL_TEXT = {
  fr: {
    counter: (enemy: string) => `Contre ${enemy}`,
    ccRule: (enemy: string) => `Attention aux contrôles de ${enemy} : gardez vos distances et prenez Reactive Barrier / Debuff Remover.`,
    airPokeRule: (enemy: string) => `Ne restez pas à découvert face au poke aérien de ${enemy}. Utilisez Knockdown ou du Bouclier Spirituel.`,
    healerRule: (enemy: string) => `Coupez la régénération de ${enemy} avec Healbane ou Toxic Bullets.`,
    archetype: (role: string) => `Archétype : ${role}`,
    blocksCc: (enemy: string) => `Bloque le CC/Hook de ${enemy}`,
    purges: (enemy: string) => `Purge les contrôles/bombes de ${enemy}`,
    ccImmunity: (enemy: string) => `Immunité aux CC contre ${enemy}`,
    antiHeal: (enemy: string) => `Anti-soin (-40%) contre ${enemy}`,
    toxic: (enemy: string) => `Saignement & -65% soin vs ${enemy}`,
    decay: (enemy: string) => `Malédiction anti-soin vs ${enemy}`,
    knockdown: (enemy: string) => `Fait tomber ${enemy} du ciel`,
    hex: (enemy: string) => `Silence la mobilité de ${enemy}`,
    spiritShield: (enemy: string) => `Bouclier Spirituel contre le burst de ${enemy}`,
    spiritResist: (enemy: string) => `Résistance Spirituelle vs ${enemy}`,
    bulletShield: (enemy: string) => `Bouclier Balistique vs ${enemy}`,
    metalSkin: (enemy: string) => `Immunité aux balles de ${enemy}`,
    returnFire: (enemy: string) => `Renvoie les balles de ${enemy}`,
    suppressor: (enemy: string) => `-25% Cadence de tir sur ${enemy}`,
    etherealShift: (enemy: string) => `Invulnérabilité contre le all-in de ${enemy}`,
    superiorStamina: (enemy: string) => `Mobilité aérienne face à ${enemy}`,
    soloDeny: 'Sécurise et deny les âmes en 1v1 Solo',
    soloSustain: 'Sustain autonome en lane Solo',
    duoPush: 'Contrôle du push en Duo 2v2',
    allyComboTip: (ally: string) =>
      `Synergie avec votre allié ${ally} : gardez vos sorts de burst/immobilisation (ex: Stake + Assassinate) pour enchaîner immédiatement sur l'engagement ou le CC de ${ally} !`,
    allyCombo: (ally: string) => `Combo dévastateur sur le contrôle de votre allié ${ally}`,
    allyDuoTip: (ally: string) =>
      `Synergie Duo avec ${ally} : alternez vos poussées de vagues et concentrez vos tirs sur la même cible dès qu'un ennemi utilise son dash.`,
  },
  en: {
    counter: (enemy: string) => `Counters ${enemy}`,
    ccRule: (enemy: string) => `Watch out for ${enemy}'s crowd control: keep your distance and get Reactive Barrier / Debuff Remover.`,
    airPokeRule: (enemy: string) => `Don't stay in the open against ${enemy}'s aerial poke. Use Knockdown or Spirit Shielding.`,
    healerRule: (enemy: string) => `Cut ${enemy}'s healing with Healbane or Toxic Bullets.`,
    archetype: (role: string) => `Archetype: ${role}`,
    blocksCc: (enemy: string) => `Blocks ${enemy}'s CC / hook`,
    purges: (enemy: string) => `Purges ${enemy}'s CC / bombs`,
    ccImmunity: (enemy: string) => `CC immunity against ${enemy}`,
    antiHeal: (enemy: string) => `Anti-heal (-40%) against ${enemy}`,
    toxic: (enemy: string) => `Bleed & -65% healing vs ${enemy}`,
    decay: (enemy: string) => `Anti-heal curse vs ${enemy}`,
    knockdown: (enemy: string) => `Knocks ${enemy} out of the sky`,
    hex: (enemy: string) => `Shuts down ${enemy}'s mobility`,
    spiritShield: (enemy: string) => `Spirit shield against ${enemy}'s burst`,
    spiritResist: (enemy: string) => `Spirit resist vs ${enemy}`,
    bulletShield: (enemy: string) => `Bullet shield vs ${enemy}`,
    metalSkin: (enemy: string) => `Bullet immunity against ${enemy}`,
    returnFire: (enemy: string) => `Reflects ${enemy}'s bullets`,
    suppressor: (enemy: string) => `-25% fire rate on ${enemy}`,
    etherealShift: (enemy: string) => `Invulnerability against ${enemy}'s all-in`,
    superiorStamina: (enemy: string) => `Air mobility against ${enemy}`,
    soloDeny: 'Secures and denies souls in a 1v1 solo lane',
    soloSustain: 'Self-sustain in a solo lane',
    duoPush: 'Wave push control in a 2v2 duo lane',
    allyComboTip: (ally: string) =>
      `Synergy with your ally ${ally}: keep your burst / root abilities (e.g. Stake + Assassinate) to follow up right away on ${ally}'s engage or CC!`,
    allyCombo: (ally: string) => `Devastating combo on your ally ${ally}'s crowd control`,
    allyDuoTip: (ally: string) =>
      `Duo synergy with ${ally}: take turns pushing the wave and focus the same target as soon as an enemy uses their dash.`,
  },
  // Item names in English here, replaced by the official Italian ones (localizeGameNames)
  it: withItalianGameNames({
    counter: (enemy: string) => `Counter contro ${enemy}`,
    ccRule: (enemy: string) => `Attenzione ai controlli di ${enemy}: tieni le distanze e prendi Reactive Barrier / Dispel Magic.`,
    airPokeRule: (enemy: string) => `Non restare allo scoperto contro il poke aereo di ${enemy}. Usa Knockdown o Spirit Shielding.`,
    healerRule: (enemy: string) => `Taglia le cure di ${enemy} con Healbane o Toxic Bullets.`,
    archetype: (role: string) => `Archetipo: ${role}`,
    blocksCc: (enemy: string) => `Blocca i controlli / l'uncino di ${enemy}`,
    purges: (enemy: string) => `Elimina i controlli / le bombe di ${enemy}`,
    ccImmunity: (enemy: string) => `Immunità ai controlli contro ${enemy}`,
    antiHeal: (enemy: string) => `Anti-cura (-40%) contro ${enemy}`,
    toxic: (enemy: string) => `Sanguinamento e -65% di cure contro ${enemy}`,
    decay: (enemy: string) => `Maledizione anti-cura contro ${enemy}`,
    knockdown: (enemy: string) => `Fa cadere ${enemy} dal cielo`,
    hex: (enemy: string) => `Blocca la mobilità di ${enemy}`,
    spiritShield: (enemy: string) => `Scudo spirituale contro il burst di ${enemy}`,
    spiritResist: (enemy: string) => `Resistenza spirituale contro ${enemy}`,
    bulletShield: (enemy: string) => `Scudo balistico contro ${enemy}`,
    metalSkin: (enemy: string) => `Immunità ai proiettili di ${enemy}`,
    returnFire: (enemy: string) => `Rimanda indietro i proiettili di ${enemy}`,
    suppressor: (enemy: string) => `-25% di cadenza di fuoco su ${enemy}`,
    etherealShift: (enemy: string) => `Invulnerabilità contro l'all-in di ${enemy}`,
    superiorStamina: (enemy: string) => `Mobilità aerea contro ${enemy}`,
    soloDeny: 'Assicura e nega le anime in un 1v1 in solitaria',
    soloSustain: 'Sustain autonomo in una corsia in solitaria',
    duoPush: "Controllo del push dell'ondata in un 2v2 in coppia",
    allyComboTip: (ally: string) =>
      `Sinergia con il tuo alleato ${ally}: tieni le tue abilità di burst / immobilizzazione (es. Stake + Assassinate) per seguire subito l'ingaggio o il controllo di ${ally}!`,
    allyCombo: (ally: string) => `Combo devastante sul controllo del tuo alleato ${ally}`,
    allyDuoTip: (ally: string) =>
      `Sinergia in coppia con ${ally}: alternatevi nello spingere l'ondata e concentrate i colpi sullo stesso bersaglio appena un nemico usa il suo scatto.`,
  }),
};

/** The same texts, with the game names replaced by the official Italian ones. */
function withItalianGameNames<T extends Record<string, string | ((arg: string) => string)>>(texts: T): T {
  return Object.fromEntries(
    Object.entries(texts).map(([key, text]) => [
      key,
      typeof text === 'function' ? (arg: string) => localizeGameNames(text(arg)) : localizeGameNames(text),
    ])
  ) as T;
}

export function generateTacticalPlan(
  myHeroId: string,
  buildId: string,
  laneColor: LaneColor,
  laneMode: LaneMode,
  laneEnemyIds: string[],
  teamEnemyIds: string[] = [],
  allyPartnerId: string | null = null,
  lang: Lang = 'fr'
): TacticalRecommendation {
  const heroes = getHeroesDb(lang);
  const items = getItemsDb(lang);
  const lanes = getLanes(lang);
  const text = TACTICAL_TEXT[lang];
  const myHero = heroes.find((h) => h.id === myHeroId) || heroes[0];
  const selectedBuild = myHero.builds.find((b) => b.id === buildId) || myHero.builds[0];
  const laneInfo = lanes.find((l) => l.id === laneColor) || lanes[0];

  const laneEnemies = laneEnemyIds
    .map((id) => heroes.find((h) => h.id === id))
    .filter((h): h is DeadlockHero => Boolean(h));

  const otherTeamEnemies = teamEnemyIds
    .filter((id) => !laneEnemyIds.includes(id))
    .map((id) => heroes.find((h) => h.id === id))
    .filter((h): h is DeadlockHero => Boolean(h));

  const allyHero = allyPartnerId ? heroes.find((h) => h.id === allyPartnerId) : null;

  const itemScores: Record<string, { score: number; reasons: string[]; urgency: Urgency }> = {};

  const addItemRecommendation = (itemId: string, score: number, reason: string, urgency: Urgency) => {
    if (!items[itemId]) return;
    if (!itemScores[itemId]) {
      itemScores[itemId] = { score: 0, reasons: [], urgency };
    }
    itemScores[itemId].score += score;
    if (!itemScores[itemId].reasons.includes(reason)) {
      itemScores[itemId].reasons.push(reason);
    }
    if (urgency === 'Critique (En Face / Lane)') {
      itemScores[itemId].urgency = 'Critique (En Face / Lane)';
    }
  };

  const matchupAlerts: TacticalRecommendation['matchupAlerts'] = [];

  const evaluateEnemy = (enemy: DeadlockHero, isInMyLane: boolean) => {
    const weight = isInMyLane ? 1.0 : 0.45;
    const prefix = isInMyLane ? `[LANE] ` : `[TEAM] `;
    const defaultUrgency: Urgency = isInMyLane ? 'Critique (En Face / Lane)' : 'Haute (Teamfight / Mid)';
    const name = enemy.name;

    const specific = myHero.specificMatchups?.[enemy.id];
    if (specific) {
      matchupAlerts.push({
        enemyId: enemy.id,
        enemyName: name,
        enemyColor: enemy.accentColor,
        isInMyLane,
        dangerLevel: specific.dangerLevel,
        advice: specific.summary,
        keyRule: specific.laneRule,
      });
      specific.mustBuyItems.forEach((itemId, idx) => {
        addItemRecommendation(
          itemId,
          Math.round((35 - idx * 5) * weight),
          `${prefix}${text.counter(name)}`,
          isInMyLane && idx === 0 ? 'Critique (En Face / Lane)' : 'Haute (Teamfight / Mid)'
        );
      });
    } else {
      const tags = enemy.threatTags;
      let danger: 'Low' | 'Medium' | 'High' | 'Extreme' = 'Medium';
      let rule = enemy.baseTips;

      if (tags.includes('cc_catch')) {
        danger = 'High';
        rule = text.ccRule(name);
      } else if (tags.includes('flier_mobility') && tags.includes('sniper_poke')) {
        danger = 'High';
        rule = text.airPokeRule(name);
      } else if (tags.includes('healer')) {
        danger = 'Medium';
        rule = text.healerRule(name);
      }

      matchupAlerts.push({
        enemyId: enemy.id,
        enemyName: name,
        enemyColor: enemy.accentColor,
        isInMyLane,
        dangerLevel: danger,
        advice: text.archetype(enemy.role),
        keyRule: rule,
      });
    }

    if (enemy.threatTags.includes('cc_catch')) {
      if (isInMyLane) {
        addItemRecommendation('reactive_barrier', 30, `[LANE] ${text.blocksCc(name)}`, 'Critique (En Face / Lane)');
      }
      addItemRecommendation('debuff_remover', Math.round(24 * weight), `${prefix}${text.purges(name)}`, defaultUrgency);
      addItemRecommendation('unstoppable', Math.round(18 * weight), `${prefix}${text.ccImmunity(name)}`, 'Moyenne (Late Game)');
    }
    if (enemy.threatTags.includes('healer')) {
      addItemRecommendation('healbane', Math.round(28 * weight), `${prefix}${text.antiHeal(name)}`, defaultUrgency);
      addItemRecommendation('toxic_bullets', Math.round(24 * weight), `${prefix}${text.toxic(name)}`, 'Haute (Teamfight / Mid)');
      addItemRecommendation('decay', Math.round(20 * weight), `${prefix}${text.decay(name)}`, defaultUrgency);
    }
    if (enemy.threatTags.includes('flier_mobility')) {
      addItemRecommendation('knockdown', Math.round(28 * weight), `${prefix}${text.knockdown(name)}`, 'Haute (Teamfight / Mid)');
      addItemRecommendation('slowing_hex', Math.round(26 * weight), `${prefix}${text.hex(name)}`, defaultUrgency);
    }
    if (enemy.threatTags.includes('spirit_burst') || enemy.threatTags.includes('sniper_poke')) {
      if (isInMyLane) {
        addItemRecommendation('spirit_shielding', 26, `[LANE] ${text.spiritShield(name)}`, 'Critique (En Face / Lane)');
      } else {
        addItemRecommendation('spirit_resilience', 18, `[TEAM] ${text.spiritResist(name)}`, 'Haute (Teamfight / Mid)');
      }
    }
    if (enemy.threatTags.includes('bullet_hose')) {
      if (isInMyLane) {
        addItemRecommendation('weapon_shielding', 22, `[LANE] ${text.bulletShield(name)}`, 'Critique (En Face / Lane)');
      }
      addItemRecommendation('metal_skin', Math.round(26 * weight), `${prefix}${text.metalSkin(name)}`, 'Haute (Teamfight / Mid)');
      addItemRecommendation('return_fire', Math.round(24 * weight), `${prefix}${text.returnFire(name)}`, defaultUrgency);
      addItemRecommendation('suppressor', Math.round(20 * weight), `${prefix}${text.suppressor(name)}`, defaultUrgency);
    }
    if (enemy.threatTags.includes('close_assassin')) {
      addItemRecommendation('ethereal_shift', Math.round(24 * weight), `${prefix}${text.etherealShift(name)}`, 'Haute (Teamfight / Mid)');
      addItemRecommendation('superior_stamina', Math.round(20 * weight), `${prefix}${text.superiorStamina(name)}`, 'Haute (Teamfight / Mid)');
    }
  };

  laneEnemies.forEach((e) => evaluateEnemy(e, true));
  otherTeamEnemies.forEach((e) => evaluateEnemy(e, false));

  // Lane & Ally Partner adjustments
  let allySynergyTip: string | undefined = undefined;
  if (laneMode === 'solo') {
    addItemRecommendation('high_velocity_mag', 15, text.soloDeny, 'Critique (En Face / Lane)');
    addItemRecommendation('extra_regen', 14, text.soloSustain, 'Critique (En Face / Lane)');
  } else {
    addItemRecommendation('monster_rounds', 14, text.duoPush, 'Critique (En Face / Lane)');
    if (allyHero) {
      if (allyHero.threatTags.includes('cc_catch') || allyHero.threatTags.includes('tank_frontline')) {
        allySynergyTip = text.allyComboTip(allyHero.name);
        if (myHero.id === 'vindicta') {
          addItemRecommendation('alchemical_fire', 22, text.allyCombo(allyHero.name), 'Haute (Teamfight / Mid)');
        }
      } else {
        allySynergyTip = text.allyDuoTip(allyHero.name);
      }
    }
  }

  // Tri déterministe (score, puis prix, puis id) : à ennemis identiques, la liste ne bouge jamais
  const priorityItems = Object.entries(itemScores)
    .sort(
      (a, b) =>
        b[1].score - a[1].score ||
        items[a[0]].cost - items[b[0]].cost ||
        a[0].localeCompare(b[0])
    )
    .slice(0, 6)
    .map(([itemId, data]) => ({
      item: items[itemId],
      reasons: data.reasons,
      urgency: data.urgency,
    }));

  const isOuterLane = laneColor === 'yellow' || laneColor === 'purple';

  return {
    priorityItems,
    matchupAlerts,
    laneStrategy: {
      laneTitle: `${laneInfo.name} — ${laneMode === 'solo' ? 'SOLO (1v1)' : 'DUO (2v2)'}`,
      modeTitle: laneInfo.tacticalNote,
      economyTip: laneMode === 'solo' ? selectedBuild.laneTips.solo : selectedBuild.laneTips.duo,
      positioningTip: isOuterLane ? selectedBuild.laneTips.yellow_purple : selectedBuild.laneTips.orange_blue,
      allySynergyTip,
    },
  };
}
