// The reference images the Street Brawl readers compare the screen with, each reduced to a matching grid: the items'
// icons, every hero's ability icons and the end-of-game screen's crops. Browser only (the tests decode the same PNG
// files themselves).
//
// Each set is loaded once, on first use, and kept for the app's life. The item icons are the exception: newer data
// can add legendary items (dataSource.ts), so the panel calls resetItemTemplates() and the next call reloads them.
import { HEROES_DB, ITEMS_DB, getAbilityIcon } from '../data/deadlockData';
import { toGrid } from './image';
import type { ItemTemplate } from './pickScreen';
import type { AbilityTemplate } from './heroReader';
import type { EndScreenTemplates } from './endScreen';
import { LEGENDARY_ITEMS } from './stats';
import type { AbilityKey } from './stats';

let cachedItems: Promise<ItemTemplate[]> | null = null;
let cachedAbilities: Promise<AbilityTemplate[]> | null = null;
let cachedEndScreen: Promise<EndScreenTemplates | null> | null = null;

/** An image file reduced to a matching grid, or null when it cannot be loaded. */
function loadGrid(src: string): Promise<Float32Array | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx || c.width === 0) return resolve(null);
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      resolve(toGrid({ data, width, height }));
    };
    img.onerror = () => resolve(null);
    // An icon from the repository (legendary item newer than this release): readable pixels need CORS
    if (/^https?:/.test(src)) img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

/** Every item's icon: the shop's items plus the Street Brawl-only legendary ones. */
export function getItemTemplates(): Promise<ItemTemplate[]> {
  cachedItems ??= (() => {
    const icons: [string, string][] = [
      ...Object.values(ITEMS_DB).flatMap((item): [string, string][] => (item.icon ? [[item.id, item.icon]] : [])),
      ...Object.entries(LEGENDARY_ITEMS).flatMap(([id, item]): [string, string][] => (item.icon ? [[id, item.icon]] : [])),
    ];
    return Promise.all(
      icons.map(async ([itemId, src]): Promise<ItemTemplate | null> => {
        const grid = await loadGrid(src);
        return grid ? { itemId, grid } : null;
      })
    ).then((all) => all.filter((t): t is ItemTemplate => t !== null));
  })();
  return cachedItems;
}

/** Forgets the item icons: the next getItemTemplates() reloads them (new legendary items downloaded). */
export function resetItemTemplates(): void {
  cachedItems = null;
}

/** Every hero's 4 ability icons (public/icons/abilities/api), for readHero. */
export function getAbilityTemplates(): Promise<AbilityTemplate[]> {
  const keys: AbilityKey[] = ['1', '2', '3', '4'];
  cachedAbilities ??= Promise.all(
    HEROES_DB.flatMap((hero) =>
      keys.map(async (key): Promise<AbilityTemplate | null> => {
        const src = getAbilityIcon(hero.id, key);
        const grid = src ? await loadGrid(src) : null;
        return grid ? { heroId: hero.id, key, grid } : null;
      })
    )
  ).then((all) => all.filter((t): t is AbilityTemplate => t !== null));
  return cachedAbilities;
}

/** The end-of-game screen's reference crops (public/icons/streetBrawl/ui), or null if one is missing. */
export function getEndScreenTemplates(): Promise<EndScreenTemplates | null> {
  cachedEndScreen ??= Promise.all(
    (['title', 'playAgain', 'roundIcons'] as const).map((part) => loadGrid(`./icons/streetBrawl/ui/${part}.png`))
  ).then(([title, playAgain, roundIcons]) => (title && playAgain && roundIcons ? { title, playAgain, roundIcons } : null));
  return cachedEndScreen;
}
