/**
 * Hero-versus-hero statistics of the generated data (scripts/update-builds.mjs, high ranks over 30 days): how a hero
 * does against each enemy (in lane and over the game), with each lane partner, and which items win more than usual
 * against each enemy. Optional fields since 2.0.0: a data file cached by an older version has none, every function
 * then returns undefined / [] and the app falls back on the hand-written threat tags.
 */
import { getMetaData } from './dataSource';

interface GeneratedPairStats {
  /** enemy -> [wins, games] laning against each other, then [wins, games] with the enemy anywhere on the other team */
  matchups?: Record<string, [number, number, number, number]>;
  /** ally -> [wins, games] laning together */
  laneDuos?: Record<string, [number, number]>;
  /** enemy -> [[itemId, extra win rate against this enemy (0.031 = +3.1 points)], ...], best first */
  counterItems?: Record<string, [string, number][]>;
}

const pairStats = (): Record<string, GeneratedPairStats> =>
  (getMetaData() as unknown as { heroes?: Record<string, GeneratedPairStats> }).heroes ?? {};

/** Fewer games than this in lane: the game-wide numbers are used instead */
const MIN_LANE_GAMES = 100;
/** Win rates are smoothed towards the hero's usual one, as if this many games had been played at that rate */
const SMOOTHING_GAMES = 200;
/** A matchup this much better or worse than usual is called favourable / hard (2.5 win-rate points) */
const STANCE_THRESHOLD = 0.025;
const EXTREME_THRESHOLD = 0.05;

export type MatchupStance = 'avoid' | 'even' | 'focus';

export interface MatchupStat {
  winRate: number; // smoothed, in the games against this enemy
  usualWinRate: number; // the hero's win rate over all its games (same rank bracket)
  diff: number; // winRate - usualWinRate
  games: number;
  lane: boolean; // numbers of the games where both laned against each other
  stance: MatchupStance;
}

/** The hero's win rate over all its games, from the matchup rows (same bracket and period as them). */
function usualWinRate(heroId: string): number | undefined {
  const rows = Object.values(pairStats()[heroId]?.matchups ?? {});
  const games = rows.reduce((sum, r) => sum + r[3], 0);
  return games > 0 ? rows.reduce((sum, r) => sum + r[2], 0) / games : undefined;
}

const smoothed = (wins: number, games: number, prior: number) => (wins + SMOOTHING_GAMES * prior) / (games + SMOOTHING_GAMES);

export const stanceOf = (diff: number): MatchupStance =>
  diff <= -STANCE_THRESHOLD ? 'avoid' : diff >= STANCE_THRESHOLD ? 'focus' : 'even';

export const isExtreme = (stat: MatchupStat) => stat.diff <= -EXTREME_THRESHOLD;

/** How my hero does against this enemy: in lane when they are my lane opponent (and often met there). */
export function getMatchupStat(heroId: string, enemyId: string, inLane: boolean): MatchupStat | undefined {
  const row = pairStats()[heroId]?.matchups?.[enemyId];
  const usual = usualWinRate(heroId);
  if (!row || usual === undefined) return undefined;
  const lane = inLane && row[1] >= MIN_LANE_GAMES;
  const [wins, games] = lane ? [row[0], row[1]] : [row[2], row[3]];
  if (games === 0) return undefined;
  const winRate = smoothed(wins, games, usual);
  const diff = winRate - usual;
  return { winRate, usualWinRate: usual, diff, games, lane, stance: stanceOf(diff) };
}

export interface DuoStat {
  winRate: number;
  usualWinRate: number;
  diff: number;
  games: number;
}

/** How my hero does when laning with this ally. */
export function getLaneDuoStat(heroId: string, allyId: string): DuoStat | undefined {
  const row = pairStats()[heroId]?.laneDuos?.[allyId];
  const usual = usualWinRate(heroId);
  if (!row || usual === undefined || row[1] === 0) return undefined;
  const winRate = smoothed(row[0], row[1], usual);
  return { winRate, usualWinRate: usual, diff: winRate - usual, games: row[1] };
}

export type LaneOutlook = 'hard' | 'even' | 'favourable';

/** Lane against these opponents: the average of my lane matchups against each of them. */
export function laneOutlookOf(stats: MatchupStat[]): { outlook: LaneOutlook; diff: number } | undefined {
  if (stats.length === 0) return undefined;
  const diff = stats.reduce((sum, s) => sum + s.diff, 0) / stats.length;
  const stance = stanceOf(diff);
  return { outlook: stance === 'avoid' ? 'hard' : stance === 'focus' ? 'favourable' : 'even', diff };
}

/** Items that win more than usual for my hero when this enemy is on the other team, best first. */
export function getCounterItemStats(heroId: string, enemyId: string): { itemId: string; lift: number }[] {
  return (pairStats()[heroId]?.counterItems?.[enemyId] ?? []).map(([itemId, lift]) => ({ itemId, lift }));
}
