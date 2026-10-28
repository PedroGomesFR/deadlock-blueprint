# Street Brawl mode

In Street Brawl, the player does not shop: at the start of each round the game offers three cards ("SELECT ITEMS",
"CHOICE 1 OF 3") and a re-roll. The **Street Brawl** tab reads that screen and ranks the cards for the hero, with
Street Brawl statistics. It is separate from the normal mode on purpose: everything lives in `src/streetBrawl/`, and
the rest of the app only shows the tab.

The first sections are for working on the feature: what it does, the tab, its files and data, adding a test frame,
its limits. The rest explain how each part works, and the measurements behind its thresholds.

## What it does

- Recognises the pick screen (the "SELECT ITEMS" title).
- Reads the item on each of the three cards, even **enhanced** cards (the item's artwork recoloured in blue),
  **rare** cards (teal ring, "RARE!" label over the icon), **legendary** cards (Street Brawl-only tier 5 items such as
  Celestial Blessing, absent from the normal shop) and cards with a teammate's portrait over the top of the icon.
- Reads the **bonus item** of a card that gives two ("BONUS!" tag tilted at the top left of the icon).
- Reads which pick of the round it is ("CHOICE 2 OF 3") and how many **re-rolls** are left (0, 1 or 2: one per
  round, two with a random hero; the round's three picks share them, and they are lost at its end).
- Ranks the cards (see How a card is scored): each item against the other items of its tier for the hero (the
  enhanced copy's win rate for an enhanced card), plus what its tier's souls are worth, plus what its upgrades add. A
  bonus item adds its own worth when positive; an owned item adds nothing and its card comes last.
- Suggests the re-roll when the best card is worth less than what a re-roll is worth at that moment (below).
- Shows what to upgrade in each **round** (up to 12 upgrades, over the 5 rounds) for the hero, and, on imbue items, the
  ability published builds imbue them on (below). The current round, counted from the pick screens, is highlighted.
- Reads the **items you own** from the in-play HUD: an offered item you already have (or one an owned item includes)
  counts for nothing, and a card that upgrades an owned item says so.

While the tab is open, the normal-mode scan (`performScreenScan` in `App.tsx`) is paused: its rules expect a 6v6 HUD
and would misread Street Brawl's 4v4 HUD.

## The tab

Built for a glance from a second monitor during the buy phase, in the game's own look (`style.ts`; design notes in
`.impeccable.md` at the repository root):

1. **Status line** (magenta, like the game's "CHOICE n OF 3"): round, pick, re-rolls left, hero.
2. **Verdict**, the largest line: "Take Close Quarters", "Close call: Extra Spirit or Melee Lifesteal" or "Re-roll",
   with why underneath for the last two.
3. **The three cards** side by side, left, centre, right as in the game. Each shows its item in a round medallion
   ringed with its category colour (gold for legendary, a second teal ring when rare, a cyan bolt when enhanced) with
   its tier badge, its rank, and one reason (`reasons.ts`: the part of its score that sets it apart: "+1.4 vs its
   tier", "Path to Point Blank", "Higher tier", "Two items", "You have it"). The card to take is outlined in green, a
   close call's second card too ("Also fine"); the third, owned cards, and every card when a re-roll is advised step
   back. An imbue item says where to imbue it ("Imbue on [icon] Ability"). Hovering a card (or focusing it) opens its
   breakdown: win rate, tier value, path, bonus item, and the share of builds imbuing there.
4. **Your items**, as medallions with their tier badges.
5. **Ability points**: the round to play spelled out, the others folded to their ability icons.
6. **Details** (closed): what the tab does, the data's date, the diagnostics line.

The tab keeps to the app's four text sizes (`src/typeScale.test.ts`): the verdict is `text-heading` in Cinzel.

## Files

| Path | |
| :--- | :--- |
| `src/streetBrawl/StreetBrawlPanel.tsx` | The tab: its capture loop (every 500 ms), what each scan does, the layout |
| `src/streetBrawl/OfferCard.tsx` | One offered card: its medallion, rank, one reason, and the breakdown on hover |
| `src/streetBrawl/reasons.ts` | The one reason a card shows for its rank. Pure |
| `src/streetBrawl/readingGate.ts` | Which pick screen readings may replace the advice (not the cards in motion). Pure |
| `src/streetBrawl/style.ts` | The tab's look: the game's colours as class strings and values |
| `src/streetBrawl/AbilityPlan.tsx` | The ability points plan: the round to play spelled out, the others folded |
| `src/streetBrawl/capture.ts` | A captured frame as 1920x1080 pixels (browser) |
| `src/streetBrawl/templates.ts` | Loads the reference images: item icons, ability icons, end-screen crops (browser) |
| `src/streetBrawl/dataSource.ts` | Downloads the latest `streetBrawl.json` from the repository when the tab opens |
| `src/streetBrawl/items.ts` | An item's tier, category and name (the app's catalogue and the legendary items) |
| `src/streetBrawl/i18n.ts` | The tab's texts (EN / FR / IT) |
| **Readers** (pure: pixels in, a reading out) | |
| `src/streetBrawl/image.ts` | Pixel helpers: grids, shape distance, best match, pixel shares |
| `src/streetBrawl/layout.ts` | Where things are on the screen (1920x1080 reference) |
| `src/streetBrawl/pickScreen.ts` | The pick screen: open or not, the three cards, re-rolls, choice number |
| `src/streetBrawl/inventory.ts` | The HUD's item slots, and the items owned this game |
| `src/streetBrawl/heroReader.ts` | The hero, from its 4 ability icons |
| `src/streetBrawl/endScreen.ts` | The end-of-game screen |
| **Logic** (pure) | |
| `src/streetBrawl/stats.ts` | Reads `streetBrawl.json`: statistics, offer odds, item gains within their tier |
| `src/streetBrawl/ranking.ts` | Scores the cards and suggests the re-roll |
| `src/streetBrawl/roundTracker.ts` | Which round it is, from the pick screens and the cards' tiers |
| `src/streetBrawl/abilityRounds.ts` | Splits the ability plan into rounds |
| **Data and assets** | |
| `scripts/update-street-brawl.mjs` | `npm run update-street-brawl`: writes `src/data/generated/streetBrawl.json` |
| `public/icons/items/streetBrawl/` | Icons of the legendary items (downloaded by the generator) |
| `public/icons/streetBrawl/ui/` | Reference crops of the end-of-game screen (`tests/streetBrawl/cropEndScreen.ts`) |
| **Tests** | |
| `src/streetBrawl/*.test.ts` | One test file per module |
| `tests/streetBrawl/frames/`, `cases.json` | Test frames, and what must be read on each pick screen |
| `tests/streetBrawl/fixtures.ts` | What the tests share: reference images and item facts as the app loads them, frames |
| `tests/streetBrawl/prepareFrames.ts`, `cropEndScreen.ts` | Turn a screenshot into a test frame, or into the end-screen crops |
| `tests/streetBrawl/png.ts`, `reference.ts` | PNG reading and writing, resizing to 1920x1080 (Node, no dependency) |

Outside these files, the feature only touches:
- `src/App.tsx`: the tab's entry and panel, `selectHeroFromStreetBrawl` (the hero the tab detects), the normal-mode
  scan paused and its "no HUD" warning hidden while the tab is open;
- `package.json`: the `update-street-brawl` script;
- `.github/workflows/update-builds.yml`: the weekly data step;
- `docs/CONTRIBUTING.md`: one line pointing here.

## Data

`npm run update-street-brawl` (after `npm run update-builds`, whose files give the hero and item ids) writes, per
hero, over 30 days and **all ranks**:

- the hero's Street Brawl games and win rate;
- `items`: per item, `[share of games in which it was acquired, smoothed win rate, games]`, from **normal copies
  only** (`enhanced_items=exclude`; components later upgraded or sold count too: a tier's shares add up to its picks
  per game);
- `enhancedItems`: per item, `[smoothed win rate, games]` from **enhanced copies only** (`enhanced_items=only`);
- `enhancedTierGain`: per tier, how much more enhanced copies win than normal ones, weighted by games.

Normal win rates are smoothed towards the hero's (300 games of weight), as in the normal mode. Enhanced copies have
a few hundred games per item, too few on their own (one hero's gaps ranged from -7 to +7 points item by item), so
each is smoothed towards the item's normal win rate + its tier's gap. A tier's gap is the hero's own, pulled towards
all heroes' until about 20,000 enhanced item-games. Over all heroes (30 days, 9.3 million enhanced item-games),
enhanced copies won +1.28 points at tier 1, +1.60 at tier 2, +1.93 at tier 3, +1.66 at tier 4 and +0.59 for
legendary items. The API records enhanced picks since 2026-04-08.

and, for the re-roll odds, `draft` per hero (each offerable item's bucket and weight) and `draftGoodShare` per tier;
`draftRoundTiers` (the normal tier of each pick of each round); `paths` per hero (see Paths to upgrades: one
`/v1/sql` query, 100,000 Street Brawl players of the last 3 days, extra chances of 2 points or more; when it fails,
the previous file's paths are kept).

The weekly workflow (`.github/workflows/update-builds.yml`) runs `npm run update-street-brawl` after the normal-mode
update (a failure keeps last week's file without holding that update back), and the tab downloads the file from the
repository when it opens (`dataSource.ts`, checked at most every 6 hours, cached under `streetBrawl.remoteData`, used
only when its `schemaVersion` matches and it is newer than the bundled one). A legendary item newer than the release
gets its icon from the repository.

It also writes the **legendary items**: the tier 5 items of the API that are not disabled (17 today), with their
names in English, French and Italian, and downloads their icons. In Street Brawl items are offered at random, so the
share of games mostly reflects how often an item is offered: the ranking uses the win rates only.

## Adding a test frame

Take a full-screen 16:9 screenshot (PNG), then:

```bash
node tests/streetBrawl/prepareFrames.ts "<screenshot.png>" <name>
```

It keeps only the pixels the readers look at, at 1920x1080, in `tests/streetBrawl/frames/<name>.png`. Then say what
must be read on it:
- a **pick screen** (or a screen that must not read as one): a case in `tests/streetBrawl/cases.json` (cards, rare,
  enhanced, bonus, re-rolls, choice, round, hero), run by `pickScreen.test.ts` and `roundTracker.test.ts`;
- **items in the HUD**: the expected slots in `inventory.test.ts`;
- an **end-of-game screen**, or a screen that must not read as one: `endScreen.test.ts`.

`npm test` runs them all.

## Limits

- **16:9 captures only** (the panel says so otherwise). 16:10, ultrawide and windowed layouts are not measured.
- The bonus tag was seen on the top card only (twice); the same position is assumed on the other two.
- Some items keep an old id after a rename (Compress Cooldown is `improved_cooldown`, Stamina Mastery is
  `superior_stamina`): the panel shows the current name, the test cases use the id.
- An unreadable choice number counts as the round's last pick (the most liberal case).
- 6 items the game can offer (Aerial Supremacy, Ancient Shield, Apex Combat, Haunting Scream, Shadow Step, Timeless
  Emblem) are in neither the catalogue nor the legendary items: their cards and slots are not recognised.
- Win rates say which items go with winning, not that they cause it (an item taken by players who are already ahead
  looks better than it is). It is the best signal the data offers, the same as the normal mode uses.
- The 4v4 portraits are not read. The round is counted, not read (the HUD prints "ROUND n" at the top: a possible
  later check).

## How the cards are read

Each card's icon is reduced to a 24x24 grid and compared with every item's official icon (the shop's and the legendary
ones) by **shape**, blind to colour (`shapeDistance`): the best correlation between any channel of one (red, green,
blue or brightness) and any channel of the other. Colour cannot be used: enhanced cards recolour the artwork
(Titanic Magazine's gold bullets turn teal), and the detail moves from one channel to another. Brightness alone read
enhanced Spirit Rend at 0.31, only 0.145 ahead of the runner-up; the best channel pair reads it at 0.07. The top rows
(the "RARE!" / "LEGENDARY" labels, a teammate's portrait) and the bottom-right corner (the enhanced bolt) are left out.

Measured on the frames in `tests/streetBrawl/frames` (2560x1440 captures):

| Signal | Right answer | Wrong / absent | Threshold |
| :--- | :--- | :--- | :--- |
| Title pixels | 0.43 | ≤ 0.11 | 0.3 |
| Card icon shape distance | 0.002–0.074, ≥ 0.107 ahead | item without template: 0.36, 0.006 ahead | ≤ 0.2 and ≥ 0.08 margin |
| Colour error of the match | normal ≤ 6.9 | enhanced 32.8–42.4 | ≥ 15 = enhanced |
| Teal share of the "RARE!" box | ~0.19 | 0 | 0.08 |
| White share of the "BONUS!" label box | 0.16–0.22 | 0 | 0.08 = the card gives two items |
| Bonus tag shape distance (label seen) | Recharging Rush 0.17, Monster Rounds 0.12 | | ≤ 0.3, else "bonus item (not recognised)" |
| Width of the re-roll line | "1 Re-Roll" 155 px | "0 / 2 Re-Rolls" 170 px | ≥ 163 = plural |
| Middle of the plural line's digit | "0": hollow | "2": crossed | < 25 % lit = 0 |
| "CHOICE n" digit pattern (280 cells) | same digit: identical on 8 captures | other digits: 40+ cells apart | ≤ 25 cells off |

A card whose item has no template is left unread (shown as "Card not recognised"), never mistaken for another item.

**Tooltips.** Hovering a card opens its tooltip over the centre card and the re-roll line: the centre card then reads
0.39 (unread, not misread) and the re-rolls as unknown. The panel keeps what the previous scan of the same pick read
for them (`holdCoveredCards`): the same choice number, and the same re-rolls when they can be read, so the cards of a
re-roll are not mixed with the old ones while the count shows. A card read now always wins. (A re-roll made while the
count is hidden would keep the old centre card until the tooltip closes.)

**Cards in motion.** The cards animate in, and away after a pick; on those scans some cards are not read and others
are misread (the centre card once read as an enhanced Titanic Magazine). `readingGate.ts` decides which readings may
replace the advice: only one that two scans in a row agree on, and, within the pick already shown (game, round,
choice), only one that reads at least as many cards (the cards leaving read fewer; a re-roll's new cards as many). A
scan that reads no card keeps the advice within its pick, and clears it on a new pick ("Reading the cards…"), so the
last pick's cards are never shown as this one's.

A card too close to call by shape is settled by its **tier**: the game offers one normal tier per pick, so when the
pick's other normal cards agree on a tier, the card is matched again among that tier's items (one tier up for a rare
card), with the same limits. Enhanced Superior Cooldown scored 0.189 with Arcane Surge only 0.043 behind (the blue
recolouring flattens the artwork); Arcane Surge is tier 2, the two other cards tier 3, and among tier 3 items it reads
clearly.

## Which hero

`heroReader.ts` reads the hero from its **4 ability icons** (bottom centre, also shown on the pick screen): each is
compared by shape with the same slot's icon of every hero (`public/icons/abilities/api`), and the hero whose 4 icons
are closest on average wins. On 11 pick screens of 4 heroes, the right hero averaged 0.19-0.48, 0.19 or more ahead of
the second; in play and on round-end screens nothing came within 0.77, so nothing is read there.

The normal mode reads the highlighted top bar portrait instead, but Street Brawl's bar is 4v4 and portraits change
with skins: Nurse Harrow's highlighted portrait matched no stored portrait (best: another hero, far off), while her
ability icons matched at 0.19. The panel changes the app's hero after 3 identical readings in a row, like a hand pick
but without locking it.

## Which round

`roundTracker.ts`: each round opens with the pick screen, and its three picks come one after another. So the pick
screen showing again after at least a minute closed is the next round; after round 5, or after 8 minutes closed
(rounds last 3 to 4.5 minutes), it is a new game.

The cards correct the count: each pick of each round offers one normal tier (`draftRoundTiers`, from `generic-data`
› `street_brawl.item_draft_rounds_per_game_round`; a rare card is one tier up, a legendary card is the rare tier of
its pick):

| Round | Pick 1 | Pick 2 | Pick 3 |
| :--- | :--- | :--- | :--- |
| 1 | 1 | 2 | 3 |
| 2 | 2 | 3 | 3 |
| 3 | 2 | 3 | 4 |
| 4 | 3 | 3 | 4 |
| 5 | 4 | 4 | 4 |

So a normal tier 1 card on the first pick is round 1, whatever the count says: a new game, even one queued straight
after the last (the count alone stayed on round 5 and kept the last game's items). A count the cards rule out moves
to the closest round they allow, without starting a new game unless that round is 1. The 11 pick screens of the test
frames all fall in their real round. The −/+ buttons by the ability points remain for what the cards cannot tell
(round 2 or 3 from a tier 2 first pick). A new game, or another hero, clears the items owned.

## Your items

`inventory.ts` reads the HUD's item slots (bottom left, 2 rows of 8), in play and under the pick screen (the slots stay
visible there, and nothing moves over them). Measured on two 2560x1440 frames with 12 items:

| Step | |
| :--- | :--- |
| Slot positions | 52 px squares 61.5 px apart from (26, 946.5) at 1920x1080, fitted on the items' best shift. The normal mode's spots (62 px from (26, 944)) were 2-3 px too high here: Spirit Strike then scored 0.66 instead of 0.08. A ±1 px search covers what is left |
| Empty or not | Brightness spread: items 38-47, empty slots at most 14. Below 25, empty, never matched |
| Badge | Colour of the corner: weapon orange, vitality green, spirit purple. Numeral strokes counted near its top and bottom: I 1/1, II 2/2, III 3/3, IV 3/1-2. All 12 right |
| Item | Shape on a disc (active items are round) without the badge's corner, among the items of the badge's category and tier only (8-19 instead of ~175): 0.016-0.171, the runner-up at least 0.25 behind; accepted at 0.3 or less and 0.1 ahead |
| Enhanced | The cyan bolt in the bottom-right corner: 0.144 of it on the 3 enhanced items, 0 on the 9 others |

The three frames with items read all 24 of them. A slot whose badge colour cannot be read (a cooldown darkening it) is left unread rather
than matched against every item. The round-end screen covers the slots: nothing is read there.

Ownership is kept **per slot**: a slot holds an item once it reads it on 4 scans in a row (2 s), and keeps it until
it confirms another item the same way, or a new game or another hero starts (see Which round). An unread or
empty-looking slot keeps its item. Items sit still while misreads come and go (a cooldown sweep, an animation over
the slot): one-scan misreads never count, and one that did get confirmed is replaced as soon as the slot shows its
real item again.

The ranking counts nothing for an offered item already owned or included in an owned one (`effectiveOwnedSet`:
owning Greater Expansion includes Mystic Expansion), in the cards and in the re-roll odds. Three frames with items
measured so far, all 2560x1440: other resolutions would need checking.

Imbue hints reuse the normal mode's data (`metaBuilds.json` › `imbueTargets`, `getHeroImbueTarget`): published builds
are not tied to a game mode, and they count popularity, not wins. The API has no imbue data from matches.

## End of the game

`endScreen.ts` recognises the end-of-game screen (MVP, key players, "PLAY AGAIN") by shape, against reference crops
in `public/icons/streetBrawl/ui` (written from a capture of it by `tests/streetBrawl/cropEndScreen.ts`):

| Part | End screens (2 games, 3 captures) | 18 other captures (pick screens, play, round ends) |
| :--- | :--- | :--- |
| "STREET BRAWL" title, top right (the match number under it left out) | 0.008 or less, from the screen's first moment | 0.537 or more, the FPS overlay over that corner included |
| "PLAY AGAIN" button | 0.003 once shown (not on the second game's capture) | 0.626 or more |
| Round icons, bottom | 0.004 or less, a few seconds in (in another order on the second game: same shape) | 0.631 or more |

It counts as the end screen when the title and the button or the icons are within 0.25: the title alone might show
somewhere else (not seen yet), and the screen stays long after the icons appear. The tab then ends the game
(`endGame`): no round, no items, no last pick, "Game over. Waiting for the next game…".

## How a card is scored

A card's score, in points of win rate (`rankOffers` in `ranking.ts`):

| Part | What | Where |
| :--- | :--- | :--- |
| Item | The item against the other items of its tier, for the hero; an enhanced card adds what the enhanced copy wins over the normal one | `stats.ts` › `itemGains`, `cardGain` |
| Tier | What the tier's souls are worth, whatever the item: stats and category investment | `ranking.ts` › `tierValue` |
| Upgrades | What the item's upgrades add (see Paths to upgrades) | `ranking.ts` › `pathValue` |
| Bonus | The bonus item's item + tier + upgrades parts, when positive (an unrecognised one: its card's tier) | `rankOffers` |

An owned item (or one an owned item includes) counts none of its parts, and its card comes last.

**Close calls.** Each item's gain comes with its uncertainty (`gainSd`, what its games leave unknown after shrinking:
median 0.9 points for items with 1,000-3,000 games, 0.6 with 3,000-10,000, 0.4 above). When the two best cards are
closer than their combined uncertainty (the square root of the sum of their squares, a bonus item's included), the
tab says it is a close call: the first card keeps "Take", the second gets "Also fine". The tier and upgrade parts are
taken as known. For Silver's tier 1 items, Extra Spirit (+0.70, 2,070 games) and Melee Lifesteal (+0.85, 15,340) are
one: the data cannot tell them apart.

**Items within their tier.** An item's raw number is the win rate of the hero's games in which it was acquired, minus
the hero's. Compared across tiers, that leans with the hero: tier 4 and legendary items mostly come in rounds 4-5, and
games that last that long are near 50/50. Against hero win rate, the average tier 4 item had a slope of −0.22 and the
average legendary one −0.37: −2.0 and −2.5 points for a 60 % hero, +2.0 and +4.3 for a 42 % one. That steered strong
heroes away from rare and legendary cards and weak ones towards them. So each item is measured against its tier's
average for the hero (weighted by the offer odds), and the lean is gone (every tier's slope under 0.05,
`stats.test.ts`). Each gain is also shrunk by its noise (empirical Bayes per hero and tier): sampling alone spreads
gains by about 0.7 points, about half the spread of tier 1 items.

**What a higher tier is worth** is then measured apart, on the draft: a pick's tier is fixed, and a rare (+1 tier),
legendary or two-item card is mostly luck. The generator (`soulValue`) regresses win on the soul value of every item a
player got in round 1 (before 110 s, before any comeback rule; every item, as a bonus card on the first pick gives 4
or more) on the week's Street Brawl sample, into `streetBrawl.json` › `soulValue`: +0.22 ± 0.23 points per 1,000
souls on 2026-10-28 (99,857 players), so about +1.2 points from tier 1 to tier 4. An independent check on another
sample found +0.30 ± 0.23 this way, and +0.35 to +0.61 comparing the two teams of each match: the value may be on the
low side. Over later rounds the slope falls (losing teams may get more rare cards), and the player's choice to take a
rare card stays in. The card shows its tier's part ("+1.4 pts for its tier" for a tier 4 item).

## Paths to upgrades

Taking a component makes its upgrades likelier later: partly the draft, partly players taking them when offered.
Measured on Street Brawl matches (`/v1/sql`, 80,000 players over 2 days), against the same hero's players who never
had the component: 1.14x as often for its upgrade, 0.88x for an unrelated item of the upgrade's tier and category (a
pick taken is one another item did not get). So about +2 points of chance on average, but up to +6 to +13 for some
heroes and pairs, which matters when the upgrade is strong for the hero.

A card's **path value** (`pathValue` in `ranking.ts`) is, over its upgrades not owned and of a tier still to come this
game (`draftRoundTiers`, from the current round), the extra chance times the upgrade's gain for the hero, when
positive. It is added to the card's score and to the re-roll draw, and the card says which upgrade it leads to.
Largest values measured: Mo & Krill's Mystic Vulnerability towards Escalating Exposure +0.45, Nurse Harrow's +0.28
(+6 points of chance, Escalating Exposure +4.5); half the heroes' pairs add nothing. A bad upgrade for the hero
(Boundless Spirit for Rat King, −6.4) adds nothing either.

The extra chance per hero and pair comes from `componentPaths` in the generator: the hero's own players, pulled
towards all heroes' for the pair until about 300 players with the component (a hero with 60 such players swung by 10
points), pairs with fewer than 1,000 players with the component overall left out. It counts players taking the upgrade
on purpose too: an upper bound for the draft's own effect. And the component's own win rate already covers the games
in which it was later upgraded (items count when acquired), so part of the path value is counted twice: small (median
0, 90th percentile +0.09 points, at most +0.39).

## When to re-roll

A round has three picks, which share its re-rolls (1, or 2 with a random hero); unused ones are lost when the round
ends. `ranking.ts` weighs taking the best card against re-rolling with the hero's statistics:

1. A re-roll keeps each card's quality: a tier X card (800, 1,600, 3,200, 6,400 souls, or legendary) turns into
   another tier X item, and an enhanced card into another enhanced one. So each slot of the fresh offer is drawn
   from the items of its own tier with the **game's odds for the hero**, at their enhanced win rates when the slot
   was enhanced (a bonus item is not counted on, an owned item is worth nothing). The odds: the card comes from the
   tier's "Good" bucket with its share (60 % at tier 1, 40 % at tiers 2-3, 35 % at tier 4, 20 % for legendary,
   `generic-data` › `street_brawl.item_drafts`), else from "Normal", then an item of that bucket in proportion to its
   weight. Which bucket each item is in, and its weight, is per hero (`/v1/assets/heroes` › `item_draft_bucketing`:
   Ricochet and Toxic Bullets are "Good" for Infernus, Medic Bullets weighs 0.4). The offer's value is its best card: P(best ≤ x) is the product of the slots'
   P(card ≤ x). The game's own draft rules agree: each pick has a normal tier and a rare tier one above
   (`/v1/assets/generic-data` › `street_brawl.item_draft_rounds_per_game_round`).
2. `worth(picks, rerolls)`, what the rest of the round is worth when each pick is played at its best, is
   `E[max(best + worth(picks - 1, rerolls), worth(picks, rerolls - 1))]`.
3. A re-roll is worth `worth(picks, rerolls - 1) - worth(picks - 1, rerolls)` now; it is suggested when the best card
   is below that.

So the re-roll is kept for later at the round's first pick (unless the offer is weak), spent more freely at its last
pick (where it would be lost), and spent more freely with two than with one. On the test frames, for Nurse Harrow, a
re-roll was worth +0.2 to +0.8 points at the first pick and +0.9 to +4.3 at the last.

The round's later picks are drawn at their own normal tier (`draftRoundTiers` and the counted round): round 1's
picks are tiers 1, 2 and 3, so a re-roll kept for pick 3 is worth more than one spent on a tier 1 offer. Assuming the
same tier as the current pick, the first pick of round 1 suggested a re-roll about twice as often. Later picks are
taken as normal cards (no rare, enhanced or bonus card), and the 6 offerable items the app has no data for are left
out (their odds go to the others of their bucket). The panel shows both numbers ("the best card is +0.3 pts, a re-roll is worth +0.7 pts here").

## Ability points

`abilityPlan` (generator, `ability-order-tree` with `game_mode=street_brawl`): one entry per point, with the ability,
the smoothed win rate and games of the players who chose it there, when that point usually comes, and the runner-up.

- The tree has one node per order prefix (games, wins, average time). Orders that reach the same **allocation**
  (points per ability) are merged: "2 in 1, 2 in 4" is the same position whatever the order. Exact orders split into
  400+ branches by the 10th point (Nurse Harrow); merged, every step of her plan stands on 1,000+ games up to the 12th.
- At each point: among the choices taken by at least 1,000 games and 5 % of the players there, the best win rate,
  smoothed towards the position's (300 games). When no choice qualifies (Pocket after 3 points; 7 heroes have 1-4
  such steps), the most common one, shown as such.
- Games last up to 5 rounds (first to 3), and about a third of games reach the 12th point.
- The panel groups the points by **round** (`abilityRounds.ts`): upgrades are bought in each round's buy phase, so
  the steps' usual times cluster, over all 44 heroes, at 41-74 s, 238-277 s, 396-463 s, 548-686 s and 815-917 s (the
  rounds' start shifts with early ends, but stays within its cluster). Each step goes to the cluster of its time,
  split at 150 / 340 / 520 / 750 s, but no later than the next step's round: the times are averages over the players
  who reached each step, so one can look later than the next (Lash: 3rd step 243 s, 4th 60 s). The game data has no
  points per round (levels come from souls, and an upgrade costs 1, 2 or 5 points), so the rounds come from the times.
- Players who are ahead reach later points, so later win rates look better than they are (Harrow's plan climbs from
  52 % to 57 %): compare the choices of one point, not points with each other.
