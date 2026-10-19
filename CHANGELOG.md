# Changelog

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
