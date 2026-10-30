# Item investment (normal mode)

Owned items in one shop category (weapon, vitality, spirit) give a bonus at fixed soul thresholds: 800, 1,600,
2,400, 3,200, 4,800, 6,400 and up. The jump at **4,800** is the largest one in every category. Good builds take
one category to 4,800, then the next, then the last, and the buy tab follows that.

## What the app shows

- **Spike line** above the buy cards: the three categories in the build's spike order, the souls in each
  (✓ at 4,800), and when players usually have that many spikes, as a range from rank 81+ to rank 1-40
  ("by 10–12 min"). It turns amber only once the match clock is past the slower median and the spike is still inside
  its window (below): comparing everyone to rank 81+ alone flagged half of the high-rank players themselves. The
  overlay shows the next spike only, with a short pace line.
- **"Reaches the 4,800 … spike"** on a shown item that takes the *next* spike's category to 4,800. A neutral chip
  with the tab colour on its icon: amber stays for "late", violet for imbue hints. With a full inventory, the item
  the card says to sell leaves first, so a sale in the same category never promises a spike it takes back.
- **Gentle nudge**: when #2 or #3 has that badge, the #1 does not, and players usually buy the two within
  2 minutes of each other, that item becomes #1. Nothing else is reordered, and a locked #1 stays locked.
- **A spike is pushed inside a window.** The first until 14 min, the second until 20, the third until 24 (any item
  before 22 min, only a top-up of 800 souls or less after). Without a clock, the first two are pushed and the third
  only as a top-up. Past its window the spike has no badge, no nudge and no amber; the line says so. See "How much it
  matters" below.
- **"Last 800 souls"**: when the target category already holds 4,000 or more and a shown item crosses 4,800 by adding
  800 souls or less, the badge says so. Same chip, never a reorder.
- **What counts**: the owned items, except those marked by hand ("Skip" or a click) that the scanner does not see
  in the inventory: skipping an item is not buying it. Without an inventory read, the hand-marked items count.
- **Sales keep finished spikes.** With a full inventory the card suggests selling the weakest item, but never one
  whose sale drops a category from 4,800 to below it (unless the new item brings it back): the next weakest is
  suggested, or "inventory full" when every candidate would. Measured on 1,760 simulated games: 2% of the sales did
  (9% of the games), now none.
- **Key core items keep their place.** An item bought in 70% or more of the hero's games (`KEY_CORE_PICK_RATE`,
  about 6 per hero) is never overtaken: a spike item does not move above one, whatever its buy time.
- **Lane counters need a lane threat and leave with laning.** A counter that only answers my lane is queued only
  when a lane enemy is to be avoided (my real win rate against it), is marked fed, or the lane is hard; a Tier 1-2
  one is dropped at 10 min (the clock, else about 6,400 souls spent; latched for the match). Counters against a
  fed enemy, or against two enemies or more, are unaffected. See `hasLaneThreat`, `isLaneOver` in
  `src/services/recommendations.ts`.
- **The player's own build wins.** A category not at 4,800 yet, with at least 2,400 souls and 1,600 more than the
  build's next category, becomes the target: the line lists it after the finished spikes, its items get the badge,
  and the queue is not reordered (it follows the build the player left). In a recorded Infernus game the build went
  spirit first, the player vitality then weapon, with spirit at 1,600 most of the game.

## Who gets the #1 spot (`src/services/buyQueue.ts`)

The queue is one pure function, tested on 264 simulated games (`buyQueue.test.ts`). When two items are due together,
the first of these wins:

