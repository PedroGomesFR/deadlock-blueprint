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
  Shuffle,
  Swords,
  Terminal,
  Undo2,
  Unlock,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import {
  LaneColor,
  LaneMode,
  TacticalRecommendation,
  formatPercent,
  formatPoints,
  generateTacticalPlan,
  getAbilityIcon,
  getHeroImbueTarget,
  getHeroItemStat,
  getHeroLateItems,
  getHeroMetaInfo,
  getHeroesDb,
  getItemsDb,
  getLanes,
  rankLabel,
} from './data/deadlockData';
import { getDataInfo } from './data/dataSource';
import { analyzeDeadlockScreen, VisionDetectionResult } from './services/visionScanner';
import { LANE_BY_PAIR, MatchSnapshot, MatchTracker, MatchUpdate, TeamBoard, clockAt } from './services/matchTracker';
import { MidBossState, NowAdvice, getNowAdvice, midBossBackAt } from './services/nowAdvice';
import {
  INVENTORY_SLOTS,
  InventoryStatus,
  QueueEntry,
  effectiveOwnedSet,
  getBuildItemIds,
  getSellCandidates,
  isInventoryFull,
  isStaleLock,
  withLockedFirst,
} from './services/recommendations';
import { computeBuyQueue, getSpikeSafeSlotPlans, isLaneOver } from './services/buyQueue';
import {
  inBuyOrder,
  investmentItems,
  investmentProgress,
  spikeBadge,
  spikeOrder,
  totalInvested,
} from './services/investments';
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
import { InvestmentLine, SpikeChip } from './components/InvestmentLine';
import { HeroPortraitIcon, ItemArtworkIcon, PowerIcon } from './components/DeadlockIcons';
import { CopyNameButton, ShopTabMarker } from './components/ShopHelpers';
import { SettingsModal } from './components/SettingsModal';
import { OnboardingModal } from './components/OnboardingModal';
import { ReportContent, ReportDialog } from './components/ReportDialog';
import { DiagnosticsTab } from './components/DiagnosticsTab';
import { I18nContext, makeI18n } from './i18n';
import { Lang, detectLang, readStoredLang, storeLang } from './i18n/lang';
// Street Brawl mode: everything lives in src/streetBrawl, the app only shows its tab
import { StreetBrawlPanel } from './streetBrawl/StreetBrawlPanel';
import { streetBrawlText } from './streetBrawl/i18n';
import { Badge, Button, Card, IconButton, InfoTip, PickTile, PopoverPanel, SectionHeader, SegmentedControl, Tabs, Toast } from './ui';

type MainTab = 'essential' | 'builds' | 'powers' | 'matchups' | 'logs' | 'streetBrawl';

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
// Only a real threat is red: a "Low" danger in red read as an alarm
const DANGER_TONE = { Low: 'neutral', Medium: 'accent', High: 'bad', Extreme: 'bad' } as const;

// Enemy stance (real matchup of my hero, or fed): label and colours of the enemy strip and the matchup cards
const STANCE_KEYS = { avoid: 'stance.avoid', even: 'stance.even', focus: 'stance.focus' } as const;
const STANCE_STYLE = {
  avoid: 'bg-bad-500/20 border-bad-400/60 text-bad-200',
  even: 'bg-bone/5 border-bone/15 text-ink-soft',
  focus: 'bg-accent-500/20 border-accent-400/60 text-accent-200',
  fed: 'bg-bad-500/35 border-bad-400 text-bad-100',
} as const;
type MatchupAlert = TacticalRecommendation['matchupAlerts'][number];

// "Now" orders, three colours only (the icon tells the kind): red = back off, amber = who to hit, bone = do it
const GO = 'text-ink-strong';
const BACK_OFF = 'text-bad-300';
const NOW_STYLE: Record<NowAdvice['kind'], { icon: string; className: string }> = {
  dead: { icon: '💀', className: 'text-ink-soft' },
  buy: { icon: '🛒', className: GO },
  farm: { icon: '🌾', className: GO },
  safe: { icon: '🛡', className: BACK_OFF },
  push: { icon: '⚔', className: GO },
  midBoss: { icon: '🐉', className: GO },
  soulsBehind: { icon: '📉', className: BACK_OFF },
  soulsAhead: { icon: '📈', className: GO },
  partnerDead: { icon: '⚠', className: BACK_OFF },
  pushLane: { icon: '➡', className: GO },
  help: { icon: '🤝', className: GO },
  focus: { icon: '🎯', className: 'text-accent-300' },
  avoid: { icon: '🚫', className: BACK_OFF },
};

// Interface size of the main window (Settings)
const UI_SCALE_KEY = 'dl_uiScale';
const UI_SCALES = ['auto', '100', '115', '130'] as const;
export type UiScale = (typeof UI_SCALES)[number];

