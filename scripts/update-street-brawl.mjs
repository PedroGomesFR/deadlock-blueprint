#!/usr/bin/env node
// Street Brawl item statistics, kept apart from the normal-mode data (scripts/update-builds.mjs).
// `npm run update-street-brawl` (after `npm run update-builds`, whose files give the hero and item ids).
//
// Output: src/data/generated/streetBrawl.json
//   legendaryItems.<id> = { apiId, className, cost, nameEn, nameFr, nameIt, category, icon }: the tier 5 items that exist only in
//   Street Brawl ("LEGENDARY" cards), absent from the normal-mode catalogue. Icons in public/icons/items/streetBrawl.
//   heroes.<localId> = {
//     matches, winRate,
//     items: { <itemId>: [pickRate, smoothedWinRate, matches] }        normal copies only (enhanced_items=exclude)
//     enhancedItems: { <itemId>: [smoothedWinRate, matches] }         enhanced copies only (enhanced_items=only)
//     enhancedTierGain: { <tier>: winRateGap }                        enhanced minus normal, games-weighted
//     abilityPlan: [[slot, winRate, games, avgTimeS, runnerUpSlot, runnerUpWinRate, mostCommon], …]  one per point
//     draft: { <itemId>: [good, weight] }   the items the game can offer the hero, "Good" (1) or "Normal" (0) bucket
//     paths: { <componentId>: [[upgradeId, extraChance], …] }   see componentPaths
//   }
//   draftGoodShare: { <tier>: share }     how often a tier's card comes from the "Good" bucket (generic-data)
//   draftRoundTiers: [[t1, t2, t3], …]    normal tier of picks 1-3 of each round (a rare card is one tier up)
//   soulValue: { perThousand, se, players }   win rate per 1,000 souls of items, from round 1 picks (see soulValue)
//   A card of tier t is drawn from the Good bucket with draftGoodShare[t], else from Normal, then an item of that tier
//   and bucket in proportion to its weight (/v1/assets/heroes › item_draft_bucketing).
//   pickRate: share of the hero's Street Brawl games in which the item was acquired (normal or enhanced; components later
//   upgraded or sold included, so a tier's shares add up to its picks per game). Street Brawl offers
//   items at random, so this mixes "players take it" with "it is offered often": the win rate is the better signal.
//   An enhanced win rate is smoothed towards the item's normal win rate + its tier's gap: per item, enhanced samples
//   are a few hundred games (all heroes, 30 days: enhanced copies win +1.3 to +1.9 points more on average at tiers
//   1-4, but item by item one hero's gaps ranged from -7 to +7).
//
// All ranks together: the mode is younger and smaller than normal games, a rank filter would thin it out.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = path.join(ROOT, 'src/data/generated');
const API = 'https://api.deadlock-api.com';
const WINDOW_DAYS = 30;
const MIN_ITEM_MATCHES = 50;
const MIN_ENHANCED_MATCHES = 20;
const WIN_RATE_PRIOR = 300; // same smoothing towards the hero's win rate as the normal-mode stats
// A hero's enhanced gap of a tier is pulled towards all heroes' until it has about this many enhanced item-games
// (Nurse Harrow: ~40,000-60,000 per tier, so mostly her own)
const TIER_GAP_PRIOR = 20000;
const ANALYTICS_DELAY_MS = 350; // API limit: 200 requests / minute on /v1/analytics
// 2: normal copies only in `items`, enhanced copies in `enhancedItems` and `enhancedTierGain`
// 3: `draft` per hero and `draftGoodShare` (offer odds)
// (`paths` per hero and `draftRoundTiers` are additions an older app ignores: same version)
export const SCHEMA_VERSION = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (x, digits = 3) => Math.round(x * 10 ** digits) / 10 ** digits;

async function fetchJson(urlPath, params) {
  const url = new URL(urlPath, API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 1; attempt <= 5; attempt++) {
    await sleep(ANALYTICS_DELAY_MS);
    const res = await fetch(url, { headers: { Accept: 'application/json' } }).catch(() => null);
    if (res?.ok) return res.json();
    if (attempt === 5) throw new Error(`HTTP ${res?.status ?? 'network error'} for ${url}`);
    await sleep(res?.status === 429 ? 15000 : 3000 * attempt);
  }
}

