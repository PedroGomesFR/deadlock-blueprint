import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Camera,
  ChevronDown,
  Flame,
  Info,
  LayoutGrid,
  Layers,
  Lock,
  MonitorX,
  Package,
  Radio,
  RotateCcw,
  Settings,
  ShoppingCart,
  Swords,
  Terminal,
  Unlock,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import {
  LaneColor,
  LaneMode,
  formatPercent,
  generateTacticalPlan,
  getHeroItemStat,
  getHeroMetaInfo,
  getHeroesDb,
  getItemsDb,
  getLanes,
  rankLabel,
} from './data/deadlockData';
import { getDataInfo } from './data/dataSource';
import { analyzeDeadlockScreen, VisionDetectionResult } from './services/visionScanner';
import { MatchSnapshot, MatchTracker, MatchUpdate } from './services/matchTracker';
import {
  INVENTORY_SLOTS,
  InventoryStatus,
  QueueEntry,
  buildPurchaseOrder,
  effectiveOwnedSet,
  getPurchaseCounters,
  getNextPurchases,
  getSellCandidates,
  getSlotPlans,
  isInventoryFull,
  withLockedFirst,
} from './services/recommendations';
import {
  isMatchLogEnabled,
  logEvent,
  logScan,
  logState,
  restartMatchLog,
  setMatchLogEnabled,
} from './services/matchLogger';
import { grabGameFrame, releaseGameFrame } from './services/screenCapture';
import type { AppInfo, ElectronSourceInfo, UpdateStatus } from './electron';
import { ItemCard } from './components/ItemCard';
import { HeroPortraitIcon, ItemArtworkIcon, PowerIcon } from './components/DeadlockIcons';
import { CopyNameButton, ShopTabMarker } from './components/ShopHelpers';
import { SettingsModal } from './components/SettingsModal';
import { OnboardingModal } from './components/OnboardingModal';
import { ReportContent, ReportDialog } from './components/ReportDialog';
import { DiagnosticsTab } from './components/DiagnosticsTab';
import { I18nContext, makeI18n } from './i18n';
import { Lang, detectLang, readStoredLang, storeLang } from './i18n/lang';

type MainTab = 'essential' | 'builds' | 'powers' | 'matchups' | 'logs';

interface LockedNextPurchase {
  key: string; // `${heroId}|${buildId}` — the lock is dropped when the hero or the build changes
  itemId: string;
}

// Overlay window only: its opacity (so it hides less of the minimap) and its size (page zoom, the window follows)
const OVERLAY_OPACITY_KEY = 'dl_overlayOpacity';
const OVERLAY_SCALE_KEY = 'dl_overlayScale';
const OVERLAY_SCALES = [1, 0.85, 0.7];
const OVERLAY_MIN_OPACITY = 0.3;

function readStoredNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const value = parseFloat(localStorage.getItem(key) ?? '');
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  } catch {
    return fallback;
  }
}

function storeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Ignore
  }
}

// Items marked as owned by hand ("Skip" / click), shared with the overlay window: the scanner never
// removes them, since they are usually not (yet) in the inventory
const MANUAL_OWNED_KEY = 'dl_manualOwned';

function readManualOwned(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(MANUAL_OWNED_KEY) || '[]'));
  } catch {
    return new Set<string>();
  }
}

function writeManualOwned(ids: Set<string>): void {
  localStorage.setItem(MANUAL_OWNED_KEY, JSON.stringify([...ids]));
}

/** Data URL of a captured frame for the Diagnostics preview (only built while that tab is open). */
function frameToPreviewUrl(image: ImageBitmap | string): string {
  if (typeof image === 'string') return image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}

const DANGER_KEYS = {
  Low: 'danger.Low',
  Medium: 'danger.Medium',
  High: 'danger.High',
  Extreme: 'danger.Extreme',
} as const;

// My hero is auto-detected once per match, then locked (persisted so a restart mid-match keeps it)
const HERO_LOCKED_KEY = 'dl_heroLocked';
// First launch done (language and game logs chosen)
const ONBOARDED_KEY = 'dl_onboarded';

/** "16:9", "21:9"... for the unsupported format message. */
function aspectLabel(width: number, height: number): string {
  const ratio = width / height;
  const known: [string, number][] = [
    ['16:9', 16 / 9],
    ['16:10', 16 / 10],
    ['21:9', 64 / 27],
    ['32:9', 32 / 9],
    ['4:3', 4 / 3],
    ['5:4', 5 / 4],
  ];
  const [label, value] = known.reduce((best, k) => (Math.abs(k[1] - ratio) < Math.abs(best[1] - ratio) ? k : best));
  return Math.abs(value - ratio) < 0.02 ? label : `${ratio.toFixed(2)}:1`;
}

