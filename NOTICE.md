# Third-party content

The MIT licence in [`LICENSE`](LICENSE) covers the source code of Deadlock Blueprint. It does **not** cover the content below, which belongs to its owners.

## Deadlock — Valve Corporation

Deadlock Blueprint is a fan project. It is **not affiliated with, endorsed, sponsored or approved by Valve Corporation**.

Deadlock, its name, logo, hero portraits, ability and item icons, and every other game asset are trademarks and/or copyright of Valve Corporation. The project includes some of these images (`public/icons/heroes`, `public/icons/items`, `public/icons/abilities`) and crops of game screenshots used as test data (`tests/vision/frames`). The scanner compares them with the game screen, and the interface uses them to show heroes and items. This is common practice for fan tools, as with community wikis and stat sites. If you are a rights holder and want something removed, open an issue.

## Game data and statistics — deadlock-api.com

Item catalogue, hero abilities, official names and descriptions (French and English), meta builds, pick and win rates come from [deadlock-api.com](https://deadlock-api.com), a community API. `scripts/update-builds.mjs` downloads them, and the results are in `src/data/generated/` and `public/icons/items/api/`. Thanks to its maintainers.

## Software

| Component | Licence | Use |
| :--- | :--- | :--- |
| [Electron](https://www.electronjs.org) | MIT | Desktop application |
| [React](https://react.dev) | MIT | Interface |
| [Tesseract.js](https://github.com/naptha/tesseract.js), tesseract.js-core | Apache 2.0 | Reads the souls counter |
| Tesseract `eng` model (`@tesseract.js-data/eng`) | Apache 2.0 | Bundled OCR model |
| [electron-updater](https://www.electron.build/auto-update) | MIT | Updates of the installed version |
| [Lucide](https://lucide.dev) | ISC | Interface icons |
| [Tailwind CSS](https://tailwindcss.com) | MIT | Styles |
| Cinzel, Inter (Google Fonts) | SIL Open Font License 1.1 | Fonts |
