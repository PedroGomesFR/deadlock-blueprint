/**
 * What the application concludes from each scan (every 350 ms): my hero, the lineups, my lane, my souls and the
 * items I own. Kept out of React so that a recorded game can be replayed through the very same rules
 * (matchTracker.test.ts); App.tsx applies the returned update to its state.
 *
 * The rules below were tuned on whole recorded games (journal de partie, AGENTS.md § 1): keep their comments.
 */
import type { LaneColor, LaneMode } from '../data/deadlockData';
import { getComponentIds, InventoryStatus } from './recommendations';
import { ItemAbsence, ItemConfirmation, SlotVoter, StableValue } from './detectionStabilizer';
import type { VisionDetectionResult } from './visionScanner';

/** The part of the application state the scanner reads and updates. */
export interface MatchSnapshot {
  myHeroId: string;
  heroLocked: boolean;
  ownedItems: string[];
  manualOwned: Set<string>; // marked by hand ("Skip"): never removed by the scanner
  manuallyExcluded: Set<string>; // removed by hand: never added back by the scanner
  laneColor: LaneColor;
  laneMode: LaneMode;
  allyPartnerId: string | null;
  laneEnemyIds: string[];
  teamEnemyIds: string[];
  currentSouls: number | null;
  inventoryStatus: InventoryStatus | null;
}

export type MatchPatch = Partial<
  Pick<
    MatchSnapshot,
    | 'myHeroId'
    | 'laneColor'
    | 'laneMode'
    | 'allyPartnerId'
    | 'laneEnemyIds'
    | 'teamEnemyIds'
    | 'ownedItems'
    | 'currentSouls'
    | 'inventoryStatus'
  >
>;

export interface MatchUpdate {
  patch: MatchPatch;
  heroLocked?: boolean; // new lock state of my hero
  clearOwned: boolean; // new match or other hero: owned items (scanned and by hand) are forgotten before `patch`
  /** Decisions for the game log, in order; 'restart': new match detected, the current game log is closed. */
  log: { kind: 'event' | 'restart'; text: string }[];
  changes: string[]; // short summary of what changed
  /** Capture whose format the scanner is not calibrated for: nothing was applied. */
  formatIssue?: { width: number; height: number };
  /** Deadlock is captured but no game screen has been recognized for a long time. */
  hudMissing: boolean;
}

// Above any respawn timer: a "foreign" inventory still on screen after that really is mine (sold + bought)
const FOREIGN_INVENTORY_MAX_SCANS = 250; // ~90 s

// Between two matches there is always longer than this without the top bar or the shop on screen
export const NEW_MATCH_MIN_GAP_MS = 30000;
// ...and the new match's lineup is read within its first minutes: later, a lineup change is never a new match.
// Replay of a recorded game (old scanner, slot order rarely known): its first full lineup came 7.6 min in and
// wiped the items and unlocked the hero mid-game, which then flipped 3 times on the ability icons.
const NEW_MATCH_WINDOW_MS = 3 * 60 * 1000;

// The scanner normalizes 16:9, 16:10, 21:9, 32:9, 4:3, 5:4 and windowed frames onto 1920x1080
const MIN_ASPECT_RATIO = 1.2; // 5:4 (1.25) and 4:3 (1.33)
const MAX_ASPECT_RATIO = 3.8; // 32:9 super-ultrawide (3.55)
const FORMAT_SCANS = 3;
// Deadlock captured this long without any game screen: the HUD is probably not where the scanner looks
const HUD_MISSING_AFTER_MS = 5 * 60 * 1000;

const LANE_BY_PAIR: LaneColor[] = ['yellow', 'blue', 'orange'];

/** Is the captured frame a valid landscape game resolution (16:9, 16:10, 21:9, 32:9, 4:3, windowed)? */
export function isSupportedFormat(width?: number, height?: number): boolean {
  if (!width || !height) return true;
  if (width < 640 || height < 360) return false;
  const ratio = width / height;
  return ratio >= MIN_ASPECT_RATIO && ratio <= MAX_ASPECT_RATIO;
}

/**
 * An inventory that cannot be mine (spectated teammate while dead): in the same frame, at least 2 of my items
 * are gone and 2 unknown items appeared. Upgrades don't count (the new item replaces its component), nor do
 * items that unrecognized slots may be hiding (active item on cooldown).
 */