export function App() {
  const isDedicatedOverlayWindow = window.location.hash === '#overlay';

  // v6: generated high-rank meta builds are now Build #1 — drop the previously saved build choice
  if (!localStorage.getItem('dl_sync_v6')) {
    localStorage.setItem('dl_sync_v6', '1');
    localStorage.removeItem('dl_selectedBuildId');
    localStorage.removeItem('dl_lockedNext');
  }

  // Interface language (shared with the overlay through localStorage)
  const [lang, setLang] = useState<Lang>(detectLang);
  const i18n = useMemo(() => makeI18n(lang), [lang]);
  const { t, formatNumber, formatDuration } = i18n;
  const HEROES = useMemo(() => getHeroesDb(lang), [lang]);
  const ITEMS = useMemo(() => getItemsDb(lang), [lang]);
  const LANES = useMemo(() => getLanes(lang), [lang]);
  const changeLang = useCallback((next: Lang) => {
    storeLang(next);
    setLang(next);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Core Match State
  const [myHeroId, setMyHeroId] = useState<string>(
    () => localStorage.getItem('dl_myHeroId') || 'infernus'
  );
  // Empty = first build of the hero (the high-rank meta build), resolved by the effect below
  const [selectedBuildId, setSelectedBuildId] = useState<string>(
    () => localStorage.getItem('dl_selectedBuildId') || ''
  );
  const [laneColor, setLaneColor] = useState<LaneColor>(
    () => (localStorage.getItem('dl_laneColor') as LaneColor) || 'yellow'
  );
  const [laneMode, setLaneMode] = useState<LaneMode>(
    () => (localStorage.getItem('dl_laneMode') as LaneMode) || 'duo'
  );
  const [allyPartnerId, setAllyPartnerId] = useState<string | null>(() =>
    localStorage.getItem('dl_allyPartnerId')
  );
  const [laneEnemyIds, setLaneEnemyIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('dl_laneEnemyIds') || '["solomon","paige"]');
    } catch {
      return ['solomon', 'paige'];
    }
  });
  const [teamEnemyIds, setTeamEnemyIds] = useState<string[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem('dl_teamEnemyIds') || '["yamato","ivy","mcginnis","seven"]'
      );
    } catch {
      return ['yamato', 'ivy', 'mcginnis', 'seven'];
    }
  });
  const [ownedItems, setOwnedItems] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('dl_ownedItems') || '[]');
    } catch {
      return [];
    }
  });
  const [currentSouls, setCurrentSouls] = useState<number | null>(() => {
    const saved = localStorage.getItem('dl_currentSouls');
    return saved ? parseInt(saved, 10) : null;
  });
  // Last readable inventory (slots used / padlocked, items in it): written by the main window, read by the overlay
  const [inventoryStatus, setInventoryStatus] = useState<InventoryStatus | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('dl_inventoryStatus') || 'null');
    } catch {
      return null;
    }
  });
  const [isHeroLocked, setIsHeroLocked] = useState<boolean>(
    () => localStorage.getItem(HERO_LOCKED_KEY) === '1'
  );
  // Locked "next purchase" (#1): written by the main window, read by the overlay so both show the same item
  const [lockedNext, setLockedNext] = useState<LockedNextPurchase | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('dl_lockedNext') || 'null');
    } catch {
      return null;
    }
  });

  // Sync changes between Main Desktop Window (Vertical Monitor) and Transparent Overlay HUD (Gaming Monitor)
  useEffect(() => {
    if (!isDedicatedOverlayWindow) {
      localStorage.setItem('dl_myHeroId', myHeroId);
      localStorage.setItem('dl_selectedBuildId', selectedBuildId);
      localStorage.setItem('dl_laneColor', laneColor);
      localStorage.setItem('dl_laneMode', laneMode);
      if (allyPartnerId) localStorage.setItem('dl_allyPartnerId', allyPartnerId);
      else localStorage.removeItem('dl_allyPartnerId');
      localStorage.setItem('dl_laneEnemyIds', JSON.stringify(laneEnemyIds));
      localStorage.setItem('dl_teamEnemyIds', JSON.stringify(teamEnemyIds));
      localStorage.setItem('dl_ownedItems', JSON.stringify(ownedItems));
      if (currentSouls !== null) localStorage.setItem('dl_currentSouls', String(currentSouls));
      localStorage.setItem('dl_inventoryStatus', JSON.stringify(inventoryStatus));
    }
  }, [
    isDedicatedOverlayWindow,
    myHeroId,
    selectedBuildId,
    laneColor,
    laneMode,
    allyPartnerId,
    laneEnemyIds,
    teamEnemyIds,
    ownedItems,
    currentSouls,
    inventoryStatus,
  ]);

  useEffect(() => {
    const onStorage = () => {
      const l = readStoredLang();
      if (l) setLang(l);
      const h = localStorage.getItem('dl_myHeroId');
      if (h) setMyHeroId(h);
      const b = localStorage.getItem('dl_selectedBuildId');
      if (b) setSelectedBuildId(b);
      const lc = localStorage.getItem('dl_laneColor') as LaneColor;
      if (lc) setLaneColor(lc);
      const lm = localStorage.getItem('dl_laneMode') as LaneMode;
      if (lm) setLaneMode(lm);
      setAllyPartnerId(localStorage.getItem('dl_allyPartnerId'));
      const cs = localStorage.getItem('dl_currentSouls');
      if (cs) setCurrentSouls(parseInt(cs, 10));
      try {
        setLaneEnemyIds(JSON.parse(localStorage.getItem('dl_laneEnemyIds') || '[]'));
        setTeamEnemyIds(JSON.parse(localStorage.getItem('dl_teamEnemyIds') || '[]'));
        setOwnedItems(JSON.parse(localStorage.getItem('dl_ownedItems') || '[]'));
        setLockedNext(JSON.parse(localStorage.getItem('dl_lockedNext') || 'null'));
        setInventoryStatus(JSON.parse(localStorage.getItem('dl_inventoryStatus') || 'null'));
      } catch {
        // Ignore
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Navigation Tabs & Popovers
  const [activeTab, setActiveTab] = useState<MainTab>('essential');
  const [openPopover, setOpenPopover] = useState<'myHero' | 'ally' | 'enemies' | null>(null);
  const [enemyPopoverMode, setEnemyPopoverMode] = useState<'lane' | 'team'>('lane');

  // Screen Vision & Overlay State (100% Silent, Zero Distraction)
  const [isOverlayMode, setIsOverlayMode] = useState<boolean>(isDedicatedOverlayWindow);
  const [isClickThrough, setIsClickThrough] = useState<boolean>(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(!isDedicatedOverlayWindow);
  const [lastCaptureUrl, setLastCaptureUrl] = useState<string | null>(null);
  const [lastDetection, setLastDetection] = useState<VisionDetectionResult | null>(null);
  const [sources, setSources] = useState<ElectronSourceInfo[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  // Capture the scanner is not calibrated for (paused), or Deadlock captured without any HUD for a long time
  const [formatIssue, setFormatIssue] = useState<{ width: number; height: number } | null>(null);
  const [hudMissing, setHudMissing] = useState(false);

  // Settings, first launch, problem report, updates
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !isDedicatedOverlayWindow && localStorage.getItem(ONBOARDED_KEY) !== '1'
  );
  const [logsEnabled, setLogsEnabled] = useState(isMatchLogEnabled);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const isDiagnosticsOpen = activeTab === 'logs' && !isDedicatedOverlayWindow;

  // Overlay controls. In ghost mode clicks go through to the game, so its buttons are hidden until Alt+L. Its
  // settings are shown in arrange mode (⚙ or Alt+K), the only time it takes the focus from the game.
  const [overlayOpacity, setOverlayOpacity] = useState(() =>
    readStoredNumber(OVERLAY_OPACITY_KEY, 1, OVERLAY_MIN_OPACITY, 1)
  );
  const [overlayScale, setOverlayScale] = useState(() =>
    readStoredNumber(OVERLAY_SCALE_KEY, 1, OVERLAY_SCALES[OVERLAY_SCALES.length - 1], 1)
  );
  const [isOverlayArranging, setIsOverlayArranging] = useState(false);
  useEffect(() => {
    if (isDedicatedOverlayWindow) window.electronAPI?.setOverlayScale(overlayScale);
  }, [isDedicatedOverlayWindow, overlayScale]);
  const changeOverlayOpacity = (value: number) => {
    setOverlayOpacity(value);
    storeNumber(OVERLAY_OPACITY_KEY, value);
  };
  const changeOverlayScale = (value: number) => {
    setOverlayScale(value);
    storeNumber(OVERLAY_SCALE_KEY, value);
  };

  const myHero = useMemo(() => HEROES.find((h) => h.id === myHeroId) || HEROES[0], [HEROES, myHeroId]);

  useEffect(() => {
    if (!myHero.builds.some((b) => b.id === selectedBuildId)) {
      setSelectedBuildId(myHero.builds[0].id);
    }
  }, [myHero, selectedBuildId]);

  const activeBuild = useMemo(
    () => myHero.builds.find((b) => b.id === selectedBuildId) || myHero.builds[0],
    [myHero, selectedBuildId]
  );

  const tacticalPlan = useMemo(
    () =>
      generateTacticalPlan(
        myHeroId,
        activeBuild.id,
        laneColor,
        laneMode,
        laneEnemyIds,
        teamEnemyIds,
        laneMode === 'duo' ? allyPartnerId : null,
        lang
      ),
    [myHeroId, activeBuild.id, laneColor, laneMode, laneEnemyIds, teamEnemyIds, allyPartnerId, lang]
  );

  /**
   * Smart Next-To-Buy Queue (services/recommendations.ts): early lane items, urgent counters against the lane
   * opponents, then mid and late game items. Every item already owned (detected or marked by hand), and every
   * component consumed by an owned upgrade, is skipped.
   */
  const purchaseOrder = useMemo(
    () => buildPurchaseOrder(activeBuild, tacticalPlan.priorityItems, ITEMS, t),
    [activeBuild, tacticalPlan.priorityItems, ITEMS, t]
  );

  const purchaseCounters = useMemo(
    () => getPurchaseCounters(tacticalPlan.priorityItems),
    [tacticalPlan.priorityItems]
  );

  const isFull = isInventoryFull(inventoryStatus);

  const sellCandidates = useMemo(
    () =>
      getSellCandidates(inventoryStatus, activeBuild, new Set(tacticalPlan.priorityItems.map((r) => r.item.id))),
    [inventoryStatus, activeBuild, tacticalPlan.priorityItems]
  );

  // Owned items plus the components they consumed (owning Greater Expansion means Mystic Expansion is done)
  const effectiveOwned = useMemo(() => effectiveOwnedSet(ownedItems), [ownedItems]);

  const rawNextToBuyQueue = useMemo(
    () =>
      getNextPurchases(
        purchaseOrder,
        ownedItems,
        inventoryStatus,
        sellCandidates,
        (itemId) => getHeroItemStat(myHeroId, itemId)?.buyTimeS
      ),
    [purchaseOrder, ownedItems, inventoryStatus, sellCandidates, myHeroId]
  );

  // The #1 stays locked until it is bought or skipped (or the hero/build changes):
  // new counters or a re-ordering of the queue only affect #2 and beyond.
  const lockKey = `${myHeroId}|${activeBuild.id}`;
  const lockedItemId = lockedNext?.key === lockKey ? lockedNext.itemId : null;

  useEffect(() => {
    if (isDedicatedOverlayWindow) return; // the overlay follows the main window's lock
    const stillValid =
      lockedItemId !== null && rawNextToBuyQueue.some((entry) => entry.item.id === lockedItemId);
    if (stillValid) return;
    const nextId = rawNextToBuyQueue[0]?.item.id;
    const next = nextId ? { key: lockKey, itemId: nextId } : null;
    setLockedNext(next);
    if (next) localStorage.setItem('dl_lockedNext', JSON.stringify(next));
    else localStorage.removeItem('dl_lockedNext');
  }, [isDedicatedOverlayWindow, lockKey, lockedItemId, rawNextToBuyQueue]);

  const nextToBuyQueue = useMemo(
    () => withLockedFirst(rawNextToBuyQueue, lockedItemId),
    [rawNextToBuyQueue, lockedItemId]
  );

  // What each displayed recommendation does to the inventory: an upgrade replaces its component; with a full
  // inventory, the other ones each need an owned item sold first (the weakest for #1, the next one for #2...)
  const slotPlans = useMemo(
    () => getSlotPlans(nextToBuyQueue.slice(0, 6), ownedItems, inventoryStatus, sellCandidates),
    [nextToBuyQueue, ownedItems, inventoryStatus, sellCandidates]
  );

  // Static list of the active build's items: a tie-breaker for the inventory scanner that does not
  // depend on the buy queue (feeding the queue back into the scanner made the list cascade)
  const buildItemIds = useMemo(
    () => [
      ...activeBuild.phases.early,
      ...activeBuild.phases.mid,
      ...activeBuild.phases.late,
      ...activeBuild.phases.situational,
    ],
    [activeBuild]
  );

  // Game log (services/matchLogger.ts): the application's state, written whenever it changes
  useEffect(() => {
    logState(
      'ÉTAT héros',
      `${myHeroId}${isHeroLocked ? ' 🔒' : ''} build=${activeBuild.id} lane=${laneColor}/${laneMode} partenaire=${
        allyPartnerId ?? '-'
      } ennemis lane=[${laneEnemyIds.join(',')}] équipe=[${teamEnemyIds.join(',')}]`
    );
  }, [myHeroId, isHeroLocked, activeBuild.id, laneColor, laneMode, allyPartnerId, laneEnemyIds, teamEnemyIds]);

  const previousOwnedRef = useRef<string[]>(ownedItems);
  useEffect(() => {
    const added = ownedItems.filter((id) => !previousOwnedRef.current.includes(id));
    const removed = previousOwnedRef.current.filter((id) => !ownedItems.includes(id));
    previousOwnedRef.current = ownedItems;
    if (added.length > 0 || removed.length > 0) {
      logEvent(
        `Objets possédés${added.length ? ` + [${added.join(', ')}]` : ''}${
          removed.length ? ` − [${removed.join(', ')}]` : ''
        } → ${ownedItems.length} objet(s)`
      );
    }
    logState('ÉTAT possédés', `[${ownedItems.join(', ')}] dont marqués à la main [${[...readManualOwned()].join(', ')}]`);
  }, [ownedItems]);

  useEffect(() => {
    logState(
      'ÉTAT inventaire',
      inventoryStatus
        ? `occupés=${inventoryStatus.occupied} cadenas=${inventoryStatus.locked} inconnus=${inventoryStatus.unmatched} plein=${
            isFull ? 'oui' : 'non'
          } objets=[${inventoryStatus.itemIds.join(', ')}]`
        : 'aucun inventaire lu'
    );
  }, [inventoryStatus, isFull]);

  useEffect(() => {
    const describePlan = (itemId: string) => {
      const plan = slotPlans.get(itemId);
      if (!plan) return '';
      if (plan.kind === 'full') return ' (⇄ inventaire plein)';
      return plan.kind === 'upgrade' ? ` (⬆ remplace ${plan.itemId})` : ` (⇄ vendre ${plan.itemId})`;
    };
    logState(
      'RECO',
      `âmes=${currentSouls ?? '?'} ${nextToBuyQueue
        .slice(0, 3)
        .map((entry, i) => `#${i + 1} ${entry.item.id} ${entry.item.cost}${describePlan(entry.item.id)}`)
        .join(' • ')}`
    );
  }, [nextToBuyQueue, slotPlans, currentSouls]);

  const manuallyExcludedRef = useRef<Set<string>>(new Set());
  const isScanningRef = useRef<boolean>(false);
  // Decisions taken from each scan (services/matchTracker.ts), and the latest state it reads: the scan loop
  // does not re-subscribe on every change, and a scan right after another must see its result
  const trackerRef = useRef(new MatchTracker());
  const snapshotRef = useRef<Omit<MatchSnapshot, 'manualOwned' | 'manuallyExcluded'>>(null!);
  snapshotRef.current = {
    myHeroId,
    heroLocked: isHeroLocked,
    ownedItems,
    laneColor,
    laneMode,
    allyPartnerId,
    laneEnemyIds,
    teamEnemyIds,
    currentSouls,
    inventoryStatus,
  };

  const lockHero = useCallback((locked: boolean) => {
    snapshotRef.current = { ...snapshotRef.current, heroLocked: locked };
    setIsHeroLocked(locked);
    if (locked) localStorage.setItem(HERO_LOCKED_KEY, '1');
    else localStorage.removeItem(HERO_LOCKED_KEY);
  }, []);

  /** New match (or Reset): forget every owned item, scanned or marked by hand. */
  const clearOwnedItems = useCallback(() => {
    manuallyExcludedRef.current.clear();
    writeManualOwned(new Set());
    trackerRef.current.resetOwned();
    snapshotRef.current = { ...snapshotRef.current, ownedItems: [], inventoryStatus: null };
    setOwnedItems([]);
    setInventoryStatus(null);
  }, []);

  /** Applies what the tracker concluded from a scan. */
  const applyMatchUpdate = useCallback(
    (update: MatchUpdate) => {
      for (const entry of update.log) {
        if (entry.kind === 'restart') restartMatchLog(entry.text);
        else logEvent(entry.text);
      }
      if (update.clearOwned) clearOwnedItems();
      if (update.heroLocked !== undefined) lockHero(update.heroLocked);
      const p = update.patch;
      snapshotRef.current = { ...snapshotRef.current, ...p };
      if (p.myHeroId !== undefined) setMyHeroId(p.myHeroId);
      if (p.laneColor !== undefined) setLaneColor(p.laneColor);
      if (p.laneMode !== undefined) setLaneMode(p.laneMode);
      if (p.allyPartnerId !== undefined) setAllyPartnerId(p.allyPartnerId);
      if (p.laneEnemyIds !== undefined) setLaneEnemyIds(p.laneEnemyIds);
      if (p.teamEnemyIds !== undefined) setTeamEnemyIds(p.teamEnemyIds);
      if (p.currentSouls !== undefined) setCurrentSouls(p.currentSouls);
      if (p.inventoryStatus !== undefined) setInventoryStatus(p.inventoryStatus);
      if (p.ownedItems !== undefined) {
        setOwnedItems(p.ownedItems);
        localStorage.setItem('dl_ownedItems', JSON.stringify(p.ownedItems));
      }
      setFormatIssue((prev) =>
        update.formatIssue
          ? prev && prev.width === update.formatIssue.width && prev.height === update.formatIssue.height
            ? prev
            : update.formatIssue
          : null
      );
      setHudMissing(update.hudMissing);
    },
    [clearOwnedItems, lockHero]
  );


  const handleSelectEnemyHero = (heroId: string) => {
    if (heroId === myHeroId || heroId === allyPartnerId) return;

    const maxInLane = laneMode === 'solo' ? 1 : 2;
    const isInLane = laneEnemyIds.includes(heroId);
    const isInTeam = teamEnemyIds.includes(heroId);

    if (enemyPopoverMode === 'lane') {
      if (isInLane) {
        setLaneEnemyIds((prev) => prev.filter((id) => id !== heroId));
      } else {
        setTeamEnemyIds((prev) => prev.filter((id) => id !== heroId));
        if (laneEnemyIds.length >= maxInLane) {
          const displaced = laneEnemyIds[0];
          setLaneEnemyIds((prev) => [...prev.slice(1), heroId]);
          setTeamEnemyIds((prev) =>
            prev.length < 6 - maxInLane ? [...prev, displaced] : prev
          );
        } else {
          setLaneEnemyIds((prev) => [...prev, heroId]);
        }
      }
    } else {
      if (isInTeam) {
        setTeamEnemyIds((prev) => prev.filter((id) => id !== heroId));
      } else if (isInLane) {
        setLaneEnemyIds((prev) => prev.filter((id) => id !== heroId));
        setTeamEnemyIds((prev) => [...prev, heroId]);
      } else {
        const maxTeamOthers = 6 - laneEnemyIds.length;
        if (teamEnemyIds.length >= maxTeamOthers) {
          setTeamEnemyIds((prev) => [...prev.slice(1), heroId]);
        } else {
          setTeamEnemyIds((prev) => [...prev, heroId]);
        }
      }
    }
  };

  const handleToggleOwnedItem = (itemId: string) => {
    setOwnedItems((prev) => {
      const isCurrentlyOwned = prev.includes(itemId);
      const manualOwned = readManualOwned();
      if (isCurrentlyOwned) {
        manuallyExcludedRef.current.add(itemId);
        manualOwned.delete(itemId);
      } else {
        manuallyExcludedRef.current.delete(itemId);
        manualOwned.add(itemId);
      }
      writeManualOwned(manualOwned);
      const next = isCurrentlyOwned ? prev.filter((id) => id !== itemId) : [...prev, itemId];
      localStorage.setItem('dl_ownedItems', JSON.stringify(next));
      snapshotRef.current = { ...snapshotRef.current, ownedItems: next };
      return next;
    });
  };

  const refreshSources = useCallback(async () => {
    if (!window.electronAPI) return;
    const list = await window.electronAPI.getSources();
    setSources(list);
  }, []);

  const performScreenScan = useCallback(async () => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    try {
      if (!window.electronAPI) return;
      const frame = await grabGameFrame(selectedSourceId);
      if (!frame) return;
      if (isDiagnosticsOpen) setLastCaptureUrl(frameToPreviewUrl(frame.image));
      let detection: VisionDetectionResult;
      try {
        detection = await analyzeDeadlockScreen(
          frame.image,
          frame.sourceName,
          frame.isDeadlockWindow,
          snapshotRef.current.myHeroId,
          buildItemIds,
          isDiagnosticsOpen
        );
        // The game log must never keep a scan from being applied
        try {
          logScan(detection, frame.image);
        } catch (err) {
          console.warn('Journal de partie :', err);
        }
      } finally {
        releaseGameFrame(frame);
      }
      if (isDiagnosticsOpen) setLastDetection(detection);

      const update = trackerRef.current.push(
        detection,
        {
          ...snapshotRef.current,
          manualOwned: readManualOwned(),
          manuallyExcluded: manuallyExcludedRef.current,
        },
        Date.now()
      );
      applyMatchUpdate(update);
    } finally {
      isScanningRef.current = false;
    }
  }, [selectedSourceId, buildItemIds, isDiagnosticsOpen, applyMatchUpdate]);

  // Run initial scan + ultra-fast silent background scan every 350ms (near-instantaneous item updates)
  useEffect(() => {
    if (isDedicatedOverlayWindow) return;
    const initTimer = setTimeout(() => {
      performScreenScan();
    }, 300);
    return () => clearTimeout(initTimer);
  }, [isDedicatedOverlayWindow]);

  useEffect(() => {
    if (!autoScanEnabled || isDedicatedOverlayWindow) return;
    const timer = setInterval(() => {
      performScreenScan();
    }, 350);
    return () => clearInterval(timer);
  }, [autoScanEnabled, isDedicatedOverlayWindow, performScreenScan]);

  useEffect(() => {
    if (!window.electronAPI) return;
    refreshSources();
    const unsubOverlay = window.electronAPI.onOverlayStateChanged((state) => {
      setIsOverlayMode(state.isOverlayMode);
      setIsClickThrough(state.isClickThrough);
      setIsOverlayArranging(state.isArranging);
    });
    const unsubScan = window.electronAPI.onTriggerShortcutScan(() => {
      if (!isDedicatedOverlayWindow) {
        performScreenScan();
      }
    });
    return () => {
      unsubOverlay();
      unsubScan();
    };
  }, [isDedicatedOverlayWindow, performScreenScan, refreshSources]);

  // Version and update notices (main window only)
  useEffect(() => {
    const api = window.electronAPI;
    if (!api || isDedicatedOverlayWindow) return;
    api.getAppInfo().then(setAppInfo);
    api.updates.status().then(setUpdateStatus);
    return api.updates.onStatus(setUpdateStatus);
  }, [isDedicatedOverlayWindow]);

  const handleToggleOverlay = async () => {
    if (window.electronAPI) {
      const next = await window.electronAPI.setOverlayMode(!isOverlayMode);
      setIsOverlayMode(next.isOverlayMode);
      setIsClickThrough(next.isClickThrough);
      setIsOverlayArranging(next.isArranging);
    }
  };

  const handleToggleClickThrough = async () => {
    if (window.electronAPI) {
      const next = await window.electronAPI.setClickThrough(!isClickThrough);
      setIsOverlayMode(next.isOverlayMode);
      setIsClickThrough(next.isClickThrough);
      setIsOverlayArranging(next.isArranging);
    }
  };

  const handleToggleArranging = async () => {
    if (window.electronAPI) {
      const next = await window.electronAPI.setOverlayArranging(!isOverlayArranging);
      setIsClickThrough(next.isClickThrough);
      setIsOverlayArranging(next.isArranging);
    }
  };

  const handleLogsChange = (enabled: boolean) => {
    setMatchLogEnabled(enabled);
    setLogsEnabled(enabled);
  };

  /** Contents of a problem report: readable summary, raw state, and the GitHub issue form fields. */
  const collectReport = (): ReportContent => {
    const d = lastDetection;
    const frame = formatIssue ?? (d?.frameWidth ? { width: d.frameWidth, height: d.frameHeight ?? 0 } : null);
    const data = getDataInfo();
    const info = [
      `Language: ${lang}`,
      `Hero: ${myHeroId}${isHeroLocked ? ' (locked)' : ''} — build ${activeBuild.id}`,
      `Lane: ${laneColor} / ${laneMode}, partner: ${allyPartnerId ?? '-'}`,
      `Enemies: lane [${laneEnemyIds.join(', ')}] team [${teamEnemyIds.join(', ')}]`,
      `Owned: [${ownedItems.join(', ')}] (by hand: [${[...readManualOwned()].join(', ')}])`,
      `Inventory: ${inventoryStatus ? JSON.stringify(inventoryStatus) : '-'}${isFull ? ' FULL' : ''}`,
      `Souls: ${currentSouls ?? '-'}`,
      `Next purchases: ${nextToBuyQueue
        .slice(0, 3)
        .map((e) => e.item.id)
        .join(', ')}`,
      `Capture: ${frame ? `${frame.width}x${frame.height}` : '-'}${formatIssue ? ' (unsupported format)' : ''}${
        hudMissing ? ' (no HUD found)' : ''
      }`,
      d
        ? `Last scan (${d.isDeadlockWindow ? 'Deadlock window' : d.sourceName}): ${
            d.shopOpen ? 'shop' : d.hudVisible ? 'HUD' : 'no HUD'
          }, allies [${(d.allySlots ?? []).map((id) => id ?? '?').join(',')}] enemies [${(d.enemySlots ?? [])
            .map((id) => id ?? '?')
            .join(',')}]`
        : 'Last scan: open the Diagnostics tab to include it',
      `Data: ${data.generatedAt} (${data.origin})`,
      `Game logs: ${logsEnabled ? 'on' : 'off'}`,
    ].join('\n');
    const state: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.startsWith('dl_') && key !== 'dl_remoteData') state[key] = localStorage.getItem(key);
    }
    return {
      info,
      state: JSON.stringify(state, null, 2),
      fields: {
        version: appInfo?.version ?? '',
        resolution: frame ? `${frame.width}x${frame.height}` : '',
        hero: myHero.name,
        language: lang,
      },
    };
  };

  /** "⬆ Replaces X" (upgrade) or "⇄ Sell X" (inventory full) under a recommendation. */
  const renderSlotPlan = (itemId: string, compact = false) => {
    const plan = slotPlans.get(itemId);
    if (!plan) return null;
    const sizeClass = compact ? 'px-1.5 py-0.5 text-small' : 'px-2 py-1 text-small';
    if (plan.kind === 'full') {
      return (
        <div className={`rounded-lg border font-bold bg-red-500/15 border-red-400/50 text-red-200 ${sizeClass}`}>
          {t('slot.fullSellFirst')}
        </div>
      );
    }
    const other = ITEMS[plan.itemId];
    if (!other) return null;
    const isUpgrade = plan.kind === 'upgrade';
    return (
      <div
        className={`flex items-center gap-1.5 rounded-lg border font-bold ${sizeClass} ${
          isUpgrade
            ? 'bg-sky-500/15 border-sky-400/40 text-sky-200'
            : 'bg-red-500/15 border-red-400/50 text-red-200'
        }`}
        title={isUpgrade ? t('slot.upgradeTitle') : t('slot.sellTitle')}
      >
        <span className="shrink-0">{isUpgrade ? t('slot.replaces') : t('slot.sell')}</span>
        <ItemArtworkIcon itemId={other.id} category={other.category} size={compact ? 16 : 20} />
        {/* The overlay's narrow rows wrap the name instead of cutting it */}
        <span className={compact ? 'min-w-0' : 'truncate'}>{other.name.split('(')[0].trim()}</span>
      </div>
    );
  };

  /** Why an item is recommended: how often high-rank players of this hero buy it, and their win rate with it. */
  const whyText = (entry: QueueEntry): string | null => {
    const stat = getHeroItemStat(myHeroId, entry.item.id);
    const meta = getHeroMetaInfo(myHeroId);
    if (!stat || !meta) return null;
    const pick = `${Math.round(stat.pickRate * 100)}${lang === 'fr' ? ' %' : '%'}`;
    const parts = [
      t('why.meta', pick, rankLabel(meta.badgeMin, lang), myHero.name),
      t('why.winRate', formatPercent(stat.winRate, lang)),
    ];
    if (stat.buyTimeS > 0) parts.push(t('why.buyTime', formatDuration(stat.buyTimeS)));
    return parts.join(' · ');
  };

  const inventoryLabel = inventoryStatus
    ? t('inv.label', inventoryStatus.occupied, INVENTORY_SLOTS - inventoryStatus.locked, isFull)
    : t('inv.ownedCount', ownedItems.length);

  const totalSelectedEnemies = laneEnemyIds.length + teamEnemyIds.length;
  const allyHeroObj = allyPartnerId ? HEROES.find((h) => h.id === allyPartnerId) : null;
  const heroName = (id: string) => HEROES.find((h) => h.id === id)?.name;

  // ================= DEDICATED TRANSPARENT IN-GAME OVERLAY HUD WINDOW =================
  if (isDedicatedOverlayWindow) {
    return (
      <I18nContext.Provider value={i18n}>
        <div className="h-screen w-screen p-2 flex flex-col select-none bg-transparent overflow-hidden">
          <div
            style={{ opacity: overlayOpacity }}
            className="relative flex-1 flex flex-col rounded-2xl bg-[#0c0b0e]/85 backdrop-blur-xl border border-amber-500/45 shadow-2xl overflow-hidden"
          >
            {isOverlayArranging && !isClickThrough && (
              <div
                title={t('overlay.resizeTitle')}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  window.electronAPI?.overlayResize('start');
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) window.electronAPI?.overlayResize('move');
                }}
                onPointerUp={() => window.electronAPI?.overlayResize('end')}
                onLostPointerCapture={() => window.electronAPI?.overlayResize('end')}
                className="no-drag absolute bottom-0 left-0 z-10 w-6 h-6 cursor-nesw-resize flex items-end justify-start p-1"
              >
                <div className="w-3 h-3 border-l-2 border-b-2 border-amber-400 rounded-bl" />
              </div>
            )}
            <div className="drag-region px-3 py-2 bg-gradient-to-r from-amber-950/80 via-[#15131c] to-[#15131c] border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <HeroPortraitIcon heroId={myHero.id} color={myHero.accentColor} size={28} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-display text-body font-extrabold text-amber-300 truncate">
                      {myHero.name.toUpperCase()}
                    </span>
                    {currentSouls !== null && (
                      <span className="text-small font-bold text-teal-300 bg-teal-950/70 px-1.5 py-0.2 rounded border border-teal-500/40">
                        {t('souls', formatNumber(currentSouls))}
                      </span>
                    )}
                  </div>
                  <span className="text-small text-slate-400 block leading-none">
                    VS {laneEnemyIds.map(heroName).join(' + ') || t('enemies.laneBadge')}
                  </span>
                </div>
              </div>

              <div className="no-drag flex items-center gap-1 shrink-0">
                {!isClickThrough && (
                  <button
                    onClick={handleToggleArranging}
                    title={t('overlay.settingsTitle')}
                    className={`p-1.5 rounded-lg border transition ${
                      isOverlayArranging
                        ? 'bg-amber-500 border-amber-300 text-black'
                        : 'bg-white/10 border-white/15 text-slate-200 hover:bg-white/20'
                    }`}
                  >
                    <Settings className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={handleToggleClickThrough}
                  title={t('overlay.clickThroughTitle')}
                  className={`px-2 py-1 rounded-lg text-small font-bold border flex items-center gap-1 transition ${
                    isClickThrough
                      ? 'bg-red-500/35 border-red-400 text-red-100'
                      : 'bg-white/10 border-white/15 text-slate-200 hover:bg-white/20'
                  }`}
                >
                  {isClickThrough ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  Alt+L
                </button>
                <button
                  onClick={() => window.electronAPI?.setOverlayMode(false)}
                  title={t('overlay.hideTitle')}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-red-500/30 text-small font-bold text-slate-200"
                >
                  ✕
                </button>
              </div>
            </div>

            {isClickThrough && (
              <div className="bg-red-950/90 border-b border-red-500/40 px-3 py-1 text-small text-center text-red-200 font-semibold">
                {t('overlay.ghostActive')} <kbd className="px-1 bg-black/50 rounded">Alt+L</kbd> {t('overlay.ghostUnlock')}
              </div>
            )}

            {isOverlayArranging && !isClickThrough && (
              <div className="no-drag px-3 py-2 bg-black/60 border-b border-white/10 space-y-2 text-small font-bold text-slate-300">
                <p className="font-semibold text-amber-200">
                  {t('overlay.arrangeHint')} <kbd className="px-1 bg-black/50 rounded">Alt+K</kbd>
                </p>
                <label className="flex items-center gap-2">
                  <span className="w-14 shrink-0">{t('overlay.opacity')}</span>
                  <input
                    type="range"
                    min={OVERLAY_MIN_OPACITY * 100}
                    max={100}
                    step={5}
                    value={Math.round(overlayOpacity * 100)}
                    onChange={(e) => changeOverlayOpacity(Number(e.target.value) / 100)}
                    className="flex-1 accent-amber-500"
                  />
                  <span className="w-10 text-right tabular-nums">{t('overlay.percent', Math.round(overlayOpacity * 100))}</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="w-14 shrink-0">{t('overlay.size')}</span>
                  <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/10">
                    {OVERLAY_SCALES.map((scale) => (
                      <button
                        key={scale}
                        onClick={() => changeOverlayScale(scale)}
                        className={`px-2 py-0.5 rounded-md transition ${
                          overlayScale === scale ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {t('overlay.percent', Math.round(scale * 100))}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="no-drag px-2.5 py-2 bg-black/50 border-b border-white/10 flex items-center justify-between">
              <span className="text-small font-bold uppercase text-purple-300">{t('overlay.abilities')}</span>
              <div className="flex items-center gap-1">
                {activeBuild.abilitiesOrder.map((key, idx) => {
                  const ab = activeBuild.abilitiesDetails.find((a) => a.key === key);
                  return (
                    <React.Fragment key={key}>
                      <PowerIcon heroId={myHero.id} abilityKey={key} abilityName={ab?.name || key} size={32} />
                      {idx < 3 && <span className="text-slate-500 text-body font-bold">›</span>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div className="no-drag flex-1 overflow-y-auto p-2.5 space-y-2.5">
              <div className="space-y-1.5">
                <span className="text-small font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                  <ShoppingCart className="w-3 h-3 text-emerald-400" /> {t('overlay.buyNow')}
                </span>
                {nextToBuyQueue.slice(0, 3).map((entry, idx) => {
                  const canAfford = currentSouls !== null && currentSouls >= entry.item.cost;
                  const shortName = entry.item.name.split('(')[0].trim();
                  return (
                    <div
                      key={entry.item.id}
                      onClick={() => handleToggleOwnedItem(entry.item.id)}
                      title={[entry.reason, whyText(entry)].filter(Boolean).join('\n')}
                      className={`p-2 rounded-xl border cursor-pointer transition flex items-center justify-between gap-2 ${
                        canAfford
                          ? 'bg-emerald-950/50 border-emerald-400 shadow-lg'
                          : 'bg-[#171520] border-white/15 hover:border-amber-400/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-full bg-amber-500 text-black font-extrabold text-small flex items-center justify-center shrink-0">
                          #{idx + 1}
                        </span>
                        <ItemArtworkIcon itemId={entry.item.id} category={entry.item.category} size={46} />
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-title font-extrabold text-white truncate">{shortName}</span>
                            {!isClickThrough && <CopyNameButton name={shortName} />}
                          </div>
                          <ShopTabMarker category={entry.item.category} />
                          {renderSlotPlan(entry.item.id, true)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-title font-extrabold text-teal-300 block">{formatNumber(entry.item.cost)}</span>
                        {canAfford && (
                          <span className="text-small font-extrabold text-emerald-300">{t('overlay.buy')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </I18nContext.Provider>
    );
  }

  const showUpdateBanner =
    !updateDismissed && (updateStatus.state === 'available' || updateStatus.state === 'ready');

  return (
    <I18nContext.Provider value={i18n}>
      <div className="h-screen w-screen flex flex-col bg-deadlock-bg text-slate-100 overflow-hidden">
        {/* 1. COMPACT TOP BAR (Hero + Partner + Lane + Enemies + Silent Controls) */}
        <div className="px-3 py-2 bg-[#14121b] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0 relative z-30">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setOpenPopover(openPopover === 'myHero' ? null : 'myHero')}
              className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-black/60 hover:bg-black/80 border border-amber-500/40 transition"
            >
              <HeroPortraitIcon heroId={myHero.id} color={myHero.accentColor} size={32} />
              <span className="font-display text-body sm:text-title font-extrabold text-white">{myHero.name}</span>
              {isHeroLocked && (
                <span title={t('hero.lockedTitle')}>
                  <Lock className="w-3 h-3 text-amber-400" />
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
            </button>

            {laneMode === 'duo' && (
              <button
                onClick={() => setOpenPopover(openPopover === 'ally' ? null : 'ally')}
                className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-emerald-950/30 hover:bg-emerald-950/50 border border-emerald-500/40 transition text-body font-bold text-emerald-200"
                title={t('ally.title')}
              >
                {allyHeroObj ? (
                  <HeroPortraitIcon heroId={allyHeroObj.id} color={allyHeroObj.accentColor} size={28} />
                ) : (
                  <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>{allyHeroObj ? allyHeroObj.name : t('ally.add')}</span>
              </button>
            )}

            {myHero.builds.length > 1 && (
              <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/10">
                {myHero.builds.map((b, idx) => (
                  <button
                    key={b.id}
                    title={`${b.name}\n${b.subtitle}`}
                    onClick={() => setSelectedBuildId(b.id)}
                    className={`px-2 py-1 rounded-md text-small font-bold transition ${
                      activeBuild.id === b.id ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t('build.n', idx + 1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Center: Enemies Button */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setOpenPopover(openPopover === 'enemies' ? null : 'enemies')}
              className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-red-950/35 hover:bg-red-950/55 border border-red-500/40 transition"
            >
              <div className="flex -space-x-1.5">
                {laneEnemyIds.length > 0 ? (
                  laneEnemyIds.map((eid) => {
                    const eh = HEROES.find((h) => h.id === eid);
                    return eh ? <HeroPortraitIcon key={eid} heroId={eh.id} color={eh.accentColor} size={28} /> : null;
                  })
                ) : (
                  <Swords className="w-4 h-4 text-red-400" />
                )}
              </div>
              <span className="text-body font-bold text-white">
                {t('enemies.button', laneEnemyIds.length, teamEnemyIds.length)}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-red-300" />
            </button>

            {/* Silent Auto-Scan Toggle (No blinking/spinning animations!) */}
            <button
              onClick={() => setAutoScanEnabled((v) => !v)}
              title={t('autoscan.title')}
              className={`px-2 py-1.5 rounded-xl border text-small font-bold flex items-center gap-1 transition ${
                autoScanEnabled
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                  : 'bg-white/5 border-white/10 text-slate-400'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">{t('autoscan.label')}</span>
            </button>

            <button
              onClick={() => performScreenScan()}
              title={t('scan.title')}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-small flex items-center gap-1 transition"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{t('scan.label')}</span>
            </button>

            <button
              onClick={handleToggleOverlay}
              title={t('overlay.toggleTitle')}
              className={`px-2.5 py-1.5 rounded-xl border text-small font-bold flex items-center gap-1 transition ${
                isOverlayMode
                  ? 'bg-purple-500 text-white border-purple-300 shadow-glow-spirit'
                  : 'bg-purple-600/20 hover:bg-purple-600/35 border-purple-400/50 text-purple-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t('overlay.label')}</span>
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              title={t('settings.open')}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* POPOVER MODALS */}
          {openPopover === 'myHero' && (
            <div className="fixed inset-x-4 top-16 max-w-md mx-auto p-3.5 rounded-2xl bg-[#181520] border border-amber-500/60 shadow-2xl z-50 space-y-2">
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <span className="text-body font-bold uppercase text-amber-300">{t('hero.pick')}</span>
                <button onClick={() => setOpenPopover(null)} className="text-body text-slate-400">
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto">
                {HEROES.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => {
                      setMyHeroId(h.id);
                      snapshotRef.current = { ...snapshotRef.current, myHeroId: h.id };
                      lockHero(true); // picked by hand: the scanner no longer changes it this match
                      trackerRef.current.resetHero();
                      setLaneEnemyIds((prev) => prev.filter((id) => id !== h.id));
                      setTeamEnemyIds((prev) => prev.filter((id) => id !== h.id));
                      if (allyPartnerId === h.id) setAllyPartnerId(null);
                      setOpenPopover(null);
                    }}
                    className={`p-1.5 rounded-xl border text-left flex items-center gap-1.5 ${
                      h.id === myHeroId
                        ? 'bg-amber-500/25 border-amber-400 text-white font-bold'
                        : 'bg-black/40 border-white/5 text-slate-300'
                    }`}
                  >
                    <HeroPortraitIcon heroId={h.id} color={h.accentColor} size={26} />
                    <span className="text-body truncate">{h.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {openPopover === 'ally' && (
            <div className="fixed inset-x-4 top-16 max-w-md mx-auto p-3.5 rounded-2xl bg-[#181520] border border-emerald-500/60 shadow-2xl z-50 space-y-2">
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <span className="text-body font-bold uppercase text-emerald-300">{t('ally.pick')}</span>
                <button onClick={() => setOpenPopover(null)} className="text-body text-slate-400">
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto">
                {HEROES.filter((h) => h.id !== myHeroId).map((h) => (
                  <button
                    key={h.id}
                    onClick={() => {
                      setAllyPartnerId(h.id);
                      setLaneEnemyIds((prev) => prev.filter((id) => id !== h.id));
                      setTeamEnemyIds((prev) => prev.filter((id) => id !== h.id));
                      setOpenPopover(null);
                    }}
                    className={`p-1.5 rounded-xl border text-left flex items-center gap-1.5 ${
                      h.id === allyPartnerId
                        ? 'bg-emerald-500/25 border-emerald-400 text-white font-bold'
                        : 'bg-black/40 border-white/5 text-slate-300'
                    }`}
                  >
                    <HeroPortraitIcon heroId={h.id} color={h.accentColor} size={26} />
                    <span className="text-body truncate">{h.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {openPopover === 'enemies' && (
            <div className="fixed inset-x-4 top-16 max-w-md mx-auto p-3.5 rounded-2xl bg-[#181520] border border-red-500/60 shadow-2xl space-y-2.5 z-50">
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <span className="text-body font-bold uppercase text-red-300">{t('enemies.title', totalSelectedEnemies)}</span>
                <div className="flex items-center gap-3">
                  {totalSelectedEnemies > 0 && (
                    <button
                      onClick={() => {
                        setLaneEnemyIds([]);
                        setTeamEnemyIds([]);
                      }}
                      className="text-small text-red-400 hover:underline"
                    >
                      {t('enemies.clear')}
                    </button>
                  )}
                  <button onClick={() => setOpenPopover(null)} className="text-body text-slate-400">
                    ✕
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 bg-black/50 p-1 rounded-xl border border-white/10">
                <button
                  onClick={() => setEnemyPopoverMode('lane')}
                  className={`flex-1 py-1 px-2 rounded-lg text-body font-bold ${
                    enemyPopoverMode === 'lane' ? 'bg-red-500 text-white' : 'text-slate-400'
                  }`}
                >
                  {t('enemies.myLane', laneEnemyIds.length, laneMode === 'solo' ? 1 : 2)}
                </button>
                <button
                  onClick={() => setEnemyPopoverMode('team')}
                  className={`flex-1 py-1 px-2 rounded-lg text-body font-bold ${
                    enemyPopoverMode === 'team' ? 'bg-orange-500 text-black' : 'text-slate-400'
                  }`}
                >
                  {t('enemies.otherLanes', teamEnemyIds.length, 6 - laneEnemyIds.length)}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto">
                {HEROES.filter((h) => h.id !== myHeroId && h.id !== allyPartnerId).map((eh) => {
                  const isInLane = laneEnemyIds.includes(eh.id);
                  const isInTeam = teamEnemyIds.includes(eh.id);
                  return (
                    <button
                      key={eh.id}
                      onClick={() => handleSelectEnemyHero(eh.id)}
                      className={`p-1.5 rounded-xl border text-left flex items-center gap-1.5 ${
                        isInLane
                          ? 'bg-red-500/30 border-red-400 text-white font-bold'
                          : isInTeam
                          ? 'bg-orange-500/25 border-orange-400 text-orange-100 font-bold'
                          : 'bg-black/40 border-white/5 text-slate-300'
                      }`}
                    >
                      <HeroPortraitIcon heroId={eh.id} color={eh.accentColor} size={26} />
                      <div className="min-w-0">
                        <span className="text-body block truncate">{eh.name}</span>
                        {isInLane && <span className="text-small text-red-300 block">{t('enemies.laneBadge')}</span>}
                        {isInTeam && <span className="text-small text-orange-300 block">{t('enemies.teamBadge')}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 2. NAVIGATION TABS */}
        <div className="px-3 bg-[#100e15] border-b border-white/10 flex items-center justify-between shrink-0">
          <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'essential', label: t('tabs.essential'), icon: LayoutGrid },
                { id: 'powers', label: t('tabs.powers'), icon: Zap },
                { id: 'builds', label: t('tabs.builds'), icon: Package },
                { id: 'matchups', label: t('tabs.matchups', totalSelectedEnemies), icon: Swords },
                { id: 'logs', label: t('tabs.logs'), icon: Terminal },
              ] as const
            ).map((tab) => {
              const TabIcon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 text-body font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
                    active
                      ? 'border-amber-400 text-amber-300 bg-amber-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 py-1">
            {currentSouls !== null && (
              <span className="px-2 py-0.5 rounded-lg bg-teal-950/60 border border-teal-500/40 text-small text-teal-300 font-extrabold">
                {t('souls.inPocket', formatNumber(currentSouls))}
              </span>
            )}
            {ownedItems.length > 0 && (
              <button
                onClick={clearOwnedItems}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-small text-slate-400 hover:text-white flex items-center gap-1"
                title={t('owned.resetTitle')}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('owned.reset', ownedItems.length)}</span>
              </button>
            )}
          </div>
        </div>

        {/* Notices: update available, unsupported screen format, HUD never found */}
        {(showUpdateBanner || formatIssue || hudMissing) && (
          <div className="px-3 pt-2 space-y-2 shrink-0">
            {showUpdateBanner && (
              <div className="max-w-5xl mx-auto px-3 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/50 flex items-center justify-between gap-2 flex-wrap text-body">
                <span className="font-bold text-emerald-200">
                  {updateStatus.state === 'ready'
                    ? t('update.ready', updateStatus.version)
                    : updateStatus.state === 'available'
                    ? t('update.available', updateStatus.version)
                    : ''}
                </span>
                <div className="flex items-center gap-2">
                  {updateStatus.state === 'available' && (
                    <button
                      onClick={() => window.electronAPI?.openExternal(updateStatus.url)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold"
                    >
                      {t('update.download')}
                    </button>
                  )}
                  {updateStatus.state === 'ready' && (
                    <button
                      onClick={() => window.electronAPI?.updates.install()}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold"
                    >
                      {t('update.restart')}
                    </button>
                  )}
                  <button onClick={() => setUpdateDismissed(true)} className="text-slate-400 hover:text-white" title={t('update.dismiss')}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            {formatIssue && (
              <div className="max-w-5xl mx-auto px-3 py-2.5 rounded-xl bg-red-950/70 border-2 border-red-500/70 flex items-start gap-2.5">
                <MonitorX className="w-5 h-5 text-red-300 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <p className="text-body font-extrabold uppercase text-red-200">{t('resolution.title')}</p>
                  <p className="text-body text-red-100">
                    {t('resolution.body', formatIssue.width, formatIssue.height, aspectLabel(formatIssue.width, formatIssue.height))}
                  </p>
                  <p className="text-small text-red-200/90">{t('resolution.help')}</p>
                </div>
                <button
                  onClick={() => setIsReportOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-small font-bold text-red-100 shrink-0"
                >
                  {t('resolution.report')}
                </button>
              </div>
            )}
            {!formatIssue && hudMissing && (
              <div className="max-w-5xl mx-auto px-3 py-2 rounded-xl bg-amber-950/50 border border-amber-500/40 flex items-start gap-2 text-small text-amber-100">
                <Info className="w-4 h-4 text-amber-300 shrink-0" />
                <span>
                  <strong>{t('hud.notFoundTitle')}.</strong> {t('hud.notFoundBody')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 3. MAIN VIEW */}
        <main
          onClick={() => {
            if (openPopover) setOpenPopover(null);
          }}
          className="flex-1 overflow-y-auto p-3 space-y-3 bg-deadlock-bg"
        >
          <div className="max-w-5xl mx-auto space-y-3">
            {/* ================= TAB 1: ACTIVE BUILD ================= */}
            {activeTab === 'essential' && (
              <div className="space-y-3">
                {/* ★ PRIORITY #1: BUY RIGHT NOW (NEXT ITEMS + WHERE TO FIND IN SHOP + AFFORDABILITY) ★ */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-[#15131d] to-[#15131d] border-2 border-emerald-500/60 shadow-xl space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-xl bg-emerald-500 text-black">
                        <ShoppingCart className="w-4 h-4" />
                      </span>
                      <div>
                        <h2 className="font-display text-title font-extrabold uppercase tracking-wider text-emerald-300">
                          {t('buy.title', inventoryLabel)}
                        </h2>
                        <p className="text-small text-slate-300">{t('buy.help')}</p>
                        {inventoryStatus && inventoryStatus.unmatched > 0 && (
                          <p className="text-small text-orange-300 font-semibold">{t('buy.unmatched', inventoryStatus.unmatched)}</p>
                        )}
                        <p className="text-small text-amber-300 font-semibold">
                          {activeBuild.name} — <span className="text-slate-400 font-normal">{activeBuild.subtitle}</span>
                        </p>
                      </div>
                    </div>

                    {currentSouls !== null && (
                      <div className="px-3 py-1 rounded-xl bg-teal-950/80 border border-teal-400/50 text-body font-extrabold text-teal-200">
                        {t('souls.detected', formatNumber(currentSouls))}
                      </div>
                    )}
                  </div>

                  {/* Top 6 Immediate Next Buys */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {nextToBuyQueue.slice(0, 6).map((entry, idx) => {
                      const { item } = entry;
                      const isCounter = purchaseCounters.some((counter) => counter.item.id === item.id);
                      const canAfford = currentSouls !== null && currentSouls >= item.cost;
                      const missingSouls =
                        currentSouls !== null && currentSouls < item.cost ? item.cost - currentSouls : null;
                      const shortName = item.name.split('(')[0].trim();
                      const why = whyText(entry);

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleToggleOwnedItem(item.id)}
                          className={`p-3 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between gap-2.5 relative ${
                            idx === 0
                              ? canAfford
                                ? 'bg-emerald-950/60 border-emerald-400 ring-2 ring-emerald-400/30'
                                : 'bg-amber-950/35 border-amber-400'
                              : canAfford
                              ? 'bg-emerald-950/35 border-emerald-500/60'
                              : 'bg-black/50 border-white/15 hover:border-white/35'
                          }`}
                        >
                          <div className="space-y-2">
                            {/* Header: Order Badge + Affordability Status */}
                            <div className="flex items-center justify-between gap-1">
                              <span
                                className={`px-2 py-0.5 rounded-md text-small font-extrabold uppercase ${
                                  idx === 0 ? 'bg-amber-400 text-black' : 'bg-white/15 text-slate-200'
                                }`}
                              >
                                {idx === 0 ? (
                                  <span className="flex items-center gap-1">
                                    {t('buy.next1')} <Lock className="w-2.5 h-2.5" />
                                  </span>
                                ) : (
                                  t('buy.nextN', idx + 1)
                                )}
                              </span>

                              {canAfford ? (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-black font-extrabold text-small uppercase">
                                  {t('buy.affordable')}
                                </span>
                              ) : missingSouls !== null ? (
                                <span className="px-2 py-0.5 rounded-md bg-black/60 border border-white/10 text-amber-300 font-bold text-small">
                                  {t('buy.missing', formatNumber(missingSouls))}
                                </span>
                              ) : null}
                            </div>

                            {/* Item icon, name, price and shop tab (icon colour = tab colour) */}
                            <div className="flex items-center gap-3">
                              <ItemArtworkIcon itemId={item.id} category={item.category} size={56} />
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-start gap-1">
                                  <span className="font-bold text-title text-white leading-tight flex-1 min-w-0">{shortName}</span>
                                  <CopyNameButton name={shortName} />
                                </div>
                                <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
                                  <span className="text-small font-extrabold text-teal-300">
                                    {t('souls', formatNumber(item.cost))}
                                  </span>
                                  <ShopTabMarker category={item.category} tier={item.tier} />
                                </div>
                              </div>
                            </div>

                            {renderSlotPlan(item.id)}

                            {/* Why this item: meta statistics of this hero */}
                            {why && (
                              <p className="text-small text-slate-400 leading-snug flex gap-1" title={t('buy.whyTitle')}>
                                <Info className="w-3 h-3 shrink-0 mt-px text-slate-500" />
                                <span>{why}</span>
                              </p>
                            )}
                          </div>

                          {/* Reason + Click to Skip / Advance */}
                          <div className="pt-1 border-t border-white/10 flex items-center justify-between text-small">
                            <span
                              className={`truncate font-semibold ${isCounter ? 'text-orange-300' : 'text-slate-300'}`}
                              title={entry.reason}
                            >
                              {entry.reason}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-white/10 hover:bg-emerald-500/30 text-slate-200 font-bold flex items-center gap-1 shrink-0">
                              {t('buy.skip')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Compact Power Order Strip */}
                <div className="p-2.5 rounded-xl bg-deadlock-panel border border-purple-500/30 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-small font-bold uppercase text-purple-300 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-purple-400" /> {t('abilities.order')}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeBuild.abilitiesOrder.map((key, idx) => {
                      const ab = activeBuild.abilitiesDetails.find((a) => a.key === key);
                      const spellName = ab?.name.split('(')[0].trim() || key;
                      return (
                        <React.Fragment key={key}>
                          <div className="flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded-lg border border-white/5">
                            <PowerIcon heroId={myHero.id} abilityKey={key} abilityName={ab?.name || key} size={30} />
                            <span className="text-body font-bold text-white">{spellName}</span>
                          </div>
                          {idx < 3 && <span className="text-slate-500 font-bold text-body">→</span>}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Urgent Counter Items Against Selected Enemies (UNOWNED ONLY) */}
                {tacticalPlan.priorityItems.filter((rec) => !effectiveOwned.has(rec.item.id)).length > 0 && (
                  <div className="p-3 rounded-xl bg-gradient-to-r from-orange-950/30 to-deadlock-panel border border-orange-500/40 space-y-2">
                    <span className="text-body font-bold uppercase tracking-wider text-orange-300 flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-orange-400" />{' '}
                      {t('counters.title', laneEnemyIds.map(heroName).join(' + '), teamEnemyIds.length)}
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {tacticalPlan.priorityItems
                        .filter((rec) => !effectiveOwned.has(rec.item.id))
                        .slice(0, 3)
                        .map((rec) => (
                          <ItemCard
                            key={rec.item.id}
                            item={rec.item}
                            isOwned={false}
                            onToggleOwned={handleToggleOwnedItem}
                            highlightReasons={rec.reasons}
                            compact
                          />
                        ))}
                    </div>
                  </div>
                )}

                {/* 3 Build Phases — filtered so owned items automatically disappear and show only remaining items */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                  {(
                    [
                      { key: 'early', title: t('phases.early'), accent: 'text-amber-300 border-amber-500/30' },
                      { key: 'mid', title: t('phases.mid'), accent: 'text-purple-300 border-purple-500/30' },
                      { key: 'late', title: t('phases.late'), accent: 'text-teal-300 border-teal-500/30' },
                    ] as const
                  ).map((col) => {
                    const unownedPhaseIds = activeBuild.phases[col.key].filter((id) => !effectiveOwned.has(id));
                    return (
                      <div key={col.key} className={`p-3 rounded-xl bg-deadlock-panel border ${col.accent} space-y-2`}>
                        <h3 className="font-display text-body font-extrabold uppercase tracking-wider">{col.title}</h3>
                        {unownedPhaseIds.length === 0 ? (
                          <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-body text-emerald-300 font-bold">
                            {t('phases.done')}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
                            {unownedPhaseIds.map((itemId) => {
                              const item = ITEMS[itemId];
                              return item ? (
                                <ItemCard
                                  key={itemId}
                                  item={item}
                                  isOwned={false}
                                  onToggleOwned={handleToggleOwnedItem}
                                  compact
                                />
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Owned Items Archive at the bottom of the page */}
                {ownedItems.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex items-center gap-2 flex-wrap">
                    <span className="text-small font-bold uppercase text-slate-400">{t('owned.title', ownedItems.length)}</span>
                    {ownedItems.map((id) => {
                      const it = ITEMS[id];
                      if (!it) return null;
                      return (
                        <button
                          key={id}
                          onClick={() => handleToggleOwnedItem(id)}
                          title={t('owned.removeTitle')}
                          className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/5 hover:bg-red-950/50 border border-white/10 text-small font-semibold text-slate-300 transition"
                        >
                          <ItemArtworkIcon itemId={it.id} category={it.category} size={18} />
                          <span>{it.name.split('(')[0].trim()}</span>
                          <span className="text-small text-slate-500">✕</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ================= TAB 2: ABILITIES (1-4) ================= */}
            {activeTab === 'powers' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeBuild.abilitiesOrder.map((key, index) => {
                  const detail = activeBuild.abilitiesDetails.find((a) => a.key === key);
                  if (!detail) return null;
                  return (
                    <div key={key} className="p-4 rounded-xl bg-deadlock-panel border border-purple-500/30 flex items-start gap-3">
                      <PowerIcon heroId={myHero.id} abilityKey={detail.key} abilityName={detail.name} size={52} />
                      <div className="space-y-1 flex-1">
                        <span className="text-small font-bold uppercase text-purple-300">{t('powers.max', index + 1, detail.key)}</span>
                        <h3 className="font-bold text-title text-white">{detail.name.split('(')[0].trim()}</h3>
                        <p className="text-body text-amber-200/90">{detail.priorityTip}</p>
                        {detail.description && <p className="text-small text-slate-400">{detail.description}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ================= TAB 3: ITEM DETAILS ================= */}
            {activeTab === 'builds' && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-deadlock-panel border border-amber-500/30">
                  <h3 className="text-title font-extrabold text-amber-300">{activeBuild.name}</h3>
                  <p className="text-small text-slate-300">{activeBuild.subtitle}</p>
                </div>
                {(
                  [
                    { key: 'early', title: t('details.early') },
                    { key: 'mid', title: t('details.mid') },
                    { key: 'late', title: t('details.late') },
                    { key: 'situational', title: t('details.situational') },
                  ] as const
                ).map((phase) => (
                  <div key={phase.key} className="space-y-2">
                    <h3 className="text-body font-bold uppercase text-amber-300">{phase.title}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {activeBuild.phases[phase.key].map((itemId) => {
                        const item = ITEMS[itemId];
                        return item ? (
                          <ItemCard
                            key={itemId}
                            item={item}
                            isOwned={effectiveOwned.has(itemId)}
                            onToggleOwned={handleToggleOwnedItem}
                          />
                        ) : null;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ================= TAB 4: LANE ADVICE & MATCHUPS ================= */}
            {activeTab === 'matchups' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-deadlock-panel border border-amber-500/30 space-y-1.5">
                  <h3 className="text-body font-bold uppercase text-amber-300">{tacticalPlan.laneStrategy.laneTitle}</h3>
                  <p className="text-body text-slate-200">{tacticalPlan.laneStrategy.economyTip}</p>
                  {tacticalPlan.laneStrategy.allySynergyTip && (
                    <p className="text-body text-emerald-300 pt-1">🤝 {tacticalPlan.laneStrategy.allySynergyTip}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tacticalPlan.matchupAlerts.map((alert) => (
                    <div
                      key={alert.enemyId}
                      className={`p-3.5 rounded-xl bg-deadlock-panel border space-y-1.5 ${
                        alert.isInMyLane ? 'border-red-500/50' : 'border-orange-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-body font-bold text-white">
                          {alert.isInMyLane ? t('matchups.lane') : t('matchups.team')} VS {alert.enemyName}
                        </span>
                        <span className="text-small font-bold text-red-300">{t(DANGER_KEYS[alert.dangerLevel])}</span>
                      </div>
                      <p className="text-body text-emerald-300">{alert.keyRule}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ================= TAB 5: DIAGNOSTICS ================= */}
            {activeTab === 'logs' && (
              <DiagnosticsTab
                heroes={HEROES}
                sources={sources}
                selectedSourceId={selectedSourceId}
                onSelectSource={(id) => {
                  setSelectedSourceId(id);
                  refreshSources();
                }}
                onScanNow={() => {
                  refreshSources();
                  performScreenScan();
                }}
                onReport={() => setIsReportOpen(true)}
                lastCaptureUrl={lastCaptureUrl}
                lastDetection={lastDetection}
              />
            )}
          </div>
        </main>

        {isSettingsOpen && (
          <SettingsModal
            onClose={() => setIsSettingsOpen(false)}
            onLangChange={changeLang}
            logsEnabled={logsEnabled}
            onLogsChange={handleLogsChange}
            appInfo={appInfo}
            updateStatus={updateStatus}
            onReport={() => {
              setIsSettingsOpen(false);
              setIsReportOpen(true);
            }}
          />
        )}
        {isReportOpen && (
          <ReportDialog
            onClose={() => setIsReportOpen(false)}
            repoUrl={appInfo?.repoUrl ?? 'https://github.com/PedroGomesFR/deadlock-blueprint'}
            logsEnabled={logsEnabled}
            collect={collectReport}
          />
        )}
        {showOnboarding && (
          <OnboardingModal
            onLangChange={changeLang}
            onDone={(enableLogs) => {
              handleLogsChange(enableLogs);
              localStorage.setItem(ONBOARDED_KEY, '1');
              setShowOnboarding(false);
            }}
          />
        )}
      </div>
    </I18nContext.Provider>
  );
}


export default App;
