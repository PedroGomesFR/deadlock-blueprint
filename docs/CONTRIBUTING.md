# Contributing

Thanks for helping! This guide covers the setup, the tests, and the four jobs that come up most often: **recalibrating the scanner**, **adding a hero**, **translating**, and **publishing a release**. The HUD coordinates, thresholds and the reasoning behind them are in [`AGENTS.md`](../AGENTS.md) (in French).

## Setup

Windows and [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm run dev          # Vite with hot reload + Electron
```

> Running Electron from a VS Code terminal? VS Code sets `ELECTRON_RUN_AS_NODE`, and Electron then starts as plain Node (`Cannot find module 'electron'`). Run `$env:ELECTRON_RUN_AS_NODE=$null` (PowerShell) or `unset ELECTRON_RUN_AS_NODE` (bash) first.

## Where things are

| Path | |
| :--- | :--- |
| `electron/main.cjs` | Windows, overlay, shortcuts, capture source, updates, problem reports, game log files |
| `src/services/visionScanner.ts` | The scanner: one frame → what is on screen (portraits, inventory, souls) |
| `src/services/matchTracker.ts` | The rules: scans over time → my hero, lineups (voted per slot), owned items, new match |
| `src/services/recommendations.ts` | What to buy next, what to sell |
| `src/services/matchLogger.ts` | Game logs (opt-in) |
| `src/data/deadlockData.ts` | Heroes, hand-written builds, counters (French); `deadlockData.en.ts` holds their English text |
| `src/data/generated/` | Item catalogue and meta builds from deadlock-api.com (`npm run update-builds`) |
| `src/data/dataSource.ts` | Picks bundled, cached or freshly downloaded generated data |
| `src/i18n/` | Interface texts (`fr.ts`, `en.ts`) |
| `tests/replays/` | Recorded game logs replayed through the rules |
| `tests/vision/` | Saved game frames and what the scanner must read in them |
| `src/streetBrawl/` | Street Brawl mode, separate from the rest: see [`STREET_BRAWL.md`](STREET_BRAWL.md) |

## Tests

```bash
npm test             # rules, recorded games, translations (Vitest)
npm run test:vision  # builds, then runs the real scanner on tests/vision in a hidden Electron window
npm run typecheck
```

- **`src/services/matchTracker.test.ts`** replays the games of `tests/replays/*.journal.log.gz` through today's rules and checks what must always hold: no "new match" in the middle of a game, the hero stays locked, owned items never drop by more than 2 at once, the final inventory is right. Each of these once broke on a real game.
- **`tests/vision/cases.json`** lists frames (crops of the top bar, inventory and abilities, pasted back into a 1920×1080 frame) with what the scanner must read: mode (HUD / shop), highlighted portrait, the 12 portraits, the 12 inventory slots, padlocks, souls. `knownIssues` documents readings that are wrong today.

### Adding a recorded game to the replay tests

1. Turn on game logs (Settings), play, and find the folder: Diagnostics › Game logs (`%APPDATA%\deadlock-tactical-autobuild\match-logs\partie_…`).
2. Gzip its `journal.log` into `tests/replays/<name>.journal.log.gz`.
3. Add `{ file: '<name>', finalOwned: <items in your final inventory> }` to the `games` list of `matchTracker.test.ts`.

## Recalibrating the scanner

Most detection problems come with a game log (from a report `.zip`, or your own). Replay its frames through the scanner:

```bash
npm run build
npx electron scripts/vision-replay.cjs --log "<game log folder>" --hero infernus
#   one line per full frame (1 per minute): mode, my portrait, allies, enemies, souls, inventory
npx electron scripts/vision-replay.cjs --log "<game log folder>" --crops --sequential
#   every inventory + score-box capture (every 2 s, no portraits), in order like the live scan loop
#   --out results.json to keep everything, --no-ocr to go faster
```

Then:

1. Look at the frames that are read wrong (`images/full_*.jpg`, `inv_*.jpg`) and measure what differs (colours, positions). The Diagnostics tab and the `Last scan details` of the app show the raw readings: matching errors of each slot, best and second candidate.
2. Change the scanner (`visionScanner.ts`). Keep the measured values next to each threshold, in a comment.
3. Add the frame to `tests/vision`: crop `top` (0,0 → 1920×100), `inv` (0,820 → 420×260) and `abilities` (790,970 → 250×70) into `tests/vision/frames/`, add a case to `cases.json`, and run `npm run test:vision`. To get what the scanner reads now, run `npx electron scripts/vision-replay.cjs --check tests/vision --out out.json`.
4. Run `npm test`. If the rules depend on the change, replay the game logs as well.

### Other screen formats (ultrawide, 16:10)

The scanner draws every frame onto a 1920×1080 canvas before reading it (`drawNormalizedFrame` in `visionScanner.ts`): 16:9 at any size is plainly scaled, the other formats try several layouts (`buildHudCandidates`: HUD scaled by height and anchored to the corners on ultrawide, scaled by width on 16:10, 16:9 game view inside window borders…) and keep the one where the top bar, or the souls digits, are found. Only portrait or tiny captures pause detection (`isSupportedFormat` in `matchTracker.ts`). Those layouts were written from simulated frames (`simulateLayout` in `tests/vision/cases.json`), not from real captures: when a report comes with a game log of such a format, check where the HUD really is on its `full_*.jpg` images (the game log saves the normalized frame, so a wrong layout shows there) and fix the candidate.

## Adding a hero

When Valve releases a hero, `npm run update-builds` lists it under *"Heroes absent from HEROES_DB"*, and a test warns about it.

1. **Portrait**: `public/icons/heroes/<id>.png`, the hero's card art from deadlock-api (`images.icon_hero_card` of `/v1/assets/heroes`). The scanner matches the top-bar portraits against it. `<id>` is the slug of the English name (`Rat King` → `rat_king`).
2. **Entry**: in `src/data/deadlockData.ts`, add the hero to the generic list (the one with `s1`…`s4`): `role`, `archetype`, `threatTags` (they drive the counters: `cc_catch`, `healer`, `bullet_hose`…), `baseTips`, the official ability names (`'Nom FR (English Name)'`), and a few items. The meta builds replace the placeholder build automatically.
3. **English text**: `role` and `baseTips` in `src/data/deadlockData.en.ts` (a test fails without them).
4. Run `npm test` and check the hero in the app (Diagnostics shows the portraits read slot by slot).

## Translating

- Interface: every key of `src/i18n/fr.ts` must exist in `src/i18n/en.ts` and `src/i18n/it.ts` (TypeScript and a test check it). A message is a string, or a function of its parameters.
- Hand-written hero guides: `src/data/deadlockData.en.ts` and `deadlockData.it.ts`, keyed like `deadlockData.ts`. A test fails if an English or Italian screen would show French text, or a hand-written Italian text still has English in it.
- In `deadlockData.it.ts`, write item and ability names by their **current English name** ("Reactive Barrier"): they are replaced by the official Italian name from the game data ("Barriera reattiva"), so the guides use the game's wording and follow Valve's renames.
- Item names, descriptions, stats and ability names come from the official game data in each language (`scripts/update-builds.mjs`, `nameIt` / `descriptionIt` / `statsIt`…).
- A new language means a new message table, the `Lang` type (`src/i18n/lang.ts`), `nameXx` / `descriptionXx` / `statsXx` fields in the generator (optional: no schema bump, see *Game data*), and the language's hand-written guides.

## Interface

- **Text sizes**: four only, `text-small` (11 px), `text-body` (12 px), `text-title` (14 px), `text-heading` (16 px), defined as CSS variables in `src/index.css`. `src/typeScale.test.ts` fails on any other size (`text-xs`, `text-[10px]`…).
- **Overlay buttons** only work when ghost mode is off (clicks go through to the game otherwise): hide new ones while `isClickThrough` is on, like the settings and copy buttons.

## Game data

`npm run update-builds` downloads the statistics (30 days, Oracle+ then lower brackets), the item catalogue and the icons, validates them, and writes `src/data/generated/`. GitHub Actions does it every Monday (`.github/workflows/update-builds.yml`) and commits the result to `main`. **Installed apps download these files at launch**, so:

- **Changing the shape of the generated files** (renamed or removed fields): bump `SCHEMA_VERSION` in `scripts/update-builds.mjs` **and** `DATA_SCHEMA_VERSION` in `src/data/dataSource.ts`. Older apps then ignore the new files and keep their bundled data, instead of breaking.
- Adding an optional field is fine without a bump.
- If `main` is protected, allow `github-actions[bot]` to push, or change the workflow to open a pull request.

## Releasing

1. Update `version` in `package.json` and add a `## [x.y.z] — date` section at the top of `CHANGELOG.md` (it becomes the release notes).
2. Commit, then tag and push: `git tag vX.Y.Z && git push origin main vX.Y.Z`.
3. `.github/workflows/release.yml` checks that the tag matches `package.json`, runs the tests, builds the installer and the portable exe, computes their SHA-256 and publishes the release (with `latest.yml`, which the installed apps read to update themselves).
4. **VirusTotal** (optional): create a free account on virustotal.com, copy the API key into a repository secret named `VT_API_KEY`, and both executables are uploaded for scanning at each release. Without it, the release notes still link to their VirusTotal pages, and anyone can upload the file there.

The executables are not code-signed, hence the SmartScreen warning on first launch. A code-signing certificate (or [SignPath Foundation](https://signpath.org), free for open-source projects) would remove it: electron-builder signs with `CSC_LINK` / `CSC_KEY_PASSWORD`.

## Recording the demo

The README is missing a 15-second GIF. It should show: the shop open, buying the #1 recommended item, and the list moving on to the next item.

1. Play in 1920×1080 with the overlay on (<kbd>Alt</kbd>+<kbd>O</kbd>), or the main window on a second screen.
2. Record with [ScreenToGif](https://www.screentogif.com) or OBS (then `ffmpeg -i demo.mp4 -vf "fps=12,scale=960:-1:flags=lanczos" -loop 0 docs/demo.gif`).
3. Keep it under ~8 MB, save it as `docs/demo.gif`, and replace the `TODO` comment at the top of `README.md` with `![Demo](docs/demo.gif)`.
