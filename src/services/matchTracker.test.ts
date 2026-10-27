import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { InventorySlotReading, VisionDetectionResult } from './visionScanner';
import { MatchSnapshot, MatchTracker, MatchUpdate, clockAt, isForeignInventory, isSupportedFormat } from './matchTracker';
import { readJournal, replayJournal } from '../test/journalReplay';

const ALLIES = ['celeste', 'vindicta', 'infernus', 'sinclair', 'mirage', 'billy'];
const ENEMIES = ['apollo', 'warden', 'paige', 'wraith', 'rat_king', 'haze'];

function detection(overrides: Partial<VisionDetectionResult> = {}): VisionDetectionResult {
  return {
    detectedLaneEnemyIds: [],
    detectedTeamEnemyIds: [],
    detectedAllyIds: [],
    detectedEnemyIds: [],
    detectedOwnedItemIds: [],
    inventoryScanned: true,
    occupiedSlotsCount: 0,
    rawText: '',
    confidence: 0,
    sourceName: 'Deadlock',
    isDeadlockWindow: true,
    timestamp: '',
    debugLogs: [],
    frameWidth: 1920,
    frameHeight: 1080,
    ...overrides,
  };
}

/** HUD frame of my own match: my portrait highlighted, both lineups readable, these items in the inventory. */
function hud(items: string[] = [], overrides: Partial<VisionDetectionResult> = {}): VisionDetectionResult {
  const inventorySlots: InventorySlotReading[] = items.map((id, i) => ({ slot: `1.${i + 1}`, state: 'item', itemId: id }));
  return detection({
    hudVisible: true,
    highlightedHeroId: 'infernus',
    allySlots: ALLIES,
    enemySlots: ENEMIES,
    detectedOwnedItemIds: items,
    occupiedSlotsCount: items.length,
    inventorySlots,
    ...overrides,
  });
}

function snapshot(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    myHeroId: 'infernus',
    heroLocked: true,
    ownedItems: [],
    manualOwned: new Set(),
    manuallyExcluded: new Set(),
    laneColor: 'yellow',
    laneMode: 'duo',
    allyPartnerId: null,
    laneEnemyIds: [],
    teamEnemyIds: [],
    currentSouls: null,
    inventoryStatus: null,
    ...overrides,
  };
}

/** Runs `frames` through a tracker (350 ms apart), applying each update like App.tsx. */
function run(frames: VisionDetectionResult[], start: MatchSnapshot = snapshot(), tracker = new MatchTracker(), t0 = 1_000_000) {
  let state = start;
  const updates: MatchUpdate[] = [];
  frames.forEach((frame, i) => {
    const update = tracker.push(frame, state, t0 + i * 350);
    if (update.clearOwned) state = { ...state, ownedItems: [], inventoryStatus: null };
    state = { ...state, ...update.patch, heroLocked: update.heroLocked ?? state.heroLocked };
    updates.push(update);
  });
  return { state, updates, tracker };
}

const times = <T,>(n: number, value: T): T[] => Array.from({ length: n }, () => value);

describe('screen format', () => {
  it('accepts 16:9, 2K, 4K, 16:10, 21:9, 32:9, 4:3 and windowed, refuses portrait or tiny captures', () => {
    expect(isSupportedFormat(1920, 1080)).toBe(true);
    expect(isSupportedFormat(1280, 720)).toBe(true);
    expect(isSupportedFormat(2560, 1440)).toBe(true); // 2K 16:9
    expect(isSupportedFormat(2560, 1600)).toBe(true); // 2K 16:10
    expect(isSupportedFormat(3440, 1440)).toBe(true); // 2K 21:9 ultrawide
    expect(isSupportedFormat(5120, 1440)).toBe(true); // 32:9 super-ultrawide
    expect(isSupportedFormat(3840, 2160)).toBe(true); // 4K
    expect(isSupportedFormat(1936, 1119)).toBe(true); // windowed with borders
    expect(isSupportedFormat(1080, 1920)).toBe(false); // vertical monitor
    expect(isSupportedFormat(320, 240)).toBe(false); // minimized / tiny
  });

  it('pauses everything on an unsupported capture, after 3 scans', () => {
    const vertical = hud(['extra_regen'], { frameWidth: 1080, frameHeight: 1920 });
    const { state, updates } = run(times(10, vertical));
    expect(updates[1].formatIssue).toBeUndefined();
    expect(updates[2].formatIssue).toEqual({ width: 1080, height: 1920 });
    expect(state.ownedItems).toEqual([]);
  });
});

