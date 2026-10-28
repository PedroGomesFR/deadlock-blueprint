import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../tests/streetBrawl/png';
import { ROOT, frame, itemTemplates as templates, tierOf } from '../../tests/streetBrawl/fixtures';
import { toGrid } from './image';
import { AbilityTemplate, readHero } from './heroReader';
import { holdCoveredCards, readPickScreen } from './pickScreen';
import type { PickScreenReading } from './pickScreen';

const CASES_DIR = path.join(ROOT, 'tests/streetBrawl');

interface Case {
  frame: string;
  open: boolean;
  /** The game's round, on pick screens */
  round?: number;
  rerolls?: number;
  choice?: number;
  /** The hero read from the ability icons; null = none must be read */
  hero?: string | null;
  cards?: Record<string, unknown>[];
}

// Every hero's 4 ability icons, as getAbilityTemplates loads them (public/icons/abilities/api/<hero>_<key>.png)
const ABILITY_DIR = path.join(ROOT, 'public/icons/abilities/api');
const abilityTemplates: AbilityTemplate[] = fs
  .readdirSync(ABILITY_DIR)
  .filter((f) => /_[1-4]\.png$/.test(f))
  .map((f) => ({
    heroId: f.replace(/_[1-4]\.png$/, ''),
    key: f.slice(-5, -4) as AbilityTemplate['key'],
    grid: toGrid(decodePng(path.join(ABILITY_DIR, f))),
  }));

const { cases } = JSON.parse(fs.readFileSync(path.join(CASES_DIR, 'cases.json'), 'utf8')) as { cases: Case[] };

describe('Street Brawl pick screen', () => {
  it('has templates for the whole catalogue, the legendary items and every hero’s abilities', () => {
    expect(templates.length).toBeGreaterThan(120);
    expect(templates.some((t) => t.itemId === 'celestial_blessing')).toBe(true);
    expect(new Set(abilityTemplates.map((t) => t.heroId)).size).toBeGreaterThanOrEqual(40);
  });

  it.each(cases.map((c) => [c.frame, c] as const))('reads %s', (_name, c) => {
    const img = frame(c.frame);
    const reading = readPickScreen(img, templates, tierOf);
    expect(reading.open).toBe(c.open);
    if (c.rerolls !== undefined) expect(reading.rerolls).toBe(c.rerolls);
    if (c.choice !== undefined) expect(reading.choice).toBe(c.choice);
    if (c.hero !== undefined) expect(readHero(img, abilityTemplates).heroId).toBe(c.hero);
    c.cards?.forEach((expected, i) => expect(reading.cards[i]).toMatchObject(expected));
  });
});

describe('a card covered by a tooltip', () => {
  const covered = () => readPickScreen(frame('pick_r1_c2_tooltip_over_centre'), templates, tierOf);
  // The scan before the hover: the same pick, all three cards read, 1 re-roll left
  const before: PickScreenReading = {
    ...covered(),
    rerolls: 1,
    cards: covered().cards.map((c) => (c.position === 'center' ? { ...c, itemId: 'cold_front', distance: 0.01 } : c)),
  };

  it('keeps the card and the re-rolls it read just before, on the same pick', () => {
    const held = holdCoveredCards(before, covered());
    expect(held.cards.map((c) => c.itemId)).toEqual(['cold_front', 'guardian_ward', 'intensifying_magazine']);
    expect(held.rerolls).toBe(1);
  });

  it('keeps nothing from another pick, or after a re-roll', () => {
    expect(holdCoveredCards({ ...before, choice: 1 }, covered()).cards[0].itemId).toBeNull();
    expect(holdCoveredCards(before, { ...covered(), rerolls: 0 }).cards[0].itemId).toBeNull();
    expect(holdCoveredCards(null, covered()).cards[0].itemId).toBeNull();
  });

  it('prefers what it reads now over what it remembers', () => {
    const now = covered();
    const prev = { ...before, cards: before.cards.map((c) => (c.position === 'left' ? { ...c, itemId: 'grit' } : c)) };
    expect(holdCoveredCards(prev, now).cards[1].itemId).toBe('guardian_ward');
  });
});
