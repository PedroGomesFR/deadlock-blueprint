/**
 * Replays a game log (journal.log, src/services/matchLogger.ts) through the application's rules
 * (MatchTracker): each SCAN line is turned back into a scanner result, repeated every 350 ms until the next one,
 * as the real scan loop does. Used by the regression tests (matchTracker.test.ts) on recorded games.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import type { LaneColor, LaneMode } from '../data/deadlockData';
import type { InventorySlotReading, VisionDetectionResult } from '../services/visionScanner';
import { MatchSnapshot, MatchTracker } from '../services/matchTracker';
import { InventoryStatus } from '../services/recommendations';

export interface JournalScan {
  t: number; // ms since midnight
  detection: VisionDetectionResult;
}

export interface ParsedJournal {
  start: MatchSnapshot;
  scans: JournalScan[];
}

const SCAN_INTERVAL_MS = 350;

const timeOf = (line: string) => {
  const m = line.match(/^(\d\d):(\d\d):(\d\d)\.(\d{3}) /);
  return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4] : NaN;
};
const list = (s: string | undefined) => (s ? s.split(',').filter(Boolean) : []);
// "?" unreadable, "✝" dead (respawn timer; older logs wrote "?" for both)
const slotList = (s: string | undefined) =>
  s === undefined || s === '-' ? undefined : s.split(',').map((id) => (id === '?' || id === '✝' ? null : id));
const deadList = (s: string | undefined) => (s === undefined || s === '-' ? undefined : s.split(',').map((id) => id === '✝'));
const orUndefined = (s: string | undefined) => (s && s !== '-' ? s : undefined);

function parseSlot(token: string): InventorySlotReading {
  const [slot, ...rest] = token.trim().split(/\s+/);
  const value = rest.join(' ');
  if (value === '·' || value === '') return { slot, state: 'empty' };
  if (value === '🔒') return { slot, state: 'locked' };
  const unknown = value.match(/^\?(\w+):(\S+) (\S+)\/(\S+) (\S+)/);
  if (unknown) {
    return {
      slot,
      state: 'unknown',
      category: unknown[1] as InventorySlotReading['category'],
      itemId: unknown[2],
      error: parseFloat(unknown[3]),
      secondId: unknown[4],
      secondError: parseFloat(unknown[5]),
    };
  }
  const [id, error] = value.split(' ');
  return id.startsWith('⏳')
    ? { slot, state: 'cooldown', itemId: id.slice(1), error: parseFloat(error) }
    : { slot, state: 'item', itemId: id, error: parseFloat(error) };
}

function parseScan(line: string): VisionDetectionResult | null {
  const m = line.match(
    /SCAN (HUD|BOUTIQUE|AUTRE) héros=(\S+) \(portrait (\S+), sorts (\S+)\) âmes=(\S+) ennemis=\[([^\]]*)\](?: alliés@=\[([^\]]*)\] ennemis@=\[([^\]]*)\])? slots occupés=(\d+) cadenas=(\d+) inconnus=(\d+) \| (.*)$/
  );
  if (!m) return null;
  const [, mode, hero, portrait, abilities, souls, enemies, alliesAt, enemiesAt, occupied, locked, unknown, slotsText] = m;
  const inventorySlots = slotsText.split(' | ').map(parseSlot);
  const enemyIds = list(enemies);
  // Logs older than 1.4.0 have no slot-by-slot portraits: a full list of 6 still gives the slots in order
  let enemySlots = slotList(enemiesAt);
  let allySlots = slotList(alliesAt);
  if (!enemySlots && mode === 'HUD' && enemyIds.length === 6) {
    enemySlots = enemyIds;
    allySlots = new Array(6).fill(null);
  }
  return {
    detectedHeroId: orUndefined(hero),
    highlightedHeroId: orUndefined(portrait),
    abilityHeroId: orUndefined(abilities),
    detectedLaneEnemyIds: [],
    detectedTeamEnemyIds: [],
    detectedAllyIds: [],
    detectedEnemyIds: enemyIds,
    allySlots,
    enemySlots,
    allyDead: deadList(alliesAt),
    enemyDead: deadList(enemiesAt),
    detectedOwnedItemIds: [
      ...new Set(inventorySlots.filter((s) => s.state === 'item' || s.state === 'cooldown').map((s) => s.itemId!)),
    ],
    inventoryScanned: true,
    occupiedSlotsCount: +occupied,
    lockedSlotsCount: +locked,
    unmatchedSlotsCount: +unknown,
    inventorySlots,
    hudVisible: mode === 'HUD',
    shopOpen: mode === 'BOUTIQUE',
    detectedSouls: souls === '?' ? undefined : +souls,
    frameWidth: 1920,
    frameHeight: 1080,
    rawText: '',
    confidence: 0,
    sourceName: 'Deadlock',
    isDeadlockWindow: true,
    timestamp: '',
    debugLogs: [],
  };
}

/** State of the application when the log started (its first ÉTAT lines). */
function parseStart(lines: string[]): MatchSnapshot {
  const heroLine = lines.find((l) => l.includes(' ÉTAT héros ')) ?? '';
  const h = heroLine.match(
    /ÉTAT héros (\S+)( 🔒)? build=\S+ lane=(\w+)\/(\w+) partenaire=(\S+) ennemis lane=\[([^\]]*)\] équipe=\[([^\]]*)\]/
  );
  const owned = lines.find((l) => l.includes(' ÉTAT possédés '))?.match(/ÉTAT possédés \[([^\]]*)\]/)?.[1] ?? '';
  return {
    myHeroId: h?.[1] ?? 'infernus',
    heroLocked: Boolean(h?.[2]),
    ownedItems: owned.split(', ').filter(Boolean),
    soldItems: [],
    manualOwned: new Set(),
    manuallyExcluded: new Set(),
    laneColor: (h?.[3] ?? 'yellow') as LaneColor,
    laneMode: (h?.[4] ?? 'duo') as LaneMode,
    allyPartnerId: h && h[5] !== '-' ? h[5] : null,
    laneEnemyIds: list(h?.[6]),
    teamEnemyIds: list(h?.[7]),
    currentSouls: null,
    inventoryStatus: null,
  };
}

