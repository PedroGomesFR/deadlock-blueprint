# Changelog

## [1.4.8] — 2026-10-27

Suggestions from a player.

### New
- **Who to avoid, who to focus**: each enemy is now rated from your hero's real win rate against them in high-rank games (in lane for your lane opponents): **Avoid 1v1s**, **Even** or **Focus**, with the numbers ("You win 44.9% of games laning against them, usually 47.8%"). The danger level comes from it too: before, it only depended on what the enemy does (any enemy with crowd control was "High"), whatever hero you played. Shown in the Matchups tab, in a new **Enemies** strip of the main window, and as one line of the overlay.
- **Lane outlook and duo**: the Matchups tab says whether your lane is hard, even or favourable against your opponents, and how your hero does with your lane partner.
- **Items that win against each enemy**: the counters now include the items that win more than usual for your hero when that enemy is on the other team ("+2.1 pts win rate against Haze"), on top of the anti-heal / resist / CC-immunity rules.
- **Mark an enemy as fed**: click them in the Enemies strip (or "Mark fed" in the Matchups tab). Their counters come first, they are always "Avoid 1v1s", and the overlay reminds you. Cleared at the next match.

## [1.4.7] — 2026-10-26

### Fixed
- **Items you bought are recognised again without HDR.** The HDR correction of 1.4.6 made some items you had bought go unrecognised on screens without HDR, so they stayed in "Buy right now". It is removed for now: with Windows HDR on, the app detects nothing again. Turn HDR off while playing (Settings › Display › Use HDR) until HDR is supported properly.

## [1.4.6] — 2026-10-26

### Fixed
- **The app now works with Windows HDR turned on.** With HDR, the screen capture does not give the colours the game shows (darker, or too bright and washed out, depending on the "SDR content brightness" setting of Windows): the app saw no match at all, so no hero, no lineups and no items. It now recognises an HDR capture from the colours of the score boxes at the top of the screen and corrects it. On a real HDR capture, everything is read as without HDR. With a high "SDR content brightness", the capture itself loses the brightest details: some portraits are not read on every frame (the lineups are voted over the whole match anyway), and from about 320 nits some items too. If detection stays incomplete, lower that setting (Settings › Display › HDR) or turn HDR off while playing.

