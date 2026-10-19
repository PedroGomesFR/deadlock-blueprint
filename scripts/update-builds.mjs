#!/usr/bin/env node
// Met à jour les builds méta (statistiques réelles haut rang) et le catalogue complet d'objets
// à partir de https://api.deadlock-api.com. À relancer après chaque patch : `npm run update-builds`.
//
// Sorties :
//   src/data/generated/itemsCatalog.json  — tous les objets de la boutique (noms, descriptions et stats FR/EN, prix,
//                                           palier, composants, icône)
//   src/data/generated/metaBuilds.json    — par héros : build « Méta » (objets les plus achetés en haut rang),
//                                           meilleur build publié (meilleur taux de victoire), ordre des sorts, et
//                                           stats de chaque objet (taux d'achat, de victoire, moment d'achat)
//   public/icons/items/api/<id>.png       — icônes officielles (jamais d'écrasement des PNG existants)
//   public/icons/abilities/api/<héros>_<touche>.png — icônes officielles des sorts (idem)
//
// Les deux JSON sont aussi téléchargés par l'application au démarrage (src/data/dataSource.ts) depuis la branche
// main : SCHEMA_VERSION doit changer dès que leur forme change, sinon les versions déjà installées les refusent.
// `--check` valide les fichiers existants sans rien télécharger (CI).

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.deadlock-api.com';
const OUT_DIR = path.join(ROOT, 'src', 'data', 'generated');
const API_ICON_DIR = path.join(ROOT, 'public', 'icons', 'items', 'api');
const ABILITY_ICON_DIR = path.join(ROOT, 'public', 'icons', 'abilities', 'api');
const LEGACY_ICON_DIR = path.join(ROOT, 'public', 'icons', 'items');

// Must match DATA_SCHEMA_VERSION in src/data/dataSource.ts
const SCHEMA_VERSION = 2;
const WINDOW_DAYS = 30;
// Badge moyen des deux équipes (dizaine = rang) : 81 = Oracle+, 71 = Archon+, 51 = Ritualist+, 0 = tous.
const BADGE_LADDER = [81, 71, 51, 0];
const BADGE_LABELS = { 81: 'Oracle+', 71: 'Archon+', 51: 'Ritualist+', 0: 'Tous rangs' };
const MIN_HERO_MATCHES = 3000; // parties minimum pour qu'un palier de rang soit retenu
const MIN_BUILD_MATCHES = 100; // parties minimum pour qu'un build publié soit retenu
const ANALYTICS_DELAY_MS = 350; // limite API : 200 requêtes / minute sur /v1/analytics