async function readGenerated(name) {
  return JSON.parse(await fs.readFile(path.join(GENERATED, name), 'utf8'));
}

const ICON_DIR = path.join(ROOT, 'public/icons/items/streetBrawl');
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** The Street Brawl-only items (tier 5, "LEGENDARY" cards) still in the game, with their icon downloaded. */
async function legendaryItems() {
  const [en, fr, it] = await Promise.all(
    ['english', 'french', 'italian'].map((language) => fetchJson('/v1/assets/items/by-type/upgrade', { language }))
  );
  const frById = new Map(fr.map((x) => [x.id, x.name]));
  const itById = new Map(it.map((x) => [x.id, x.name]));
  await fs.mkdir(ICON_DIR, { recursive: true });
  const out = {};
  for (const x of en.filter((i) => i.item_tier === 5 && !i.disabled && i.shopable !== false && i.name)) {
    const id = slug(x.name);
    const file = path.join(ICON_DIR, `${id}.png`);
    const exists = await fs.access(file).then(() => true, () => false);
    if (!exists && x.shop_image) {
      const res = await fetch(x.shop_image).catch(() => null);
      if (res?.ok) await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
    }
    out[id] = {
      apiId: x.id,
      className: x.class_name,
      cost: x.cost,
      nameEn: x.name,
      nameFr: frById.get(x.id) || x.name,
      nameIt: itById.get(x.id) || x.name,
      category: x.item_slot_type,
      icon: (await fs.access(file).then(() => true, () => false)) ? `./icons/items/streetBrawl/${id}.png` : undefined,
    };
  }
  return out;
}

const PLAN_MAX_POINTS = 12; // a game lasts up to 5 rounds; about a third of games reach the 12th point
const PLAN_MIN_GAMES = 1000; // a choice needs this many games...
const PLAN_MIN_SHARE = 0.05; // ...and this share of the players at that point, to be followed
const PLAN_MIN_NODE_GAMES = 200; // tree nodes fetched

/** Ability slot ('1'-'4') of each ability id of every hero: the heroes' signature1-4 abilities. */
async function abilitySlots() {
  const [heroes, abilities] = await Promise.all([
    fetchJson('/v1/assets/heroes', { language: 'english', only_active: true }),
    fetchJson('/v1/assets/items/by-type/ability', { language: 'english' }),
  ]);
  const idByClass = new Map(abilities.map((a) => [a.class_name, a.id]));
  const slots = new Map();
  for (const h of heroes) {
    const m = new Map();
    for (const key of ['1', '2', '3', '4']) {
      const id = idByClass.get(h.items?.[`signature${key}`]);
      if (id) m.set(id, key);
    }
    slots.set(h.id, m);
  }
  return slots;
}

/**
 * The offer odds: per hero, the bucket ("Good" / "Normal") and weight of every item the game can offer it, by local
 * item id; per tier, the Good bucket's share. Items the app does not know (no local id) are left out.
 */
async function draftOdds(idByClassName) {
  const [heroes, generic] = await Promise.all([
    fetchJson('/v1/assets/heroes', { language: 'english', only_active: true }),
    fetchJson('/v1/assets/generic-data', {}),
  ]);
  // Normal tier of each pick of each round (a rare card is one tier up): round -> [pick 1, pick 2, pick 3]
  const roundTiers = (generic.street_brawl?.item_draft_rounds_per_game_round ?? []).map((r) =>
    (r.item_draft_rounds ?? []).map((d) => d.normal_mod_tier)
  );
  const goodShare = {};
  for (const [tier, d] of Object.entries(generic.street_brawl?.item_drafts ?? {})) {
    const total = (d.bucket?.good ?? 0) + (d.bucket?.normal ?? 0);
    if (total > 0) goodShare[tier] = round(d.bucket.good / total);
  }
  const byHero = new Map();
  for (const h of heroes) {
    const draft = {};
    for (const [className, b] of Object.entries(h.item_draft_bucketing ?? {})) {
      const itemId = idByClassName.get(className);
      if (itemId && b.weight > 0) draft[itemId] = [b.bucket === 'Good' ? 1 : 0, b.weight];
    }
    byHero.set(h.id, draft);
  }
  return { goodShare, byHero, roundTiers };
}