### New
- **Nurse Harrow** is in the hero list (guide, abilities, builds and counters): the hero was missing, so the app could not show or detect them. Thanks to [@roroos](https://github.com/roroos) ([#5](https://github.com/PedroGomesFR/deadlock-blueprint/pull/5)).

## [1.4.5] — 2026-10-23

### Fixed
- **A counter item that is also in your build now says why it counters your enemies.** When an item was both in the build and recommended against your opponents (Healbane against a healer, Reactive Barrier against a hook…), the card showed the generic build text ("End of the early lane phase") instead of "[LANE] Anti-heal (-40%) against Solomon", and it was not highlighted as a counter. The purchase order is unchanged. Thanks to [@vshtykhnov](https://github.com/vshtykhnov) ([#3](https://github.com/PedroGomesFR/deadlock-blueprint/pull/3)).

## [1.4.4] — 2026-10-23

### Fixed
- **The overlay could no longer be moved, resized or set** since 1.4.3, which stopped it from taking the focus (so clicking it no longer muted the game). It now has an **arrange mode**: its ⚙ button or <kbd>Alt</kbd> + <kbd>K</kbd> gives it the focus, like before 1.4.3, to drag its header, resize it from its new ↙ corner and set its opacity and size. Click the game (or press <kbd>Alt</kbd> + <kbd>K</kbd> again) to go back: the game gets the focus back. The copy buttons still never take the focus.
- Resizing the overlay from its edges barely worked even before: they are in its transparent margin, which lets clicks through to the game. The ↙ corner replaces them.

## [1.4.3] — 2026-10-21

### Fixed
- **Clicking the overlay sent the game to the background** (its audio stopped, as after an alt-tab): the overlay window took the focus. It no longer takes it, so its buttons (copy, settings) work while Deadlock stays in front.

## [1.4.2] — 2026-10-20

Interface improvements suggested by a player in the issues.

### New
- **Italian interface** (Italiano), chosen automatically on an Italian system. Item and ability names, descriptions and stats use the official Italian texts of the game, and the hero guides are translated, with the game's own item and ability names.
- **Overlay settings** (⚙ in its header): **opacity**, so it hides less of the minimap, and **size** (100 / 85 / 70 %). The window shrinks with it, so the empty part never catches your clicks.
- **Copy the item name** (button next to each recommendation), to paste it into the shop search. It only writes to the clipboard: nothing is typed into the game.

### Changed
- **Less to read in the middle of a fight**: bigger item icons, and the shop tab shown as its colour and icon plus "Vitality · Tier II" instead of "SHOP: VITALITY TAB (Green) / Tier II (1,600 souls)". The full sentence is still in the tooltip, and the price is shown once.
- **Consistent text sizes**: the interface now uses four text sizes instead of six, and the smallest is 11 px (some overlay labels were 9 px).
- In ghost mode the overlay hides its buttons (settings, copy), which clicks could not reach anyway; its banner says that <kbd>Alt</kbd>+<kbd>L</kbd> brings them back.
- French: the spirit category is now called "Esprit", as in the game.
- Weekly builds and item data refreshed.

## [1.4.1] — 2026-10-20

### Fixed
- **Your hero kept changing and your items were wiped every few seconds** when the app could not find your highlighted portrait (Rat King: his crown covers the corners it looked at). The hero then came from the ability icons, which read Rat King as Pocket or Paradox, and every switch wiped the owned items. Your portrait is now found from the edges of its frame, which hero art does not cover, and the ability icons can no longer switch between heroes.
- **A hero locked from the previous match made the app ignore your inventory for the whole next match** (your new hero's portrait was taken for a teammate you were spectating). The new match is now detected, and your new hero locked.
- The scan could stop for good if opening the capture of the game window never answered, and one failed opening switched the app to the heavy thumbnail capture until it was restarted. It now gives up after 5 s and tries again.
- The capture uses the same Windows capture as before 1.4.0 again (1.4.0 switched to Windows.Graphics.Capture, which draws a yellow border around the game on Windows 10).

### Changed
- Captures larger than 2560×1600 are scaled down while captured (4K: 2560×1440): the scanner reads at 1920×1080 anyway, and a 4K frame cost four times the work.
- 16:10, ultrawide, 4:3 and windowed with borders are marked as experimental: their layouts have only been checked on simulated frames.
- Game logs: the full image of a capture that is not 16:9 is saved as captured, to show where its HUD really is.

## [1.4.0] — 2026-10-19

First public version.

### New
- **English interface**, with a French / English switch (it follows the system language on first launch). Item names, descriptions and stats come from the official game data in both languages, and the hand-written hero guides are translated.
- **Why this item?** Each recommendation shows how often high-rank players of your hero buy it, their win rate with it, and when they usually buy it.
- **Automatic updates**: a new installer updates itself. The portable exe shows a notice with a download link.
- **Builds stay up to date on their own**: the meta builds and the item catalogue are refreshed every week and downloaded at launch, so a Deadlock patch no longer needs a new release.
- **Report a problem** (Diagnostics or Settings): creates a .zip with the system info and, if you want, your last game log, then opens a pre-filled GitHub issue.
- **Settings**: language, game logs, updates, about.
- **All screen sizes & formats supported**: 720p, 1080p, 2K (`2560×1440`, `2560×1600`, `3440×1440`), 4K (`3840×2160`), 16:9, 16:10, ultrawide 21:9 / 32:9, High-DPI Windows scaling (125% / 150% / 200%), and windowed mode with borders. A hint appears when Deadlock is open but no in-game HUD has been recognized for several minutes.
- The **Diagnostics** tab now shows what the scanner reads, live: capture, portraits slot by slot, inventory slot by slot.

### Detection
- **Lineups are voted slot by slot over the whole match.** On recorded games, 95–97% of the portrait readings are right, and the voted lineups had all 12 heroes right. Before, the enemy list changed every few seconds.
- **Dead heroes** (respawn timer over a grey portrait) are no longer read as a random hero.
- **Rat King and Deadman Danny** were missing. Rat King was read as Solomon or Warden.
- A new match is only detected in the first 3 minutes after leaving the game screens. A late first lineup could wipe your items in the middle of a match.
- Item stats come from the current game data.
- **The OCR model is bundled**: souls are read offline, with no request to a CDN.

### Privacy & security
- **Game logs are now opt-in** (off by default), stay on your PC and can be deleted from Settings.
- Content-Security-Policy on the application pages.

### Project
- Tests: buying rules, match rules, three recorded games replayed through the rules, translations, and a vision regression of the real scanner on saved game frames.
- Releases are built by GitHub Actions from the tagged sources, with SHA-256 checksums and VirusTotal links. CI runs on every push.
- MIT licence, third-party notice (Valve, deadlock-api.com), issue templates, contributor guide.

## [1.3.2] — 2026-10-19
- Game logs (journal + HUD captures) to replay a match and recalibrate the scanner.
- Inventory read with the shop open, items on cooldown, padlocked slots.
- Death cam and spectating ignored (killer's inventory, other heroes' portraits).
- Fixes: false "new match" when enemies die, items dropped by the shop's fade-out, own portrait on the Sapphire side.

## [1.2.0]
- Single video stream capture: about 130 MB of RAM for the main process instead of 600 MB, and up to several GB on PCs with many windows.

## [1.1.0], [1.0.0]
- First versions (French interface).