export function isForeignInventory(ownedIds: string[], seenIds: string[], unmatchedSlots: number): boolean {
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

const overlap = (a: (string | null | undefined)[], b: (string | null | undefined)[]) =>
  a.filter((id) => id && b.includes(id)).length;

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

export class MatchTracker {
  // Anti-flicker: a detection is applied only once it has been seen several scans in a row (350 ms each)
  private heroStabilizer = new StableValue<string>(3, (id) => id);
  private allyStabilizer = new StableValue<{ partnerId?: string; laneColor?: LaneColor }>(
    4,
    (a) => `${a.partnerId ?? ''}|${a.laneColor ?? ''}`
  );
  // Portraits of both teams, voted slot by slot over the whole match
  private allyVoter = new SlotVoter();
  private enemyVoter = new SlotVoter();
  // Occupied / padlocked slot counts (inventory full or not): a single transition frame (shop opening, padlock
  // hidden for a moment) must not make the "⇄ Sell" hint blink
  private slotCountsStabilizer = new StableValue<{ occupied: number; locked: number }>(
    3,
    (c) => `${c.occupied}|${c.locked}`
  );
  private itemConfirmation = new ItemConfirmation(3);
  // ~2 s missing from a readable inventory before an item is dropped (sold, upgraded, previous match); ~10 s when
  // 3+ items are missing together (a game log showed all 11 items dropped 11 times by the shop's fade-out)
  private itemAbsence = new ItemAbsence(6, 30, 3);
  private foreignInventoryStreak = 0;
  private inventoryIgnoreReason = '';
  // A new match can only be detected after NEW_MATCH_MIN_GAP_MS without any game screen (end screen, menus,
  // matchmaking, loading), until the first full enemy lineup of the next game screens
  private lastGameScreenAt = 0;
  private newMatchPossible = true;
  private newMatchUntil = Infinity;
  private formatStabilizer = new StableValue<boolean>(FORMAT_SCANS, (ok) => String(ok));
  private formatSupported = true;
  private deadlockSince: number | null = null;

  /** Forgets everything learnt about the owned items (new match, Reset). */
  resetOwned(): void {
    this.itemConfirmation.reset();
    this.itemAbsence.reset();
    this.slotCountsStabilizer.reset();
    this.foreignInventoryStreak = 0;
  }

  /** My hero was picked by hand: re-detection starts over. */
  resetHero(): void {
    this.heroStabilizer.reset();
  }

  push(detection: VisionDetectionResult, state: MatchSnapshot, now: number): MatchUpdate {
    const update: MatchUpdate = { patch: {}, clearOwned: false, log: [], changes: [], hudMissing: false };
    const event = (text: string) => update.log.push({ kind: 'event', text });
    const isGameScreen = Boolean(detection.hudVisible || detection.shopOpen);

    // Capture in another format than 16:9 (ultrawide, 16:10, windowed with borders): every coordinate would be
    // wrong. Nothing is applied, and the application says why instead of showing wrong recommendations.
    if (detection.isDeadlockWindow) {
      const stable = this.formatStabilizer.push(isSupportedFormat(detection.frameWidth, detection.frameHeight));
      if (stable !== undefined) this.formatSupported = stable;
    } else {
      this.formatStabilizer.reset();
      this.formatSupported = true;
    }
    if (!this.formatSupported) {
      update.formatIssue = { width: detection.frameWidth ?? 0, height: detection.frameHeight ?? 0 };
      return update;
    }

    if (isGameScreen) {
      if (now - this.lastGameScreenAt >= NEW_MATCH_MIN_GAP_MS) {
        this.newMatchPossible = true;
        this.newMatchUntil = now + NEW_MATCH_WINDOW_MS;
        // A new match may start: its portraits are voted from scratch
        this.allyVoter.reset();
        this.enemyVoter.reset();
      }
      this.lastGameScreenAt = now;
    }
    if (detection.isDeadlockWindow) {
      this.deadlockSince ??= now;
      update.hudMissing = now - Math.max(this.lastGameScreenAt, this.deadlockSince) > HUD_MISSING_AFTER_MS;
    } else {
      this.deadlockSince = null;
    }

    let owned = state.ownedItems;
    let heroLocked = state.heroLocked;
    const clearOwned = () => {
      this.resetOwned();
      update.clearOwned = true;
      owned = [];
    };
    const lockHero = (locked: boolean) => {
      heroLocked = locked;
      update.heroLocked = locked;
    };

    // My hero: auto-detected once per match, then locked. While dead (death cam, spectating a teammate)
    // the screen shows other heroes; once locked, the hero only changes at the next match (new enemy
    // lineup) or when picked by hand.
    // The ability icons are a weak fallback (icons for 18 heroes only, cooldown numbers fool them): playing Rat King,
    // whose highlighted portrait was never found, they read Pocket or Paradox, and the hero flipped between the two
    // every few seconds, wiping the owned items each time (15 times in 2.5 min). They may only replace a hero who
    // is not on my team (the last match's) by one who is.
    let activeHeroId = state.myHeroId;
    const alliesSoFar = this.allyVoter.result();
    const abilityHeroId =
      detection.abilityHeroId &&
      alliesSoFar.includes(detection.abilityHeroId) &&
      !alliesSoFar.includes(state.myHeroId)
        ? detection.abilityHeroId
        : undefined;
    const heroEvidence = detection.highlightedHeroId ?? abilityHeroId;
    const stableHeroId = heroEvidence ? this.heroStabilizer.push(heroEvidence) : undefined;
    if (stableHeroId && !heroLocked) {
      // Only the highlighted portrait is trusted enough to lock (cooldown numbers fool the abilities)
      if (stableHeroId === detection.highlightedHeroId) {
        lockHero(true);
        event(`Héros verrouillé : ${stableHeroId} (portrait surligné)`);
      }
      if (stableHeroId !== state.myHeroId) {
        event(`Héros changé : ${state.myHeroId} → ${stableHeroId} (objets possédés vidés)`);
        // Another hero = another match: the previous match's items and portraits no longer apply
        activeHeroId = stableHeroId;
        update.patch.myHeroId = stableHeroId;
        this.allyStabilizer.reset();
        this.allyVoter.reset();
        this.enemyVoter.reset();
        clearOwned();
        update.changes.push(`hero:${stableHeroId}`);
      }
    }

    // Another hero highlighted than my locked one (spectating a teammate): inventory, souls and lane are
    // left untouched. Only the highlighted portrait counts: a whole game log showed the abilities reading
    // Infernus as Paradox in a third of the frames, which kept ignoring my own inventory while alive.
    // The death cam shows the killer's own HUD (their team on the left, their portrait highlighted) with
    // frames without any highlight in between.
    const heroOnScreen = detection.highlightedHeroId;
    const isWatchingOtherHero = heroLocked && heroOnScreen !== undefined && heroOnScreen !== activeHeroId;

    // Portrait votes, only from my team's point of view: never from the death cam's killer HUD (its left side
    // holds my enemies, its right side my team, me included). Spectating a teammate keeps my team on the left, so
    // those frames vote: a hero locked from the last match took the new one's highlighted hero for a spectated
    // teammate, no lineup was voted, and the new match was never detected (my inventory ignored on 64 % of a game).
    // For the same reason my hero among the enemies only means the killer's view once my team's votes confirm it.
    const allySlots = detection.allySlots;
    const enemySlots = detection.enemySlots;
    if (detection.hudVisible && allySlots && enemySlots) {
      const votedAllies = this.allyVoter.result();
      const votedEnemies = this.enemyVoter.result();
      const flipped =
        (votedAllies.includes(activeHeroId) && enemySlots.includes(activeHeroId)) ||
        overlap(allySlots, votedEnemies) >= 2 ||
        overlap(enemySlots, votedAllies) >= 2;
      if (!flipped) {
        this.allyVoter.push(allySlots);
        this.enemyVoter.push(enemySlots);
      }
    }
    const votedAllies = this.allyVoter.result();
    const votedEnemies = this.enemyVoter.result();
    // My slot among the voted allies gives my lane (slots go by lane pairs) and my lane partner
    const mySlot = votedAllies.indexOf(activeHeroId);
    let lanePair = mySlot >= 0 ? Math.floor(mySlot / 2) : -1;

    if (!isWatchingOtherHero) {
      let stableAlly: { partnerId?: string; laneColor?: LaneColor } | undefined;
      if (mySlot >= 0) {
        const partnerId = votedAllies[mySlot % 2 === 0 ? mySlot + 1 : mySlot - 1] ?? undefined;
        stableAlly = { partnerId, laneColor: LANE_BY_PAIR[lanePair] };
      } else {
        const detectedPartnerId = detection.detectedPartnerId ?? detection.detectedAllyIds[0];
        if (detectedPartnerId || detection.detectedLaneColor) {
          stableAlly = this.allyStabilizer.push({ partnerId: detectedPartnerId, laneColor: detection.detectedLaneColor });
          if (stableAlly?.laneColor) lanePair = LANE_BY_PAIR.indexOf(stableAlly.laneColor);
        }
      }
      if (stableAlly?.laneColor && stableAlly.laneColor !== state.laneColor) {
        update.patch.laneColor = stableAlly.laneColor;
      }
      if (stableAlly?.partnerId) {
        if (state.laneMode !== 'duo') update.patch.laneMode = 'duo';
        if (state.allyPartnerId !== stableAlly.partnerId) {
          update.patch.allyPartnerId = stableAlly.partnerId;
          update.changes.push(`partner:${stableAlly.partnerId}`);
        }
      }
    }

    if (votedEnemies.some(Boolean)) {
      // My lane pair unknown on this frame: the current lane colour (otherwise the split would change every frame)
      if (lanePair < 0) lanePair = LANE_BY_PAIR.indexOf(update.patch.laneColor ?? state.laneColor);
      // Sorted so that a mere change of order is not a change of lineup
      const laneSlots = lanePair >= 0 ? [lanePair * 2, lanePair * 2 + 1] : [];
      const known = votedEnemies
        .map((id, slot) => ({ id, slot }))
        .filter((e): e is { id: string; slot: number } => Boolean(e.id));
      const laneIds = (laneSlots.length > 0 ? known.filter((e) => laneSlots.includes(e.slot)) : known.slice(0, 2)).map(
        (e) => e.id
      );
      const lane = [...laneIds].sort();
      const team = known
        .map((e) => e.id)
        .filter((id) => !laneIds.includes(id))
        .sort();

      // Mostly different enemies (same hero picked again) = new match: drop last match's items. Only
      // after a long stretch without any game screen: mid-game, dead enemies turn into unreadable
      // silhouettes, the lineup shrinks to 1-3 heroes then grows back, which looked like a new match
      // (4 times in one game: owned items wiped, hero unlocked then switched on the end screen).
      const previousLineup = new Set([...state.laneEnemyIds, ...state.teamEnemyIds]);
      const lineup = [...lane, ...team];
      const common = lineup.filter((id) => previousLineup.has(id)).length;
      if (now > this.newMatchUntil) this.newMatchPossible = false;
      const isNewMatch =
        this.newMatchPossible && previousLineup.size > 0 && lineup.length >= 4 && common * 2 < lineup.length;
      if (lineup.length >= 4) this.newMatchPossible = false;
      if (isNewMatch) {
        update.log.push({ kind: 'restart', text: `Nouvelle partie : ennemis [${[...previousLineup].join(',')}] → [${lineup.join(
          ','
        )}] (objets vidés, héros déverrouillé)` });
        clearOwned();
        lockHero(false); // my hero is re-detected (and re-locked) for this new match
        this.heroStabilizer.reset();
        update.changes.push('newMatch');
      }
      // Within a match, enemies only leave the lineup by dying (unreadable portrait): keep the fuller one,
      // so the counters do not change every time an enemy is dead
      if (isNewMatch || lineup.length >= previousLineup.size) {
        if (!sameList(lane, state.laneEnemyIds)) update.patch.laneEnemyIds = lane;
        if (!sameList(team, state.teamEnemyIds)) update.patch.teamEnemyIds = team;
        if (update.patch.laneEnemyIds || update.patch.teamEnemyIds) update.changes.push('enemies');
      }
    }

    if (!isWatchingOtherHero && detection.detectedSouls !== undefined && detection.detectedSouls !== state.currentSouls) {
      update.patch.currentSouls = detection.detectedSouls;
    }

    // Inventory Sync: the owned list mirrors the inventory on screen.
    // - an item seen 3 consecutive scans (~1 s) is added;
    // - an item missing for ~2 s is removed (~10 s when 3+ go together), but only from a readable inventory:
    //   the HUD (top bar) or the shop must be detected, with at least one occupied slot. Being the Deadlock
    //   window is not enough: the shop's fade-out and the death screen read neither as HUD nor as shop, and
    //   the HUD position then falls between the shop's slot rows (a whole game log: all items dropped 11
    //   times). Hidden HUD, menus, Alt-Tab and black frames all read as an empty inventory. Items marked by
    //   hand are never removed by the scanner.
    // - frames showing someone else's inventory (another hero on screen, or an inventory that cannot be
    //   mine, like the killer's on the death cam) are ignored altogether.
    const canReadInventory = isGameScreen && detection.occupiedSlotsCount > 0;
    const scannedOwned = owned.filter((id) => !state.manualOwned.has(id));
    const looksForeign =
      canReadInventory &&
      isForeignInventory(scannedOwned, detection.detectedOwnedItemIds, detection.unmatchedSlotsCount ?? 0);
    this.foreignInventoryStreak = looksForeign ? this.foreignInventoryStreak + 1 : 0;
    const ignoreInventory =
      isWatchingOtherHero || (looksForeign && this.foreignInventoryStreak < FOREIGN_INVENTORY_MAX_SCANS);
    const ignoreReason = isWatchingOtherHero
      ? `autre héros à l'écran (${heroOnScreen}) : mort ou spectateur`
      : ignoreInventory
      ? 'inventaire étranger (plusieurs de mes objets absents et objets inconnus)'
      : '';
    if (ignoreReason !== this.inventoryIgnoreReason) {
      event(ignoreReason ? `Inventaire ignoré : ${ignoreReason}` : 'Inventaire de nouveau pris en compte');
      this.inventoryIgnoreReason = ignoreReason;
    }

    // An ignored frame (death cam, spectating) breaks the 3-scan streak of a new item: otherwise the killer's
    // items, also seen on the frames of the death cam without highlighted portrait, add up to 3 scans
    if (ignoreInventory) this.itemConfirmation.reset();
    const confirmedItemIds =
      ignoreInventory || !isGameScreen ? [] : this.itemConfirmation.push(detection.detectedOwnedItemIds);
    // An unrecognized slot (item on cooldown) whose best candidate is one of my items: that item is most likely
    // there. Otherwise a legit removal (upgraded component) plus a cooldown made both items go (game log).
    const unknownCandidates = (detection.inventorySlots ?? [])
      .filter((s) => s.state === 'unknown' && s.itemId && scannedOwned.includes(s.itemId))
      .map((s) => s.itemId!);
    const goneItemIds =
      canReadInventory && !ignoreInventory
        ? this.itemAbsence.push(
            scannedOwned,
            [...detection.detectedOwnedItemIds, ...unknownCandidates],
            (detection.unmatchedSlotsCount ?? 0) - unknownCandidates.length
          )
        : [];

    const slotCounts =
      canReadInventory && !ignoreInventory
        ? this.slotCountsStabilizer.push({
            occupied: detection.occupiedSlotsCount,
            locked: detection.lockedSlotsCount ?? 0,
          })
        : undefined;
    if (slotCounts) {
      const status: InventoryStatus = {
        itemIds: [...confirmedItemIds].sort(),
        occupied: slotCounts.occupied,
        locked: slotCounts.locked,
        unmatched: detection.unmatchedSlotsCount ?? 0,
      };
      const previous = update.clearOwned ? null : state.inventoryStatus;
      if (!previous || JSON.stringify(previous) !== JSON.stringify(status)) update.patch.inventoryStatus = status;
    }

    if (confirmedItemIds.length > 0 || goneItemIds.length > 0) {
      const gone = new Set(goneItemIds);
      const filteredNew = confirmedItemIds.filter((id) => !state.manuallyExcluded.has(id));
      const merged = Array.from(new Set([...owned.filter((id) => !gone.has(id)), ...filteredNew]));
      if (!sameList(merged, owned)) {
        update.patch.ownedItems = merged;
        update.changes.push(`items:${merged.length}`);
      }
    }

    return update;
  }
}