const SAMPLE_DAYS = 3;
const SAMPLE_PLAYERS = 100000; // players sampled: the endpoint's most rows (a sample over all games times out)

/**
 * Street Brawl players of the last days, with their items (id, time acquired) and whether they won: one /v1/sql query
 * (the endpoint allows 2 a minute), shared by componentPaths and soulValue. null when it fails.
 */
async function sampleStreetBrawlPlayers() {
  const since = new Date(Date.now() - SAMPLE_DAYS * 86400e3).toISOString();
  const query =
    `SELECT hero_id, won, "items.item_id", "items.game_time_s" FROM match_player ` +
    `WHERE game_mode = 'StreetBrawl' AND start_time > '${since}' LIMIT ${SAMPLE_PLAYERS}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${API}/v1/sql?query=${encodeURIComponent(query)}`).catch(() => null);
    if (res?.ok) return res.json();
    await sleep(res?.status === 429 ? 35000 : 10000 * attempt);
  }
  return null;
}

// Round 1's three picks are all taken by 90 s: every item acquired before this is a round 1 pick (bonus items included)
const ROUND1_END_S = 110;

/**
 * What 1,000 souls of items are worth in win rate, whatever the items. A pick's tier is fixed by the draft, so the
 * soul value of a player's round 1 items differs only by rare (+1 tier), legendary and bonus (two-item) cards: mostly
 * luck, and before any comeback rule. Least squares of win on that value. Counting every round 1 item, not the first
 * 3: a bonus card on the first pick gives 4 or more (12 % of players). The player's choice to take a rare is left in.
 * Over later rounds the slope falls (losing teams may get more rare cards): round 1 is the cleanest.
 */
function soulValue(rows, costByApi) {
  const xs = [];
  const ys = [];
  for (const r of rows) {
    let value = 0;
    r['items.item_id'].forEach((api, i) => {
      if (r['items.game_time_s'][i] < ROUND1_END_S) value += costByApi.get(api) ?? 0;
    });
    if (value === 0) continue;
    xs.push(value);
    ys.push(r.won ? 1 : 0);
  }
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = (sxy / sxx) * 1000;
  const se = Math.sqrt((my * (1 - my)) / sxx) * 1000;
  return { perThousand: round(slope, 5), se: round(se, 5), players: n };
}
const PATH_PRIOR = 300; // a hero's extra chance is pulled towards all heroes' until about this many players with the component
const PATH_MIN_PLAYERS = 1000; // all heroes' players with the component, for the pair to be measured at all
// Smaller extra chances are left out of the file: times an upgrade's gain (a few points), under 0.1 point
const PATH_MIN_EXTRA = 0.02;

/**
 * Per hero: after picking a component, how much more often players end up with each of its upgrades than the hero's
 * players who never had it ("extra chance", in probability). Measured on Street Brawl matches (/v1/sql, which allows
 * 2 queries a minute: one here). A hero's value is pulled towards all heroes' for the pair (PATH_PRIOR): with a few
 * dozen players it swings by 10 points. It includes players taking the upgrade on purpose when offered, not only the
 * offer being likelier: an upper bound for the draft's own effect. All heroes, same hero: 1.14x the rate; an unrelated
 * item of the upgrade's tier and category: 0.88x (a pick taken is a pick another item did not get).
 */
