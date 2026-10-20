import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEROES_DB, ITEMS_DB, generateTacticalPlan, getHeroesDb, getItemsDb, getLanes } from './deadlockData';
import { EN_HEROES } from './deadlockData.en';
import { IT_HEROES } from './deadlockData.it';
import { getMetaData } from './dataSource';
import { MESSAGES_EN } from '../i18n/en';
import { MESSAGES_FR } from '../i18n/fr';
import { MESSAGES_IT } from '../i18n/it';

// French words or letters that should never reach the English interface (a missing translation falls back to French)
const FRENCH = /[éèêàâçùûœ]|\b(les|des|une|avec|pour|votre|vous|dès|à)\b/i;
// The same for the Italian interface, whose own accents (à è é ì ò ù) are not a sign of French
const FRENCH_IN_ITALIAN = /[âêîôûçœëï]|\b(les|des|une|avec|pour|votre|vous|dès|dans|cette|chez)\b/i;
// English left in the Italian hand-written texts (item and ability names are replaced by the official Italian ones)
const ENGLISH = /\b(the|and|with|your|you|when|this|that|for)\b/i;

describe('heroes', () => {
  it('every hero has a portrait (the scanner recognizes heroes by their portrait)', () => {
    for (const hero of HEROES_DB) {
      const file = hero.id === 'mo_and_krill' ? 'mo_krill' : hero.id;
      expect(fs.existsSync(`public/icons/heroes/${file}.png`), hero.id).toBe(true);
    }
  });

  it('every build only lists known items', () => {
    for (const hero of HEROES_DB) {
      expect(hero.builds.length, hero.id).toBeGreaterThan(0);
      for (const build of hero.builds) {
        for (const phase of Object.values(build.phases)) {
          for (const id of phase) {
            // Hand-written builds may name items removed since: they are skipped by the interface
            if (build.id.endsWith('_meta')) expect(ITEMS_DB[id], `${build.id}: ${id}`).toBeDefined();
          }
        }
      }
    }
  });

  it('lists the heroes of the generated statistics missing from HEROES_DB (new hero: add it and its portrait)', () => {
    const known = new Set(HEROES_DB.map((h) => h.id));
    const missing = Object.keys((getMetaData() as { heroes: Record<string, unknown> }).heroes).filter((id) => !known.has(id));
    if (missing.length > 0) console.warn(`Heroes without entry in HEROES_DB: ${missing.join(', ')}`);
    expect(missing.length).toBeLessThan(5);
  });
});