// My hero is auto-detected once per match, then locked (persisted so a restart mid-match keeps it)
const HERO_LOCKED_KEY = 'dl_heroLocked';
const FED_ENEMIES_KEY = 'dl_fedEnemies';
const SOLD_ITEMS_KEY = 'dl_soldItems';
// Who is dead in the top bar right now (services/matchTracker.ts), written by the main window only when it changes
const BOARD_KEY = 'dl_board';
// Mid Boss kills marked by hand this match (services/nowAdvice.ts), shared with the overlay
const MID_BOSS_KEY = 'dl_midBoss';
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
  // Items sold this match (services/matchTracker.ts): no longer suggested, cleared at a new match, shared with the overlay
  const [soldItems, setSoldItems] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SOLD_ITEMS_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const storeSoldItems = useCallback((ids: string[]) => {
    setSoldItems(ids);
    localStorage.setItem(SOLD_ITEMS_KEY, JSON.stringify(ids));
  }, []);
  // Enemies marked fed by the player (their counters come first), cleared at a new match: shared with the overlay
  const [fedEnemyIds, setFedEnemyIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FED_ENEMIES_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const storeFedEnemies = useCallback((ids: string[]) => {
    setFedEnemyIds(ids);
    localStorage.setItem(FED_ENEMIES_KEY, JSON.stringify(ids));
  }, []);
  const [board, setBoard] = useState<TeamBoard | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(BOARD_KEY) || 'null');
    } catch {
      return null;
    }
  });
  // Mid Boss kills marked by hand ("Mid Boss taken"): the app cannot see it, it only counts its respawn time
  const [midBoss, setMidBoss] = useState<MidBossState | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(MID_BOSS_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const storeMidBoss = useCallback((state: MidBossState | null) => {
    setMidBoss(state);
    if (state) localStorage.setItem(MID_BOSS_KEY, JSON.stringify(state));
    else localStorage.removeItem(MID_BOSS_KEY);
  }, []);
  // Ticks every second while the match clock or a Mid Boss timer is shown (both are extrapolated)
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!board?.clock && !midBoss) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [board?.clock, midBoss]);
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
        setSoldItems(JSON.parse(localStorage.getItem(SOLD_ITEMS_KEY) || '[]'));
        setFedEnemyIds(JSON.parse(localStorage.getItem(FED_ENEMIES_KEY) || '[]'));
        setBoard(JSON.parse(localStorage.getItem(BOARD_KEY) || 'null'));
        setMidBoss(JSON.parse(localStorage.getItem(MID_BOSS_KEY) || 'null'));
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
  const closePopover = useCallback(() => setOpenPopover(null), []);
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

  // A fed mark only counts while that hero is in the enemy lineup
  const activeFedIds = useMemo(
    () => fedEnemyIds.filter((id) => laneEnemyIds.includes(id) || teamEnemyIds.includes(id)),
    [fedEnemyIds, laneEnemyIds, teamEnemyIds]
  );
  const toggleFed = (enemyId: string) =>
    storeFedEnemies(activeFedIds.includes(enemyId) ? activeFedIds.filter((id) => id !== enemyId) : [...activeFedIds, enemyId]);

  // Match clock (extrapolated between two readings)
  const clockS = board?.clock ? Math.floor(clockAt(board.clock, nowMs)) : undefined;

  // Laning ends at 10 min (the clock, else about 6,400 souls spent). Latched for the match: the clock is forgotten 15 s
  // after the top bar was last seen, and a lane counter must not come back with it
  const soulsSpent = useMemo(() => totalInvested(ownedItems), [ownedItems]);
  const [laneOverLatched, setLaneOverLatched] = useState(false);
  const laneOver = laneOverLatched || isLaneOver(clockS, soulsSpent);
  useEffect(() => {
    if (laneOver && !laneOverLatched) setLaneOverLatched(true);
  }, [laneOver, laneOverLatched]);

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
        lang,
        activeFedIds,
        laneOver
      ),
    [myHeroId, activeBuild.id, laneColor, laneMode, laneEnemyIds, teamEnemyIds, allyPartnerId, lang, activeFedIds, laneOver]
  );
  // Enemies for the enemy strip and the overlay: lane opponents first (none once laning is over), then the most
  // dangerous: fed, to avoid, even, to focus
  const stanceAlerts = useMemo(() => {
    const danger = (a: MatchupAlert) => (a.isFed ? 0 : a.stance === 'avoid' ? 1 : a.stance === 'focus' ? 3 : 2);
    return [...tacticalPlan.matchupAlerts].sort(
      (a, b) => Number(b.isInMyLane) - Number(a.isInMyLane) || danger(a) - danger(b)
    );
  }, [tacticalPlan.matchupAlerts]);

  const isFull = isInventoryFull(inventoryStatus);

  // Late items beyond the build (the queue goes on with them once the build runs out)
  const lateItems = useMemo(() => getHeroLateItems(myHeroId), [myHeroId]);
  const sellCandidates = useMemo(
    () =>
      getSellCandidates(
        inventoryStatus,
        activeBuild,
        new Set([...tacticalPlan.priorityItems.map((r) => r.item.id), ...lateItems])
      ),
    [inventoryStatus, activeBuild, tacticalPlan.priorityItems, lateItems]
  );

  // Owned items plus the components they consumed (owning Greater Expansion means Mystic Expansion is done)
  const effectiveOwned = useMemo(() => effectiveOwnedSet(ownedItems), [ownedItems]);

  // The build takes one category to 4,800 souls, then the next, then the last, in the order players buy its items
  // (services/investments.ts); a category the player committed to replaces the build's next one
  const buildSpikeOrder = useMemo(
    () =>
      spikeOrder(
        inBuyOrder(
          getBuildItemIds(activeBuild),
          (itemId) => getHeroItemStat(myHeroId, itemId)?.buyTimeS || undefined
        )
      ),
    [activeBuild, myHeroId]
  );
  // Hand-marked items ("Skip") count only once the scanner sees them (services/investments.ts)
  const investedItems = useMemo(
    () => investmentItems(ownedItems, readManualOwned(), inventoryStatus?.itemIds ?? null),
    [ownedItems, inventoryStatus]
  );
  // The clock by the minute: the push windows of a spike (SPIKES) and the due times do not need the second
  const clockMinuteS = clockS === undefined ? undefined : Math.floor(clockS / 60) * 60;
  const investment = useMemo(
    () => investmentProgress(buildSpikeOrder, investedItems, clockMinuteS),
    [buildSpikeOrder, investedItems, clockMinuteS]
  );

  /**
   * Smart Next-To-Buy Queue (services/buyQueue.ts): key core items first, counters placed by the time they are due, the
   * build in its usual buy order, the 4,800 spike nudge. Lane-only counters need a real lane threat and leave with
   * laning. Every item already owned (detected or marked by hand), and every component consumed by an owned
   * upgrade, is skipped.
   */
  const { queue: rawNextToBuyQueue, counters: purchaseCounters } = useMemo(
    () =>
      computeBuyQueue({
        build: activeBuild,
        priorityItems: tacticalPlan.priorityItems,
        matchupAlerts: tacticalPlan.matchupAlerts,
        laneOutlook: tacticalPlan.laneStrategy.outlook?.outlook,
        items: ITEMS,
        t,
        ownedItems,
        investedItems,
        inventoryStatus,
        sellCandidates,
        investment,
        stat: (itemId) => getHeroItemStat(myHeroId, itemId),
        clockS: clockMinuteS,
        laneOver,
        soldItems,
        lateItems,
      }),
    [
      activeBuild,
      tacticalPlan.priorityItems,
      tacticalPlan.matchupAlerts,
      tacticalPlan.laneStrategy.outlook,
      ITEMS,
      t,
      ownedItems,
      investedItems,
      inventoryStatus,
      sellCandidates,
      investment,
      myHeroId,
      clockMinuteS,
      laneOver,
      soldItems,
      lateItems,
    ]
  );

  // The #1 stays locked until it is bought or skipped (or the hero/build changes):
  // new counters or a re-ordering of the queue only affect #2 and beyond.
  const lockKey = `${myHeroId}|${activeBuild.id}`;
  const lockedItemId = lockedNext?.key === lockKey ? lockedNext.itemId : null;

  useEffect(() => {
    if (isDedicatedOverlayWindow) return; // the overlay follows the main window's lock
    const stillValid =
      lockedItemId !== null &&
      rawNextToBuyQueue.some((entry) => entry.item.id === lockedItemId) &&
      !isStaleLock(rawNextToBuyQueue, lockedItemId, (id) => getHeroItemStat(myHeroId, id)?.buyTimeS);
    if (stillValid) return;
    const nextId = rawNextToBuyQueue[0]?.item.id;
    const next = nextId ? { key: lockKey, itemId: nextId } : null;
    setLockedNext(next);
    if (next) localStorage.setItem('dl_lockedNext', JSON.stringify(next));
    else localStorage.removeItem('dl_lockedNext');
  }, [isDedicatedOverlayWindow, lockKey, lockedItemId, rawNextToBuyQueue, myHeroId]);

  const nextToBuyQueue = useMemo(
    () => withLockedFirst(rawNextToBuyQueue, lockedItemId),
    [rawNextToBuyQueue, lockedItemId]
  );

  // What each displayed recommendation does to the inventory: an upgrade replaces its component; with a full
  // inventory, the other ones each need an owned item sold first (the weakest for #1, the next one for #2...)
  const slotPlans = useMemo(
    () => getSpikeSafeSlotPlans(nextToBuyQueue.slice(0, 6), { ownedItems, investedItems, inventoryStatus, sellCandidates }),
    [nextToBuyQueue, ownedItems, investedItems, inventoryStatus, sellCandidates]
  );

  // When the Mid Boss is back after a kill marked by hand
  const midBossBack = midBossBackAt(midBoss);
  const midBossAlive = midBossBack === null || nowMs >= midBossBack;

  // "Now": a few orders from who is dead in the top bar, my souls and my real matchups (services/nowAdvice.ts)
  const nowAdvice = useMemo(
    () =>
      getNowAdvice(
        {
          board,
          clockS,
          midBossAlive,
          laneOver,
          nextItem: nextToBuyQueue[0] && { id: nextToBuyQueue[0].item.id, cost: nextToBuyQueue[0].item.cost },
          souls: currentSouls,
          enemies: tacticalPlan.matchupAlerts.map((a) => ({
            id: a.enemyId,
            stance: a.stance,
            diff: a.stat?.diff,
            winRate: a.stat?.winRate,
            isFed: a.isFed,
          })),
        },
        4
      ),
    [board, clockS, midBossAlive, laneOver, nextToBuyQueue, currentSouls, tacticalPlan.matchupAlerts]
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

  useEffect(() => {
    const deadSlots = (slots: TeamBoard['allies']) =>
      slots.flatMap((s, i) => (s.dead ? [`${i}:${s.heroId ?? '?'}`] : [])).join(',');
    // Written when it changes: the clock only to the minute, or this line would come every second
    const clockMin = clockS === undefined ? '?' : Math.floor(clockS / 60);
    logState(
      'MAINTENANT',
      `${
        board
          ? `chrono=${clockMin} min âmes équipes=${board.souls ? `${board.souls.ally}k/${board.souls.enemy}k` : '?'} mid boss=${
              midBossAlive ? 'vivant' : 'pris'
            } morts alliés=[${deadSlots(board.allies)}] ennemis=[${deadSlots(board.enemies)}]`
          : 'barre du haut non vue'
      } → ${nowAdvice.map(({ kind, ...rest }) => `${kind} ${JSON.stringify(rest)}`).join(' • ') || 'rien'}`
    );
  }, [board, nowAdvice, clockS, midBossAlive]);

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
    soldItems,
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
    snapshotRef.current = { ...snapshotRef.current, ownedItems: [], soldItems: [], inventoryStatus: null };
    setOwnedItems([]);
    storeSoldItems([]);
    setInventoryStatus(null);
    storeFedEnemies([]);
    storeMidBoss(null);
    setLaneOverLatched(false);
    // A new match starts from the queue's head, not from the item locked at the end of the last one
    setLockedNext(null);
    localStorage.removeItem('dl_lockedNext');
  }, [storeFedEnemies, storeMidBoss, storeSoldItems]);

  const boardJsonRef = useRef<string>(JSON.stringify(board));

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
      if (p.soldItems !== undefined) storeSoldItems(p.soldItems);
      setFormatIssue((prev) =>
        update.formatIssue
          ? prev && prev.width === update.formatIssue.width && prev.height === update.formatIssue.height
            ? prev
            : update.formatIssue
          : null
      );
      setHudMissing(update.hudMissing);
      const boardJson = JSON.stringify(update.board);
      if (boardJson !== boardJsonRef.current) {
        boardJsonRef.current = boardJson;
        setBoard(update.board);
        localStorage.setItem(BOARD_KEY, boardJson);
      }
    },
    [clearOwnedItems, lockHero, storeSoldItems]
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
        const sold = snapshotRef.current.soldItems;
        if (sold.includes(itemId)) storeSoldItems(sold.filter((id) => id !== itemId));
      }
      writeManualOwned(manualOwned);
      const next = isCurrentlyOwned ? prev.filter((id) => id !== itemId) : [...prev, itemId];
      localStorage.setItem('dl_ownedItems', JSON.stringify(next));
      snapshotRef.current = { ...snapshotRef.current, ownedItems: next };
      return next;
    });
  };

  // "Skip" in the buy list marks the item bought, with an Undo: a stray click on a second monitor is easy
  const [skipped, setSkipped] = useState<{ itemId: string; name: string } | null>(null);
  const skipItem = (itemId: string, name: string) => {
    handleToggleOwnedItem(itemId);
    setSkipped({ itemId, name });
  };
  const undoSkip = () => {
    if (!skipped) return;
    const { itemId } = skipped;
    setOwnedItems((prev) => {
      const manualOwned = readManualOwned();
      manualOwned.delete(itemId);
      writeManualOwned(manualOwned);
      const next = prev.filter((id) => id !== itemId);
      localStorage.setItem('dl_ownedItems', JSON.stringify(next));
      snapshotRef.current = { ...snapshotRef.current, ownedItems: next };
      return next;
    });
    setSkipped(null);
  };
  const dismissSkipped = useCallback(() => setSkipped(null), []);
  // Active build: the enemy whose counters are open (default: the first to focus), and the queue past #4
  const [openEnemyId, setOpenEnemyId] = useState<string | null>(null);
  const [showFullQueue, setShowFullQueue] = useState(false);

  // "New match" clears the whole match state: a second click within 4 s confirms it
  const [resetArmed, setResetArmed] = useState(false);
  useEffect(() => {
    if (!resetArmed) return;
    const timer = setTimeout(() => setResetArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [resetArmed]);

  // Interface size of the main window (CSS zoom; the overlay has its own size). Auto: larger on 1440p screens and up.
  const [uiScale, setUiScale] = useState<UiScale>(() => {
    const stored = localStorage.getItem(UI_SCALE_KEY);
    return UI_SCALES.includes(stored as UiScale) ? (stored as UiScale) : 'auto';
  });
  useEffect(() => {
    if (isDedicatedOverlayWindow) return;
    const factor = uiScale === 'auto' ? (window.screen.width >= 2400 ? 1.15 : 1) : Number(uiScale) / 100;
    document.documentElement.style.setProperty('zoom', String(factor));
    localStorage.setItem(UI_SCALE_KEY, uiScale);
  }, [uiScale, isDedicatedOverlayWindow]);

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
    // The Street Brawl tab runs its own reader: the normal-mode rules would misread its 4v4 HUD
    if (!autoScanEnabled || isDedicatedOverlayWindow || activeTab === 'streetBrawl') return;
    const timer = setInterval(() => {
      performScreenScan();
    }, 350);
    return () => clearInterval(timer);
  }, [autoScanEnabled, isDedicatedOverlayWindow, performScreenScan, activeTab]);

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
        <div className={`rounded-lg border font-bold bg-bad-500/15 border-bad-400/50 text-bad-200 ${sizeClass}`}>
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
            ? 'bg-enhanced-500/15 border-enhanced-400/40 text-enhanced-200'
            : 'bg-bad-500/15 border-bad-400/50 text-bad-200'
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

  /** "Imbue on [ability icon] Name 53 %" under an imbue item, when most published builds agree on the ability. */
  const renderImbueHint = (itemId: string, compact = false) => {
    const imbue = getHeroImbueTarget(myHeroId, itemId, lang);
    if (!imbue) return null;
    const icon = getAbilityIcon(myHeroId, imbue.ability);
    const share = `${Math.round(imbue.share * 100)}${lang === 'fr' ? ' %' : '%'}`;
    const size = compact ? 16 : 20;
    return (
      <div
        className={`flex items-center gap-1.5 rounded-lg border font-bold bg-spirit-500/15 border-spirit-400/40 text-spirit-200 ${
          compact ? 'px-1.5 py-0.5' : 'px-2 py-1'
        } text-small`}
        title={t('imbue.title', share, imbue.builds)}
      >
        <span className="shrink-0">{t('imbue.label')}</span>
        {icon ? (
          <img src={icon} alt="" style={{ width: size, height: size }} className="shrink-0 object-contain" draggable={false} />
        ) : (
          <span className="shrink-0 rounded bg-accent-500 px-1 text-on-accent">{imbue.ability}</span>
        )}
        <span className={compact ? 'min-w-0' : 'truncate'}>{imbue.abilityName}</span>
        <span className="shrink-0 font-semibold text-spirit-300/80">{share}</span>
      </div>
    );
  };

  /** The spike badge under an item, after selling what its card says to sell (inventory full). */
  const renderSpikeHint = (itemId: string, compact = false) => {
    const plan = slotPlans.get(itemId);
    const badge = spikeBadge(itemId, investedItems, investment, plan?.kind === 'sell' ? plan.itemId : undefined);
    return badge ? <SpikeChip badge={badge} compact={compact} /> : null;
  };

  const stanceLabel = (alert: MatchupAlert) =>
    alert.isFed ? t('stance.fed') : alert.stance ? t(STANCE_KEYS[alert.stance]) : null;
  const stanceStyle = (alert: MatchupAlert) => STANCE_STYLE[alert.isFed ? 'fed' : alert.stance ?? 'even'];
  /** "You win 44.1% of games laning against them (usually 48.3%) · 2,345 games" */
  const matchupStatText = (alert: MatchupAlert) =>
    alert.stat
      ? t(
          'matchups.stat',
          formatPercent(alert.stat.winRate, lang),
          formatPercent(alert.stat.usualWinRate, lang),
          formatNumber(alert.stat.games),
          alert.stat.lane
        )
      : null;
  const { outlook, duo } = tacticalPlan.laneStrategy;
  const laneOutlookText = outlook
    ? outlook.outlook === 'hard'
      ? t('lane.hard', formatPoints(outlook.diff, lang))
      : outlook.outlook === 'favourable'
      ? t('lane.favourable', formatPoints(outlook.diff, lang))
      : t('lane.even')
    : null;
  const laneDuoText =
    duo && allyPartnerId
      ? t(
          'lane.duo',
          HEROES.find((h) => h.id === allyPartnerId)?.name ?? allyPartnerId,
          formatPercent(duo.winRate, lang),
          formatPercent(duo.usualWinRate, lang),
          formatNumber(duo.games)
        )
      : null;

  const inventoryLabel = inventoryStatus
    ? t('inv.label', inventoryStatus.occupied, INVENTORY_SLOTS - inventoryStatus.locked, isFull)
    : t('inv.ownedCount', ownedItems.length);

  const totalSelectedEnemies = laneEnemyIds.length + teamEnemyIds.length;
  const allyHeroObj = allyPartnerId ? HEROES.find((h) => h.id === allyPartnerId) : null;
  const heroName = (id: string) => HEROES.find((h) => h.id === id)?.name;

  const nameList = (ids: string[]) => {
    const names = ids.map((id) => heroName(id) ?? id);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} ${t('now.and')} ${names[names.length - 1]}` : names[0] ?? '';
  };
  const shortItemName = (id: string) => ITEMS[id]?.name.split('(')[0].trim() ?? id;
  const nowText = (a: NowAdvice): string => {
    switch (a.kind) {
      case 'dead':
        if (!a.itemId) return t('now.deadNoItem');
        return a.missing === 0
          ? t('now.deadCanBuy', shortItemName(a.itemId))
          : t('now.dead', shortItemName(a.itemId), a.missing === undefined ? null : formatNumber(a.missing));
      case 'buy':
        return t('now.buy', shortItemName(a.itemId));
      case 'farm':
        return t('now.farm', formatNumber(a.missing), shortItemName(a.itemId));
      case 'safe':
        return t('now.safe', a.alliesDead, a.enemiesDead);
      case 'push':
        return t('now.push', a.enemiesDead, a.alliesDead);
      case 'midBoss':
        return a.soulLead !== undefined && a.enemiesDead - a.alliesDead < 3
          ? t('now.midBossLead', a.enemiesDead, formatNumber(a.soulLead))
          : t('now.midBoss', a.enemiesDead, a.alliesDead);
      case 'soulsBehind':
        return t('now.soulsBehind', formatNumber(a.diff));
      case 'soulsAhead':
        return t('now.soulsAhead', formatNumber(a.diff));
      case 'partnerDead':
        return t('now.partnerDead', nameList([a.partnerId]));
      case 'pushLane':
        return t('now.pushLane', nameList(a.enemyIds), a.enemyIds.length);
      case 'help': {
        const lane = LANES.find((l) => l.id === LANE_BY_PAIR[a.lanePair])?.name.split(' (')[0] ?? LANE_BY_PAIR[a.lanePair];
        return t('now.help', lane, nameList([a.allyId]), nameList(a.enemyIds));
      }
      case 'focus':
        return a.fed
          ? t('now.focusFed', nameList([a.enemyId]))
          : t('now.focus', nameList([a.enemyId]), a.winRate === undefined ? null : formatPercent(a.winRate, lang));
      case 'avoid':
        return t('now.avoid', nameList(a.enemyIds));
    }
  };
  /** The heroes an order is about (their portraits are shown with it), or the item it is about. */
  const nowVisual = (a: NowAdvice): { heroIds: string[]; itemId?: string } => {
    switch (a.kind) {
      case 'partnerDead':
        return { heroIds: [a.partnerId] };
      case 'pushLane':
      case 'avoid':
        return { heroIds: a.enemyIds };
      case 'help':
        return { heroIds: [a.allyId, ...a.enemyIds] };
      case 'focus':
        return { heroIds: [a.enemyId] };
      case 'dead':
        return { heroIds: [], itemId: a.itemId };
      case 'buy':
      case 'farm':
        return { heroIds: [], itemId: a.itemId };
      default:
        return { heroIds: [] };
    }
  };
  const formatClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  /** The "Now" orders, most urgent first, with the portraits of the heroes they name; then the Mid Boss timer. */
  const renderNow = (max: number, compact: boolean, withStatus = true) => {
    const size = compact ? 22 : 28;
    return (
      <div className="space-y-1.5">
        <ul className="space-y-1">
          {nowAdvice.length === 0 ? (
            <li className="text-body text-ink-muted">{t('now.empty')}</li>
          ) : (
            nowAdvice.slice(0, max).map((a) => {
              const { heroIds, itemId } = nowVisual(a);
              const item = itemId ? ITEMS[itemId] : undefined;
              return (
                <li key={a.kind} className={`flex items-center gap-1.5 text-body font-semibold ${NOW_STYLE[a.kind].className}`}>
                  <span className="shrink-0 w-4 text-center">{NOW_STYLE[a.kind].icon}</span>
                  {heroIds.length > 0 && (
                    <span className="shrink-0 flex items-center -space-x-1">
                      {heroIds.map((id) => (
                        <HeroPortraitIcon
                          key={id}
                          heroId={id}
                          color={HEROES.find((h) => h.id === id)?.accentColor ?? '#64748b'}
                          size={size}
                        />
                      ))}
                    </span>
                  )}
                  {item && <ItemArtworkIcon itemId={item.id} category={item.category} size={size} />}
                  <span className="min-w-0">{nowText(a)}</span>
                </li>
              );
            })
          )}
        </ul>
        {withStatus && renderMidBoss(compact)}
      </div>
    );
  };
  /** Match clock, Mid Boss state and the button marking it killed (the app cannot see it). */
  const renderMidBoss = (compact: boolean) => {
    const canClick = !(compact && isClickThrough);
    return (
      <div className="flex items-center gap-2 flex-wrap text-small text-ink-muted">
        {clockS !== undefined && <span className="tabular-nums">⏱ {formatClock(clockS)}</span>}
        <span title={t(laneOver ? 'now.phaseTeamTitle' : 'now.phaseLaneTitle')}>
          {t(laneOver ? 'now.phaseTeam' : 'now.phaseLane')}
        </span>
        <span className={midBossAlive ? 'text-choice-300' : ''}>
          🐉{' '}
          {midBossAlive
            ? t('now.midBossUp')
            : t('now.midBossBack', formatClock(Math.max(0, (midBossBack! - nowMs) / 1000)))}
        </span>
        {canClick && (
          <span className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={() =>
                storeMidBoss({ kills: (midBoss?.kills ?? 0) + 1, lastKillAt: Date.now(), previous: midBoss ?? undefined })
              }
              title={t('now.midBossTakenTitle')}
              className="text-choice-200"
            >
              {t('now.midBossTaken')}
            </Button>
            {midBoss && (
              <IconButton
                label={t('now.midBossUndoTitle')}
                icon={<Undo2 className="w-3.5 h-3.5" />}
                onClick={() => storeMidBoss(midBoss.previous ?? null)}
              />
            )}
          </span>
        )}
      </div>
    );
  };

  // ================= DEDICATED TRANSPARENT IN-GAME OVERLAY HUD WINDOW =================
  if (isDedicatedOverlayWindow) {
    return (
      <I18nContext.Provider value={i18n}>
        <div className="h-screen w-screen p-2 flex flex-col select-none bg-transparent overflow-hidden">
          <div
            style={{ opacity: overlayOpacity }}
            className="relative flex-1 flex flex-col rounded-2xl bg-surface-base/85 backdrop-blur-xl border border-accent-500/45 shadow-overlay overflow-hidden"
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
                <div className="w-3 h-3 border-l-2 border-b-2 border-accent-400 rounded-bl" />
              </div>
            )}
            <div className="drag-region px-3 py-2 bg-gradient-to-r from-accent-950/80 via-surface-panel to-surface-panel border-b border-bone/10 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <HeroPortraitIcon heroId={myHero.id} color={myHero.accentColor} size={28} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-display tracking-display text-body text-accent-300 truncate">
                      {myHero.name}
                    </span>
                    {currentSouls !== null && (
                      <span className="text-small font-bold text-info-300 bg-info-950/70 px-1.5 py-0.2 rounded border border-info-500/40">
                        {t('souls', formatNumber(currentSouls))}
                      </span>
                    )}
                  </div>
                  <span className="text-small text-ink-muted block leading-none">
                    VS{' '}
                    {laneOver
                      ? t('enemies.team', laneEnemyIds.length + teamEnemyIds.length)
                      : laneEnemyIds.map(heroName).join(' + ') || t('enemies.laneBadge')}
                  </span>
                </div>
              </div>

              <div className="no-drag flex items-center gap-1 shrink-0">
                {!isClickThrough && (
                  <Button
                    size="sm"
                    pressed={isOverlayArranging}
                    pressedVariant="primary"
                    onClick={handleToggleArranging}
                    title={t('overlay.settingsTitle')}
                    aria-label={t('overlay.settingsTitle')}
                    className="px-1.5 py-1"
                    icon={<Settings className="w-3 h-3" />}
                  />
                )}
                <Button
                  size="sm"
                  pressed={isClickThrough}
                  pressedVariant="danger"
                  onClick={handleToggleClickThrough}
                  title={t('overlay.clickThroughTitle')}
                  icon={isClickThrough ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                >
                  Alt+L
                </Button>
                <IconButton
                  label={t('overlay.hideTitle')}
                  icon={<X className="w-3.5 h-3.5" />}
                  onClick={() => window.electronAPI?.setOverlayMode(false)}
                />
              </div>
            </div>

            <div className="no-drag px-3 py-1.5 bg-shade/50 border-b border-bone/10 space-y-1">
              <span className="font-display text-small tracking-display text-accent-300">{t('now.title')}</span>
              {renderNow(3, true)}
            </div>

            {isClickThrough && (
              <div className="bg-bad-950/90 border-b border-bad-500/40 px-3 py-1 text-small text-center text-bad-200 font-semibold">
                {t('overlay.ghostActive')} <kbd className="px-1 bg-shade/50 rounded">Alt+L</kbd> {t('overlay.ghostUnlock')}
              </div>
            )}

            {isOverlayArranging && !isClickThrough && (
              <div className="no-drag px-3 py-2 bg-shade/60 border-b border-bone/10 space-y-2 text-small font-bold text-ink-soft">
                <p className="font-semibold text-accent-200">
                  {t('overlay.arrangeHint')} <kbd className="px-1 bg-shade/50 rounded">Alt+K</kbd>
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
                    className="flex-1 accent-accent-500"
                  />
                  <span className="w-10 text-right tabular-nums">{t('overlay.percent', Math.round(overlayOpacity * 100))}</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="w-14 shrink-0">{t('overlay.size')}</span>
                  <SegmentedControl
                    size="sm"
                    tone="accent"
                    value={overlayScale}
                    onChange={changeOverlayScale}
                    options={OVERLAY_SCALES.map((scale) => ({ value: scale, label: t('overlay.percent', Math.round(scale * 100)) }))}
                  />
                </div>
              </div>
            )}

            <div className="no-drag px-2.5 py-2 bg-shade/50 border-b border-bone/10 flex items-center justify-between">
              <span className="text-small font-bold uppercase text-spirit-300">{t('overlay.abilities')}</span>
              <div className="flex items-center gap-1">
                {activeBuild.abilitiesOrder.map((key, idx) => {
                  const ab = activeBuild.abilitiesDetails.find((a) => a.key === key);
                  return (
                    <React.Fragment key={key}>
                      <PowerIcon heroId={myHero.id} abilityKey={key} abilityName={ab?.name || key} size={32} />
                      {idx < 3 && <span className="text-ink-faint text-body font-bold">›</span>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div className="no-drag flex-1 overflow-y-auto p-2.5 space-y-2.5">
              <div className="space-y-1.5">
                <span className="font-display text-small tracking-display text-ink-strong flex items-center gap-1">
                  <ShoppingCart className="w-3 h-3 text-accent-400" /> {t('overlay.buyNow')}
                </span>
                <InvestmentLine investment={investment} clockS={clockS} compact />
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
                          ? 'bg-accent-950/35 border-accent-400 shadow-raised'
                          : 'bg-surface-panel border-bone/15 hover:border-accent-400/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-full bg-accent-500 text-on-accent font-extrabold text-small flex items-center justify-center shrink-0">
                          #{idx + 1}
                        </span>
                        <ItemArtworkIcon itemId={entry.item.id} category={entry.item.category} size={46} />
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="font-label text-title text-ink-strong truncate">{shortName}</span>
                            {!isClickThrough && <CopyNameButton name={shortName} />}
                          </div>
                          <ShopTabMarker category={entry.item.category} />
                          {renderSlotPlan(entry.item.id, true)}
                          {renderImbueHint(entry.item.id, true)}
                          {renderSpikeHint(entry.item.id, true)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-title font-extrabold text-info-300 block">{formatNumber(entry.item.cost)}</span>
                        {canAfford && (
                          <Badge tone="good" solid className="uppercase">{t('overlay.buy')}</Badge>
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
  // The normal scan is paused on the Street Brawl tab and never reads its 4v4 HUD: its warning does not apply there
  const showHudMissing = hudMissing && activeTab !== 'streetBrawl';
  /** The hero the Street Brawl tab read from its ability icons: selected like a hand pick, without locking it. */
  const selectHeroFromStreetBrawl = (heroId: string) => {
    setMyHeroId(heroId);
    snapshotRef.current = { ...snapshotRef.current, myHeroId: heroId };
    trackerRef.current.resetHero();
  };

  /** Price state of a queued item: affordable, or how many souls are missing. */
  const affordBadge = (cost: number) =>
    currentSouls === null ? null : currentSouls >= cost ? (
      <Badge tone="good" solid className="uppercase">
        {t('buy.affordable')}
      </Badge>
    ) : (
      <Badge className="text-accent-300 tabular-nums">{t('buy.missing', formatNumber(cost - currentSouls))}</Badge>
    );
  const whyTip = (entry: QueueEntry) => [entry.reason, whyText(entry)].filter(Boolean).join('\n');

  /** The next purchase, large: everything needed to buy it (sell plan, imbue, spike). */
  const renderBuyHero = (entry: QueueEntry) => {
    const { item } = entry;
    const shortName = item.name.split('(')[0].trim();
    const isCounter = purchaseCounters.some((counter) => counter.item.id === item.id);
    return (
      <div key={item.id} className="p-3.5 rounded-xl border-2 bg-accent-950/35 border-accent-400 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="accent" solid className="uppercase">
            {t('buy.next1')} <Lock className="w-2.5 h-2.5" />
          </Badge>
          {affordBadge(item.cost)}
        </div>
        <div className="flex items-center gap-3">
          <ItemArtworkIcon itemId={item.id} category={item.category} size={72} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start gap-1">
              <span className="font-label text-heading text-ink-strong leading-tight flex-1 min-w-0">{shortName}</span>
              <CopyNameButton name={shortName} />
            </div>
            <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
              <span className="text-body font-extrabold text-info-300 tabular-nums">{t('souls', formatNumber(item.cost))}</span>
              <ShopTabMarker category={item.category} tier={item.tier} />
            </div>
          </div>
        </div>
        {renderSlotPlan(item.id)}
        {renderImbueHint(item.id)}
        {renderSpikeHint(item.id)}
        <div className="mt-auto pt-2 border-t border-bone/10 flex items-center justify-between gap-2">
          <span className={`flex items-center gap-1.5 min-w-0 text-small font-semibold ${isCounter ? 'text-bad-300' : 'text-ink-soft'}`}>
            <span className="truncate">{entry.reason}</span>
            <InfoTip text={whyTip(entry)} />
          </span>
          <Button className="px-4 py-1.5" onClick={() => skipItem(item.id, shortName)}>
            {t('buy.skip')}
          </Button>
        </div>
      </div>
    );
  };

  /** The purchases after the next one: one line each, details on the ⓘ. */
  const renderBuyRow = (entry: QueueEntry, rank: number) => {
    const { item } = entry;
    const shortName = item.name.split('(')[0].trim();
    return (
      <div key={item.id} className="p-2 rounded-xl border bg-shade/40 border-bone/10 flex items-center gap-2.5">
        <span className="w-6 shrink-0 text-center font-display text-small tracking-display text-ink-faint">#{rank}</span>
        <ItemArtworkIcon itemId={item.id} category={item.category} size={40} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1 min-w-0">
            <span className="font-label text-title text-ink-strong truncate">{shortName}</span>
            <CopyNameButton name={shortName} />
            <InfoTip text={whyTip(entry)} />
          </div>
          <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
            <span className="text-small font-extrabold text-info-300 tabular-nums">{t('souls', formatNumber(item.cost))}</span>
            <ShopTabMarker category={item.category} tier={item.tier} />
          </div>
          <div className="flex">{renderSlotPlan(item.id, true)}</div>
        </div>
        <div className="shrink-0">{affordBadge(item.cost)}</div>
        <Button size="sm" variant="ghost" onClick={() => skipItem(item.id, shortName)}>
          {t('buy.skip')}
        </Button>
      </div>
    );
  };

  return (
    <I18nContext.Provider value={i18n}>
      <div className="h-full w-full flex flex-col bg-surface-base text-ink overflow-hidden">
        {/* 1. COMPACT TOP BAR (Hero + Partner + Lane + Enemies + Silent Controls) */}
        <div className="px-3 py-2 bg-surface-panel border-b border-bone/10 flex flex-wrap items-center justify-between gap-2 shrink-0 relative z-30">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setOpenPopover(openPopover === 'myHero' ? null : 'myHero')}
              aria-expanded={openPopover === 'myHero'}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-shade/60 hover:bg-shade/80 border border-accent-500/40 transition"
            >
              <HeroPortraitIcon heroId={myHero.id} color={myHero.accentColor} size={32} />
              <span className="font-label text-body sm:text-title text-ink-strong">{myHero.name}</span>
              {isHeroLocked && (
                <span title={t('hero.lockedTitle')}>
                  <Lock className="w-3 h-3 text-accent-400" />
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-accent-400" />
            </button>

            {laneMode === 'duo' && (
              <button
                onClick={() => setOpenPopover(openPopover === 'ally' ? null : 'ally')}
                aria-expanded={openPopover === 'ally'}
                className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-good-950/30 hover:bg-good-950/50 border border-good-500/40 transition font-label text-body text-good-200"
                title={t('ally.title')}
              >
                {allyHeroObj ? (
                  <HeroPortraitIcon heroId={allyHeroObj.id} color={allyHeroObj.accentColor} size={28} />
                ) : (
                  <UserPlus className="w-3.5 h-3.5 text-good-400" />
                )}
                <span>{allyHeroObj ? allyHeroObj.name : t('ally.add')}</span>
              </button>
            )}

            {myHero.builds.length > 1 && (
              <SegmentedControl
                size="sm"
                tone="accent"
                value={activeBuild.id}
                onChange={setSelectedBuildId}
                options={myHero.builds.map((b, idx) => ({ value: b.id, label: t('build.n', idx + 1), title: `${b.name}\n${b.subtitle}` }))}
              />
            )}
          </div>

          {/* Center: Enemies Button */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setOpenPopover(openPopover === 'enemies' ? null : 'enemies')}
              aria-expanded={openPopover === 'enemies'}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-bad-950/35 hover:bg-bad-950/55 border border-bad-500/40 transition"
            >
              <div className="flex -space-x-1.5">
                {laneEnemyIds.length > 0 ? (
                  laneEnemyIds.map((eid) => {
                    const eh = HEROES.find((h) => h.id === eid);
                    return eh ? <HeroPortraitIcon key={eid} heroId={eh.id} color={eh.accentColor} size={28} /> : null;
                  })
                ) : (
                  <Swords className="w-4 h-4 text-bad-400" />
                )}
              </div>
              <span className="font-label text-body text-ink-strong">
                {t('enemies.button', laneEnemyIds.length, teamEnemyIds.length)}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-bad-300" />
            </button>

            {/* Silent Auto-Scan Toggle (No blinking/spinning animations!) */}
            <Button
              size="sm"
              pressed={autoScanEnabled}
              onClick={() => setAutoScanEnabled((v) => !v)}
              title={t('autoscan.title')}
              icon={<Radio className={`w-3.5 h-3.5 ${autoScanEnabled ? '' : 'text-good-400'}`} />}
            >
              <span className="hidden md:inline">{t('autoscan.label')}</span>
            </Button>

            <Button size="sm" variant="primary" onClick={() => performScreenScan()} title={t('scan.title')} icon={<Camera className="w-3.5 h-3.5" />}>
              {t('scan.label')}
            </Button>

            <Button
              size="sm"
              pressed={isOverlayMode}
              pressedVariant="spirit"
              onClick={handleToggleOverlay}
              title={t('overlay.toggleTitle')}
              icon={<Layers className={`w-3.5 h-3.5 ${isOverlayMode ? '' : 'text-spirit-400'}`} />}
            >
              {t('overlay.label')}
            </Button>

            <IconButton label={t('settings.open')} icon={<Settings className="w-4 h-4" />} onClick={() => setIsSettingsOpen(true)} />
          </div>

          {/* POPOVER MODALS */}
          {openPopover === 'myHero' && (
            <PopoverPanel title={t('hero.pick')} onClose={closePopover} closeLabel={t('settings.close')}>
              <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto">
                {HEROES.map((h) => (
                  <PickTile
                    key={h.id}
                    selected={h.id === myHeroId}
                    selectedClassName="bg-accent-500/25 border-accent-400 text-ink-strong"
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
                  >
                    <HeroPortraitIcon heroId={h.id} color={h.accentColor} size={26} />
                    <span className="text-body truncate">{h.name}</span>
                  </PickTile>
                ))}
              </div>
            </PopoverPanel>
          )}

          {openPopover === 'ally' && (
            <PopoverPanel tone="good" title={t('ally.pick')} onClose={closePopover} closeLabel={t('settings.close')}>
              <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto">
                {HEROES.filter((h) => h.id !== myHeroId).map((h) => (
                  <PickTile
                    key={h.id}
                    selected={h.id === allyPartnerId}
                    selectedClassName="bg-good-500/25 border-good-400 text-ink-strong"
                    onClick={() => {
                      setAllyPartnerId(h.id);
                      setLaneEnemyIds((prev) => prev.filter((id) => id !== h.id));
                      setTeamEnemyIds((prev) => prev.filter((id) => id !== h.id));
                      setOpenPopover(null);
                    }}
                  >
                    <HeroPortraitIcon heroId={h.id} color={h.accentColor} size={26} />
                    <span className="text-body truncate">{h.name}</span>
                  </PickTile>
                ))}
              </div>
            </PopoverPanel>
          )}

          {openPopover === 'enemies' && (
            <PopoverPanel
              tone="bad"
              className="space-y-2.5"
              title={t('enemies.title', totalSelectedEnemies)}
              onClose={closePopover}
              closeLabel={t('settings.close')}
              actions={
                totalSelectedEnemies > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-bad-300"
                    onClick={() => {
                      setLaneEnemyIds([]);
                      setTeamEnemyIds([]);
                    }}
                  >
                    {t('enemies.clear')}
                  </Button>
                )
              }
            >
              <SegmentedControl
                stretch
                value={enemyPopoverMode}
                onChange={setEnemyPopoverMode}
                options={[
                  { value: 'lane', label: t('enemies.myLane', laneEnemyIds.length, laneMode === 'solo' ? 1 : 2), tone: 'bad' },
                  { value: 'team', label: t('enemies.otherLanes', teamEnemyIds.length, 6 - laneEnemyIds.length), tone: 'weapon' },
                ]}
              />

              <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto">
                {HEROES.filter((h) => h.id !== myHeroId && h.id !== allyPartnerId).map((eh) => {
                  const isInLane = laneEnemyIds.includes(eh.id);
                  const isInTeam = teamEnemyIds.includes(eh.id);
                  return (
                    <PickTile
                      key={eh.id}
                      onClick={() => handleSelectEnemyHero(eh.id)}
                      selected={isInLane || isInTeam}
                      selectedClassName={
                        isInLane ? 'bg-bad-500/30 border-bad-400 text-ink-strong' : 'bg-weapon-500/25 border-weapon-400 text-weapon-100'
                      }
                    >
                      <HeroPortraitIcon heroId={eh.id} color={eh.accentColor} size={26} />
                      <div className="min-w-0">
                        <span className="text-body block truncate">{eh.name}</span>
                        {isInLane && <span className="text-small text-bad-300 block">{t('enemies.laneBadge')}</span>}
                        {isInTeam && <span className="text-small text-weapon-300 block">{t('enemies.teamBadge')}</span>}
                      </div>
                    </PickTile>
                  );
                })}
              </div>
            </PopoverPanel>
          )}
        </div>

        {/* 2. NAVIGATION TABS */}
        <div className="px-3 bg-surface-header border-b border-bone/10 flex items-center justify-between shrink-0">
          <Tabs
            value={activeTab}
            onChange={setActiveTab}
            items={[
              { id: 'essential', label: t('tabs.essential'), icon: LayoutGrid },
              { id: 'powers', label: t('tabs.powers'), icon: Zap },
              { id: 'builds', label: t('tabs.builds'), icon: Package },
              { id: 'matchups', label: t('tabs.matchups', totalSelectedEnemies), icon: Swords },
              { id: 'logs', label: t('tabs.logs'), icon: Terminal },
              { id: 'streetBrawl', label: streetBrawlText(lang).tab, icon: Shuffle },
            ]}
          />

          <div className="flex items-center gap-2 py-1">
            {currentSouls !== null && activeTab !== 'essential' && <Badge tone="info">{t('souls.inPocket', formatNumber(currentSouls))}</Badge>}
            {ownedItems.length > 0 && (
              <Button
                size="sm"
                variant={resetArmed ? 'danger' : 'ghost'}
                onClick={() => {
                  if (!resetArmed) return setResetArmed(true);
                  clearOwnedItems();
                  setResetArmed(false);
                }}
                title={t('owned.resetTitle')}
                icon={<RotateCcw className="w-3 h-3" />}
              >
                {resetArmed ? t('owned.resetConfirm') : t('owned.reset', ownedItems.length)}
              </Button>
            )}
          </div>
        </div>

        {/* Notices: update available, unsupported screen format, HUD never found */}
        {(showUpdateBanner || formatIssue || showHudMissing) && (
          <div className="px-3 pt-2 space-y-2 shrink-0">
            {showUpdateBanner && (
              <div className="max-w-screen-2xl mx-auto px-3 py-2 rounded-xl bg-good-950/60 border border-good-500/50 flex items-center justify-between gap-2 flex-wrap text-body">
                <span className="font-bold text-good-200">
                  {updateStatus.state === 'ready'
                    ? t('update.ready', updateStatus.version)
                    : updateStatus.state === 'available'
                    ? t('update.available', updateStatus.version)
                    : ''}
                </span>
                <div className="flex items-center gap-2">
                  {updateStatus.state === 'available' && (
                    <Button variant="success" onClick={() => window.electronAPI?.openExternal(updateStatus.url)}>
                      {t('update.download')}
                    </Button>
                  )}
                  {updateStatus.state === 'ready' && (
                    <Button variant="success" onClick={() => window.electronAPI?.updates.install()}>
                      {t('update.restart')}
                    </Button>
                  )}
                  <IconButton label={t('update.dismiss')} icon={<X className="w-4 h-4" />} onClick={() => setUpdateDismissed(true)} />
                </div>
              </div>
            )}
            {formatIssue && (
              <div className="max-w-screen-2xl mx-auto px-3 py-2.5 rounded-xl bg-bad-950/70 border-2 border-bad-500/70 flex items-start gap-2.5">
                <MonitorX className="w-5 h-5 text-bad-300 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <p className="font-display text-body tracking-display text-bad-200">{t('resolution.title')}</p>
                  <p className="text-body text-bad-100">
                    {t('resolution.body', formatIssue.width, formatIssue.height, aspectLabel(formatIssue.width, formatIssue.height))}
                  </p>
                  <p className="text-small text-bad-200/90">{t('resolution.help')}</p>
                </div>
                <Button size="sm" className="shrink-0" onClick={() => setIsReportOpen(true)}>
                  {t('resolution.report')}
                </Button>
              </div>
            )}
            {!formatIssue && showHudMissing && (
              <div className="max-w-screen-2xl mx-auto px-3 py-2 rounded-xl bg-accent-950/50 border border-accent-500/40 flex items-start gap-2 text-small text-accent-100">
                <Info className="w-4 h-4 text-accent-300 shrink-0" />
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
          className="flex-1 overflow-y-auto p-3 space-y-3 bg-surface-base"
        >
          <div className="max-w-screen-2xl mx-auto space-y-3">
            {/* ================= TAB 1: ACTIVE BUILD ================= */}
            {activeTab === 'essential' && (
              <div className="space-y-3">
                {/* Match strip: clock, phase, Mid Boss, souls (one line instead of four places) */}
                <Card className="px-3 py-2 flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
                  {renderMidBoss(false)}
                  {currentSouls !== null && (
                    <Badge tone="info" className="text-body px-2.5 py-1 tabular-nums">
                      {t('souls.inPocket', formatNumber(currentSouls))}
                    </Badge>
                  )}
                </Card>

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start gap-3">
                {/* ★ PRIORITY #1: BUY RIGHT NOW (NEXT ITEMS + WHERE TO FIND IN SHOP + AFFORDABILITY) ★ */}
                <section className="p-3.5 rounded-2xl bg-surface-panel border border-bone/10 shadow-raised space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="p-1.5 rounded-xl bg-accent-500 text-on-accent">
                        <ShoppingCart className="w-4 h-4" />
                      </span>
                      <h2 className="font-display text-title tracking-display text-ink-strong">{t('buy.title', inventoryLabel)}</h2>
                      <InfoTip text={`${t('buy.help')}\n${activeBuild.name} — ${activeBuild.subtitle}`} />
                      {inventoryStatus && inventoryStatus.unmatched > 0 && (
                        <span className="text-small text-accent-300 font-semibold">{t('buy.unmatched', inventoryStatus.unmatched)}</span>
                      )}
                    </div>
                    <InvestmentLine investment={investment} clockS={clockS} />
                  </div>

                  {/* The next purchase large, then #2–#4 (up to #6 on demand) */}
                  {nextToBuyQueue.slice(0, 1).map(renderBuyHero)}
                  {nextToBuyQueue.length > 1 && (
                    <div className="space-y-1.5">
                      <span className="block font-display text-small tracking-display text-ink-muted">{t('buy.then')}</span>
                      {nextToBuyQueue.slice(1, showFullQueue ? 6 : 4).map((entry, i) => renderBuyRow(entry, i + 2))}
                      {nextToBuyQueue.length > 4 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-expanded={showFullQueue}
                          onClick={() => setShowFullQueue((v) => !v)}
                          icon={<ChevronDown className={`w-3.5 h-3.5 transition ${showFullQueue ? 'rotate-180' : ''}`} />}
                        >
                          {showFullQueue ? t('buy.less') : t('buy.more', Math.min(6, nextToBuyQueue.length) - 4)}
                        </Button>
                      )}
                    </div>
                  )}
                </section>

                  <div className="space-y-3">
                {/* What to do now: who is dead in the top bar, my souls, my matchups */}
                <section className="p-3 rounded-2xl bg-surface-panel border border-accent-500/50 shadow-raised space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-title tracking-display text-ink-strong flex items-center gap-1.5">
                      <Radio className="w-4 h-4 text-accent-400" /> {t('now.title')}
                    </h2>
                    <InfoTip text={t('now.hint')} />
                  </div>
                  {renderNow(3, false, false)}
                </section>

                {/* Enemies: one chip each (lane opponents first, then the most dangerous), one open with its ultimate,
                    its best counters and the fed toggle */}
                {stanceAlerts.length > 0 &&
                  (() => {
                    const isDead = (id: string) => board?.enemies.some((s) => s.heroId === id && s.dead) ?? false;
                    const open =
                      stanceAlerts.find((a) => a.enemyId === openEnemyId) ??
                      stanceAlerts.find((a) => a.stance === 'focus' && !isDead(a.enemyId)) ??
                      stanceAlerts[0];
                    return (
                      <section className="p-3 rounded-2xl bg-surface-panel border border-bone/10 shadow-raised space-y-2.5">
                        <SectionHeader
                          as="h2"
                          icon={<Swords className="w-3.5 h-3.5" />}
                          title={t('enemies.countersTitle')}
                          aside={<InfoTip text={t('enemies.countersHint')} />}
                        />
                        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('enemies.countersTitle')}>
                          {stanceAlerts.map((alert) => {
                            const selected = alert.enemyId === open.enemyId;
                            const dead = isDead(alert.enemyId);
                            return (
                              <button
                                key={alert.enemyId}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => setOpenEnemyId(alert.enemyId)}
                                title={[stanceLabel(alert), matchupStatText(alert)].filter(Boolean).join('\n')}
                                className={`flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 ${stanceStyle(
                                  alert
                                )} ${selected ? 'ring-2 ring-accent-400' : 'hover:brightness-125'} ${dead ? 'opacity-50' : ''}`}
                              >
                                <HeroPortraitIcon heroId={alert.enemyId} color={alert.enemyColor} size={26} />
                                <span className="font-label text-body">{alert.enemyName}</span>
                                {alert.isInMyLane && <span className="text-small">🎯</span>}
                                {dead && <span className="text-small">💀</span>}
                              </button>
                            );
                          })}
                        </div>

                        <div className="pt-2.5 border-t border-bone/10 space-y-2">
                          <div className="flex items-center gap-2">
                            <HeroPortraitIcon heroId={open.enemyId} color={open.enemyColor} size={36} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-label text-title text-ink-strong">{open.enemyName}</span>
                                {stanceLabel(open) && (
                                  <span className={`px-1.5 rounded-md border text-small font-bold ${stanceStyle(open)}`}>{stanceLabel(open)}</span>
                                )}
                                {isDead(open.enemyId) && <span className="text-small text-ink-muted">💀 {t('enemies.dead')}</span>}
                              </div>
                              {matchupStatText(open) && <p className="text-small text-ink-muted truncate">{matchupStatText(open)}</p>}
                            </div>
                            <Button size="sm" pressed={open.isFed} pressedVariant="danger" onClick={() => toggleFed(open.enemyId)}>
                              {open.isFed ? t('matchups.fedUnmark') : `🔥 ${t('matchups.fedMark')}`}
                            </Button>
                          </div>
                          {open.ult && (
                            <div className="flex items-center gap-1.5 text-small text-ink-soft" title={t('enemies.ultTitle')}>
                              {getAbilityIcon(open.enemyId, '4') && (
                                <img
                                  src={getAbilityIcon(open.enemyId, '4')}
                                  alt=""
                                  className="w-6 h-6 shrink-0 rounded-md bg-surface-raised border border-bone/15 object-contain p-0.5"
                                  draggable={false}
                                />
                              )}
                              <span className="font-semibold text-ink-muted shrink-0">{t('enemies.ult')}</span>
                              <span className="truncate">{open.ult.name.split('(')[0].trim()}</span>
                            </div>
                          )}
                          {open.counters.length > 0 ? (
                            <ul className="space-y-1.5">
                              {open.counters.map(({ item, reason }) => {
                                const owned = effectiveOwned.has(item.id);
                                return (
                                  <li key={item.id} title={reason} className={`flex items-center gap-2 ${owned ? 'opacity-50' : ''}`}>
                                    <ItemArtworkIcon itemId={item.id} category={item.category} size={32} />
                                    <span className="min-w-0">
                                      <span className="block font-label text-body text-ink-strong truncate">
                                        {owned && '✓ '}
                                        {item.name.split('(')[0].trim()}
                                      </span>
                                      <span className="block text-small text-ink-muted truncate">{reason}</span>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="text-small text-ink-faint">{t('enemies.noCounters')}</p>
                          )}
                        </div>
                      </section>
                    );
                  })()}
                  </div>
                </div>

                {/* Planning, on demand: ability order, counter items, the build's phases, owned items */}
                <details className="group rounded-2xl bg-surface-panel border border-bone/10">
                  <summary className="px-3.5 py-2.5 cursor-pointer list-none flex items-center gap-2 font-display text-body tracking-display text-ink-soft hover:text-ink-strong rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="w-4 h-4 transition group-open:rotate-180" aria-hidden />
                    {t('more.title')}
                  </summary>
                  <div className="px-3.5 pb-3.5 space-y-3">
                {/* Compact Power Order Strip */}
                <div className="p-2.5 rounded-xl bg-surface-panel border border-bone/10 flex items-center justify-between gap-2 flex-wrap">
                  <SectionHeader
                    icon={<Zap className="w-3.5 h-3.5" />}
                    title={t('abilities.order')}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeBuild.abilitiesOrder.map((key, idx) => {
                      const ab = activeBuild.abilitiesDetails.find((a) => a.key === key);
                      const spellName = ab?.name.split('(')[0].trim() || key;
                      return (
                        <React.Fragment key={key}>
                          <div className="flex items-center gap-1.5 bg-shade/50 px-2 py-1 rounded-lg border border-bone/5">
                            <PowerIcon heroId={myHero.id} abilityKey={key} abilityName={ab?.name || key} size={30} />
                            <span className="font-label text-body text-ink-strong">{spellName}</span>
                          </div>
                          {idx < 3 && <span className="text-ink-faint font-bold text-body">→</span>}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Urgent Counter Items Against Selected Enemies (UNOWNED ONLY) */}
                {tacticalPlan.priorityItems.filter((rec) => !effectiveOwned.has(rec.item.id)).length > 0 && (
                  <div className="p-3 rounded-xl bg-surface-panel border border-bone/10 space-y-2">
                    <SectionHeader
                      icon={<Flame className="w-3.5 h-3.5" />}
                      title={
                        laneOver
                          ? t('counters.title', t('enemies.team', laneEnemyIds.length + teamEnemyIds.length), 0)
                          : t('counters.title', laneEnemyIds.map(heroName).join(' + '), teamEnemyIds.length)
                      }
                    />
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
                      { key: 'early', title: t('phases.early'), accent: 'text-ink-strong border-bone/10' },
                      { key: 'mid', title: t('phases.mid'), accent: 'text-ink-strong border-bone/10' },
                      { key: 'late', title: t('phases.late'), accent: 'text-ink-strong border-bone/10' },
                    ] as const
                  ).map((col) => {
                    const unownedPhaseIds = activeBuild.phases[col.key].filter((id) => !effectiveOwned.has(id));
                    return (
                      <div key={col.key} className={`p-3 rounded-xl bg-surface-panel border ${col.accent} space-y-2`}>
                        <h3 className="font-display text-body tracking-display">{col.title}</h3>
                        {unownedPhaseIds.length === 0 ? (
                          <div className="p-2.5 rounded-lg bg-bone/5 border border-bone/10 text-body text-ink-soft font-bold">
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
                  <Card tone="well" className="p-2.5 flex items-center gap-2 flex-wrap">
                    <span className="text-small font-bold uppercase tracking-caps text-ink-muted">{t('owned.title', ownedItems.length)}</span>
                    {ownedItems.map((id) => {
                      const it = ITEMS[id];
                      if (!it) return null;
                      return (
                        <button
                          key={id}
                          onClick={() => handleToggleOwnedItem(id)}
                          title={t('owned.removeTitle')}
                          className="group flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full bg-bone/5 hover:bg-bad-950/50 border border-bone/10 hover:border-bad-500/40 font-label text-small text-ink-soft transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
                        >
                          <ItemArtworkIcon itemId={it.id} category={it.category} size={18} />
                          <span>{it.name.split('(')[0].trim()}</span>
                          <X className="w-3 h-3 text-ink-faint group-hover:text-bad-300" />
                        </button>
                      );
                    })}
                  </Card>
                )}
                  </div>
                </details>
              </div>
            )}

            {/* ================= TAB 2: ABILITIES (1-4) ================= */}
            {activeTab === 'powers' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeBuild.abilitiesOrder.map((key, index) => {
                  const detail = activeBuild.abilitiesDetails.find((a) => a.key === key);
                  if (!detail) return null;
                  return (
                    <Card key={key} className="p-4 flex items-start gap-3">
                      <PowerIcon heroId={myHero.id} abilityKey={detail.key} abilityName={detail.name} size={52} />
                      <div className="space-y-1 flex-1">
                        <span className="font-display text-small tracking-display text-ink-muted">{t('powers.max', index + 1, detail.key)}</span>
                        <h3 className="font-label text-title text-ink-strong">{detail.name.split('(')[0].trim()}</h3>
                        <p className="text-body text-ink">{detail.priorityTip}</p>
                        {detail.description && <p className="text-small text-ink-muted">{detail.description}</p>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* ================= TAB 3: ITEM DETAILS ================= */}
            {activeTab === 'builds' && (
              <div className="space-y-4">
                <Card className="p-3">
                  <h3 className="font-display text-title tracking-display text-ink-strong">{activeBuild.name}</h3>
                  <p className="text-small text-ink-soft">{activeBuild.subtitle}</p>
                </Card>
                {(
                  [
                    { key: 'early', title: t('details.early') },
                    { key: 'mid', title: t('details.mid') },
                    { key: 'late', title: t('details.late') },
                    { key: 'situational', title: t('details.situational') },
                  ] as const
                ).map((phase) => (
                  <div key={phase.key} className="space-y-2">
                    <SectionHeader title={phase.title} />
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
                <Card className="p-3.5 space-y-1.5">
                  <SectionHeader title={tacticalPlan.laneStrategy.laneTitle} />
                  <p className="text-body text-ink">{tacticalPlan.laneStrategy.economyTip}</p>
                  {laneOutlookText && (
                    <p
                      className={`text-body font-semibold ${
                        outlook?.outlook === 'hard'
                          ? 'text-bad-300'
                          : outlook?.outlook === 'favourable'
                          ? 'text-good-300'
                          : 'text-ink-soft'
                      }`}
                    >
                      ⚔ {laneOutlookText}
                    </p>
                  )}
                  {tacticalPlan.laneStrategy.allySynergyTip && (
                    <p className="text-body text-ink pt-1">🤝 {tacticalPlan.laneStrategy.allySynergyTip}</p>
                  )}
                  {laneDuoText && <p className="text-small text-ink-muted">{laneDuoText}</p>}
                </Card>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tacticalPlan.matchupAlerts.map((alert) => (
                    <Card
                      key={alert.enemyId}
                      className={`p-3.5 space-y-1.5 ${
                        alert.isFed ? 'border-bad-400' : alert.isInMyLane ? 'border-bad-500/50' : 'border-bone/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-label text-title text-ink-strong">
                          {alert.isInMyLane ? t('matchups.lane') : t('matchups.team')} VS {alert.enemyName}
                        </span>
                        <Badge tone={DANGER_TONE[alert.dangerLevel]} solid={alert.dangerLevel === 'Extreme'} className="shrink-0">
                          {t(DANGER_KEYS[alert.dangerLevel])}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        {stanceLabel(alert) ? (
                          <span className={`px-2 py-0.5 rounded-md border text-small font-bold ${stanceStyle(alert)}`}>
                            {stanceLabel(alert)}
                          </span>
                        ) : (
                          <span />
                        )}
                        <Button size="sm" pressed={alert.isFed} pressedVariant="secondary" onClick={() => toggleFed(alert.enemyId)}>
                          {alert.isFed ? t('matchups.fedUnmark') : `🔥 ${t('matchups.fedMark')}`}
                        </Button>
                      </div>
                      {matchupStatText(alert) && <p className="text-small text-ink-muted">{matchupStatText(alert)}</p>}
                      {alert.isFed && <p className="text-body text-bad-200">{t('matchups.fedRule')}</p>}
                      <p className="text-body text-ink">{alert.keyRule}</p>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* ================= STREET BRAWL (src/streetBrawl) ================= */}
            {activeTab === 'streetBrawl' && (
              <StreetBrawlPanel
                heroId={myHeroId}
                heroName={myHero.name}
                lang={lang}
                sourceId={selectedSourceId}
                onHeroDetected={selectHeroFromStreetBrawl}
              />
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
            uiScale={uiScale}
            onUiScaleChange={setUiScale}
            onReport={() => {
              setIsSettingsOpen(false);
              setIsReportOpen(true);
            }}
          />
        )}
        {skipped && (
          <Toast
            message={t('buy.skipped', skipped.name)}
            actionLabel={t('buy.undo')}
            onAction={undoSkip}
            onDismiss={dismissSkipped}
            closeLabel={t('update.dismiss')}
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