function componentPaths(rows, catalog, localByApiHero) {
  const byApi = new Map(Object.values(catalog).map((it) => [it.apiId, it.id]));
  // Per player: first time each item was bought
  const players = rows.map((r) => {
    const first = new Map();
    r['items.item_id'].forEach((api, i) => {
      const id = byApi.get(api);
      if (id && !first.has(id)) first.set(id, r['items.game_time_s'][i]);
    });
    return { hero: localByApiHero.get(r.hero_id), first };
  });
  const pairs = Object.values(catalog).flatMap((up) => (up.upgradesFrom ?? []).filter((c) => catalog[c]).map((c) => [c, up.id]));
  const out = {}; // hero -> component -> [[upgrade, extra]]
  for (const [comp, up] of pairs) {
    // Per hero counts: with the component (then the upgrade after it), without (the upgrade at all)
    const counts = new Map();
    for (const p of players) {
      if (!p.hero) continue;
      const k = counts.get(p.hero) ?? { c: 0, cu: 0, n: 0, nu: 0 };
      if (p.first.has(comp)) {
        k.c++;
        if (p.first.has(up) && p.first.get(up) >= p.first.get(comp)) k.cu++;
      } else {
        k.n++;
        if (p.first.has(up)) k.nu++;
      }
      counts.set(p.hero, k);
    }
    // All heroes: each hero's extra chance, weighted by its players with the component (same-hero comparison)
    let sum = 0;
    let weight = 0;
    for (const k of counts.values()) {
      if (k.c === 0 || k.n === 0) continue;
      sum += (k.cu / k.c - k.nu / k.n) * k.c;
      weight += k.c;
    }
    if (weight < PATH_MIN_PLAYERS) continue;
    const overall = sum / weight;
    for (const [hero, k] of counts) {
      if (k.n === 0) continue;
      const own = k.c > 0 ? k.cu / k.c - k.nu / k.n : 0;
      const extra = (own * k.c + overall * PATH_PRIOR) / (k.c + PATH_PRIOR);
      if (extra < PATH_MIN_EXTRA) continue;
      ((out[hero] ??= {})[comp] ??= []).push([up, round(extra)]);
    }
  }
  console.log(`  paths: ${rows.length} Street Brawl players, ${pairs.length} component pairs`);
  return out;
}

/**
 * Where to put each ability point, from the Street Brawl ability order tree (one node per order prefix: games, wins,
 * average time). Orders that reach the same allocation (points per ability) are merged: "2 in 1, 2 in 4" is the same
 * position whatever the order, which keeps thousands of games per decision up to the 12th point (exact orders split
 * into 400+ branches by the 10th). At each point: the choice with the best win rate, smoothed towards the position's,
 * among those taken by enough players (else the most common one, flagged mostCommon = 1).
 */
async function abilityPlan(heroApiId, slotOf, minUnix) {
  const tree = await fetchJson('/v1/analytics/ability-order-tree', {
    hero_id: heroApiId,
    game_mode: 'street_brawl',
    min_unix_timestamp: minUnix,
    min_matches: PLAN_MIN_NODE_GAMES,
  });
  const allocation = (ids) => {
    const c = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const id of ids) c[slotOf.get(id)]++;
    return `${c[1]}-${c[2]}-${c[3]}-${c[4]}`;
  };
  // allocation -> slot -> { wins, games, time x games }
  const moves = new Map();
  let heroWins = 0;
  let heroGames = 0;
  for (const n of tree) {
    if (!n.abilities.every((id) => slotOf.has(id))) continue;
    if (n.abilities.length === 1) {
      heroWins += n.wins;
      heroGames += n.matches;
    }
    const from = allocation(n.abilities.slice(0, -1));
    const slot = slotOf.get(n.abilities.at(-1));
    const bySlot = moves.get(from) ?? moves.set(from, new Map()).get(from);
    const m = bySlot.get(slot) ?? { wins: 0, games: 0, time: 0 };
    m.wins += n.wins;
    m.games += n.matches;
    m.time += n.avg_upgrade_time_s * n.matches;
    bySlot.set(slot, m);
  }
  if (heroGames === 0) return [];
  const plan = [];
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let positionWr = heroWins / heroGames;
  let positionGames = heroGames;
  for (let point = 0; point < PLAN_MAX_POINTS; point++) {
    const from = `${counts[1]}-${counts[2]}-${counts[3]}-${counts[4]}`;
    const all = [...(moves.get(from) ?? new Map())].map(([slot, m]) => ({
      slot,
      m,
      wr: (m.wins + WIN_RATE_PRIOR * positionWr) / (m.games + WIN_RATE_PRIOR),
    }));
    const solid = all
      .filter(({ m }) => m.games >= PLAN_MIN_GAMES && m.games >= PLAN_MIN_SHARE * positionGames)
      .sort((a, b) => b.wr - a.wr);
    // No choice with enough players (the position splits thinly, Pocket after 3 points): the most common one,
    // flagged, rather than a win rate on a few hundred games
    const mostCommon = solid.length === 0;
    const options = mostCommon ? all.sort((a, b) => b.m.games - a.m.games) : solid;
    if (options.length === 0) break;
    const [best, second] = options;
    plan.push([
      best.slot,
      round(best.wr),
      best.m.games,
      Math.round(best.m.time / best.m.games),
      mostCommon ? null : (second?.slot ?? null),
      mostCommon || !second ? null : round(second.wr),
      mostCommon ? 1 : 0,
    ]);
    counts[best.slot]++;
    positionWr = best.wr;
    positionGames = best.m.games;
  }
  return plan;
}