describe('English data', () => {
  const en = getHeroesDb('en');

  it('has the same heroes, builds and items as the French data', () => {
    expect(en.map((h) => h.id)).toEqual(HEROES_DB.map((h) => h.id));
    en.forEach((hero, i) => {
      expect(hero.builds.map((b) => b.id)).toEqual(HEROES_DB[i].builds.map((b) => b.id));
      hero.builds.forEach((b, j) => expect(b.phases).toEqual(HEROES_DB[i].builds[j].phases));
    });
    expect(Object.keys(getItemsDb('en'))).toEqual(Object.keys(ITEMS_DB));
  });

  it('translates every hand-written hero text', () => {
    for (const hero of HEROES_DB) {
      const text = EN_HEROES[hero.id];
      expect(text, hero.id).toBeDefined();
      for (const build of hero.builds.filter((b) => !b.id.endsWith('_meta'))) {
        expect(text.builds?.[build.id], build.id).toBeDefined();
        for (const d of build.abilitiesDetails) expect(text.builds?.[build.id]?.abilities[d.key], `${build.id} ${d.key}`).toBeDefined();
      }
      for (const enemyId of Object.keys(hero.specificMatchups ?? {})) {
        expect(text.matchups?.[enemyId], `${hero.id} vs ${enemyId}`).toBeDefined();
      }
    }
  });

  it('shows no French text', () => {
    const texts: [string, string][] = [];
    for (const hero of en) {
      texts.push([`${hero.id} role`, hero.role], [`${hero.id} tips`, hero.baseTips]);
      for (const b of hero.builds) {
        // The subtitle of a published build quotes its author's title, in any language
        texts.push([`${b.id} name`, b.name], [`${b.id} playstyle`, b.playstyle]);
        if (!b.id.endsWith('_published_meta')) texts.push([`${b.id} subtitle`, b.subtitle]);
        Object.entries(b.laneTips).forEach(([k, v]) => texts.push([`${b.id} ${k}`, v]));
        for (const d of b.abilitiesDetails) {
          texts.push([`${b.id} ${d.key} name`, d.name], [`${b.id} ${d.key} tip`, d.priorityTip], [`${b.id} ${d.key} desc`, d.description]);
        }
      }
      for (const [enemy, m] of Object.entries(hero.specificMatchups ?? {})) {
        texts.push([`${hero.id} vs ${enemy}`, `${m.summary} ${m.laneRule}`]);
      }
    }
    for (const lane of getLanes('en')) texts.push([lane.id, `${lane.name} ${lane.description} ${lane.tacticalNote}`]);
    for (const item of Object.values(getItemsDb('en'))) texts.push([item.id, `${item.name} ${item.hint} ${item.stats.join(' ')}`]);
    const french = texts.filter(([, text]) => FRENCH.test(text));
    expect(french.slice(0, 10)).toEqual([]);
    // ...and the detector does catch the French data
    expect(HEROES_DB.filter((h) => FRENCH.test(h.baseTips)).length).toBeGreaterThan(30);
    expect(Object.values(ITEMS_DB).filter((i) => FRENCH.test(`${i.name} ${i.hint}`)).length).toBeGreaterThan(100);
  });

  it('writes the counter reasons in English', () => {
    const plan = generateTacticalPlan('vindicta', 'vindicta_crow_executor', 'yellow', 'duo', ['bebop', 'haze'], ['abrams', 'lash'], 'kelvin', 'en');
    const texts = [
      ...plan.priorityItems.flatMap((p) => [p.item.name, ...p.reasons]),
      ...plan.matchupAlerts.flatMap((a) => [a.advice, a.keyRule]),
      plan.laneStrategy.laneTitle,
      plan.laneStrategy.economyTip,
      plan.laneStrategy.allySynergyTip ?? '',
    ];
    expect(texts.filter((t) => FRENCH.test(t))).toEqual([]);
    expect(plan.priorityItems.length).toBeGreaterThan(0);
  });
});