describe('lineups', () => {
  it('votes each portrait slot over the match: misread frames do not change the lineup', () => {
    const noisy = hud([], { enemySlots: ['pocket', 'viscous', null, 'paradox', 'warden', null] });
    const frames = [...times(8, hud()), ...times(3, noisy), ...times(4, hud()), ...times(3, noisy)];
    const { updates, state } = run(frames);
    // my slot (infernus) is ally slot 3: lane pair 2 = Broadway (blue), enemy slots 3 and 4
    expect(state.laneColor).toBe('blue');
    expect(state.laneEnemyIds).toEqual(['paige', 'wraith']);
    expect(state.teamEnemyIds).toEqual(['apollo', 'haze', 'rat_king', 'warden']);
    expect(state.allyPartnerId).toBe('sinclair');
    const enemyChanges = updates.filter((u) => u.patch.laneEnemyIds || u.patch.teamEnemyIds);
    expect(enemyChanges.length).toBeLessThanOrEqual(2);
  });

  it('ignores the death cam (the killer\'s HUD: my enemies on the left)', () => {
    const deathCam = hud([], { highlightedHeroId: undefined, allySlots: ENEMIES, enemySlots: ALLIES });
    const { state } = run([...times(6, hud()), ...times(40, deathCam)]);
    expect([...state.laneEnemyIds, ...state.teamEnemyIds].sort()).toEqual([...ENEMIES].sort());
  });

  it('detects a new match only after a long gap, and only in its first minutes', () => {
    const tracker = new MatchTracker();
    const first = run(times(10, hud(['extra_regen', 'extra_spirit'])), snapshot(), tracker, 0);
    expect(first.state.ownedItems.sort()).toEqual(['extra_regen', 'extra_spirit']);

    // Other enemies straight away (no gap): same match, nothing wiped
    const other = ['shiv', 'kelvin', 'dynamo', 'ivy', 'lash', 'bebop'];
    const noGap = run(times(10, hud(['extra_regen', 'extra_spirit'], { enemySlots: other })), first.state, tracker, 4000);
    expect(noGap.updates.some((u) => u.clearOwned)).toBe(false);

    // 40 s of menus, then a new lineup: new match
    const afterGap = run(times(10, hud([], { enemySlots: other })), first.state, tracker, 4000 + 3500 + 40000);
    expect(afterGap.updates.some((u) => u.log.some((l) => l.kind === 'restart'))).toBe(true);
    expect(afterGap.state.ownedItems).toEqual([]);
  });
});