function validate(out, itemIds) {
  const errors = [];
  if (Object.keys(out.legendaryItems).length < 10) errors.push(`only ${Object.keys(out.legendaryItems).length} legendary items`);
  for (const [id, x] of Object.entries(out.legendaryItems)) {
    if (!x.icon) errors.push(`${id}: icon missing`);
    if (!['weapon', 'vitality', 'spirit'].includes(x.category)) errors.push(`${id}: category ${x.category}`);
  }
  const heroes = Object.entries(out.heroes);
  if (heroes.length < 35) errors.push(`only ${heroes.length} heroes`);
  for (const [id, h] of heroes) {
    if (!(h.matches > 0) || !(h.winRate > 0 && h.winRate < 1)) errors.push(`${id}: matches ${h.matches}, win rate ${h.winRate}`);
    if (Object.keys(h.items).length < 20) errors.push(`${id}: only ${Object.keys(h.items).length} items`);
    for (const [itemId, row] of Object.entries(h.items)) {
      if (!itemIds.has(itemId)) errors.push(`${id}: unknown item ${itemId}`);
      if (!Array.isArray(row) || row.length !== 3) errors.push(`${id}/${itemId}: bad row`);
    }
    for (const [itemId, row] of Object.entries(h.enhancedItems)) {
      if (!h.items[itemId]) errors.push(`${id}: enhanced ${itemId} without normal stats`);
      if (!Array.isArray(row) || row.length !== 2 || !(row[0] > 0 && row[0] < 1)) errors.push(`${id}/${itemId}: bad enhanced row`);
    }
    if (h.abilityPlan.length < 4) errors.push(`${id}: ability plan of ${h.abilityPlan.length} points`);
    if (Object.keys(h.draft).length < 100) errors.push(`${id}: only ${Object.keys(h.draft).length} offerable items`);
    for (const [comp, ups] of Object.entries(h.paths)) {
      if (!itemIds.has(comp) || ups.some(([up, x]) => !itemIds.has(up) || !(x > 0 && x < 1))) errors.push(`${id}: bad path ${comp}`);
    }
    for (const step of h.abilityPlan) {
      if (!['1', '2', '3', '4'].includes(step[0]) || !(step[1] > 0 && step[1] < 1)) errors.push(`${id}: bad plan step`);
    }
    for (const [tier, gap] of Object.entries(h.enhancedTierGain)) {
      // Enhanced copies measured at -0.1 to +1.5 points on average: far outside this means a broken answer
      if (!(Math.abs(gap) < 0.1)) errors.push(`${id}: enhanced gap ${gap} at tier ${tier}`);
    }
  }
  for (const tier of ['1', '2', '3', '4']) {
    const share = out.draftGoodShare[tier];
    if (!(share >= 0 && share <= 1)) errors.push(`draft good share of tier ${tier}: ${share}`);
  }
  const rt = out.draftRoundTiers;
  if (rt.length !== 5 || !rt.every((r) => r.length === 3 && r.every((t) => t >= 1 && t <= 5))) {
    errors.push(`draft round tiers: ${JSON.stringify(rt)}`);
  }
  if (errors.length > 0) throw new Error(`Invalid Street Brawl data:\n  - ${errors.slice(0, 20).join('\n  - ')}`);
}