// Correspondance ids locaux historiques -> class_name Valve (stable même quand l'objet est renommé).
const LOCAL_ID_BY_CLASS = {
  upgrade_high_velocity_mag: 'high_velocity_mag',
  upgrade_headshot_booster: 'headshot_booster',
  upgrade_medic_bullets: 'restorative_shot',
  upgrade_non_player_bonus: 'monster_rounds',
  upgrade_rapid_rounds: 'rapid_rounds',
  upgrade_close_range: 'close_quarters',
  upgrade_active_reload: 'active_reload',
  upgrade_kinetic_sash: 'kinetic_dash',
  upgrade_slowing_bullets: 'slowing_bullets',
  upgrade_crackshot: 'mystic_shot',
  upgrade_tech_defense_shredders: 'soul_shredder_bullets',
  upgrade_fleetfoot_boots: 'fleetfoot',
  upgrade_sharpshooter: 'sharpshooter',
  upgrade_toxic_bullets: 'toxic_bullets',
  upgrade_pristine_emblem: 'pristine_emblem',
  upgrade_thermal_detonator: 'alchemical_fire',
  upgrade_chain_lightning: 'tesla_bullets',
  upgrade_headhunter: 'headhunter',
  upgrade_burst_fire: 'burst_fire',
  upgrade_banshee_slugs: 'crippling_headshot',
  upgrade_tech_overflow: 'spiritual_overflow',
  upgrade_glass_cannon: 'glass_cannon',
  upgrade_proc_silence: 'silencer',
  upgrade_endurance: 'extra_regen',
  upgrade_improved_stamina: 'extra_stamina',
  upgrade_sprint_booster: 'sprint_boots',
  upgrade_health: 'extra_health',
  upgrade_health_stimpak: 'healing_rite',
  upgrade_magic_shield: 'enchanters_barrier',
  upgrade_vex_barrier: 'reactive_barrier',
  upgrade_healbane: 'healbane',
  upgrade_debuff_reducer: 'debuff_reducer',
  upgrade_vampire: 'bullet_lifesteal',
  upgrade_health_stealing_magic: 'spirit_lifesteal',
  upgrade_cardio_calibrator: 'enduring_speed',
  upgrade_return_fire: 'return_fire',
  upgrade_superior_stamina: 'superior_stamina',
  upgrade_reduce_debuff_duration: 'debuff_remover',
  upgrade_metal_skin: 'metal_skin',
  upgrade_improved_bullet_armor: 'bullet_resilience',
  upgrade_tech_purge: 'spirit_resilience',
  upgrade_damage_recycler: 'leech',
  upgrade_unstoppable: 'unstoppable',
  upgrade_extra_charge: 'extra_charge',
  upgrade_magic_burst: 'mystic_burst',
  upgrade_magic_reach: 'mystic_reach',
  upgrade_acolytes_glove: 'spirit_strike',
  upgrade_quick_silver: 'quicksilver_reload',
  upgrade_suppressor: 'suppressor',
  upgrade_rupture: 'decay',
  upgrade_containment: 'slowing_hex',
  upgrade_arcane_extension: 'duration_extender',
  upgrade_magic_tempo: 'improved_cooldown',
  upgrade_rapid_recharge: 'rapid_recharge',
  upgrade_magic_shock: 'improved_burst',
  upgrade_target_stun: 'knockdown',
  upgrade_self_bubble: 'ethereal_shift',
  upgrade_magic_vulnerability: 'mystic_vulnerability',
  upgrade_magic_storm: 'surge_of_power',
  upgrade_cooldown_reduction: 'superior_cooldown',
  upgrade_boundless_spirit: 'boundless_spirit',
  upgrade_mystic_reverb: 'mystic_reverb',
};

// Fichiers d'icônes locaux dont le nom ne suit pas `<id>.png`
const LEGACY_ICON_FILE = { enchanters_barrier: 'enchanter_s_barrier.png' };

// Catégories standard du jeu (Lane / Mid / Late) : jamais considérées comme situationnelles
const STANDARD_CATEGORIES = new Set(['#Citadel_HeroBuilds_Lane', '#Citadel_HeroBuilds_MidGame', '#Citadel_HeroBuilds_LateGame']);
const SITUATIONAL_CATEGORY_RE = /situ|option|flex|swap|counter|contre|if you need|anti/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^the\s+/, '')
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const stripHtml = (s) =>
  (s || '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// La description d'un objet/sort est rangée sous `desc`, `active` ou `passive` selon son type
const describe = (d) => stripHtml(d?.desc || d?.active || d?.passive);

const formatStatValue = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

/** Stat lines of the shop tooltip ("+30% Max Ammo", "24s Cooldown"), in the language of `it`. */
function statLines(it) {
  const lines = [];
  for (const section of it.tooltip_sections || []) {
    for (const attr of section.section_attributes || []) {
      for (const name of [...(attr.elevated_properties || []), ...(attr.properties || [])]) {
        const p = it.properties?.[name];
        const label = stripHtml(p?.label);
        const value = Number(p?.value);
        if (!label || !Number.isFinite(value) || value === 0) continue;
        const sign = String(p.prefix || '').includes('{s:sign}') && value > 0 ? '+' : '';
        lines.push(`${sign}${formatStatValue(value)}${stripHtml(p.postfix)} ${label}`);
      }
    }
  }
  return [...new Set(lines)].slice(0, 5);
}

let lastAnalyticsCall = 0;

async function fetchJson(urlPath, params = {}, { analytics = false } = {}) {
  const url = new URL(urlPath, API);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (analytics) {
      const wait = lastAnalyticsCall + ANALYTICS_DELAY_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastAnalyticsCall = Date.now();
    }
    let res;
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (err) {
      if (attempt === 5) throw new Error(`Réseau indisponible pour ${url} : ${err.message}`);
      await sleep(2000 * attempt);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === 5) throw new Error(`HTTP ${res.status} pour ${url}`);
      await sleep(res.status === 429 ? 15000 : 3000 * attempt);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
    return res.json();
  }
  throw new Error(`Échec : ${url}`);
}

