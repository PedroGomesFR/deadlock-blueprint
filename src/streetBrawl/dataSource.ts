// The latest Street Brawl data, downloaded from the repository (refreshed weekly by
// .github/workflows/update-builds.yml) when the tab opens, like the normal-mode data at launch (src/data/dataSource.ts).
// Kept apart from that file: the tab works with the bundled copy until the download arrives, and the rest of the app
// never waits for it.
import { REPO_RAW_BASE } from '../data/dataSource';
import { STREET_BRAWL_SCHEMA_VERSION, adoptStreetBrawlFile, streetBrawlDataInfo } from './stats';
import type { StreetBrawlFile } from './stats';

// Not "dl_…": those settings are copied into bug reports, and this is a large file
const CACHE_KEY = 'streetBrawl.remoteData';
const REFRESH_AFTER_MS = 6 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 10000;

interface Cached {
  file: StreetBrawlFile;
  checkedAt: number;
}

let loading: Promise<boolean> | null = null;

/** A file with fewer heroes than this is a broken download (the game has 44, the generator refuses fewer than 35). */
const MIN_HEROES = 30;

function isUsableStreetBrawlFile(f: StreetBrawlFile | undefined): f is StreetBrawlFile {
  return (
    !!f &&
    f.schemaVersion === STREET_BRAWL_SCHEMA_VERSION &&
    typeof f.generatedAt === 'string' &&
    Object.keys(f.heroes ?? {}).length >= MIN_HEROES
  );
}

const newer = (f: StreetBrawlFile) => (Date.parse(f.generatedAt ?? '') || 0) > (Date.parse(streetBrawlDataInfo().generatedAt) || 0);

/** Uses the file if it is valid and newer than the one in use. */
function adopt(f: StreetBrawlFile | undefined): boolean {
  if (!isUsableStreetBrawlFile(f) || !newer(f)) return false;
  adoptStreetBrawlFile(f, REPO_RAW_BASE);
  return true;
}

function readCache(): Cached | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeCache(c: Cached): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // Storage full or unavailable: the bundled data stays in use
  }
}

async function download(): Promise<StreetBrawlFile | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${REPO_RAW_BASE}/src/data/generated/streetBrawl.json`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok ? ((await res.json()) as StreetBrawlFile) : undefined;
  } catch {
    // Offline or GitHub unreachable: bundled or cached data
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The newest valid data (bundled, cached, online), once per app run. Resolves true when the data in use changed (the
 * tab re-reads the hero's statistics and the legendary icons then).
 */
export function loadStreetBrawlData(): Promise<boolean> {
  loading ??= (async () => {
    const cached = readCache();
    let changed = adopt(cached?.file);
    if (cached && Date.now() - cached.checkedAt < REFRESH_AFTER_MS) return changed;
    const file = await download();
    if (isUsableStreetBrawlFile(file)) {
      writeCache({ file, checkedAt: Date.now() });
      changed = adopt(file) || changed;
    } else if (cached) {
      // Data of another schema (newer application needed): keep what we have, retry later
      writeCache({ ...cached, checkedAt: Date.now() });
    }
    return changed;
  })();
  return loading;
}