async function main() {
  const catalog = (await readGenerated('itemsCatalog.json')).items;
  const meta = (await readGenerated('metaBuilds.json')).heroes;
  const legendary = await legendaryItems();
  const itemByApiId = new Map([
    ...Object.values(catalog).map((it) => [it.apiId, it.id]),
    ...Object.entries(legendary).map(([id, x]) => [x.apiId, id]),
  ]);
  const minUnix = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86400;
  const sample = await sampleStreetBrawlPlayers();
  let paths;
  let souls;
  if (sample) {
    paths = componentPaths(sample, catalog, new Map(Object.entries(meta).map(([id, m]) => [m.apiHeroId, id])));
    const costByApi = new Map([
      ...Object.values(catalog).map((it) => [it.apiId, it.cost]),
      ...Object.values(legendary).map((x) => [x.apiId, x.cost]),
    ]);
    souls = soulValue(sample, costByApi);
    console.log(
      `  soul value: ${(souls.perThousand * 100).toFixed(2)} pts per 1,000 souls (± ${(souls.se * 200).toFixed(2)}), ${souls.players} players`
    );
  } else {
    // /v1/sql unavailable: last week's measurements are kept
    const previous = await readGenerated('streetBrawl.json').catch(() => null);
    paths = Object.fromEntries(Object.entries(previous?.heroes ?? {}).map(([id, h]) => [id, h.paths ?? {}]));
    souls = previous?.soulValue ?? null;
    console.log(`  ✗ /v1/sql unavailable: the previous file's paths and soul value are kept`);
  }
  const draft = await draftOdds(
    new Map([
      ...Object.values(catalog).map((it) => [it.className, it.id]),
      ...Object.entries(legendary).map(([id, x]) => [x.className, id]),
    ])
  );

  const heroStats = await fetchJson('/v1/analytics/hero-stats', { game_mode: 'street_brawl', min_unix_timestamp: minUnix });
  const heroById = new Map(heroStats.map((h) => [h.hero_id, h]));

  const tierOf = (itemId) => (legendary[itemId] ? 5 : catalog[itemId]?.tier);
  const itemStats = (heroApiId, enhanced) =>
    fetchJson('/v1/analytics/item-stats', {
      game_mode: 'street_brawl',
      hero_ids: heroApiId,
      enhanced_items: enhanced,
      min_matches: enhanced === 'only' ? MIN_ENHANCED_MATCHES : MIN_ITEM_MATCHES,
      min_unix_timestamp: minUnix,
    });
  const byItem = (rows) => {
    const out = new Map();
    for (const r of rows) {
      const itemId = itemByApiId.get(r.item_id);
      if (itemId && r.matches > 0) out.set(itemId, r);
    }
    return out;
  };

  // Pass 1: normal copies and enhanced copies of every item, per hero, and the enhanced gap per tier
  const slotsByHero = await abilitySlots();
  const raw = [];
  const gapSum = {}; // tier -> { all heroes: sum of games x gap, games }
  for (const [localId, m] of Object.entries(meta)) {
    const hs = heroById.get(m.apiHeroId);
    if (!hs || hs.matches === 0) {
      console.log(`  ✗ ${m.nameEn}: no Street Brawl games`);
      continue;
    }
    const normal = byItem(await itemStats(m.apiHeroId, 'exclude'));
    const enhanced = byItem(await itemStats(m.apiHeroId, 'only'));
    const heroGap = {};
    for (const [itemId, e] of enhanced) {
      const n = normal.get(itemId);
      const tier = tierOf(itemId);
      if (!n || !tier) continue;
      const g = (heroGap[tier] ??= { sum: 0, games: 0 });
      const all = (gapSum[tier] ??= { sum: 0, games: 0 });
      const gap = e.wins / e.matches - n.wins / n.matches;
      g.sum += gap * e.matches;
      g.games += e.matches;
      all.sum += gap * e.matches;
      all.games += e.matches;
    }
    const plan = await abilityPlan(m.apiHeroId, slotsByHero.get(m.apiHeroId) ?? new Map(), minUnix);
    raw.push({ localId, m, hs, normal, enhanced, heroGap, plan });
  }
  const globalGap = Object.fromEntries(Object.entries(gapSum).map(([t, g]) => [t, g.games > 0 ? g.sum / g.games : 0]));

  // Pass 2: smoothed values
  const heroes = {};
  for (const { localId, m, hs, normal, enhanced, heroGap, plan } of raw) {
    const heroWinRate = hs.wins / hs.matches;
    // The hero's own enhanced gap per tier, pulled towards all heroes' when the hero has few enhanced games
    const tierGain = {};
    for (const [tier, g0] of Object.entries(globalGap)) {
      const g = heroGap[tier] ?? { sum: 0, games: 0 };
      tierGain[tier] = (g.sum + TIER_GAP_PRIOR * g0) / (g.games + TIER_GAP_PRIOR);
    }
    const items = {};
    for (const [itemId, n] of normal) {
      const games = n.matches + (enhanced.get(itemId)?.matches ?? 0);
      const wr = (n.wins + WIN_RATE_PRIOR * heroWinRate) / (n.matches + WIN_RATE_PRIOR);
      items[itemId] = [round(games / hs.matches), round(wr), n.matches];
    }
    const enhancedItems = {};
    for (const [itemId, e] of enhanced) {
      const tier = tierOf(itemId);
      if (!items[itemId] || !tier) continue;
      // Few enhanced games per item: smoothed towards the item's normal win rate + its tier's enhanced gap
      const prior = items[itemId][1] + (tierGain[tier] ?? 0);
      enhancedItems[itemId] = [round((e.wins + WIN_RATE_PRIOR * prior) / (e.matches + WIN_RATE_PRIOR)), e.matches];
    }
    heroes[localId] = {
      matches: hs.matches,
      winRate: round(heroWinRate),
      enhancedTierGain: Object.fromEntries(Object.entries(tierGain).map(([t, v]) => [t, round(v, 4)])),
      items,
      enhancedItems,
      abilityPlan: plan,
      draft: draft.byHero.get(m.apiHeroId) ?? {},
      paths: paths[localId] ?? {},
    };
    console.log(
      `  ✓ ${m.nameEn.padEnd(16)} ${String(hs.matches).padStart(8)} games  ${Object.keys(items).length} items, ` +
        `${Object.keys(enhancedItems).length} enhanced, points ${plan.map((s) => s[0]).join('')}  (enhanced gap: ${Object.entries(tierGain)
          .map(([t, v]) => `T${t} ${(v * 100).toFixed(1)}`)
          .join(' ')})`
    );
  }
  console.log(
    `  all heroes, enhanced gap by tier: ${Object.entries(globalGap)
      .map(([t, v]) => `T${t} ${(v * 100).toFixed(2)} pts (${gapSum[t].games} games)`)
      .join(', ')}`
  );

  const out = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    draftGoodShare: draft.goodShare,
    draftRoundTiers: draft.roundTiers,
    soulValue: souls,
    legendaryItems: legendary,
    heroes,
  };
  validate(out, new Set([...Object.keys(catalog), ...Object.keys(legendary)]));
  // One hero per line: small file, readable diffs
  const heroLines = Object.entries(heroes).map(([id, h]) => `  ${JSON.stringify(id)}: ${JSON.stringify(h)}`);
  const legendaryLines = Object.entries(legendary).map(([id, x]) => `  ${JSON.stringify(id)}: ${JSON.stringify(x)}`);
  const { heroes: _h, legendaryItems: _l, ...head } = out;
  const text =
    `${JSON.stringify(head).slice(0, -1)},\n "legendaryItems": {\n${legendaryLines.join(',\n')}\n },\n` +
    ` "heroes": {\n${heroLines.join(',\n')}\n }\n}\n`;
  JSON.parse(text); // never write a file the app could not read
  await fs.writeFile(path.join(GENERATED, 'streetBrawl.json'), text);
  console.log(`✔ ${Object.keys(heroes).length} heroes written to src/data/generated/streetBrawl.json`);
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
