/**
 * "What to do now": a few orders from what the scanner sees right now (who is dead on each side of the top bar, in
 * which lane, my souls) and from my hero's real matchups. Pure: App.tsx words them in the interface language.
 *
 * The scanner sees no map: no positions, health, objectives or match clock. The orders are therefore only about the
 * players alive on each side, by lane pair of the top bar (slots 0-1 York, 2-3 Broadway, 4-5 Orchard).
 */
import type { MatchupStance } from '../data/matchupStats';
import type { TeamBoard } from './matchTracker';

export type NowAdvice =
  | { kind: 'dead'; itemId?: string; missing?: number } // I am dead: my next purchase (missing souls, 0 = affordable)
  | { kind: 'buy'; itemId: string }
  | { kind: 'safe'; alliesDead: number; enemiesDead: number }
  | { kind: 'push'; alliesDead: number; enemiesDead: number }
  | { kind: 'partnerDead'; partnerId: string }
  | { kind: 'pushLane'; enemyIds: string[] }
  | { kind: 'help'; lanePair: number; allyId: string; enemyIds: string[] }
  | { kind: 'focus'; enemyId: string; fed: boolean; winRate?: number }
  | { kind: 'avoid'; enemyIds: string[] }
  | { kind: 'farm'; itemId: string; missing: number };

export interface NowEnemy {
  id: string;
  stance?: MatchupStance; // my real matchup against them (absent from older data files)
  diff?: number; // my win rate against them minus my usual one
  winRate?: number;
  isFed: boolean;
}

export interface NowInput {
  board: TeamBoard | null; // null: top bar not seen lately (shop, menus), nobody is known dead
  nextItem?: { id: string; cost: number }; // #1 of "Buy right now"
  souls: number | null;
  enemies: NowEnemy[];
}

// A numbers advantage worth a push (or a retreat): at least 3 dead on one side, 2 more than on the other
const NUMBERS_MIN_DEAD = 3;
const NUMBERS_MIN_GAP = 2;

// Most urgent first; the list is cut to the first few
const PRIORITY: Record<NowAdvice['kind'], number> = {
  dead: 100,
  safe: 90,
  buy: 80,
  push: 70,
  partnerDead: 65,
  pushLane: 60,
  help: 55,
  focus: 40,
  farm: 35,
  avoid: 30,
};

export function getNowAdvice({ board, nextItem, souls, enemies }: NowInput, max = 3): NowAdvice[] {
  const out: NowAdvice[] = [];
  const missing = nextItem && souls !== null ? Math.max(0, nextItem.cost - souls) : undefined;
  const me = board && board.mySlot >= 0 ? board.allies[board.mySlot] : undefined;
  const iAmDead = me?.dead ?? false;

  if (iAmDead) out.push({ kind: 'dead', itemId: nextItem?.id, missing });
  else if (nextItem && missing === 0) out.push({ kind: 'buy', itemId: nextItem.id });
  else if (nextItem && missing !== undefined) out.push({ kind: 'farm', itemId: nextItem.id, missing });

  if (board && !iAmDead) {
    const alliesDead = board.allies.filter((s) => s.dead).length;
    const enemiesDead = board.enemies.filter((s) => s.dead).length;
    let numbers = false;
    if (alliesDead >= NUMBERS_MIN_DEAD && alliesDead - enemiesDead >= NUMBERS_MIN_GAP) {
      out.push({ kind: 'safe', alliesDead, enemiesDead });
      numbers = true;
    } else if (enemiesDead >= NUMBERS_MIN_DEAD && enemiesDead - alliesDead >= NUMBERS_MIN_GAP) {
      out.push({ kind: 'push', alliesDead, enemiesDead });
      numbers = true;
    }

    if (me && !numbers) {
      const pair = Math.floor(board.mySlot / 2);
      const partner = board.allies[board.mySlot ^ 1];
      const opponents = board.enemies.slice(pair * 2, pair * 2 + 2).filter((s) => s.heroId);
      const aliveOpponents = opponents.filter((s) => !s.dead).length;
      if (opponents.length > 0 && aliveOpponents === 0) {
        out.push({ kind: 'pushLane', enemyIds: opponents.map((s) => s.heroId!) });
      } else if (partner?.heroId && partner.dead && aliveOpponents >= 2) {
        out.push({ kind: 'partnerDead', partnerId: partner.heroId });
      }
      // Leave my lane only when nobody is left alone there: an ally alone against two in another lane needs help
      const myLaneCovered = aliveOpponents === 0 || (aliveOpponents === 1 && !partner?.dead);
      if (myLaneCovered) {
        for (let p = 0; p < 3; p++) {
          if (p === pair) continue;
          const allies = board.allies.slice(p * 2, p * 2 + 2);
          const foes = board.enemies.slice(p * 2, p * 2 + 2);
          const alone = allies.filter((s) => s.heroId && !s.dead);
          const deadAllies = allies.filter((s) => s.heroId && s.dead);
          if (alone.length === 1 && deadAllies.length === 1 && foes.every((s) => s.heroId && !s.dead)) {
            out.push({ kind: 'help', lanePair: p, allyId: alone[0].heroId!, enemyIds: foes.map((s) => s.heroId!) });
            break;
          }
        }
      }
    }
  }

  // Who to hit: a fed enemy first (in teamfights), otherwise my best matchup; only among the enemies alive
  const dead = new Set(board ? board.enemies.filter((s) => s.dead && s.heroId).map((s) => s.heroId!) : []);
  const alive = enemies.filter((e) => !dead.has(e.id));
  const target =
    alive.find((e) => e.isFed) ??
    alive.filter((e) => e.stance === 'focus').sort((a, b) => (b.diff ?? 0) - (a.diff ?? 0))[0];
  if (target) {
    out.push({ kind: 'focus', enemyId: target.id, fed: target.isFed, winRate: target.isFed ? undefined : target.winRate });
  }
  const avoid = alive.filter((e) => e.id !== target?.id && (e.isFed || e.stance === 'avoid')).map((e) => e.id);
  if (avoid.length > 0) out.push({ kind: 'avoid', enemyIds: avoid });

  return out.sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind]).slice(0, max);
}
