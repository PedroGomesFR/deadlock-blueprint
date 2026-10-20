# Changelog

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