describe('who is dead (board)', () => {
  const NONE = times(6, false);
  const dead = (...slots: number[]) => NONE.map((_, i) => slots.includes(i));
  /** HUD frame with these slots showing a respawn timer (their portrait unreadable). */
  const withDead = (allyDead: boolean[], enemyDead: boolean[], overrides: Partial<VisionDetectionResult> = {}) =>
    hud([], {
      allyDead,
      enemyDead,
      allySlots: ALLIES.map((id, i) => (allyDead[i] ? null : id)),
      enemySlots: ENEMIES.map((id, i) => (enemyDead[i] ? null : id)),
      ...overrides,
    });

  it('keeps the voted hero of a dead slot, after 2 scans of respawn timer', () => {
    const { updates } = run([...times(6, withDead(NONE, NONE)), ...times(2, withDead(NONE, dead(0, 5)))]);
    expect(updates[6].board!.enemies[0].dead).toBe(false); // a single frame is not enough
    const board = updates[7].board!;
    expect(board.mySlot).toBe(2);
    expect(board.enemies[0]).toEqual({ heroId: 'apollo', dead: true });
    expect(board.enemies[5]).toEqual({ heroId: 'haze', dead: true });
    expect(board.allies.every((s) => !s.dead)).toBe(true);
  });

  it('ignores the death cam: its teams are swapped', () => {
    const deathCam = withDead(dead(0, 1, 2), NONE, { highlightedHeroId: undefined, allySlots: ENEMIES, enemySlots: ALLIES });
    const { updates } = run([...times(6, withDead(NONE, NONE)), ...times(10, deathCam)]);
    expect(updates[updates.length - 1].board!.enemies.every((s) => !s.dead)).toBe(true);
  });

  it('reads the match clock: two agreeing readings, extrapolated in between, a misread ignored', () => {
    const t0 = 1_000_000;
    // One top bar reading every ~4 s (12 scans), as the scanner's background OCR
    const frames = [945, 949, 1949, 957, 961].flatMap((clockS, k) =>
      times(12, withDead(NONE, NONE, { topBar: { clockS, at: t0 + k * 12 * 350, allySlots: ALLIES, enemySlots: ENEMIES } }))
    );
    const { updates } = run(frames, snapshot(), new MatchTracker(), t0);
    expect(updates[5].board!.clock).toBeUndefined(); // a single reading is not trusted yet
    const clock = updates[30].board!.clock!;
    expect(clockAt(clock, t0 + 30 * 350)).toBeCloseTo(945 + 10.5, 0); // extrapolated
    // 1949 (32:29, scans 24-35) disagrees: kept at the last good reading, then the next ones agree again
    expect(updates[30].board!.clock!.seconds).toBe(949);
    expect(updates[40].board!.clock!.seconds).toBe(957);
    expect(updates[updates.length - 1].board!.clock!.seconds).toBe(961);
  });

  it('reads the team souls from my point of view only (never the death cam)', () => {
    const reading = (ally: number, enemy: number, at: number, flipped = false) =>
      withDead(NONE, NONE, {
        topBar: {
          allySouls: ally,
          enemySouls: enemy,
          at,
          allySlots: flipped ? ENEMIES : ALLIES,
          enemySlots: flipped ? ALLIES : ENEMIES,
        },
      });
    const t0 = 1_000_000;
    const frames = [
      ...times(8, reading(62, 72, t0)),
      ...times(8, reading(63, 73, t0 + 8 * 350)),
      // Death cam: the killer's top bar, their team on the left
      ...times(8, reading(74, 63, t0 + 16 * 350, true)),
      ...times(8, reading(74, 63, t0 + 24 * 350, true)),
    ];
    const { updates } = run(frames, snapshot(), new MatchTracker(), t0);
    expect(updates[15].board!.souls).toEqual({ ally: 63, enemy: 73 });
    expect(updates[updates.length - 1].board!.souls).toEqual({ ally: 63, enemy: 73 });
  });

  it('forgets who is dead 15 s after the top bar was last seen (shop, menus)', () => {
    const { updates } = run([...times(6, withDead(NONE, dead(3))), ...times(50, detection())]);
    expect(updates[15].board!.enemies[3].dead).toBe(true); // ~3 s later: still shown
    expect(updates[updates.length - 1].board).toBeNull(); // ~17 s later
  });
});

describe('my hero', () => {
  // A new match after the last one's hero (unlocked by the new lineup): Rat King's portrait not found, his ability
  // icons read as a teammate (Pocket) or as a hero of neither team (Paradox)
  const RAT_KING_ALLIES = ['rem', 'pocket', 'venator', 'haze', 'rat_king', 'sinclair'];
  const noHighlight = (abilityHeroId: string) =>
    hud(['extra_regen'], { highlightedHeroId: undefined, abilityHeroId, allySlots: RAT_KING_ALLIES });

  it('never flips between heroes on the ability icons, and the highlighted portrait still wins', () => {
    const flipping = Array.from({ length: 60 }, (_, i) => noHighlight(i % 8 < 4 ? 'pocket' : 'paradox'));
    const found = hud(['extra_regen'], { highlightedHeroId: 'rat_king', allySlots: RAT_KING_ALLIES });
    const { state, updates } = run([...flipping, ...times(4, found)], snapshot({ heroLocked: false }));
    const changes = updates.flatMap((u) => u.changes.filter((c) => c.startsWith('hero:')));
    // the last match's hero (not on my team) once replaced by a teammate's icons, then my highlighted portrait
    expect(changes).toEqual(['hero:pocket', 'hero:rat_king']);
    expect(state.myHeroId).toBe('rat_king');
    expect(state.heroLocked).toBe(true);
  });

  it('a hero locked from the last match does not keep the new match from being detected', () => {
    const tracker = new MatchTracker();
    const last = run(times(10, hud(['extra_regen'])), snapshot(), tracker, 0);
    expect(last.state.heroLocked).toBe(true);
    // Next match, after the menus: Vindicta highlighted, and the last match's hero now on the enemy team
    const newAllies = ['vindicta', 'rem', 'victor', 'violet', 'abrams', 'celeste'];
    const newEnemies = ['doorman', 'silver', 'billy', 'graves', 'pocket', 'infernus'];
    const next = run(
      times(20, hud(['extra_spirit'], { highlightedHeroId: 'vindicta', allySlots: newAllies, enemySlots: newEnemies })),
      last.state,
      tracker,
      3500 + 60000
    );
    expect(next.updates.some((u) => u.log.some((l) => l.kind === 'restart'))).toBe(true);
    expect(next.state.myHeroId).toBe('vindicta');
    expect(next.state.heroLocked).toBe(true);
    expect(next.state.ownedItems).toEqual(['extra_spirit']);
  });
});

