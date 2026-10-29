// The Street Brawl tab: reads the screen about twice a second (pick screen, HUD item slots, end of game) and ranks the
// offered cards for the hero. Self-contained: its own capture loop (the normal-mode scan is paused while the tab is
// open, see App.tsx), its own texts and data. It only reads the game data and icon components of the app.
import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Info, Shuffle } from 'lucide-react';
import { grabGameFrame, releaseGameFrame } from '../services/screenCapture';
import { effectiveOwnedSet } from '../services/recommendations';
import type { Lang } from '../i18n/lang';
import { framePixels } from './capture';
import { holdCoveredCards, normalCardTiers, readPickScreen, titleShare } from './pickScreen';
import { OPEN_GATE, passReading } from './readingGate';
import type { GateState } from './readingGate';
import type { PickScreenReading } from './pickScreen';
import type { CardPosition } from './layout';
import { rankOffers } from './ranking';
import type { PickAdvice } from './ranking';
import { draftRoundTiers, getStreetBrawlHeroStats, streetBrawlDataInfo } from './stats';
import { itemInfo, itemName, tierOf } from './items';
import { AbilityPlan } from './AbilityPlan';
import { Medallion, OfferCard } from './OfferCard';
import { BONE, MAGENTA } from './style';
import { getAbilityTemplates, getEndScreenTemplates, getItemTemplates, resetItemTemplates } from './templates';
import { isEndScreen } from './endScreen';
import { loadStreetBrawlData } from './dataSource';
import { readHero } from './heroReader';
import { NO_ROUND, endGame, nextPickTiers, observeRound, possibleRounds, shiftRound, tiersStillToCome } from './roundTracker';
import type { RoundState } from './roundTracker';
import { noItemsOwned, observeSlots, ownedItems, readInventory } from './inventory';
import type { OwnedState } from './inventory';
import { streetBrawlText } from './i18n';

const SCAN_INTERVAL_MS = 500;
/** The cards as the game lays them out, left to right. */
const CARD_ORDER: CardPosition[] = ['left', 'center', 'right'];

/** Same hero read on this many pick screen scans in a row before the app's hero is changed. */
const HERO_CONFIRM_SCANS = 3;

/** One line of what a pick screen scan read, for the diagnostics line. */
function describeReading(reading: PickScreenReading, hero: ReturnType<typeof readHero> | null): string {
  const cards = reading.cards
    .map((c) => `${c.itemId ?? '?'} ${c.distance.toFixed(2)}/${c.secondDistance.toFixed(2)}`)
    .join(', ');
  const heroPart = hero ? `${hero.heroId ?? '?'} ${hero.distance.toFixed(2)}/+${hero.margin.toFixed(2)}` : '?';
  return ` · ${cards} · hero ${heroPart}`;
}

type PanelProps = {
  heroId: string;
  heroName: string;
  lang: Lang;
  sourceId: string;
  /** The hero read from the ability icons, once confirmed: the app selects it */
  onHeroDetected: (heroId: string) => void;
};

