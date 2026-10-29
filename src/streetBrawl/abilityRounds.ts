// Splits the ability plan into the rounds' buy phases, from when each step usually comes. Pure.
import type { AbilityPlanStep } from './stats';

/**
 * Game clock (seconds) where each round's buy phase ends and the next one's has not started. Upgrades are bought at
 * the start of a round, so the plans' step times cluster: over all 44 heroes, 41-74 s, 238-277 s, 396-463 s,
 * 548-686 s and 815-917 s. These are the gaps between the clusters.
 */
const ROUND_SPLITS = [150, 340, 520, 750];

export interface PlanRound {
  /** 1-5 */
  round: number;
  /** The steps to take in this round's buy phase, in order, with their number in the whole plan (1-based) */
  steps: { n: number; step: AbilityPlanStep }[];
}

const roundAt = (timeS: number) => 1 + ROUND_SPLITS.filter((split) => timeS >= split).length;

/**
 * Each step's round is the one its usual time falls in, but no later than the next step's: the times are averages
 * over the players who reached each step, so a step can look later than the one after it (Lash: 3rd step 243 s,
 * 4th 60 s). The next step being taken in round 1 means this one was too.
 */
export function planByRound(plan: AbilityPlanStep[]): PlanRound[] {
  const rounds = plan.map((step) => roundAt(step.timeS));
  for (let i = rounds.length - 2; i >= 0; i--) rounds[i] = Math.min(rounds[i], rounds[i + 1]);

  const byRound: PlanRound[] = [];
  plan.forEach((step, i) => {
    const last = byRound[byRound.length - 1];
    if (last?.round === rounds[i]) last.steps.push({ n: i + 1, step });
    else byRound.push({ round: rounds[i], steps: [{ n: i + 1, step }] });
  });
  return byRound;
}