function assertFields(label, obj, fields) {
  const missing = fields.filter((f) => !(f in obj));
  if (missing.length > 0) {
    throw new Error(
      `Le schéma de l'API a changé (${label}) : champs manquants ${missing.join(', ')}. Adaptez scripts/update-builds.mjs.`
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Catalogue d'objets
// ---------------------------------------------------------------------------

function buildCatalog(itemsFr, itemsEn) {
  assertFields('items', itemsEn[0], ['id', 'class_name', 'name', 'item_slot_type', 'item_tier', 'cost', 'shopable', 'shop_image']);

  const frById = new Map(itemsFr.map((x) => [x.id, x]));
  const shop = itemsEn.filter((x) => x.shopable && x.item_tier >= 1 && x.item_tier <= 4);

  const idByClass = new Map();
  const usedIds = new Set();
  for (const it of shop) {
    let id = LOCAL_ID_BY_CLASS[it.class_name] || slugify(it.name);
    if (usedIds.has(id)) id = slugify(it.class_name.replace(/^upgrade_/, ''));
    usedIds.add(id);
    idByClass.set(it.class_name, id);
  }

  const items = {};
  for (const it of shop) {
    const id = idByClass.get(it.class_name);
    const fr = frById.get(it.id) || it;
    const nameFr = fr.name || it.name;
    const legacyFile = LEGACY_ICON_FILE[id] || `${id}.png`;
    items[id] = {
      id,
      apiId: it.id,
      className: it.class_name,
      nameFr,
      nameEn: it.name,
      category: it.item_slot_type,
      tier: it.item_tier,
      cost: it.cost,
      isActive: Boolean(it.is_active_item),
      upgradesFrom: (it.component_items || []).map((c) => idByClass.get(c)).filter(Boolean),
      descriptionFr: describe(fr.description).slice(0, 220),
      descriptionEn: describe(it.description).slice(0, 220),
      statsFr: statLines(fr),
      statsEn: statLines(it),
      shopImage: it.shop_image,
      icon: `./icons/items/api/${id}.png`,
      legacyIcon: existsSync(path.join(LEGACY_ICON_DIR, legacyFile)) ? `./icons/items/${legacyFile}` : undefined,
    };
  }

  const mappedLocal = new Set(Object.values(LOCAL_ID_BY_CLASS));
  const missingClasses = Object.keys(LOCAL_ID_BY_CLASS).filter((c) => !idByClass.has(c));
  return { items, byApiId: new Map(Object.values(items).map((x) => [x.apiId, x])), mappedLocal, missingClasses };
}

async function downloadIcons(items) {
  await fs.mkdir(API_ICON_DIR, { recursive: true });
  const queue = Object.values(items);
  let downloaded = 0;
  let failed = 0;
  const worker = async () => {
    while (queue.length > 0) {
      const it = queue.shift();
      const file = path.join(API_ICON_DIR, `${it.id}.png`);
      if (existsSync(file)) continue;
      try {
        const res = await fetch(it.shopImage);
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !type.includes('image')) throw new Error(`HTTP ${res.status} ${type}`);
        await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
        downloaded++;
      } catch (err) {
        failed++;
        it.icon = it.legacyIcon;
        console.warn(`  ⚠ Icône introuvable pour ${it.id} (${it.shopImage}) : ${err.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return { downloaded, failed };
}

/** Downloads the missing ability icons ({ file, url }); returns the files that could not be downloaded. */
async function downloadAbilityIcons(icons) {
  await fs.mkdir(ABILITY_ICON_DIR, { recursive: true });
  const queue = [...icons];
  const failed = new Set();
  const worker = async () => {
    while (queue.length > 0) {
      const { file, url } = queue.shift();
      if (existsSync(file)) continue;
      try {
        const res = await fetch(url);
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !type.includes('image')) throw new Error(`HTTP ${res.status} ${type}`);
        await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
      } catch (err) {
        failed.add(file);
        console.warn(`  ⚠ Icône de sort introuvable (${url}) : ${err.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return failed;
}

// ---------------------------------------------------------------------------
// 2. Builds par héros
// ---------------------------------------------------------------------------

const tierPhase = (tier) => (tier === 1 ? 'early' : tier === 2 ? 'mid' : 'late');

/** Per-item rows of the hero: share of matches where it was bought, smoothed win rate, average buy time. */
function itemRows(itemStats, catalog, heroMatches, heroWinRate) {
  return itemStats
    .map((s) => ({ s, item: catalog.byApiId.get(s.item_id) }))
    .filter((r) => r.item && r.s.matches > 0)
    .map((r) => ({
      ...r,
      pick: r.s.matches / heroMatches,
      // Taux de victoire lissé vers celui du héros pour ne pas surévaluer les objets rares
      wr: (r.s.wins + 300 * heroWinRate) / (r.s.matches + 300),
      buy: r.s.avg_buy_time_s ?? 0,
    }));
}

/**
 * Stats shown to explain a recommendation ("bought in 82 % of the games, 51 % wins"): itemId ->
 * [pick rate, smoothed win rate, average buy time in s], for the items bought in at least 2 % of the games.
 */
function compactItemStats(rows) {
  const out = {};
  for (const r of [...rows].sort((a, b) => b.pick - a.pick)) {
    if (r.pick < 0.02) continue;
    out[r.item.id] = [Math.round(r.pick * 1000) / 1000, Math.round(r.wr * 1000) / 1000, Math.round(r.buy)];
  }
  return out;
}

/** Build « Méta » : objets les plus achetés par les joueurs du rang choisi, triés par moment d'achat moyen. */
function buildFromItemStats(rows, heroWinRate) {

  const pickPhase = (tiers, minPick, max) => {
    const candidates = rows.filter((r) => tiers.includes(r.item.tier)).sort((a, b) => b.pick - a.pick);
    const chosen = candidates.filter((r) => r.pick >= minPick).slice(0, max);
    return chosen.length >= 3 ? chosen : candidates.slice(0, 3);
  };

  const early = pickPhase([1], 0.3, 6);
  const mid = pickPhase([2], 0.22, 6);
  const late = pickPhase([3, 4], 0.12, 7);
  const used = new Set([...early, ...mid, ...late].map((r) => r.item.id));
  const situational = rows
    .filter((r) => !used.has(r.item.id) && r.pick >= 0.04 && r.wr >= heroWinRate)
    .sort((a, b) => b.wr - a.wr)
    .slice(0, 6);

  const byBuyTime = (a, b) => a.buy - b.buy;
  return {
    early: early.sort(byBuyTime).map((r) => r.item.id),
    mid: mid.sort(byBuyTime).map((r) => r.item.id),
    late: late.sort(byBuyTime).map((r) => r.item.id),
    situational: situational.map((r) => r.item.id),
  };
}

const PHASE_CAPS = { early: 7, mid: 8, late: 10, situational: 10 };

/**
 * Convertit un build publié en phases early/mid/late/situational.
 * Les catégories optionnelles/situationnelles de l'auteur vont en `situational` ; les autres objets sont
 * rangés par palier (les auteurs mélangent souvent les paliers dans leurs catégories), dans l'ordre de l'auteur.
 */
function phasesFromPublishedBuild(heroBuild, catalog) {
  const phases = { early: [], mid: [], late: [], situational: [] };
  const overflow = [];
  const seen = new Set();
  for (const cat of heroBuild.details?.mod_categories || []) {
    const name = cat.name || '';
    const isSituational = !STANDARD_CATEGORIES.has(name) && (cat.optional || SITUATIONAL_CATEGORY_RE.test(name));
    for (const mod of cat.mods || []) {
      const item = catalog.byApiId.get(mod.ability_id);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      const phase = isSituational ? 'situational' : tierPhase(item.tier);
      if (phase !== 'situational' && phases[phase].length >= PHASE_CAPS[phase]) overflow.push(item.id);
      else phases[phase].push(item.id);
    }
  }
  phases.situational = [...overflow, ...phases.situational].slice(0, PHASE_CAPS.situational);
  return phases;
}

/** Ordre de maximisation des sorts : ordre dans lequel chaque sort reçoit sa 4e occurrence (déblocage + 3 améliorations). */
function maxOrderFromSequence(sequence, slotByAbilityId) {
  const counts = new Map();
  const order = [];
  for (const abilityId of sequence) {
    const slot = slotByAbilityId.get(abilityId);
    if (!slot) continue;
    const n = (counts.get(slot) || 0) + 1;
    counts.set(slot, n);
    if (n === 4 && !order.includes(slot)) order.push(slot);
  }
  const rest = ['1', '2', '3', '4']
    .filter((s) => !order.includes(s))
    .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || Number(a) - Number(b));
  return [...order, ...rest];
}

function abilityOrderFromStats(orderStats, slotByAbilityId) {
  const groups = new Map();
  for (const row of orderStats || []) {
    const order = maxOrderFromSequence(row.abilities || [], slotByAbilityId);
    const key = order.join('');
    const g = groups.get(key) || { order, matches: 0, wins: 0 };
    g.matches += row.matches || 0;
    g.wins += row.wins || 0;
    groups.set(key, g);
  }
  const best = [...groups.values()].sort((a, b) => b.matches - a.matches)[0];
  return best && best.matches > 0 ? best.order : undefined;
}

function abilityOrderFromBuild(heroBuild, slotByAbilityId) {
  // currency_type 1 = points d'amélioration (1, 2 puis 5 points = palier max)
  const spent = new Map();
  const order = [];
  for (const ch of heroBuild.details?.ability_order?.currency_changes || []) {
    if (ch.currency_type !== 1) continue;
    const slot = slotByAbilityId.get(ch.ability_id);
    if (!slot) continue;
    const total = (spent.get(slot) || 0) - ch.delta;
    spent.set(slot, total);
    if (total >= 8 && !order.includes(slot)) order.push(slot);
  }
  if (spent.size === 0) return undefined;
  const rest = ['1', '2', '3', '4']
    .filter((s) => !order.includes(s))
    .sort((a, b) => (spent.get(b) || 0) - (spent.get(a) || 0) || Number(a) - Number(b));
  return [...order, ...rest];
}

/** Indented JSON with the arrays of plain values (item ids, stats) on one line: smaller file, readable diffs. */
const stringifyCompact = (obj) =>
  JSON.stringify(obj, null, 2).replace(/\[\n\s+([^[\]{}]*?)\n\s*\]/g, (_, inner) => `[${inner.split(/,\n\s+/).join(', ')}]`) +
  '\n';

const pct = (x) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
const fmtInt = (n) => n.toLocaleString('fr-FR');

async function readLocalHeroIds() {
  try {
    const src = await fs.readFile(path.join(ROOT, 'src', 'data', 'deadlockData.ts'), 'utf8');
    const heroesPart = src.slice(src.search(/const (BASE_)?HEROES_DB/));
    return new Set([...heroesPart.matchAll(/^ {4}(?: {2})?id: '([a-z0-9_]+)',$/gm)].map((m) => m[1]));
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  const minUnix = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86400;

  console.log('▶ Téléchargement des assets (objets, sorts, héros)…');
  const [itemsFr, itemsEn, abilitiesFr, abilitiesEn, heroesFr, heroesEn] = await Promise.all([
    fetchJson('/v1/assets/items/by-type/upgrade', { language: 'french' }),
    fetchJson('/v1/assets/items/by-type/upgrade', { language: 'english' }),
    fetchJson('/v1/assets/items/by-type/ability', { language: 'french' }),
    fetchJson('/v1/assets/items/by-type/ability', { language: 'english' }),
    fetchJson('/v1/assets/heroes', { language: 'french', only_active: true }),
    fetchJson('/v1/assets/heroes', { language: 'english', only_active: true }),
  ]);
  assertFields('heroes', heroesEn[0], ['id', 'name', 'items', 'player_selectable']);

  const catalog = buildCatalog(itemsFr, itemsEn);
  console.log(`  ${Object.keys(catalog.items).length} objets de boutique.`);
  if (catalog.missingClasses.length > 0) {
    console.log(`  Objets locaux retirés du jeu : ${catalog.missingClasses.map((c) => LOCAL_ID_BY_CLASS[c]).join(', ')}`);
  }

  console.log('▶ Téléchargement des icônes manquantes…');
  const icons = await downloadIcons(catalog.items);
  console.log(`  ${icons.downloaded} nouvelles icônes, ${icons.failed} échecs.`);

  const abilityEnByClass = new Map(abilitiesEn.map((a) => [a.class_name, a]));
  const abilityFrById = new Map(abilitiesFr.map((a) => [a.id, a]));
  const heroFrById = new Map(heroesFr.map((h) => [h.id, h]));
  const localHeroIds = await readLocalHeroIds();

  console.log('▶ Statistiques globales des héros par rang…');
  const heroStatsByBadge = {};
  for (const badge of BADGE_LADDER) {
    const rows = await fetchJson(
      '/v1/analytics/hero-stats',
      { min_unix_timestamp: minUnix, min_average_badge: badge || undefined },
      { analytics: true }
    );
    heroStatsByBadge[badge] = new Map(rows.map((r) => [r.hero_id, r]));
  }

  const heroes = {};
  const unmappedHeroes = [];
  const abilityIcons = [];
  const playable = heroesEn.filter((h) => h.player_selectable !== false && !h.disabled);

  for (const hero of playable) {
    const localId = slugify(hero.name);
    if (localHeroIds.size > 0 && !localHeroIds.has(localId)) unmappedHeroes.push(`${hero.name} (${localId})`);

    const badge = BADGE_LADDER.find((b) => (heroStatsByBadge[b].get(hero.id)?.matches || 0) >= MIN_HERO_MATCHES) ?? 0;
    const heroStats = heroStatsByBadge[badge].get(hero.id);
    if (!heroStats || heroStats.matches === 0) {
      console.log(`  ✗ ${hero.name} : aucune partie sur ${WINDOW_DAYS} jours, ignoré.`);
      continue;
    }
    const heroWinRate = heroStats.wins / heroStats.matches;

    // Sorts du héros (slots 1-4)
    const slotByAbilityId = new Map();
    const abilities = [];
    for (const key of ['1', '2', '3', '4']) {
      const ab = abilityEnByClass.get(hero.items?.[`signature${key}`]);
      if (!ab) continue;
      slotByAbilityId.set(ab.id, key);
      const abFr = abilityFrById.get(ab.id);
      const iconFile = `${localId}_${key}.png`;
      if (ab.image) abilityIcons.push({ file: path.join(ABILITY_ICON_DIR, iconFile), url: ab.image });
      abilities.push({
        key,
        nameEn: ab.name,
        nameFr: abFr?.name || ab.name,
        descriptionFr: describe(abFr?.description).slice(0, 260),
        descriptionEn: describe(ab.description).slice(0, 260),
        icon: ab.image ? `./icons/abilities/api/${iconFile}` : undefined,
      });
    }

    const filters = { min_unix_timestamp: minUnix, min_average_badge: badge || undefined };
    const [itemStats, orderStats, buildStats] = [
      await fetchJson('/v1/analytics/item-stats', { ...filters, hero_ids: hero.id, min_matches: 20 }, { analytics: true }),
      await fetchJson(
        '/v1/analytics/ability-order-stats',
        { ...filters, hero_id: hero.id, min_ability_upgrades: 12, min_matches: 20 },
        { analytics: true }
      ),
      await fetchJson(
        `/v1/analytics/hero-build-stats/${hero.id}`,
        { ...filters, min_matches: MIN_BUILD_MATCHES },
        { analytics: true }
      ),
    ];

    const statsOrder = abilityOrderFromStats(orderStats, slotByAbilityId);
    const rows = itemRows(itemStats, catalog, heroStats.matches, heroWinRate);
    const builds = [];

    // Titles are formatted by the application, in the player's language, from these fields
    builds.push({
      kind: 'stats',
      winRate: heroWinRate,
      matches: heroStats.matches,
      badgeMin: badge,
      abilitiesOrder: statsOrder,
      phases: buildFromItemStats(rows, heroWinRate),
    });

    // Meilleur build publié : taux de victoire bayésien (lissé vers 50 %) parmi les builds assez joués
    const bestPublished = (buildStats || [])
      .filter((b) => b.matches >= MIN_BUILD_MATCHES)
      .map((b) => ({ ...b, score: (b.wins + 50) / (b.matches + 100) }))
      .sort((a, b) => b.score - a.score)[0];

    if (bestPublished) {
      const found = await fetchJson('/v1/builds', { build_id: bestPublished.hero_build_id, only_latest: true });
      const heroBuild = found?.[0]?.hero_build;
      if (heroBuild) {
        const phases = phasesFromPublishedBuild(heroBuild, catalog);
        if (phases.early.length + phases.mid.length + phases.late.length >= 6) {
          builds.push({
            kind: 'published',
            sourceBuildId: bestPublished.hero_build_id,
            sourceName: heroBuild.name.trim().slice(0, 80),
            winRate: bestPublished.wins / bestPublished.matches,
            matches: bestPublished.matches,
            badgeMin: badge,
            abilitiesOrder: abilityOrderFromBuild(heroBuild, slotByAbilityId) || statsOrder,
            phases,
          });
        }
      }
    }

    heroes[localId] = {
      apiHeroId: hero.id,
      nameFr: heroFrById.get(hero.id)?.name || hero.name,
      nameEn: hero.name,
      matches: heroStats.matches,
      winRate: heroWinRate,
      badgeMin: badge,
      abilities,
      builds,
      itemStats: compactItemStats(rows),
    };
    const b0 = builds[0].phases;
    console.log(
      `  ✓ ${hero.name.padEnd(16)} ${BADGE_LABELS[badge].padEnd(10)} ${fmtInt(heroStats.matches).padStart(8)} parties  WR ${pct(heroWinRate)}  ` +
        `méta ${b0.early.length}/${b0.mid.length}/${b0.late.length}  ${builds[1] ? `publié ${pct(builds[1].winRate)}` : 'pas de build publié'}`
    );
  }

  console.log('▶ Icônes des sorts…');
  const failedAbilityIcons = await downloadAbilityIcons(abilityIcons);
  for (const hero of Object.values(heroes)) {
    for (const a of hero.abilities) {
      if (a.icon && failedAbilityIcons.has(path.join(ABILITY_ICON_DIR, path.basename(a.icon)))) delete a.icon;
    }
  }

  const generatedAt = new Date().toISOString();
  const catalogJson = { schemaVersion: SCHEMA_VERSION, generatedAt, items: catalog.items };
  const metaJson = { schemaVersion: SCHEMA_VERSION, generatedAt, windowDays: WINDOW_DAYS, heroes };
  // Never write (and so never publish to every installed app) a broken or truncated API answer
  validateGenerated(catalogJson, metaJson);

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, 'itemsCatalog.json'), stringifyCompact(catalogJson));
  await fs.writeFile(path.join(OUT_DIR, 'metaBuilds.json'), stringifyCompact(metaJson));

  console.log('');
  console.log(`✔ ${Object.keys(heroes).length} héros mis à jour en ${Math.round((Date.now() - t0) / 1000)} s.`);
  if (unmappedHeroes.length > 0) {
    console.log(`  Héros absents de HEROES_DB (builds générés mais non affichés) : ${unmappedHeroes.join(', ')}`);
  }
}

/**
 * Sanity checks of the generated data, also run by CI (`--check`) on the committed files: the application
 * downloads them from the main branch, so a bad file would reach every player at their next launch.
 */
function validateGenerated(catalogJson, metaJson) {
  const errors = [];
  const items = catalogJson.items || {};
  const heroes = metaJson.heroes || {};
  if (catalogJson.schemaVersion !== SCHEMA_VERSION) errors.push(`itemsCatalog schemaVersion ${catalogJson.schemaVersion}`);
  if (metaJson.schemaVersion !== SCHEMA_VERSION) errors.push(`metaBuilds schemaVersion ${metaJson.schemaVersion}`);
  const itemList = Object.values(items);
  if (itemList.length < 120) errors.push(`seulement ${itemList.length} objets`);
  for (const it of itemList) {
    if (!it.nameFr || !it.nameEn) errors.push(`${it.id} : nom manquant`);
    if (![1, 2, 3, 4].includes(it.tier)) errors.push(`${it.id} : palier ${it.tier}`);
    if (!['weapon', 'vitality', 'spirit'].includes(it.category)) errors.push(`${it.id} : catégorie ${it.category}`);
    if (!(it.cost > 0)) errors.push(`${it.id} : prix ${it.cost}`);
    for (const c of it.upgradesFrom || []) if (!items[c]) errors.push(`${it.id} : composant inconnu ${c}`);
  }
  const heroList = Object.entries(heroes);
  if (heroList.length < 35) errors.push(`seulement ${heroList.length} héros`);
  for (const [id, h] of heroList) {
    if (!h.builds?.length) errors.push(`${id} : aucun build`);
    if (h.abilities?.length !== 4) errors.push(`${id} : ${h.abilities?.length ?? 0} sorts`);
    for (const b of h.builds || []) {
      const n = b.phases.early.length + b.phases.mid.length + b.phases.late.length;
      if (n < 6) errors.push(`${id}/${b.kind} : ${n} objets`);
      for (const phase of Object.values(b.phases)) for (const itemId of phase) if (!items[itemId]) errors.push(`${id} : objet inconnu ${itemId}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Données générées invalides :\n  - ${errors.slice(0, 30).join('\n  - ')}`);
  }
}

async function checkExisting() {
  const read = async (name) => JSON.parse(await fs.readFile(path.join(OUT_DIR, name), 'utf8'));
  validateGenerated(await read('itemsCatalog.json'), await read('metaBuilds.json'));
  console.log('✔ Données générées valides.');
}

(process.argv.includes('--check') ? checkExisting() : main()).catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