describe('inventory', () => {
  it('adds an item after 3 scans, removes it after ~2 s of absence', () => {
    const { state, updates } = run([...times(3, hud(['extra_regen'])), ...times(9, hud(['extra_spirit']))]);
    expect(updates[2].patch.ownedItems).toEqual(['extra_regen']);
    expect(updates[5].patch.ownedItems).toEqual(['extra_regen', 'extra_spirit']);
    expect(updates[7].patch.ownedItems).toBeUndefined(); // 5 scans missing: still owned
    expect(state.ownedItems).toEqual(['extra_spirit']);
  });

  it('keeps the items through the shop fade-out and other non-game screens', () => {
    const items = ['extra_regen', 'extra_spirit', 'healbane', 'titanic_magazine'];
    const fadeOut = detection({ occupiedSlotsCount: 3, detectedOwnedItemIds: ['healbane'] }); // neither HUD nor shop
    const { state } = run([...times(4, hud(items)), ...times(60, fadeOut)]);
    expect(state.ownedItems.sort()).toEqual([...items].sort());
  });

  it('ignores the inventory of another hero (spectating while dead)', () => {
    const spectating = hud(['lifestrike', 'stalker'], { highlightedHeroId: 'vindicta' });
    const { state } = run([...times(4, hud(['extra_regen'])), ...times(30, spectating)]);
    expect(state.ownedItems).toEqual(['extra_regen']);
  });

  it('never re-adds an item removed by hand, never removes one marked by hand', () => {
    const start = snapshot({ ownedItems: ['boundless_spirit'], manualOwned: new Set(['boundless_spirit']), manuallyExcluded: new Set(['extra_regen']) });
    const { state } = run(times(20, hud(['extra_regen', 'extra_spirit'])), start);
    expect(state.ownedItems.sort()).toEqual(['boundless_spirit', 'extra_spirit']);
  });

  it('recognizes a foreign inventory: 2 of my items gone and 2 unknown ones', () => {
    expect(isForeignInventory(['a', 'b', 'c'], ['c', 'x', 'y'], 0)).toBe(true);
    expect(isForeignInventory(['a', 'b', 'c'], ['c', 'x', 'y'], 1)).toBe(false);
    // An upgrade replaces its component: not foreign
    expect(isForeignInventory(['extra_spirit', 'extra_regen'], ['improved_spirit', 'extra_regen'], 0)).toBe(false);
  });
});

/**
 * Recorded games (tests/replays/*.journal.log.gz, written by versions 1.3.0 / 1.3.1 with an older, noisier
 * scanner), replayed through today's rules. Each of them once triggered a bug: items wiped by a false "new
 * match" late in the game, the killer's items added during the death cam, the whole inventory dropped by the
 * shop's fade-out.
 */
