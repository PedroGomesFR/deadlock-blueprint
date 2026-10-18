import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  Eye,
  Flame,
  LayoutGrid,
  Layers,
  Lock,
  Package,
  Radio,
  RotateCcw,
  ShoppingCart,
  Swords,
  Terminal,
  Unlock,
  UserPlus,
  Zap,
} from 'lucide-react';
import {
  DEADLOCK_LANES,
  DeadlockItem,
  HEROES_DB,
  ITEMS_DB,
  LaneColor,
  LaneMode,
  generateTacticalPlan,
} from './data/deadlockData';
import {
  ABILITY_TEMPLATE_HERO_IDS,
  analyzeDeadlockScreen,
  VisionDetectionResult,
} from './services/visionScanner';
import { ItemAbsence, ItemConfirmation, StableValue } from './services/detectionStabilizer';
import { grabGameFrame, releaseGameFrame } from './services/screenCapture';
import { ElectronSourceInfo } from './electron';
import { ItemCard } from './components/ItemCard';
import { ScreenScannerModal } from './components/ScreenScannerModal';
import { HeroPortraitIcon, ItemArtworkIcon, PowerIcon } from './components/DeadlockIcons';

type MainTab = 'essential' | 'builds' | 'powers' | 'matchups' | 'logs';

interface LockedNextPurchase {
  key: string; // `${heroId}|${buildId}` — the lock is dropped when the hero or the build changes
  itemId: string;
}

interface QueueEntry {
  item: DeadlockItem;
  reason?: string;
  isCounter?: boolean;
}

export interface ScanLogEntry {
  id: number;
  time: string;
  sourceName: string;
  summary: string;
  details: string[];
  hasDetection: boolean;
}

function getShopLocationBadge(item: DeadlockItem): {
  tabLabel: string;
  tierLabel: string;
  badgeClass: string;
  dotColor: string;
} {
  const tierRoman = item.tier === 1 ? 'I' : item.tier === 2 ? 'II' : item.tier === 3 ? 'III' : 'IV';
  const tierLabel = `Palier ${tierRoman} (${item.cost.toLocaleString('fr-FR')} Âmes)`;

  if (item.category === 'weapon') {
    return {
      tabLabel: 'BOUTIQUE : ONGLET ARME (Orange)',
      tierLabel,
      badgeClass: 'bg-orange-500/20 border-orange-500/50 text-orange-200',
      dotColor: '#f97316',
    };
  }
  if (item.category === 'vitality') {
    return {
      tabLabel: 'BOUTIQUE : ONGLET VITALITÉ (Vert)',
      tierLabel,
      badgeClass: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200',
      dotColor: '#22c55e',
    };
  }
  return {
    tabLabel: 'BOUTIQUE : ONGLET ESPRIT (Violet)',
    tierLabel,
    badgeClass: 'bg-purple-500/20 border-purple-500/50 text-purple-200',
    dotColor: '#a855f7',
  };
}

// Items marked as owned by hand ("Passer" / click), shared with the overlay window: the scanner never
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

