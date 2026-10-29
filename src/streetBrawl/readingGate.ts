// Which pick screen readings may replace the advice shown. The cards animate in, and away after a pick: on those
// scans some cards are not read and others are misread (the centre card once read as an enhanced Titanic Magazine
// for a moment), and the advice was then rebuilt from them. Pure.
import type { CardReading } from './pickScreen';

export interface GateState {
  /** The reading seen on the last scan (pick and cards), to tell a steady reading from a passing one */
  lastSeen: string | null;
  /** The pick the advice shown is for, and how many of its cards were read */
  shown: { pick: string; cards: number } | null;
}

export const OPEN_GATE: GateState = { lastSeen: null, shown: null };

export type GateDecision =
  /** Show advice from this reading */
  | 'accept'
  /** Keep the advice shown */
  | 'keep'
  /** A new pick whose cards cannot be read yet: drop the last pick's advice ("Reading the cards…") */
  | 'clear';

/**
 * `pick` identifies the pick (game, round, choice). A reading is accepted only when:
 * - the previous scan read the same cards (a card flying away or flipping in does not stay put for two scans);
 * - and, within the pick already shown, it reads at least as many cards (the cards leaving after the player's pick
 *   read fewer; a re-roll's new cards read as many).
 * A scan that reads no card keeps the advice within its pick, and clears it on another pick.
 */
export function passReading(state: GateState, pick: string, cards: CardReading[]): { state: GateState; decision: GateDecision } {
  const read = cards.filter((c) => c.itemId !== null).length;
  const seen = `${pick}|${cards.map((c) => `${c.position}:${c.itemId ?? '-'}:${c.enhanced ? 'e' : ''}`).join(',')}`;
  const steady = state.lastSeen === seen;
  const next = { ...state, lastSeen: seen };
  if (read === 0) {
    return state.shown?.pick === pick ? { state: next, decision: 'keep' } : { state: { ...next, shown: null }, decision: 'clear' };
  }
  if (!steady) return { state: next, decision: 'keep' };
  if (state.shown?.pick === pick && read < state.shown.cards) return { state: next, decision: 'keep' };
  return { state: { ...next, shown: { pick, cards: read } }, decision: 'accept' };
}
