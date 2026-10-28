// Where to put the ability points in Street Brawl, round by round, for the hero (streetBrawl.json › abilityPlan).
// Only the round to play now is spelled out; the others are folded to their ability icons, in order.
import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { getHeroesDb } from '../data/deadlockData';
import { PowerIcon } from '../components/DeadlockIcons';
import type { Lang } from '../i18n/lang';
import type { AbilityPlanStep } from './stats';
import { planByRound } from './abilityRounds';
import { shortName } from './items';
import { BONE } from './style';
import { streetBrawlText } from './i18n';

/** Points the plan marks as "close": the runner-up is within this much win rate. */
const CLOSE_RUNNER_UP = 0.01;

export const AbilityPlan: React.FC<{
  heroId: string;
  lang: Lang;
  plan: AbilityPlanStep[] | undefined;
  /** 1-5, or null before the first pick screen (round 1 is shown then) */
  currentRound: number | null;
  onCorrectRound: (by: 1 | -1) => void;
}> = ({ heroId, lang, plan, currentRound, onCorrectRound }) => {
  const text = streetBrawlText(lang);
  const hero = getHeroesDb(lang).find((h) => h.id === heroId);
  const details = hero?.builds[0]?.abilitiesDetails ?? [];
  const name = (key: string) => {
    const full = details.find((d) => d.key === key)?.name;
    return full ? shortName(full) : key;
  };
  // No plan for this hero (or data from before the plan existed): nothing to show
  if (!plan || plan.length === 0) return null;
  const rounds = planByRound(plan);
  const shownRound = currentRound ?? rounds[0]?.round;
  const nothingThisRound = currentRound !== null && !rounds.some((r) => r.round === currentRound);

  return (
    <section className="space-y-2 pt-3 border-t border-white/10">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-small font-extrabold uppercase tracking-[0.12em] text-stone-400" title={text.pointsIntro}>
          {text.pointsTitle}
        </h3>
        <div className="flex items-center gap-1 text-small text-stone-400">
          <span>{currentRound === null ? text.roundUnknown : text.roundNow(currentRound)}</span>
          <button
            onClick={() => onCorrectRound(-1)}
            title={text.roundEarlier}
            aria-label={text.roundEarlier}
            className="p-1 rounded text-stone-300 hover:bg-white/10"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={() => onCorrectRound(1)}
            title={text.roundLater}
            aria-label={text.roundLater}
            className="p-1 rounded text-stone-300 hover:bg-white/10"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>
      {nothingThisRound && <p className="text-small font-bold text-amber-200">{text.nothingThisRound}</p>}

      <div className="space-y-1">
        {rounds.map(({ round, steps }) => {
          if (round !== shownRound) {
            // Folded: the round's upgrades as icons, in order (dimmer once played)
            const done = currentRound !== null && round < currentRound;
            return (
              <div key={round} className={`flex items-center gap-2 px-2 py-0.5 ${done ? 'opacity-40' : 'opacity-75'}`}>
                <span className="w-16 shrink-0 text-small uppercase tracking-[0.1em] text-stone-500">{text.round(round)}</span>
                {done && <span className="text-small text-stone-600">{text.done}</span>}
                {steps.map(({ n, step }) => (
                  <PowerIcon key={n} heroId={heroId} abilityKey={step.ability} abilityName={name(step.ability)} size={20} />
                ))}
              </div>
            );
          }
          return (
            <div key={round} className="rounded-xl bg-[#ede3cc]/[0.05] border border-[#ede3cc]/25 p-2.5">
              <p className={`mb-1.5 text-small font-extrabold uppercase tracking-[0.12em] ${BONE}`}>
                {text.round(round)} <span className="font-normal normal-case tracking-normal text-stone-400">· {text.upgrades(steps.length)}</span>
              </p>
              <ol className="space-y-1">
                {steps.map(({ n, step }) => (
                  <li key={n} className="flex items-center gap-2 text-body">
                    <span className="w-5 shrink-0 text-small text-stone-500">{n}.</span>
                    <PowerIcon heroId={heroId} abilityKey={step.ability} abilityName={name(step.ability)} size={28} />
                    <span className={`font-bold ${BONE}`}>{name(step.ability)}</span>
                    <span className="text-small text-stone-500">
                      {step.mostCommon ? text.mostCommon : `${(step.winRate * 100).toFixed(1)}% · ${step.games.toLocaleString()}`}
                    </span>
                    {step.runnerUp && step.winRate - step.runnerUp.winRate < CLOSE_RUNNER_UP && (
                      <span className="text-small text-stone-500">
                        {text.runnerUp(name(step.runnerUp.ability), `${(step.runnerUp.winRate * 100).toFixed(1)}%`)}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
};