/** Data URL of a captured frame for the scanner window preview (only built while that window is open). */
function frameToPreviewUrl(image: ImageBitmap | string): string {
  if (typeof image === 'string') return image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// My hero is auto-detected once per match, then locked (persisted so a restart mid-match keeps it)
const HERO_LOCKED_KEY = 'dl_heroLocked';

/** Components consumed (recursively) when buying this item: Titanic Magazine -> Extended Magazine... */
function getComponentIds(itemId: string): Set<string> {
  const components = new Set<string>();
  const stack = [...(ITEMS_DB[itemId]?.upgradesFrom ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (components.has(id)) continue;
    components.add(id);
    stack.push(...(ITEMS_DB[id]?.upgradesFrom ?? []));
  }
  return components;
}

/**
 * An inventory that cannot be mine (spectated teammate while dead): in the same frame, at least 2 of my items
 * are gone and 2 unknown items appeared. Upgrades don't count (the new item replaces its component), nor do
 * items that unrecognized slots may be hiding (active item on cooldown).
 */
function isForeignInventory(ownedIds: string[], seenIds: string[], unmatchedSlots: number): boolean {
  const owned = new Set(ownedIds);
  const seen = new Set(seenIds);
  const appeared = seenIds.filter((id) => !owned.has(id));
  const replacedComponents = new Set<string>();
  const unexplainedNew = appeared.filter((id) => {
    const components = [...getComponentIds(id)].filter((c) => owned.has(c));
    components.forEach((c) => replacedComponents.add(c));
    return components.length === 0;
  });
  const missing = ownedIds.filter((id) => !seen.has(id) && !replacedComponents.has(id));
  return missing.length - unmatchedSlots >= 2 && unexplainedNew.length >= 2;
}

// Above any respawn timer: a "foreign" inventory still on screen after that really is mine (sold + bought)
const FOREIGN_INVENTORY_MAX_SCANS = 250; // ~90 s

const INVENTORY_SLOTS = 12;

interface InventoryStatus {
  itemIds: string[]; // items currently in the inventory (confirmed by the scanner)
  occupied: number;
  locked: number;
  unmatched: number;
}

type SlotPlan =
  | { kind: 'upgrade'; itemId: string } // takes the slot of this owned component
  | { kind: 'sell'; itemId: string } // inventory full: sell this owned item first
  | { kind: 'full' }; // inventory full, no recognized item to suggest

export function App() {
  const isDedicatedOverlayWindow = window.location.hash === '#overlay';

  // v6: generated high-rank meta builds are now Build #1 — drop the previously saved build choice
  if (!localStorage.getItem('dl_sync_v6')) {
    localStorage.setItem('dl_sync_v6', '1');
    localStorage.removeItem('dl_selectedBuildId');
    localStorage.removeItem('dl_lockedNext');
  }

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
  const [isScannerModalOpen, setIsScannerModalOpen] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(!isDedicatedOverlayWindow);
  const [lastCaptureUrl, setLastCaptureUrl] = useState<string | null>(null);
  const [lastDetection, setLastDetection] = useState<VisionDetectionResult | null>(null);
  const [sources, setSources] = useState<ElectronSourceInfo[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [scanLogs, setScanLogs] = useState<ScanLogEntry[]>([]);

  const myHero = useMemo(
    () => HEROES_DB.find((h) => h.id === myHeroId) || HEROES_DB[0],
    [myHeroId]
  );

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
        laneMode === 'duo' ? allyPartnerId : null
      ),
    [myHeroId, activeBuild.id, laneColor, laneMode, laneEnemyIds, teamEnemyIds, allyPartnerId]
  );

  /**
   * Smart Next-To-Buy Queue:
   * Automatically orders what the player should buy RIGHT NOW based on:
   * 1. Unowned Early Lane items (Tier 1, 800 Souls)
   * 2. Urgent Counter-Items against the detected lane opponents (Tier 1-2)
   * 3. Unowned Mid Game (Tier 2, 1600) and Late Game (Tier 3-4, 3200-6400) items
   * Every item already in `ownedItems` (auto-detected or manually checked) is automatically skipped!
   */
  const fullOrderedBuildQueue = useMemo(() => {
    const queue: QueueEntry[] = [];
    const seen = new Set<string>();

    const pushItem = (id: string, reason?: string, isCounter = false) => {
      if (seen.has(id)) return;
      const item = ITEMS_DB[id];
      if (!item) return;
      seen.add(id);
      queue.push({ item, reason, isCounter });
    };

    // 1. First two Tier-1 core lane items so the player has immediate early stats
    activeBuild.phases.early.slice(0, 2).forEach((id) => pushItem(id, 'Priorité Début de Lane'));

    // 2. Urgent Tier 1 / Tier 2 Counter-Item against lane opponents
    tacticalPlan.priorityItems
      .filter((r) => r.item.tier <= 2)
      .slice(0, 2)
      .forEach((r) => pushItem(r.item.id, r.reasons[0] || 'Contre Prioritaire Lane', true));

    // 3. Remaining Tier-1 early items
    activeBuild.phases.early.slice(2).forEach((id) => pushItem(id, 'Fin de phase Début de Lane'));

    // 4. First two Mid-Game core items (Tier 2)
    activeBuild.phases.mid.slice(0, 2).forEach((id) => pushItem(id, 'Pic de puissance Mid Game'));

    // 5. Higher-tier Counter-Items (Tier 3-4)
    tacticalPlan.priorityItems
      .filter((r) => r.item.tier >= 3)
      .slice(0, 2)
      .forEach((r) => pushItem(r.item.id, r.reasons[0] || 'Contre Teamfight', true));

    // 6. Remaining Mid & Late Game items
    activeBuild.phases.mid.slice(2).forEach((id) => pushItem(id, 'Core Mid Game'));
    activeBuild.phases.late.forEach((id) => pushItem(id, 'Core Fin de Partie'));

    return queue;
  }, [activeBuild, tacticalPlan.priorityItems]);

  // Owned items + the components they consumed (owning Titanic Magazine means Extended Magazine is done)
  const effectiveOwnedSet = useMemo(() => {
    const owned = new Set<string>(ownedItems);
    const stack = [...ownedItems];
    while (stack.length > 0) {
      for (const componentId of ITEMS_DB[stack.pop()!]?.upgradesFrom ?? []) {
        if (!owned.has(componentId)) {
          owned.add(componentId);
          stack.push(componentId);
        }
      }
    }
    return owned;
  }, [ownedItems]);

  const isInventoryFull =
    inventoryStatus !== null &&
    inventoryStatus.occupied > 0 &&
    inventoryStatus.occupied + inventoryStatus.locked >= INVENTORY_SLOTS;

  // Items of the inventory to sell when it is full, weakest first: outside the active build and the
  // counters, then lowest tier, then earliest build phase, then cheapest
  const sellCandidates = useMemo(() => {
    if (!inventoryStatus) return [];
    const { early, mid, late, situational } = activeBuild.phases;
    const counterIds = new Set(tacticalPlan.priorityItems.map((r) => r.item.id));
    const phaseRank = (id: string) =>
      late.includes(id) ? 3 : mid.includes(id) || situational.includes(id) ? 2 : early.includes(id) ? 1 : 0;
    const isWanted = (id: string) => phaseRank(id) > 0 || counterIds.has(id);
    return inventoryStatus.itemIds
      .filter((id) => ITEMS_DB[id])
      .sort(
        (a, b) =>
          Number(isWanted(a)) - Number(isWanted(b)) ||
          ITEMS_DB[a].tier - ITEMS_DB[b].tier ||
          phaseRank(a) - phaseRank(b) ||
          ITEMS_DB[a].cost - ITEMS_DB[b].cost
      );
  }, [inventoryStatus, activeBuild, tacticalPlan.priorityItems]);

  /** Owned component this item upgrades (buying it then takes that component's slot). */
  const getUpgradedComponent = useCallback(
    (itemId: string) => [...getComponentIds(itemId)].find((id) => ownedItems.includes(id)),
    [ownedItems]
  );

  const rawNextToBuyQueue = useMemo(() => {
    let unowned = fullOrderedBuildQueue.filter((entry) => !effectiveOwnedSet.has(entry.item.id));

    // Inventory full: an item needing a free slot must be worth at least the weakest item it replaces
    // (late game, never suggest selling a Tier 3 to buy a leftover Tier 1)
    if (isInventoryFull && sellCandidates.length > 0) {
      const weakestTier = ITEMS_DB[sellCandidates[0]].tier;
      unowned = unowned.filter(
        (entry) => getUpgradedComponent(entry.item.id) !== undefined || entry.item.tier >= weakestTier
      );
    }

    // Count how many Tier 1 (early lane) items the player already owns
    const ownedTier1Count = ownedItems.filter((id) => ITEMS_DB[id]?.tier === 1).length;

    // Once the player owns 4+ items total (or 3+ Tier-1 items), they have completed the Early Lane phase:
    // Automatically show "la suite" (Mid Game Tier 2 & Late Game Tier 3-4 items first!) instead of leftover starters
    if (ownedItems.length >= 4 || ownedTier1Count >= 3) {
      const midAndLate = unowned.filter((entry) => entry.item.tier >= 2);
      const leftoverEarly = unowned.filter((entry) => entry.item.tier === 1);
      return [...midAndLate, ...leftoverEarly];
    }

    return unowned;
  }, [fullOrderedBuildQueue, effectiveOwnedSet, ownedItems, isInventoryFull, sellCandidates, getUpgradedComponent]);

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

  const nextToBuyQueue = useMemo(() => {
    const lockedIdx = lockedItemId
      ? rawNextToBuyQueue.findIndex((entry) => entry.item.id === lockedItemId)
      : -1;
    if (lockedIdx <= 0) return rawNextToBuyQueue;
    return [
      rawNextToBuyQueue[lockedIdx],
      ...rawNextToBuyQueue.slice(0, lockedIdx),
      ...rawNextToBuyQueue.slice(lockedIdx + 1),
    ];
  }, [rawNextToBuyQueue, lockedItemId]);

  // What each displayed recommendation does to the inventory: an upgrade replaces its component; with a full
  // inventory, the other ones each need an owned item sold first (the weakest for #1, the next one for #2...)
  const slotPlans = useMemo(() => {
    const plans = new Map<string, SlotPlan>();
    const shown = nextToBuyQueue.slice(0, 6);
    const upgradedComponents = new Set<string>();
    for (const entry of shown) {
      const component = getUpgradedComponent(entry.item.id);
      if (component) {
        plans.set(entry.item.id, { kind: 'upgrade', itemId: component });
        upgradedComponents.add(component);
      }
    }
    if (isInventoryFull) {
      // Never sell a component that one of the shown upgrades is about to consume
      const toSell = sellCandidates.filter((id) => !upgradedComponents.has(id));
      let nextSell = 0;
      for (const entry of shown) {
        if (plans.has(entry.item.id)) continue;
        const sellId = toSell[nextSell++];
        plans.set(entry.item.id, sellId ? { kind: 'sell', itemId: sellId } : { kind: 'full' });
      }
    }
    return plans;
  }, [nextToBuyQueue, getUpgradedComponent, isInventoryFull, sellCandidates]);

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

  const manuallyExcludedRef = useRef<Set<string>>(new Set());
  const isScanningRef = useRef<boolean>(false);
  // Latest state for the scan loop (performScreenScan does not re-subscribe on every change)
  const ownedItemsRef = useRef(ownedItems);
  ownedItemsRef.current = ownedItems;
  const enemyLineupRef = useRef<string[]>([]);
  enemyLineupRef.current = [...laneEnemyIds, ...teamEnemyIds];

  // Anti-flicker: a detection is applied only once it has been seen several scans in a row (350 ms each)
  const heroStabilizerRef = useRef(new StableValue<string>(3, (id) => id));
  const enemyStabilizerRef = useRef(
    new StableValue<{ lane: string[]; team: string[] }>(4, (l) => `${l.lane.join(',')}|${l.team.join(',')}`)
  );
  const allyStabilizerRef = useRef(
    new StableValue<{ partnerId?: string; laneColor?: LaneColor }>(
      4,
      (a) => `${a.partnerId ?? ''}|${a.laneColor ?? ''}`
    )
  );
  const itemConfirmationRef = useRef(new ItemConfirmation(3));
  // ~2 s missing from a readable inventory before an item is dropped (sold, upgraded, previous match)
  const itemAbsenceRef = useRef(new ItemAbsence(6));
  const foreignInventoryStreakRef = useRef(0);
  const heroLockedRef = useRef(isHeroLocked);

  const lockHero = useCallback((locked: boolean) => {
    heroLockedRef.current = locked;
    setIsHeroLocked(locked);
    if (locked) localStorage.setItem(HERO_LOCKED_KEY, '1');
    else localStorage.removeItem(HERO_LOCKED_KEY);
  }, []);

  /** New match (or Reset): forget every owned item, scanned or marked by hand. */
  const clearOwnedItems = useCallback(() => {
    manuallyExcludedRef.current.clear();
    writeManualOwned(new Set());
    itemConfirmationRef.current.reset();
    itemAbsenceRef.current.reset();
    foreignInventoryStreakRef.current = 0;
    setOwnedItems([]);
    setInventoryStatus(null);
  }, []);

  const handleSelectLane = (color: LaneColor) => {
    setLaneColor(color);
    const laneObj = DEADLOCK_LANES.find((l) => l.id === color);
    if (laneObj) {
      setLaneMode(laneObj.defaultMode);
      if (laneObj.defaultMode === 'solo' && laneEnemyIds.length > 1) {
        const movedToTeam = laneEnemyIds.slice(1);
        setLaneEnemyIds([laneEnemyIds[0]]);
        setTeamEnemyIds((prev) => Array.from(new Set([...prev, ...movedToTeam])).slice(0, 5));
      }
    }
  };

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
    if (isScannerModalOpen) setIsScanning(true);
    try {
      if (window.electronAPI) {
        const frame = await grabGameFrame(selectedSourceId);
        if (frame) {
          if (isScannerModalOpen) {
            setLastCaptureUrl(frameToPreviewUrl(frame.image));
          }
          let detection: VisionDetectionResult;
          try {
            detection = await analyzeDeadlockScreen(
              frame.image,
              frame.sourceName,
              frame.isDeadlockWindow,
              myHeroId,
              buildItemIds,
              isScannerModalOpen
            );
          } finally {
            releaseGameFrame(frame);
          }
          if (isScannerModalOpen) {
            setLastDetection(detection);
          }

          let hasStateChange = false;
          const updatedParts: string[] = [];

          // My hero: auto-detected once per match, then locked. While dead (death cam, spectating a teammate)
          // the screen shows other heroes; once locked, the hero only changes at the next match (new enemy
          // lineup) or when picked by hand.
          let activeHeroId = myHeroId;
          const heroEvidence = detection.highlightedHeroId ?? detection.abilityHeroId;
          const stableHeroId = heroEvidence ? heroStabilizerRef.current.push(heroEvidence) : undefined;
          if (stableHeroId && !heroLockedRef.current) {
            // Only the highlighted portrait is trusted enough to lock (cooldown numbers fool the abilities)
            if (stableHeroId === detection.highlightedHeroId) lockHero(true);
            if (stableHeroId !== myHeroId) {
              // Another hero = another match: the previous match's items no longer apply
              activeHeroId = stableHeroId;
              setMyHeroId(stableHeroId);
              enemyStabilizerRef.current.reset();
              allyStabilizerRef.current.reset();
              clearOwnedItems();
              hasStateChange = true;
              const h = HEROES_DB.find((x) => x.id === stableHeroId);
              if (h) updatedParts.push(`Moi: ${h.name}`);
            }
          }

          // Another hero on screen than my locked one (dead / spectating): the highlighted portrait, or the
          // abilities when the portrait is not readable - only if my hero's abilities can be recognized at all
          // (otherwise any hero they happen to resemble would freeze my inventory while I am alive).
          // Inventory, souls and lane are then left untouched.
          const heroOnScreen =
            detection.highlightedHeroId ??
            (ABILITY_TEMPLATE_HERO_IDS.has(activeHeroId) ? detection.abilityHeroId : undefined);
          const isWatchingOtherHero =
            heroLockedRef.current && heroOnScreen !== undefined && heroOnScreen !== activeHeroId;

          const detectedPartnerId = detection.detectedPartnerId ?? detection.detectedAllyIds[0];
          if (!isWatchingOtherHero && (detectedPartnerId || detection.detectedLaneColor)) {
            const stableAlly = allyStabilizerRef.current.push({
              partnerId: detectedPartnerId,
              laneColor: detection.detectedLaneColor,
            });
            if (stableAlly?.laneColor) {
              setLaneColor((prev) => (prev !== stableAlly.laneColor ? stableAlly.laneColor! : prev));
            }
            if (stableAlly?.partnerId) {
              setLaneMode((prev) => (prev !== 'duo' ? 'duo' : prev));
              setAllyPartnerId((prev) => {
                if (prev !== stableAlly.partnerId) {
                  hasStateChange = true;
                  return stableAlly.partnerId!;
                }
                return prev;
              });
            }
          }

          if (detection.detectedEnemyIds.length > 0) {
            // Sorted so that a mere change of order is not a change of lineup
            const lineup =
              detection.detectedLaneEnemyIds.length > 0
                ? { lane: detection.detectedLaneEnemyIds, team: detection.detectedTeamEnemyIds }
                : {
                    lane: detection.detectedEnemyIds.slice(0, 2),
                    team: detection.detectedEnemyIds.slice(2, 6),
                  };
            const stableEnemies = enemyStabilizerRef.current.push({
              lane: [...lineup.lane].sort(),
              team: [...lineup.team].sort(),
            });
            if (stableEnemies) {
              // Mostly different enemies (same hero picked again) = new match: drop last match's items
              const previousLineup = new Set(enemyLineupRef.current);
              const lineup = [...stableEnemies.lane, ...stableEnemies.team];
              const common = lineup.filter((id) => previousLineup.has(id)).length;
              if (previousLineup.size > 0 && lineup.length >= 4 && common * 2 < lineup.length) {
                clearOwnedItems();
                lockHero(false); // my hero is re-detected (and re-locked) for this new match
                heroStabilizerRef.current.reset();
                hasStateChange = true;
                updatedParts.push('Nouvelle partie');
              }
              enemyLineupRef.current = lineup;
              setLaneEnemyIds((prev) =>
                prev.join(',') !== stableEnemies.lane.join(',') ? stableEnemies.lane : prev
              );
              setTeamEnemyIds((prev) =>
                prev.join(',') !== stableEnemies.team.join(',') ? stableEnemies.team : prev
              );
            }
          }

          if (!isWatchingOtherHero && detection.detectedSouls !== undefined) {
            setCurrentSouls((prev) =>
              prev !== detection.detectedSouls ? detection.detectedSouls! : prev
            );
          }

          // Inventory Sync: the owned list mirrors the inventory on screen.
          // - an item seen 3 consecutive scans (~1 s) is added;
          // - an item missing for ~2 s is removed, but only from a readable inventory: the game window or HUD
          //   must be visible with at least one occupied slot (hidden HUD, menus, Alt-Tab and black frames all
          //   read as an empty inventory). Items marked by hand are never removed by the scanner.
          // - frames showing someone else's inventory (another hero on screen, or an inventory that cannot be
          //   mine) are ignored altogether.
          const canReadInventory =
            detection.occupiedSlotsCount > 0 &&
            (detection.isDeadlockWindow || Boolean(detection.hudVisible));
          const manualOwned = readManualOwned();
          const scannedOwned = ownedItemsRef.current.filter((id) => !manualOwned.has(id));
          const looksForeign =
            canReadInventory &&
            isForeignInventory(
              scannedOwned,
              detection.detectedOwnedItemIds,
              detection.unmatchedSlotsCount ?? 0
            );
          foreignInventoryStreakRef.current = looksForeign ? foreignInventoryStreakRef.current + 1 : 0;
          const ignoreInventory =
            isWatchingOtherHero ||
            (looksForeign && foreignInventoryStreakRef.current < FOREIGN_INVENTORY_MAX_SCANS);

          const confirmedItemIds = ignoreInventory
            ? []
            : itemConfirmationRef.current.push(detection.detectedOwnedItemIds);
          const goneItemIds =
            canReadInventory && !ignoreInventory
              ? itemAbsenceRef.current.push(
                  scannedOwned,
                  detection.detectedOwnedItemIds,
                  detection.unmatchedSlotsCount ?? 0
                )
              : [];

          if (canReadInventory && !ignoreInventory) {
            const status: InventoryStatus = {
              itemIds: [...confirmedItemIds].sort(),
              occupied: detection.occupiedSlotsCount,
              locked: detection.lockedSlotsCount ?? 0,
              unmatched: detection.unmatchedSlotsCount ?? 0,
            };
            setInventoryStatus((prev) =>
              prev && JSON.stringify(prev) === JSON.stringify(status) ? prev : status
            );
          }

          if (confirmedItemIds.length > 0 || goneItemIds.length > 0) {
            setOwnedItems((prev) => {
              const gone = new Set(goneItemIds);
              const filteredNew = confirmedItemIds.filter(
                (id) => !manuallyExcludedRef.current.has(id)
              );
              const merged = Array.from(
                new Set([...prev.filter((id) => !gone.has(id)), ...filteredNew])
              );
              if (merged.length === prev.length && merged.every((id, i) => id === prev[i])) {
                return prev;
              }
              hasStateChange = true;
              updatedParts.push(`Items: ${merged.length}`);
              localStorage.setItem('dl_ownedItems', JSON.stringify(merged));
              return merged;
            });
          }

          if (hasStateChange || isScannerModalOpen) {
            const hasAnyDetection =
              Boolean(detection.detectedHeroId) ||
              detection.detectedEnemyIds.length > 0 ||
              detection.detectedOwnedItemIds.length > 0;

            setScanLogs((prev) => [
              {
                id: Date.now(),
                time: detection.timestamp,
                sourceName: detection.sourceName,
                summary:
                  updatedParts.length > 0
                    ? `Mise à jour instantanée : ${updatedParts.join(' • ')}`
                    : `Scan terminé`,
                details: detection.debugLogs,
                hasDetection: hasAnyDetection,
              },
              ...prev.slice(0, 29),
            ]);
          }
        }
      }
    } finally {
      isScanningRef.current = false;
      if (isScannerModalOpen) setIsScanning(false);
    }
  }, [selectedSourceId, myHeroId, buildItemIds, isScannerModalOpen, clearOwnedItems, lockHero]);

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

  const handleToggleOverlay = async () => {
    if (window.electronAPI) {
      const next = await window.electronAPI.setOverlayMode(!isOverlayMode);
      setIsOverlayMode(next.isOverlayMode);
      setIsClickThrough(next.isClickThrough);
    }
  };

  const handleToggleClickThrough = async () => {
    if (window.electronAPI) {
      const next = await window.electronAPI.setClickThrough(!isClickThrough);
      setIsOverlayMode(next.isOverlayMode);
      setIsClickThrough(next.isClickThrough);
    }
  };

  const applyPresetSimulation = (heroId: string, lane: LaneColor, enemies: string[]) => {
    setMyHeroId(heroId);
    setLaneColor(lane);
    setLaneMode(enemies.length > 1 ? 'duo' : 'solo');
    setLaneEnemyIds(enemies);
  };

  /** "⬆ Remplace X" (upgrade) or "⇄ Vendre X" (inventory full) under a recommendation. */
  const renderSlotPlan = (itemId: string, compact = false) => {
    const plan = slotPlans.get(itemId);
    if (!plan) return null;
    const sizeClass = compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[11px]';
    if (plan.kind === 'full') {
      return (
        <div className={`rounded-lg border font-bold bg-red-500/15 border-red-400/50 text-red-200 ${sizeClass}`}>
          ⇄ Inventaire plein : vends un objet avant d'acheter
        </div>
      );
    }
    const other = ITEMS_DB[plan.itemId];
    if (!other) return null;
    const isUpgrade = plan.kind === 'upgrade';
    return (
      <div
        className={`flex items-center gap-1.5 rounded-lg border font-bold ${sizeClass} ${
          isUpgrade
            ? 'bg-sky-500/15 border-sky-400/40 text-sky-200'
            : 'bg-red-500/15 border-red-400/50 text-red-200'
        }`}
        title={
          isUpgrade
            ? "Amélioration : l'objet prend la place de son composant, pas besoin de slot libre"
            : "Inventaire plein : vends cet objet (le moins utile pour ton build) pour libérer un slot"
        }
      >
        <span className="shrink-0">{isUpgrade ? '⬆ Remplace' : '⇄ Vendre'}</span>
        <ItemArtworkIcon itemId={other.id} category={other.category} size={compact ? 16 : 20} />
        <span className="truncate">{other.name.split('(')[0].trim()}</span>
      </div>
    );
  };

  const inventoryLabel = inventoryStatus
    ? `inventaire ${inventoryStatus.occupied}/${INVENTORY_SLOTS - inventoryStatus.locked}${
        isInventoryFull ? ' — PLEIN' : ''
      }`
    : `${ownedItems.length} objets possédés`;

  const totalSelectedEnemies = laneEnemyIds.length + teamEnemyIds.length;
  const allyHeroObj = allyPartnerId ? HEROES_DB.find((h) => h.id === allyPartnerId) : null;
  const currentLaneObj = DEADLOCK_LANES.find((l) => l.id === laneColor) || DEADLOCK_LANES[0];

  // ================= DEDICATED TRANSPARENT IN-GAME OVERLAY HUD WINDOW =================
  if (isDedicatedOverlayWindow) {
    return (
      <div className="h-screen w-screen p-2 flex flex-col select-none bg-transparent overflow-hidden">
        <div className="flex-1 flex flex-col rounded-2xl bg-[#0c0b0e]/85 backdrop-blur-xl border border-amber-500/45 shadow-2xl overflow-hidden">
          <div className="drag-region px-3 py-2 bg-gradient-to-r from-amber-950/80 via-[#15131c] to-[#15131c] border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <HeroPortraitIcon heroId={myHero.id} color={myHero.accentColor} size={28} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-xs font-extrabold text-amber-300 truncate">
                    {myHero.name.toUpperCase()}
                  </span>
                  {currentSouls !== null && (
                    <span className="text-[10px] font-bold text-teal-300 bg-teal-950/70 px-1.5 py-0.2 rounded border border-teal-500/40">
                      {currentSouls.toLocaleString('fr-FR')} Âmes
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-slate-400 block leading-none">
                  VS{' '}
                  {laneEnemyIds
                    .map((id) => HEROES_DB.find((h) => h.id === id)?.name)
                    .join(' + ') || 'Lane'}
                </span>
              </div>
            </div>

            <div className="no-drag flex items-center gap-1 shrink-0">
              <button
                onClick={handleToggleClickThrough}
                title="Verrouiller/Déverrouiller la souris (Alt+L)"
                className={`px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 transition ${
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
                title="Masquer l'Overlay (Alt+O)"
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-red-500/30 text-[10px] font-bold text-slate-200"
              >
                ✕
              </button>
            </div>
          </div>

          {isClickThrough && (
            <div className="bg-red-950/90 border-b border-red-500/40 px-3 py-1 text-[10px] text-center text-red-200 font-semibold">
              🔒 Mode Fantôme actif — <kbd className="px-1 bg-black/50 rounded">Alt+L</kbd>
            </div>
          )}

          <div className="no-drag px-2.5 py-2 bg-black/50 border-b border-white/10 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-purple-300">Sorts :</span>
            <div className="flex items-center gap-1">
              {activeBuild.abilitiesOrder.map((key, idx) => {
                const ab = activeBuild.abilitiesDetails.find((a) => a.key === key);
                return (
                  <React.Fragment key={key}>
                    <PowerIcon
                      heroId={myHero.id}
                      abilityKey={key}
                      abilityName={ab?.name || key}
                      size={32}
                    />
                    {idx < 3 && <span className="text-slate-500 text-xs font-bold">›</span>}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="no-drag flex-1 overflow-y-auto p-2.5 space-y-2.5">
            <div className="space-y-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                <ShoppingCart className="w-3 h-3 text-emerald-400" /> À Acheter Tout de Suite
              </span>
              {nextToBuyQueue.slice(0, 3).map((entry, idx) => {
                const loc = getShopLocationBadge(entry.item);
                const canAfford = currentSouls !== null && currentSouls >= entry.item.cost;
                return (
                  <div
                    key={entry.item.id}
                    onClick={() => handleToggleOwnedItem(entry.item.id)}
                    className={`p-2 rounded-xl border cursor-pointer transition flex items-center justify-between gap-2 ${
                      canAfford
                        ? 'bg-emerald-950/50 border-emerald-400 shadow-lg'
                        : 'bg-[#171520] border-white/15 hover:border-amber-400/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-black font-extrabold text-[10px] flex items-center justify-center shrink-0">
                        #{idx + 1}
                      </span>
                      <ItemArtworkIcon
                        itemId={entry.item.id}
                        category={entry.item.category}
                        size={34}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-white truncate">
                          {entry.item.name.split('(')[0].trim()}
                        </div>
                        <div className="text-[9px] font-bold flex items-center gap-1">
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{ backgroundColor: loc.dotColor }}
                          />
                          <span className="text-slate-300">{loc.tabLabel.replace('BOUTIQUE : ', '')}</span>
                        </div>
                        {renderSlotPlan(entry.item.id, true)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-extrabold text-teal-300 block">
                        {entry.item.cost}
                      </span>
                      {canAfford && (
                        <span className="text-[9px] font-extrabold text-emerald-300">
                          ACHETER !
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-deadlock-bg text-slate-100 overflow-hidden">
      {/* 1. COMPACT TOP BAR (Hero + Partner + Lane + Enemies + Silent Controls) */}
      <div className="px-3 py-2 bg-[#14121b] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0 relative z-30">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setOpenPopover(openPopover === 'myHero' ? null : 'myHero')}
            className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-black/60 hover:bg-black/80 border border-amber-500/40 transition"
          >
            <HeroPortraitIcon heroId={myHero.id} color={myHero.accentColor} size={32} />
            <span className="font-display text-xs sm:text-sm font-extrabold text-white">
              {myHero.name}
            </span>
            {isHeroLocked && (
              <span title="Héros verrouillé pour cette partie : il ne change plus (même mort). Re-détecté à la partie suivante.">
                <Lock className="w-3 h-3 text-amber-400" />
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
          </button>

          {laneMode === 'duo' && (
            <button
              onClick={() => setOpenPopover(openPopover === 'ally' ? null : 'ally')}
              className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-emerald-950/30 hover:bg-emerald-950/50 border border-emerald-500/40 transition text-xs font-bold text-emerald-200"
              title="Allié sur ma lane"
            >
              {allyHeroObj ? (
                <HeroPortraitIcon
                  heroId={allyHeroObj.id}
                  color={allyHeroObj.accentColor}
                  size={28}
                />
              ) : (
                <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{allyHeroObj ? allyHeroObj.name : '+ Allié'}</span>
            </button>
          )}

          {myHero.builds.length > 1 && (
            <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/10">
              {myHero.builds.map((b, idx) => (
                <button
                  key={b.id}
                  title={`${b.name}\n${b.subtitle}`}
                  onClick={() => setSelectedBuildId(b.id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold transition ${
                    activeBuild.id === b.id
                      ? 'bg-amber-500 text-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Build #{idx + 1}
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
                  const eh = HEROES_DB.find((h) => h.id === eid);
                  return eh ? (
                    <HeroPortraitIcon key={eid} heroId={eh.id} color={eh.accentColor} size={28} />
                  ) : null;
                })
              ) : (
                <Swords className="w-4 h-4 text-red-400" />
              )}
            </div>
            <span className="text-xs font-bold text-white">
              VS Lane ({laneEnemyIds.length}) {teamEnemyIds.length > 0 && `+${teamEnemyIds.length} Team`}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-red-300" />
          </button>

          {/* Silent Auto-Scan Toggle (No blinking/spinning animations!) */}
          <button
            onClick={() => setAutoScanEnabled((v) => !v)}
            title="Activer/Désactiver la détection automatique silencieuse"
            className={`px-2 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 transition ${
              autoScanEnabled
                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                : 'bg-white/5 border-white/10 text-slate-400'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Auto</span>
          </button>

          <button
            onClick={() => performScreenScan()}
            title="Scanner maintenant (Alt+S)"
            className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] flex items-center gap-1 transition"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Scan</span>
          </button>

          <button
            onClick={handleToggleOverlay}
            title="Afficher/Masquer le HUD Overlay transparent sur l'écran de jeu (Alt+O)"
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 transition ${
              isOverlayMode
                ? 'bg-purple-500 text-white border-purple-300 shadow-glow-spirit'
                : 'bg-purple-600/20 hover:bg-purple-600/35 border-purple-400/50 text-purple-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Overlay</span>
          </button>
        </div>

        {/* POPOVER MODALS */}
        {openPopover === 'myHero' && (
          <div className="fixed inset-x-4 top-16 max-w-md mx-auto p-3.5 rounded-2xl bg-[#181520] border border-amber-500/60 shadow-2xl z-50 space-y-2">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="text-xs font-bold uppercase text-amber-300">Choisir Mon Héros</span>
              <button onClick={() => setOpenPopover(null)} className="text-xs text-slate-400">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto">
              {HEROES_DB.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    setMyHeroId(h.id);
                    lockHero(true); // picked by hand: the scanner no longer changes it this match
                    heroStabilizerRef.current.reset();
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
                  <span className="text-xs truncate">{h.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {openPopover === 'ally' && (
          <div className="fixed inset-x-4 top-16 max-w-md mx-auto p-3.5 rounded-2xl bg-[#181520] border border-emerald-500/60 shadow-2xl z-50 space-y-2">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="text-xs font-bold uppercase text-emerald-300">Allié en Lane</span>
              <button onClick={() => setOpenPopover(null)} className="text-xs text-slate-400">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto">
              {HEROES_DB.filter((h) => h.id !== myHeroId).map((h) => (
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
                  <span className="text-xs truncate">{h.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {openPopover === 'enemies' && (
          <div className="fixed inset-x-4 top-16 max-w-md mx-auto p-3.5 rounded-2xl bg-[#181520] border border-red-500/60 shadow-2xl space-y-2.5 z-50">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="text-xs font-bold uppercase text-red-300">
                Ennemis ({totalSelectedEnemies}/6)
              </span>
              <div className="flex items-center gap-3">
                {totalSelectedEnemies > 0 && (
                  <button
                    onClick={() => {
                      setLaneEnemyIds([]);
                      setTeamEnemyIds([]);
                    }}
                    className="text-[11px] text-red-400 hover:underline"
                  >
                    Tout vider
                  </button>
                )}
                <button onClick={() => setOpenPopover(null)} className="text-xs text-slate-400">
                  ✕
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-black/50 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setEnemyPopoverMode('lane')}
                className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold ${
                  enemyPopoverMode === 'lane' ? 'bg-red-500 text-white' : 'text-slate-400'
                }`}
              >
                🎯 Ma Lane ({laneEnemyIds.length}/{laneMode === 'solo' ? 1 : 2})
              </button>
              <button
                onClick={() => setEnemyPopoverMode('team')}
                className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold ${
                  enemyPopoverMode === 'team' ? 'bg-orange-500 text-black' : 'text-slate-400'
                }`}
              >
                🌐 Autres Lanes ({teamEnemyIds.length}/{6 - laneEnemyIds.length})
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto">
              {HEROES_DB.filter((h) => h.id !== myHeroId && h.id !== allyPartnerId).map((eh) => {
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
                      <span className="text-xs block truncate">{eh.name}</span>
                      {isInLane && <span className="text-[9px] text-red-300 block">Lane</span>}
                      {isInTeam && <span className="text-[9px] text-orange-300 block">Team</span>}
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
              { id: 'essential', label: 'Build Actif', icon: LayoutGrid },
              { id: 'powers', label: 'Sorts (1-4)', icon: Zap },
              { id: 'builds', label: 'Détails Objets', icon: Package },
              { id: 'matchups', label: `Conseils (${totalSelectedEnemies})`, icon: Swords },
              { id: 'logs', label: 'Diagnostic', icon: Terminal },
            ] as const
          ).map((tab) => {
            const TabIcon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
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
            <span className="px-2 py-0.5 rounded-lg bg-teal-950/60 border border-teal-500/40 text-[11px] text-teal-300 font-extrabold">
              💰 {currentSouls.toLocaleString('fr-FR')} Âmes en poche
            </span>
          )}
          {ownedItems.length > 0 && (
            <button
              onClick={clearOwnedItems}
              className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
              title="Réinitialiser les objets achetés"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset ({ownedItems.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. MAIN VIEW */}
      <main
        onClick={() => {
          if (openPopover) setOpenPopover(null);
        }}
        className="flex-1 overflow-y-auto p-3 space-y-3 bg-deadlock-bg"
      >
        <div className="max-w-5xl mx-auto space-y-3">
          {/* ================= TAB 1: BUILD ACTIF ================= */}
          {activeTab === 'essential' && (
            <div className="space-y-3">
              {/* ★ PRIORITY #1: À ACHETER TOUT DE SUITE (NEXT ITEMS + WHERE TO FIND IN SHOP + AFFORDABILITY) ★ */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-[#15131d] to-[#15131d] border-2 border-emerald-500/60 shadow-xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-xl bg-emerald-500 text-black">
                      <ShoppingCart className="w-4 h-4" />
                    </span>
                    <div>
                      <h2 className="font-display text-sm font-extrabold uppercase tracking-wider text-emerald-300">
                        À Acheter Tout de Suite — Prochains Objets ({inventoryLabel})
                      </h2>
                      <p className="text-[11px] text-slate-300">
                        Seuls vos <strong>prochains achats</strong> s'affichent ici (les objets déjà achetés passent automatiquement à la suite). Le #1 reste fixe jusqu'à son achat. Cliquez sur un objet si vous voulez le passer manuellement.
                      </p>
                      {inventoryStatus && inventoryStatus.unmatched > 0 && (
                        <p className="text-[11px] text-orange-300 font-semibold">
                          ⚠ {inventoryStatus.unmatched} objet(s) de ton inventaire non reconnu(s) : si un objet
                          proposé est déjà acheté, clique dessus pour le passer.
                        </p>
                      )}
                      <p className="text-[11px] text-amber-300 font-semibold">
                        {activeBuild.name} — <span className="text-slate-400 font-normal">{activeBuild.subtitle}</span>
                      </p>
                    </div>
                  </div>

                  {currentSouls !== null && (
                    <div className="px-3 py-1 rounded-xl bg-teal-950/80 border border-teal-400/50 text-xs font-extrabold text-teal-200">
                      Âmes détectées : {currentSouls.toLocaleString('fr-FR')}
                    </div>
                  )}
                </div>

                {/* Top 6 Immediate Next Buys */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {nextToBuyQueue.slice(0, 6).map((entry, idx) => {
                    const { item, reason, isCounter } = entry;
                    const loc = getShopLocationBadge(item);
                    const canAfford = currentSouls !== null && currentSouls >= item.cost;
                    const missingSouls =
                      currentSouls !== null && currentSouls < item.cost
                        ? item.cost - currentSouls
                        : null;
                    const frName = item.name.split('(')[0].trim();

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
                              className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                                idx === 0
                                  ? 'bg-amber-400 text-black'
                                  : 'bg-white/15 text-slate-200'
                              }`}
                            >
                              {idx === 0 ? (
                                <span className="flex items-center gap-1">
                                  ★ PROCHAIN ACHAT #1 <Lock className="w-2.5 h-2.5" />
                                </span>
                              ) : (
                                `Suite #${idx + 1}`
                              )}
                            </span>

                            {canAfford ? (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-black font-extrabold text-[10px] uppercase">
                                ✅ ACHETABLE !
                              </span>
                            ) : missingSouls !== null ? (
                              <span className="px-2 py-0.5 rounded-md bg-black/60 border border-white/10 text-amber-300 font-bold text-[10px]">
                                Manque {missingSouls} Âmes
                              </span>
                            ) : (
                              <span className="text-xs font-extrabold text-teal-300">
                                {item.cost} Âmes
                              </span>
                            )}
                          </div>

                          {/* Item Icon + French Name */}
                          <div className="flex items-center gap-2.5">
                            <ItemArtworkIcon
                              itemId={item.id}
                              category={item.category}
                              size={46}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-sm text-white leading-tight">
                                {frName}
                              </div>
                              <div className="text-[11px] font-extrabold text-teal-300 mt-0.5">
                                {item.cost.toLocaleString('fr-FR')} Âmes
                              </div>
                            </div>
                          </div>

                          {/* Exact Shop Location Badge ("Où le trouver dans la boutique") */}
                          <div
                            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex flex-col gap-0.5 ${loc.badgeClass}`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: loc.dotColor }}
                              />
                              <span className="uppercase tracking-wide">{loc.tabLabel}</span>
                            </div>
                            <span className="text-[10px] opacity-90 pl-4">{loc.tierLabel}</span>
                          </div>

                          {renderSlotPlan(item.id)}
                        </div>

                        {/* Reason + Click to Skip / Advance */}
                        <div className="pt-1 border-t border-white/10 flex items-center justify-between text-[11px]">
                          <span
                            className={`truncate font-semibold ${
                              isCounter ? 'text-orange-300' : 'text-slate-300'
                            }`}
                          >
                            {reason}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-white/10 hover:bg-emerald-500/30 text-slate-200 font-bold flex items-center gap-1 shrink-0">
                            Passer →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Compact Power Order Strip */}
              <div className="p-2.5 rounded-xl bg-deadlock-panel border border-purple-500/30 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase text-purple-300 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-purple-400" /> Ordre Sorts :
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {activeBuild.abilitiesOrder.map((key, idx) => {
                    const ab = activeBuild.abilitiesDetails.find((a) => a.key === key);
                    const frSpellName = ab?.name.split('(')[0].trim() || key;
                    return (
                      <React.Fragment key={key}>
                        <div className="flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded-lg border border-white/5">
                          <PowerIcon
                            heroId={myHero.id}
                            abilityKey={key}
                            abilityName={ab?.name || key}
                            size={30}
                          />
                          <span className="text-xs font-bold text-white">{frSpellName}</span>
                        </div>
                        {idx < 3 && <span className="text-slate-500 font-bold text-xs">→</span>}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Urgent Counter Items Against Selected Enemies (UNOWNED ONLY) */}
              {tacticalPlan.priorityItems.filter((rec) => !ownedItems.includes(rec.item.id)).length > 0 && (
                <div className="p-3 rounded-xl bg-gradient-to-r from-orange-950/30 to-deadlock-panel border border-orange-500/40 space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-orange-300 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-orange-400" /> Prochains Contres VS{' '}
                    {laneEnemyIds
                      .map((id) => HEROES_DB.find((h) => h.id === id)?.name)
                      .join(' + ')}
                    {teamEnemyIds.length > 0 && ` (+${teamEnemyIds.length} Team)`}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {tacticalPlan.priorityItems
                      .filter((rec) => !ownedItems.includes(rec.item.id))
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
                    {
                      key: 'early',
                      title: '1. Début de Lane — Restant à acheter',
                      accent: 'text-amber-300 border-amber-500/30',
                    },
                    {
                      key: 'mid',
                      title: '2. Milieu de Partie (1 600) — Suite',
                      accent: 'text-purple-300 border-purple-500/30',
                    },
                    {
                      key: 'late',
                      title: '3. Fin de Partie (3 200-6 400) — Suite',
                      accent: 'text-teal-300 border-teal-500/30',
                    },
                  ] as const
                ).map((col) => {
                  const unownedPhaseIds = activeBuild.phases[col.key].filter(
                    (id) => !ownedItems.includes(id)
                  );
                  return (
                    <div
                      key={col.key}
                      className={`p-3 rounded-xl bg-deadlock-panel border ${col.accent} space-y-2`}
                    >
                      <h3 className="font-display text-xs font-extrabold uppercase tracking-wider">
                        {col.title}
                      </h3>
                      {unownedPhaseIds.length === 0 ? (
                        <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300 font-bold">
                          ✅ Phase complétée — passez à la colonne suivante !
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
                          {unownedPhaseIds.map((itemId) => {
                            const item = ITEMS_DB[itemId];
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
                  <span className="text-[11px] font-bold uppercase text-slate-400">
                    🎒 Objets possédés ({ownedItems.length}, ignorés des recommandations) :
                  </span>
                  {ownedItems.map((id) => {
                    const it = ITEMS_DB[id];
                    if (!it) return null;
                    return (
                      <button
                        key={id}
                        onClick={() => handleToggleOwnedItem(id)}
                        title="Cliquer pour remettre cet objet dans les recommandations"
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/5 hover:bg-red-950/50 border border-white/10 text-[11px] font-semibold text-slate-300 transition"
                      >
                        <ItemArtworkIcon itemId={it.id} category={it.category} size={18} />
                        <span>{it.name.split('(')[0].trim()}</span>
                        <span className="text-[10px] text-slate-500">✕</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 2: SORTS DÉTAILLÉS (1-4) ================= */}
          {activeTab === 'powers' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeBuild.abilitiesOrder.map((key, index) => {
                const detail = activeBuild.abilitiesDetails.find((a) => a.key === key);
                if (!detail) return null;
                return (
                  <div
                    key={key}
                    className="p-4 rounded-xl bg-deadlock-panel border border-purple-500/30 flex items-start gap-3"
                  >
                    <PowerIcon
                      heroId={myHero.id}
                      abilityKey={detail.key}
                      abilityName={detail.name}
                      size={52}
                    />
                    <div className="space-y-1 flex-1">
                      <span className="text-[10px] font-bold uppercase text-purple-300">
                        Max #{index + 1} • Touche [{detail.key}]
                      </span>
                      <h3 className="font-bold text-sm text-white">
                        {detail.name.split('(')[0].trim()}
                      </h3>
                      <p className="text-xs text-amber-200/90">{detail.priorityTip}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ================= TAB 3: DÉTAILS DE TOUS LES OBJETS ================= */}
          {activeTab === 'builds' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-deadlock-panel border border-amber-500/30">
                <h3 className="text-sm font-extrabold text-amber-300">{activeBuild.name}</h3>
                <p className="text-[11px] text-slate-300">{activeBuild.subtitle}</p>
              </div>
              {(
                [
                  { key: 'early', title: 'Début de Lane (800 Âmes)' },
                  { key: 'mid', title: 'Milieu de Partie (1 600 Âmes)' },
                  { key: 'late', title: 'Fin de Partie (3 200 - 6 400 Âmes)' },
                  { key: 'situational', title: 'Objets Situationnels' },
                ] as const
              ).map((phase) => (
                <div key={phase.key} className="space-y-2">
                  <h3 className="text-xs font-bold uppercase text-amber-300">{phase.title}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {activeBuild.phases[phase.key].map((itemId) => {
                      const item = ITEMS_DB[itemId];
                      return item ? (
                        <ItemCard
                          key={itemId}
                          item={item}
                          isOwned={ownedItems.includes(itemId)}
                          onToggleOwned={handleToggleOwnedItem}
                        />
                      ) : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ================= TAB 4: CONSEILS DE LANE & MATCHUPS ================= */}
          {activeTab === 'matchups' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-deadlock-panel border border-amber-500/30 space-y-1.5">
                <h3 className="text-xs font-bold uppercase text-amber-300">
                  {tacticalPlan.laneStrategy.laneTitle}
                </h3>
                <p className="text-xs text-slate-200">{tacticalPlan.laneStrategy.economyTip}</p>
                {tacticalPlan.laneStrategy.allySynergyTip && (
                  <p className="text-xs text-emerald-300 pt-1">
                    🤝 {tacticalPlan.laneStrategy.allySynergyTip}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {tacticalPlan.matchupAlerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl bg-deadlock-panel border space-y-1.5 ${
                      alert.isInMyLane ? 'border-red-500/50' : 'border-orange-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">
                        {alert.isInMyLane ? '🎯 Lane :' : '🌐 Team :'} VS {alert.enemyName}
                      </span>
                      <span className="text-[10px] font-bold text-red-300">
                        {alert.dangerLevel}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-300">{alert.keyRule}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================= TAB 5: DIAGNOSTIC (ONLY IF OPENED MANUALLY) ================= */}
          {activeTab === 'logs' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-deadlock-panel border border-amber-500/40 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-xs font-extrabold uppercase text-amber-300 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-amber-400" /> Diagnostic & Choix de l'Écran
                  </h3>
                  <button
                    onClick={() => {
                      refreshSources();
                      performScreenScan();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Scanner Maintenant
                  </button>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 font-semibold mr-1">
                    Écran cible :
                  </span>
                  <button
                    onClick={() => {
                      setSelectedSourceId('');
                      setTimeout(() => performScreenScan(), 100);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                      selectedSourceId === ''
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-black/50 text-slate-300 border-white/10 hover:border-white/30'
                    }`}
                  >
                    🎯 Auto (Écran Principal de Jeu)
                  </button>
                  {sources.map((src) => (
                    <button
                      key={src.id}
                      onClick={() => {
                        setSelectedSourceId(src.id);
                        setTimeout(() => performScreenScan(), 100);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                        selectedSourceId === src.id
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-black/50 text-slate-300 border-white/10 hover:border-white/30'
                      }`}
                    >
                      🖥️ {src.name}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="aspect-video rounded-lg bg-black/80 border border-white/10 overflow-hidden flex items-center justify-center">
                    {lastCaptureUrl ? (
                      <img
                        src={lastCaptureUrl}
                        alt="Écran capturé"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-slate-500">Aucun scan effectué</span>
                    )}
                  </div>
                  <div className="aspect-video rounded-lg bg-black/80 border border-white/10 overflow-hidden flex items-center justify-center">
                    {lastDetection?.hudPreviewUrl ? (
                      <img
                        src={lastDetection.hudPreviewUrl}
                        alt="HUD analysé"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-slate-500">En attente de capture...</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <ScreenScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        lastCaptureUrl={lastCaptureUrl}
        lastDetection={lastDetection}
        isScanning={isScanning}
        autoScanEnabled={autoScanEnabled}
        onToggleAutoScan={() => setAutoScanEnabled((v) => !v)}
        onManualScan={() => performScreenScan()}
        sources={sources}
        selectedSourceId={selectedSourceId}
        onSelectSource={setSelectedSourceId}
        onRefreshSources={refreshSources}
        onApplyPresetSimulation={applyPresetSimulation}
      />
    </div>
  );
}

export default App;