const Panel: React.FC<PanelProps> = ({ heroId, heroName, lang, sourceId, onHeroDetected }) => {
  const text = streetBrawlText(lang);
  const onHeroDetectedRef = useRef(onHeroDetected);
  onHeroDetectedRef.current = onHeroDetected;
  const heroVoteRef = useRef<{ heroId: string | null; scans: number }>({ heroId: null, scans: 0 });

  /** Bumped when newer data was downloaded: the statistics and the scan loop are re-read */
  const [dataVersion, setDataVersion] = useState(0);
  useEffect(() => {
    loadStreetBrawlData().then((changed) => {
      if (!changed) return;
      resetItemTemplates();
      setDataVersion((v) => v + 1);
    });
  }, []);
  const stats = getStreetBrawlHeroStats(heroId, tierOf);

  const [advice, setAdvice] = useState<PickAdvice | null>(null);
  const [pick, setPick] = useState<{ choice: 1 | 2 | 3 | null; rerolls: 0 | 1 | 2 | null } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  /** The end-of-game screen was seen, and no pick screen since */
  const [gameOver, setGameOver] = useState(false);
  const [notWide, setNotWide] = useState(false);
  /** What the last scan saw, for the diagnostics line at the bottom */
  const [debug, setDebug] = useState('starting…');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busyRef = useRef(false);
  /** The last pick screen reading: what a tooltip covers on the next scans is taken from it (holdCoveredCards) */
  const lastReadingRef = useRef<PickScreenReading | null>(null);
  /** Which readings may replace the advice shown, and which pick it is for (readingGate.ts) */
  const gateRef = useRef<GateState>(OPEN_GATE);

  /** The game's round, counted from the pick screens (roundTracker.ts); the ref is what the scans update */
  const roundRef = useRef<RoundState>(NO_ROUND);
  const [round, setRound] = useState<RoundState>(NO_ROUND);
  const correctRound = (by: 1 | -1) => {
    roundRef.current = shiftRound(roundRef.current, by);
    setRound(roundRef.current);
  };

  /** The items owned this game, read in the HUD's slots (inventory.ts) */
  const ownedRef = useRef<OwnedState>(noItemsOwned());
  const [owned, setOwned] = useState<string[]>([]);
  const forgetItems = () => {
    ownedRef.current = noItemsOwned();
    setOwned([]);
  };
  // Another hero: another game, its items are not these
  useEffect(forgetItems, [heroId]);

  useEffect(() => {
    canvasRef.current ??= document.createElement('canvas');
    let stopped = false;
    const scan = async () => {
      if (busyRef.current || !window.electronAPI) return;
      busyRef.current = true;
      try {
        const [templates, abilityTemplates, endScreenTemplates, frame] = await Promise.all([
          getItemTemplates(),
          getAbilityTemplates(),
          getEndScreenTemplates(),
          grabGameFrame(sourceId),
        ]);
        if (!frame) {
          setDebug(`no frame captured · ${templates.length} icons`);
          return;
        }
        if (stopped) {
          releaseGameFrame(frame);
          return;
        }
        const size = typeof frame.image === 'string' ? 'thumbnail' : `${frame.image.width}x${frame.image.height}`;
        let pixels: Awaited<ReturnType<typeof framePixels>>;
        try {
          pixels = await framePixels(frame.image, canvasRef.current!);
        } finally {
          releaseGameFrame(frame);
        }
        setNotWide(pixels === 'not-wide');
        const source = `${frame.sourceName}${frame.isDeadlockWindow ? '' : ' (not the Deadlock window)'} · ${size}`;
        if (!pixels || pixels === 'not-wide') {
          setDebug(`${source} · ${pixels === 'not-wide' ? 'not 16:9' : 'no pixels'}`);
          return;
        }

        // 1. The end-of-game screen: nothing of the game applies to the next one
        if (endScreenTemplates && isEndScreen(pixels, endScreenTemplates)) {
          roundRef.current = endGame(roundRef.current);
          setRound(roundRef.current);
          forgetItems();
          setAdvice(null);
          gateRef.current = OPEN_GATE;
          setPick(null);
          setIsOpen(false);
          setGameOver(true);
          setDebug(`${source} · end of game`);
          return;
        }

        // 2. The pick screen, and the hero from its ability icons (in play, cooldowns cover them)
        const reading = holdCoveredCards(lastReadingRef.current, readPickScreen(pixels, templates, tierOf));
        lastReadingRef.current = reading.open ? reading : null;
        const hero = reading.open ? readHero(pixels, abilityTemplates) : null;
        if (hero?.heroId) {
          const vote = heroVoteRef.current;
          heroVoteRef.current = { heroId: hero.heroId, scans: vote.heroId === hero.heroId ? vote.scans + 1 : 1 };
          if (heroVoteRef.current.scans >= HERO_CONFIRM_SCANS && hero.heroId !== heroId) {
            onHeroDetectedRef.current(hero.heroId);
          }
        }
        setDebug(
          `${source} · ${templates.length} icons · title ${titleShare(pixels).toFixed(2)} (open ≥ 0.30)` +
            (reading.open ? describeReading(reading, hero) : '')
        );
        setIsOpen(reading.open);
        if (reading.open) setGameOver(false);

        // 3. The round: counted from the pick screens, corrected by the cards' tiers (a round 1 card: a new game)
        const previousGame = roundRef.current.game;
        const possible = reading.open
          ? possibleRounds(draftRoundTiers(), reading.choice, normalCardTiers(reading.cards, tierOf))
          : [];
        roundRef.current = observeRound(roundRef.current, reading.open, Date.now(), possible);
        setRound(roundRef.current);
        if (roundRef.current.game !== previousGame) forgetItems();

        // 4. The HUD's item slots: in play, and under the pick screen too (still there, nothing moves over them)
        ownedRef.current = observeSlots(ownedRef.current, readInventory(pixels, templates, itemInfo));
        const ownedNow = ownedItems(ownedRef.current);
        setOwned((prev) => (prev.join() === ownedNow.join() ? prev : ownedNow));

        // 5. The cards, ranked (the last pick screen stays shown, dimmed, once the round starts)
        if (!reading.open) return;
        setPick({ choice: reading.choice, rerolls: reading.rerolls });
        const currentRound = roundRef.current.round;
        const pickKey = `${roundRef.current.game}:${currentRound}:${reading.choice}`;
        if (!stats) return;
        // Only steady, complete readings replace the advice (readingGate.ts): not the cards animating in or away
        const gate = passReading(gateRef.current, pickKey, reading.cards);
        gateRef.current = gate.state;
        if (gate.decision === 'clear') setAdvice(null);
        if (gate.decision !== 'accept') return;
        setAdvice(
          rankOffers(
            reading.cards,
            stats,
            {
              rerolls: reading.rerolls,
              choice: reading.choice,
              owned: effectiveOwnedSet(ownedNow),
              laterTiers: tiersStillToCome(draftRoundTiers(), currentRound),
              nextPickTiers: nextPickTiers(draftRoundTiers(), currentRound, reading.choice),
            },
            tierOf
          )
        );
      } catch (err) {
        console.warn('Street Brawl :', err);
        setDebug(`error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        busyRef.current = false;
      }
    };
    scan();
    const timer = setInterval(scan, SCAN_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [sourceId, heroId, dataVersion]);

  const info = streetBrawlDataInfo();
  const muted = !isOpen || Boolean(advice?.suggestReroll);
  const name = (id: string) => itemName(id, lang);

  // The verdict: what to do with this pick, in one line, and why underneath
  let verdict: string;
  let verdictWhy: string | null = null;
  if (gameOver) verdict = text.gameOver;
  else if (!advice || advice.ranked.length === 0) verdict = isOpen ? text.readingCards : text.waiting;
  else if (advice.suggestReroll) {
    verdict = text.verdictReroll;
    verdictWhy = text.rerollWhy(advice.ranked[0]?.score ?? 0, advice.rerollWorth ?? 0, lang);
  } else if (advice.closeCall) {
    verdict = text.verdictClose(name(advice.ranked[0].itemId), name(advice.ranked[1].itemId));
    verdictWhy = text.closeWhy;
  } else verdict = text.verdictTake(name(advice.ranked[0].itemId));

  return (
    <div className="rounded-2xl bg-[#12100d] border border-white/10 p-4 space-y-4">
      {/* The pick: where the game is, the verdict, the three cards as the game lays them out */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap text-small">
          <span className={`font-extrabold uppercase tracking-[0.12em] ${MAGENTA}`}>
            {[round.round !== null ? text.round(round.round) : null, pick ? text.status(pick.choice, pick.rerolls) : null]
              .filter(Boolean)
              .join(' · ') || text.title}
          </span>
          <span className="flex items-center gap-1 text-stone-400">
            <Shuffle className="w-3.5 h-3.5" aria-hidden />
            {heroName}
          </span>
        </div>

        {notWide && <p className="text-body text-red-300">{text.notWide}</p>}
        {!stats && <p className="text-body text-red-300">{text.noHeroData}</p>}

        <div aria-live="polite">
          {!isOpen && advice && !gameOver && (
            <p className="text-small uppercase tracking-[0.12em] text-stone-500">{text.lastPick}</p>
          )}
          <h2
            className={`font-display text-heading font-extrabold ${
              advice && !gameOver ? BONE : 'text-stone-400'
            } ${!isOpen && advice ? 'opacity-60' : ''}`}
          >
            {verdict}
          </h2>
          {verdictWhy && <p className="text-small text-stone-400 mt-0.5">{verdictWhy}</p>}
        </div>

        {advice && stats && !gameOver && (
          <div className="grid grid-cols-3 gap-2 items-stretch">
            {CARD_ORDER.map((position) => {
              const idx = advice.ranked.findIndex((r) => r.card.position === position);
              if (idx < 0) {
                return (
                  <div
                    key={position}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-white/15 px-2 py-2 text-small text-stone-500 opacity-70"
                  >
                    <span className="uppercase tracking-[0.14em]">{text.position[position]}</span>
                    <span className="w-14 h-14 rounded-full border-2 border-dashed border-white/20" />
                    <span>{text.unreadable}</span>
                  </div>
                );
              }
              return (
                <OfferCard
                  key={position}
                  ranked={advice.ranked[idx]}
                  rank={idx + 1}
                  offer={advice.ranked}
                  isPick={idx === 0 && !advice.suggestReroll}
                  alsoFine={idx === 1 && advice.closeCall && !advice.suggestReroll}
                  muted={muted}
                  stats={stats}
                  owned={owned}
                  heroId={heroId}
                  heroName={heroName}
                  lang={lang}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* What the player has: the items read in the HUD, as its slots show them */}
      {owned.length > 0 && (
        <section className="flex items-center gap-2 flex-wrap">
          <span className="text-small uppercase tracking-[0.12em] text-stone-500">{text.yourItems}</span>
          {owned.map((id) => (
            <span key={id} title={name(id)}>
              <Medallion itemId={id} size={28} />
            </span>
          ))}
        </section>
      )}

      {stats && (
        <AbilityPlan
          heroId={heroId}
          lang={lang}
          plan={stats.abilityPlan}
          currentRound={round.round}
          onCorrectRound={correctRound}
        />
      )}

      {/* How the tab works, where its data comes from, what the last scan read */}
      <details className="group text-small text-stone-500">
        <summary className="cursor-pointer select-none flex items-center gap-1 hover:text-stone-300">
          <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" aria-hidden />
          {text.details}
        </summary>
        <div className="mt-2 space-y-1 pl-4">
          <p>{text.intro}</p>
          <p>{text.heroHint(heroName)}</p>
          <p className="flex gap-1">
            <Info className="w-3 h-3 shrink-0 mt-px" aria-hidden />
            <span>{text.dataInfo(info.windowDays, info.generatedAt.slice(0, 10))}</span>
          </p>
          <p className="font-mono break-all select-text text-stone-600">{debug}</p>
        </div>
      </details>
    </div>
  );
};

/**
 * The tab, inside its own error boundary: a failure in it shows its message here instead of taking the whole window
 * down (the error can then be reported). The tab starts afresh on the next hero or tab change.
 */
class TabBoundary extends React.Component<{ lang: Lang; children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Street Brawl tab:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const text = streetBrawlText(this.props.lang);
    return (
      <div className="rounded-2xl bg-[#12100d] border border-red-500/40 p-4 space-y-2 text-small">
        <p className="text-body font-bold text-red-300">{text.crashed}</p>
        <p className="font-mono break-all select-text text-stone-400">{this.state.error.message}</p>
        <button
          onClick={() => this.setState({ error: null })}
          className="px-2 py-1 rounded border border-white/15 text-stone-200 hover:bg-white/10"
        >
          {text.retry}
        </button>
      </div>
    );
  }
}

export const StreetBrawlPanel: React.FC<PanelProps> = (props) => (
  <TabBoundary key={props.heroId} lang={props.lang}>
    <Panel {...props} />
  </TabBoundary>
);