1. **A key core item that is due** (bought in 70% or more of the hero's games, at or past its usual buy time). Nothing
   goes ahead of it, no counter and no spike item.
2. **A counter against a fed enemy** that nothing owned or in the build answers: at once for Tier 1-2, at its usual
   buy time for Tier 3-4 (which is already past when an enemy is marked fed late).
3. **A lane counter** against a real lane threat, right after the build's first two items, gone at 10 min.
4. **A spike item**, up to 2 min early and only while its spike is worth it.
5. **The other build items**, by usual buy time.
6. **A team counter** (against two enemies or more): released once the first 4,800 is done or at 14 min, then by its
   usual buy time. The counters panel still lists it before that.

An enemy is **answered** when one of its three best counters is owned or in the active build (bought or still to
come): nothing outside the build is queued against it. Measured on 1,760 simulated lineups, 24% of the lane enemies
already had one in the build. Simulated lineups (44 heroes, random enemies, the #1 always bought, 12 slots):

| | Before | After |
| --- | --- | --- |
| Lane counters bought after laning (6,400 souls) | 79% of the Tier 1-2 counters, median 12,000 souls | 0% of lane counters, median 1,600 souls |
| Games where a Tier 1-2 counter outside the build is bought | 1,546 of 1,760 | 1,315 of 1,760, the team ones at a median 14,400 souls |
| Sales that drop a finished 4,800 | 181 | 0 |

The simulation is a regression test: it fails if a counter goes ahead of a due key core item, a team counter is queued
before the first spike, or a lane counter survives laning. Minutes without a clock are estimated from the souls spent
(`estimateClockS`: about 6,400 souls at 10 min, 12,000 at 15).

The spike order comes from the build: buying its early, mid and late items **in the order players usually buy them**
(`itemStats` buy times), the order the categories reach 4,800 (categories it never takes there come last, most souls
first). The phases are tiers, not times: walking them in order changed the first spike of 18 of 44 meta builds
(Vindicta: weapon instead of spirit, while players buy Rapid Recharge at ~11 min). An upgrade counts at its full price
and its consumed component does not count again (`src/services/investments.ts`).

## Where the numbers come from

**Published builds**: the 15 most-favourited builds of the week per hero, updated in the last 60 days
(654 builds, deadlock-api.com `/v1/builds`), bought in their order:

- the first category reaches 4,800 at a median 7,200 souls spent, with 70% of them in it;
- the second at 12,800, with only 1,600 in the third category by then;
- 67% take all three to 4,800. No fixed order: spirit first in 53%, weapon 33%, vitality 14%.

**Players**: deadlock-api.com `/v1/sql`, table `match_player_latest`, normal games, 40,000 players per group over
1.5 days. Median minute players have one, two and three categories at 4,800:

| Categories at 4,800 | Rank 81+ | Rank 1-40 |
|---|---|---|
| 1 | 10.2 min (75% of the souls in it) | 11.6 min (70%) |
| 2 | 15.3 min (third category: 800) | 17.4 min (third category: 1,600) |
| 3 | 19.9 min (55% get there) | 23.2 min (49%) |

**How much it matters** (deadlock-api.com, 534,000 ranked players from 44,500 complete matches, Oct 23-29 2026;
logistic regression controlling for held item value, unspent souls, team net-worth lead, hero and rank, errors
clustered by match; win-rate points with 95% intervals; correlations, skill is not controlled):

- Most of the raw gap (+7 to +8 points) is being ahead. At equal spend and lead the first 4,800 is worth
  **+1.0 [+0.6, +1.4] at 9 min, +0.7 [+0.4, +1.0] at 12 min and 0.0 at 15 min**. A small threshold remains: at equal
  spend the richest category at 4,800 beats 4,000 by +0.8 to +1.1 at 9-12 min, and 5,600 or 6,400 are no better.
- Each later spike is worth +0.7 to +1 while it is early (the second at 15 min +0.9, the third at 20 min +0.7), +0.3
  at 25 min and 0 at 30. Earlier is better, about 0.3 point per minute for the first spike.
- That is why the app pushes a spike only inside a window (`SPIKES` in `investments.ts`): the first until 14 min, the second
  until 20, the third until 24 (any item before 22 min, only a top-up after). No reordering, badge or "late"
  colour after that.
- 38% of players sit at 4,000-4,799 before their first spike (median wait 1.9 min at rank 81+, 2.6 at 1-40), and 46%
  of the crossings add only 800 (800 to 1,600 upgrades such as Extra Spirit to Improved Spirit). The badge then says
  "Last 800 souls to the 4,800 Spirit spike"; it never reorders anything.
- Which category pays most does not follow the bonus size (vitality +1.1, weapon +0.4), and per-hero differences are
  mostly noise: the app follows each hero's build order and does not weight categories.
- Only 32% of the items finishing the first two spikes are key core items (pick rate 70% or more), and core versus
  flexible makes no difference to win rate.

These are correlations, which is why the app nudges a spike item by at most 2 minutes and never above a key core
item rather than reordering the build.
