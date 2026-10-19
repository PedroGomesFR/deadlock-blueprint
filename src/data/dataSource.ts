/**
 * Generated game data (item catalogue, meta builds — scripts/update-builds.mjs).
 *
 * A copy is bundled with the application, and the latest one is downloaded from the GitHub repository (main
 * branch, refreshed every week by .github/workflows/update-builds.yml): a Deadlock patch reaches the players
 * without a new release. The download is cached in localStorage and checked at most every few hours; only the
 * main window downloads, the overlay reads the cache.
 *
 * Everything that reads the data (deadlockData.ts) must be imported after `loadGameData()` resolves: main.tsx
 * imports the application dynamically for that reason.
 */
import bundledCatalog from './generated/itemsCatalog.json';
import bundledMeta from './generated/metaBuilds.json';

/** Must match SCHEMA_VERSION in scripts/update-builds.mjs: data of another version is never used. */
export const DATA_SCHEMA_VERSION = 2;

// The branch explicitly: the repository also had a tag named "main" (release 1.2.0), and "main" alone is ambiguous
export const REPO_RAW_BASE = 'https://raw.githubusercontent.com/PedroGomesFR/deadlock-blueprint/refs/heads/main';
const CACHE_KEY = 'dl_remoteData';
const REFRESH_AFTER_MS = 6 * 3600 * 1000;
// Longest wait for the download at startup; a later answer is cached for the next launch
const STARTUP_WAIT_MS = 2500;
const FETCH_TIMEOUT_MS = 10000;

interface GeneratedFile {
  schemaVersion?: number;
  generatedAt?: string;
}
type CatalogFile = GeneratedFile & { items: Record<string, { id: string; icon?: string }> };
type MetaFile = GeneratedFile & { heroes: Record<string, unknown> };

interface CachedData {
  catalog: CatalogFile;
  meta: MetaFile;
  checkedAt: number;
}

export type DataOrigin = 'bundled' | 'online';

let catalog: CatalogFile = bundledCatalog as unknown as CatalogFile;
let meta: MetaFile = bundledMeta as unknown as MetaFile;
let origin: DataOrigin = 'bundled';
let frozen = false;

const generatedTime = (f: GeneratedFile) => Date.parse(f.generatedAt ?? '') || 0;

function isUsable(c: CatalogFile | undefined, m: MetaFile | undefined): c is CatalogFile {
  return (
    !!c &&
    !!m &&
    c.schemaVersion === DATA_SCHEMA_VERSION &&
    m.schemaVersion === DATA_SCHEMA_VERSION &&
    Object.keys(c.items ?? {}).length >= 100 &&
    Object.keys(m.heroes ?? {}).length >= 30
  );
}

/** Items added after this release have no bundled icon: their icon is read from the repository. */
function withRemoteIcons(remote: CatalogFile): CatalogFile {
  const bundledItems = (bundledCatalog as unknown as CatalogFile).items;
  const items: CatalogFile['items'] = {};
  for (const [id, item] of Object.entries(remote.items)) {
    items[id] =
      bundledItems[id] || !item.icon?.startsWith('./')
        ? item
        : { ...item, icon: `${REPO_RAW_BASE}/public/${item.icon.slice(2)}` };
  }
  return { ...remote, items };
}

/** Uses this data if it is valid and newer than the current one. */
function adopt(c: CatalogFile | undefined, m: MetaFile | undefined): boolean {
  if (frozen || !isUsable(c, m) || generatedTime(c) <= generatedTime(catalog)) return false;
  catalog = withRemoteIcons(c);
  meta = m!;
  origin = 'online';
  return true;
}

function readCache(): CachedData | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeCache(data: CachedData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable: the bundled data stays in use
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${REPO_RAW_BASE}/${path}`, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadLatest(previous: CachedData | null): Promise<void> {
  try {
    const [c, m] = await Promise.all([
      fetchJson<CatalogFile>('src/data/generated/itemsCatalog.json'),
      fetchJson<MetaFile>('src/data/generated/metaBuilds.json'),
    ]);
    if (!isUsable(c, m)) {
      // Data of another schema (newer application needed): keep what we have, retry later
      if (previous) writeCache({ ...previous, checkedAt: Date.now() });
      return;
    }
    writeCache({ catalog: c, meta: m, checkedAt: Date.now() });
    adopt(c, m);
  } catch {
    // Offline or GitHub unreachable: bundled or cached data
  }
}

/**
 * Picks the newest valid data (bundled, cached, online) before the application is imported. `bundledOnly`:
 * the data shipped with this version, nothing else (replay harness: results must not depend on the day).
 */
export async function loadGameData({ bundledOnly = false } = {}): Promise<void> {
  if (bundledOnly) {
    frozen = true;
    return;
  }
  const cached = readCache();
  if (cached) adopt(cached.catalog, cached.meta);

  const isOverlayWindow = window.location.hash === '#overlay';
  const isStale = !cached || Date.now() - cached.checkedAt > REFRESH_AFTER_MS;
  if (!isOverlayWindow && isStale && navigator.onLine !== false) {
    await Promise.race([downloadLatest(cached), new Promise((resolve) => setTimeout(resolve, STARTUP_WAIT_MS))]);
  }
  // From now on the data is read by the application: a late download only refreshes the cache
  frozen = true;
}

export const getCatalogData = () => catalog;
export const getMetaData = () => meta;

/** Where the data in use comes from, and when it was generated (Settings › About). */
export const getDataInfo = () => ({ origin, generatedAt: catalog.generatedAt ?? '' });
