// Which round of the game it is, from when the pick screen shows (each round opens with it), corrected by the tiers
// of the cards offered. Pure.

/** Closed this long, the next pick screen is the next round's: a round's three picks come one after another. */
const ROUND_GAP_MS = 60_000;
/** Closed this long, the next pick screen is a new game's: rounds last 3 to 4.5 minutes, plus the buy phase. */
const NEW_GAME_GAP_MS = 8 * 60_000;
const MAX_ROUNDS = 5;

export interface RoundState {
  /** 1-5, or null before the first pick screen */
  round: number | null;
  /** When the pick screen was last seen open (ms), or null */
  lastOpenAt: number | null;
  /** Changes when a new game starts: what was read during the last game (items owned) no longer applies */
  game: number;
}

export const NO_ROUND: RoundState = { round: null, lastOpenAt: null, game: 0 };

/**
 * The rounds a pick screen can belong to, from its choice number and a normal (not rare) card's tier:
 * `roundTiers[round - 1][choice - 1]` is the normal tier of that pick (streetBrawl.json › draftRoundTiers). A normal
 * tier 1 card on the first pick only comes in round 1. Empty when it says nothing.
 */
export function possibleRounds(roundTiers: number[][], choice: number | null, normalTiers: number[]): number[] {
  if (choice === null || normalTiers.length === 0 || roundTiers.length === 0) return [];
  const rounds: number[] = [];
  roundTiers.forEach((picks, i) => {
    if (normalTiers.every((t) => picks[choice - 1] === t)) rounds.push(i + 1);
  });
  return rounds;
}

/**
 * The state after a scan: `open` is whether the pick screen shows, `now` the time of the scan (ms), `possible` the
 * rounds its cards allow (possibleRounds; empty = no constraint).
 */
export function observeRound(state: RoundState, open: boolean, now: number, possible: number[] = []): RoundState {
  if (!open) return state;
  const newGame = { round: 1, lastOpenAt: now, game: state.game + 1 };
  let next: RoundState;
  if (state.round === null || state.lastOpenAt === null || now - state.lastOpenAt >= NEW_GAME_GAP_MS) {
    next = newGame;
  } else if (now - state.lastOpenAt >= ROUND_GAP_MS) {
    // A new pick phase: the next round, or a new game after the last one
    next = state.round >= MAX_ROUNDS ? newGame : { ...state, round: state.round + 1, lastOpenAt: now };
  } else {
    next = { ...state, lastOpenAt: now };
  }
  // The cards know better than the count (the tab opened mid-game, a pick phase missed, a new game queued quickly)
  if (possible.length > 0 && !possible.includes(next.round!)) {
    const closest = possible.reduce((a, b) => (Math.abs(b - next.round!) < Math.abs(a - next.round!) ? b : a));
    // Back to round 1: a new game (a game opens with round 1's pick screen). Any other correction keeps the game: the
    // count can also run ahead within one (the pick screen left for over a minute)
    next =
      closest === 1 && next.round! > 1
        ? { round: 1, lastOpenAt: now, game: next.game + 1 }
        : { ...next, round: closest };
  }
  return next;
}

/**
 * The tiers the game can still offer from `round` on (this round included): each pick's normal tier and its rare tier,
 * one up. An upgrade of another tier can no longer come. undefined when the round or the table is unknown.
 */
export function tiersStillToCome(roundTiers: number[][], round: number | null): Set<number> | undefined {
  if (round === null || roundTiers.length === 0) return undefined;
  return new Set(roundTiers.slice(round - 1).flatMap((picks) => picks.flatMap((t) => [t, t + 1])));
}

/** The normal tiers of the round's picks after pick `choice` (for the re-roll), undefined when unknown. */
export function nextPickTiers(roundTiers: number[][], round: number | null, choice: number | null): number[] | undefined {
  if (round === null || choice === null) return undefined;
  return roundTiers[round - 1]?.slice(choice);
}

/** The end-of-game screen was seen: no round until the next game's first pick screen, a new game from now on. */
export function endGame(state: RoundState): RoundState {
  return state.round === null ? state : { round: null, lastOpenAt: null, game: state.game + 1 };
}

/** The player's correction (the app was started mid-game, a pick screen was missed). */
export function shiftRound(state: RoundState, by: 1 | -1): RoundState {
  const round = Math.max(1, Math.min(MAX_ROUNDS, (state.round ?? 0) + by));
  return { ...state, round };
}