describe('Italian data', () => {
  const italian = getHeroesDb('it');

  it('has the same heroes, builds and items as the French data', () => {
    expect(italian.map((h) => h.id)).toEqual(HEROES_DB.map((h) => h.id));
    italian.forEach((hero, i) => {
      expect(hero.builds.map((b) => b.id)).toEqual(HEROES_DB[i].builds.map((b) => b.id));
      hero.builds.forEach((b, j) => expect(b.phases).toEqual(HEROES_DB[i].builds[j].phases));
    });
    expect(Object.keys(getItemsDb('it'))).toEqual(Object.keys(ITEMS_DB));
  });

  it('translates every hand-written hero text', () => {
    for (const hero of HEROES_DB) {
      const text = IT_HEROES[hero.id];
      expect(text, hero.id).toBeDefined();
      for (const build of hero.builds.filter((b) => !b.id.endsWith('_meta'))) {
        expect(text.builds?.[build.id], build.id).toBeDefined();
        for (const d of build.abilitiesDetails) expect(text.builds?.[build.id]?.abilities[d.key], `${build.id} ${d.key}`).toBeDefined();
      }
      for (const enemyId of Object.keys(hero.specificMatchups ?? {})) {
        expect(text.matchups?.[enemyId], `${hero.id} vs ${enemyId}`).toBeDefined();
      }
      // Nothing the French data does not have: a misspelt id would never be shown
      expect(Object.keys(text.builds ?? {}).filter((id) => !hero.builds.some((b) => b.id === id)), hero.id).toEqual([]);
    }
  });

  it('shows no French, and no English in the hand-written texts', () => {
    const handWritten: [string, string][] = [];
    for (const hero of italian) {
      handWritten.push([`${hero.id} role`, hero.role], [`${hero.id} tips`, hero.baseTips]);
      for (const b of hero.builds.filter((x) => !x.id.endsWith('_meta'))) {
        handWritten.push([`${b.id} name`, b.name], [`${b.id} playstyle`, b.playstyle], [`${b.id} subtitle`, b.subtitle]);
        Object.entries(b.laneTips).forEach(([k, v]) => handWritten.push([`${b.id} ${k}`, v]));
        for (const d of b.abilitiesDetails) {
          handWritten.push([`${b.id} ${d.key} tip`, d.priorityTip], [`${b.id} ${d.key} desc`, d.description]);
        }
      }
      for (const [enemy, m] of Object.entries(hero.specificMatchups ?? {})) {
        handWritten.push([`${hero.id} vs ${enemy}`, `${m.summary} ${m.laneRule}`]);
      }
    }
    for (const lane of getLanes('it')) handWritten.push([lane.id, `${lane.name} ${lane.description} ${lane.tacticalNote}`]);
    expect(handWritten.filter(([, text]) => ENGLISH.test(text)).slice(0, 10)).toEqual([]);

    const all = [...handWritten];
    for (const hero of italian) for (const b of hero.builds) all.push([`${b.id} name`, b.name]);
    for (const item of Object.values(getItemsDb('it'))) all.push([item.id, `${item.name} ${item.hint} ${item.stats.join(' ')}`]);
    expect(all.filter(([, text]) => FRENCH_IN_ITALIAN.test(text)).slice(0, 10)).toEqual([]);
    // ...and the detectors do catch the French data and the English one
    expect(HEROES_DB.filter((h) => FRENCH_IN_ITALIAN.test(`${h.role} ${h.baseTips}`)).length).toBeGreaterThan(10);
    expect(getHeroesDb('en').filter((h) => ENGLISH.test(h.baseTips)).length).toBeGreaterThan(20);
  });

  it('uses the official Italian names of items and abilities', () => {
    const vindicta = italian.find((h) => h.id === 'vindicta')!;
    const rule = vindicta.specificMatchups!.bebop.laneRule;
    expect(rule).toContain(getItemsDb('it').reactive_barrier.name);
    expect(rule).not.toContain('Reactive Barrier');
    const meta = (getMetaData() as { heroes: Record<string, { abilities: { key: string; nameIt?: string }[] }> }).heroes.vindicta;
    for (const build of vindicta.builds) {
      for (const d of build.abilitiesDetails) {
        expect(d.name, `${build.id} ${d.key}`).toBe(meta.abilities.find((a) => a.key === d.key)?.nameIt);
      }
    }
  });

  it('writes the counter reasons in Italian', () => {
    const plan = generateTacticalPlan('vindicta', 'vindicta_crow_executor', 'yellow', 'duo', ['bebop', 'haze'], ['abrams', 'lash'], 'kelvin', 'it');
    const texts = [
      ...plan.priorityItems.flatMap((p) => p.reasons),
      ...plan.matchupAlerts.flatMap((a) => [a.advice, a.keyRule]),
      plan.laneStrategy.laneTitle,
      plan.laneStrategy.economyTip,
      plan.laneStrategy.allySynergyTip ?? '',
    ];
    expect(texts.filter((t) => FRENCH_IN_ITALIAN.test(t) || ENGLISH.test(t))).toEqual([]);
    expect(plan.priorityItems.length).toBeGreaterThan(0);
  });
});

describe('interface texts', () => {
  it('has the same keys in every language, and none empty', () => {
    expect(Object.keys(MESSAGES_EN).sort()).toEqual(Object.keys(MESSAGES_FR).sort());
    expect(Object.keys(MESSAGES_IT).sort()).toEqual(Object.keys(MESSAGES_FR).sort());
    for (const table of [MESSAGES_FR, MESSAGES_EN, MESSAGES_IT]) {
      for (const [key, message] of Object.entries(table)) {
        const text = typeof message === 'function' ? (message as (...a: unknown[]) => string)('1', 2, 3) : message;
        expect(text.trim().length, key).toBeGreaterThan(0);
      }
    }
  });

  it('has no French in the English interface', () => {
    const french = Object.entries(MESSAGES_EN)
      .map(([key, m]) => [key, typeof m === 'function' ? (m as (...a: unknown[]) => string)('x', 1, 1) : m] as const)
      .filter(([, text]) => FRENCH.test(text));
    expect(french).toEqual([]);
  });

  it('has no French or English in the Italian interface', () => {
    const wrong = Object.entries(MESSAGES_IT)
      .map(([key, m]) => [key, typeof m === 'function' ? (m as (...a: unknown[]) => string)('x', 1, 1) : m] as const)
      .filter(([, text]) => FRENCH_IN_ITALIAN.test(text) || ENGLISH.test(text));
    expect(wrong).toEqual([]);
  });
});
