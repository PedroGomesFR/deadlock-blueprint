/**
 * "What to do now": a few orders from what the scanner sees right now (who is dead on each side of the top bar, in
 * which lane, my souls) and from my hero's real matchups. Pure: App.tsx words them in the interface language.
 *
 * The scanner sees no map: no positions, health or objectives. The orders are therefore only about the players alive
 * on each side, by lane pair of the top bar (slots 0-1 York, 2-3 Broadway, 4-5 Orchard), the match clock and the
 * souls of each team (top bar). Whether the Mid Boss is alive is not seen either: it is up from the start of the match
 * (patch of 22 May 2026) and comes back 7, then 6, then 5 min after each kill, which the player marks by hand.
 */
import type { MatchupStance } from '../data/matchupStats';
import type { TeamBoard } from './matchTracker';

export type NowAdvice =
  | { kind: 'dead'; itemId?: string; missing?: number } // I am dead: my next purchase (missing souls, 0 = affordable)
  | { kind: 'buy'; itemId: string }
  | { kind: 'safe'; alliesDead: number; enemiesDead: number }
  | { kind: 'push'; alliesDead: number; enemiesDead: number }
  | { kind: 'midBoss'; alliesDead: number; enemiesDead: number; soulLead?: number }
  | { kind: 'soulsBehind'; diff: number } // thousands of souls
  | { kind: 'soulsAhead'; diff: number }
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
  clockS?: number; // match clock now (top bar), unknown when not read
  midBossAlive: boolean; // not marked killed, or back since
}

// A numbers advantage worth a push (or a retreat): at least 3 dead on one side, 2 more than on the other
const NUMBERS_MIN_DEAD = 3;
const NUMBERS_MIN_GAP = 2;
// First guesses, no guide gives numbers: no Mid Boss call during the laning phase (unknown clock: none either); a
// soul lead of 12 % (at least 4k) counts as an advantage, and with 2 more enemies dead than allies calls the Mid Boss
const MID_BOSS_MIN_CLOCK_S = 10 * 60;
const SOUL_LEAD_SHARE = 0.12;
const SOUL_LEAD_MIN = 4;

// Most urgent first; the list is cut to the first few
const PRIORITY: Record<NowAdvice['kind'], number> = {
  dead: 100,
  safe: 90,
  buy: 80,
  midBoss: 75,
  push: 70,
  partnerDead: 65,
  pushLane: 60,
  help: 55,
  soulsBehind: 52,
  soulsAhead: 45,
  focus: 40,
  farm: 35,
  avoid: 30,
};

/** Mid Boss kills marked by the player this match (wall clock: Date.now()). */
export interface MidBossState {
  kills: number;
  lastKillAt: number;
  previous?: MidBossState; // before the last kill marked (undo)
}

// Back 7 min after its first death, 6 after its second, 5 after the third and later ones (deadlock.wiki, 2026)
const MID_BOSS_RESPAWN_MIN = [7, 6, 5];

/** When the Mid Boss is back (Date.now() time), null when it was never marked killed. */
export function midBossBackAt(state: MidBossState | null): number | null {
  if (!state || state.kills <= 0) return null;
  return state.lastKillAt + MID_BOSS_RESPAWN_MIN[Math.min(state.kills, MID_BOSS_RESPAWN_MIN.length) - 1] * 60_000;
}

/** My team's soul lead in thousands (negative: behind), when it is large enough to matter. */
function soulLead(souls: TeamBoard['souls']): number | undefined {
  if (!souls) return undefined;
  const diff = souls.ally - souls.enemy;
  return Math.abs(diff) >= Math.max(SOUL_LEAD_MIN, Math.max(souls.ally, souls.enemy) * SOUL_LEAD_SHARE) ? diff : undefined;
}

export function getNowAdvice(
  { board, nextItem, souls, enemies, clockS, midBossAlive }: NowInput,
  max = 3
): NowAdvice[] {
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
    const lead = soulLead(board.souls);
    const midBossTime = midBossAlive && clockS !== undefined && clockS >= MID_BOSS_MIN_CLOCK_S;
    const numbersAhead = enemiesDead >= NUMBERS_MIN_DEAD && enemiesDead - alliesDead >= NUMBERS_MIN_GAP;
    const leadAhead = lead !== undefined && lead > 0 && enemiesDead >= 2 && enemiesDead - alliesDead >= NUMBERS_MIN_GAP;
    let numbers = false;
    if (alliesDead >= NUMBERS_MIN_DEAD && alliesDead - enemiesDead >= NUMBERS_MIN_GAP) {
      out.push({ kind: 'safe', alliesDead, enemiesDead });
      numbers = true;
    } else if (midBossTime && (numbersAhead || leadAhead)) {
      out.push({ kind: 'midBoss', alliesDead, enemiesDead, soulLead: lead !== undefined && lead > 0 ? lead : undefined });
      numbers = true;
    } else if (numbersAhead) {
      out.push({ kind: 'push', alliesDead, enemiesDead });
      numbers = true;
    }
    if (lead !== undefined && lead < 0 && !out.some((a) => a.kind === 'safe')) {
      out.push({ kind: 'soulsBehind', diff: -lead });
    } else if (lead !== undefined && lead > 0 && !numbers) {
      out.push({ kind: 'soulsAhead', diff: lead });
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