describe('recorded games', () => {
  const games = [
    { file: 'amber_infernus_part1', finalOwned: 11 },
    { file: 'amber_infernus_part2', finalOwned: 11 },
    { file: 'sapphire_infernus_full', finalOwned: 10 },
  ];

  for (const game of games) {
    describe(game.file, () => {
      const journal = readJournal(`tests/replays/${game.file}.journal.log.gz`);
      const steps = replayJournal(journal);
      const at = (i: number) => (steps[i].t - steps[0].t) / 1000;

      it('never detects a new match in the middle of the game', () => {
        const restarts = steps.filter((s) => s.log.some((l) => l.kind === 'restart'));
        expect(restarts.map((s) => at(steps.indexOf(s)))).toEqual([]);
      });

      it('wipes the owned items at most once, at the start (previous session\'s hero)', () => {
        const clears = steps.map((s, i) => (s.clearOwned ? at(i) : -1)).filter((t) => t >= 0);
        expect(clears.length).toBeLessThanOrEqual(1);
        clears.forEach((t) => expect(t).toBeLessThan(120));
      });

      it('locks my hero for the whole game', () => {
        const last = steps[steps.length - 1].state;
        expect(last.myHeroId).toBe('infernus');
        expect(last.heroLocked).toBe(true);
      });

      it('never drops more than 2 owned items at once (a sale or an upgrade removes one)', () => {
        let previous = steps[0].state.ownedItems.length;
        for (const s of steps) {
          const n = s.state.ownedItems.length;
          if (!s.clearOwned) expect(previous - n).toBeLessThanOrEqual(2);
          previous = n;
        }
      });

      it('ends with my real inventory', () => {
        expect(steps[steps.length - 1].state.ownedItems).toHaveLength(game.finalOwned);
      });
    });
  }

  it('sapphire_infernus_full: the killer\'s items of the death cam never become mine', () => {
    const steps = replayJournal(readJournal('tests/replays/sapphire_infernus_full.journal.log.gz'));
    const everOwned = new Set(steps.flatMap((s) => s.state.ownedItems));
    // Items of the death-cam inventories in this game (see tests/vision: sapphire_death_cam)
    for (const id of ['lifestrike', 'stalker', 'crushing_fists']) expect(everOwned.has(id)).toBe(false);
  });

  it('amber_rat_king: the ability icons (Pocket / Paradox) never change my hero nor wipe my items', () => {
    // 1.4.0 log, playing Rat King, highlighted portrait never found: the hero flipped 5 times in 4 minutes
    const steps = replayJournal(readJournal('tests/replays/amber_rat_king.journal.log.gz'));
    expect(steps.some((s) => s.state.myHeroId !== 'infernus')).toBe(false);
    expect(steps.some((s) => s.clearOwned)).toBe(false);
  });

  it('amber_vindicta_stale_lock: a hero locked from the last match gives way to the new match\'s highlighted hero', () => {
    // 1.4.0 log, playing Vindicta with Infernus locked from the previous match: Vindicta's highlight was taken for a
    // spectated teammate, which blocked the lineup votes; the new match was never detected and the inventory was
    // ignored on 64 % of the HUD frames
    const steps = replayJournal(readJournal('tests/replays/amber_vindicta_stale_lock.journal.log.gz'));
    const at = (i: number) => (steps[i].t - steps[0].t) / 1000;
    const restarts = steps.flatMap((s, i) => (s.log.some((l) => l.kind === 'restart') ? [at(i)] : []));
    expect(restarts).toHaveLength(1);
    expect(restarts[0]).toBeLessThan(180);
    const last = steps[steps.length - 1].state;
    expect(last.myHeroId).toBe('vindicta');
    expect(last.heroLocked).toBe(true);
    const hud = steps.filter((s) => s.detection.hudVisible);
    const watching = hud.filter((s) => s.state.heroLocked && s.detection.highlightedHeroId && s.detection.highlightedHeroId !== s.state.myHeroId);
    expect(watching.length / hud.length).toBeLessThan(0.02);
  });

  it('sapphire_infernus_full: the portraits read by the current scanner give the right lineups', () => {
    const { frames } = JSON.parse(fs.readFileSync('tests/replays/sapphire_infernus_full.portraits.json', 'utf8'));
    // One reading per minute: each repeated like ~3 s of scans
    const sequence: VisionDetectionResult[] = frames.flatMap(
      (f: { mode: string; highlighted: string | null; allySlots: (string | null)[] | null; enemySlots: (string | null)[] | null }) =>
        times(
          8,
          detection({
            hudVisible: f.mode === 'hud',
            highlightedHeroId: f.highlighted ?? undefined,
            allySlots: f.allySlots ?? undefined,
            enemySlots: f.enemySlots ?? undefined,
          })
        )
    );
    const { state } = run(sequence);
    expect(state.laneColor).toBe('blue');
    expect(state.allyPartnerId).toBe('sinclair');
    expect(state.laneEnemyIds).toEqual(['paige', 'wraith']);
    expect(state.teamEnemyIds).toEqual(['apollo', 'haze', 'rat_king', 'warden']);
  });
});