export function parseJournal(text: string): ParsedJournal {
  const lines = text.split(/\r?\n/);
  const scans: JournalScan[] = [];
  for (const line of lines) {
    if (!line.includes(' SCAN ')) continue;
    const detection = parseScan(line);
    const t = timeOf(line);
    if (detection && !Number.isNaN(t)) scans.push({ t, detection });
  }
  return { start: parseStart(lines), scans };
}

export function readJournal(file: string): ParsedJournal {
  const data = fs.readFileSync(file);
  return parseJournal((file.endsWith('.gz') ? zlib.gunzipSync(data) : data).toString('utf8'));
}

export interface ReplayStep {
  t: number;
  detection: VisionDetectionResult;
  state: MatchSnapshot;
  log: { kind: 'event' | 'restart'; text: string }[];
  clearOwned: boolean;
}

/**
 * Feeds the journal to a fresh MatchTracker, one scan every 350 ms, applying each update to the state like
 * App.tsx does. Returns every step.
 */
export function replayJournal(journal: ParsedJournal): ReplayStep[] {
  const tracker = new MatchTracker();
  let state: MatchSnapshot = { ...journal.start };
  const steps: ReplayStep[] = [];
  const { scans } = journal;
  for (let i = 0; i < scans.length; i++) {
    const end = i + 1 < scans.length ? scans[i + 1].t : scans[i].t + SCAN_INTERVAL_MS;
    for (let t = scans[i].t; t < end; t += SCAN_INTERVAL_MS) {
      const update = tracker.push(scans[i].detection, state, t);
      if (update.clearOwned) state = { ...state, ownedItems: [], soldItems: [], inventoryStatus: null as InventoryStatus | null };
      state = {
        ...state,
        ...update.patch,
        heroLocked: update.heroLocked ?? state.heroLocked,
      };
      steps.push({ t, detection: scans[i].detection, state, log: update.log, clearOwned: update.clearOwned });
    }
  }
  return steps;
}
