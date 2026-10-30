// README screenshots: the main window and the overlay on a staged match (docs/app*.png, docs/overlay*.png), in French
// and English, with a throwaway profile. Run it again whenever the interface changes.
//
//   npm run screenshots          (builds first, then: electron scripts/readme-screenshots.cjs)
//
// No preload: without window.electronAPI the scan loop does nothing, so the staged state stays as written.
// (From a VS Code terminal, unset ELECTRON_RUN_AS_NODE first: VS Code sets it, and Electron then runs as Node.)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const DIST_INDEX = path.join(ROOT, 'dist', 'index.html');
const OUT = path.join(ROOT, 'docs');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dl-screenshots-')));
app.commandLine.appendSwitch('log-level', '3');
// One window at a time: closing the main window must not quit before the overlay is taken
app.on('window-all-closed', () => {});

// Infernus at 13 min (the first spike is still pushed until 14) in the blue lane with Seven, against Lady Geist + Baba.
// Full inventory (10 items, 2 padlocks), 4,000 souls in each category (the 4,800 spike line and badges show), 3 enemies
// dead to 1 ally (the "Now" advice and the Mid Boss show).
const OWNED = [
  'improved_spirit',
  'duration_extender',
  'mystic_burst',
  'swift_striker',
  'titanic_magazine',
  'monster_rounds',
  'extra_regen',
  'extra_stamina',
  'healing_rite',
  'spirit_lifesteal',
];
const ALLIES = ['vindicta', 'dynamo', 'infernus', 'seven', 'mo_and_krill', 'ivy'];
const ENEMIES = ['haze', 'abrams', 'lady_geist', 'baba', 'mcginnis', 'paradox'];
const DEAD_ALLIES = ['mo_and_krill'];
const DEAD_ENEMIES = ['haze', 'abrams', 'baba'];

function stagedState(lang) {
  const board = {
    allies: ALLIES.map((heroId) => ({ heroId, dead: DEAD_ALLIES.includes(heroId) })),
    enemies: ENEMIES.map((heroId) => ({ heroId, dead: DEAD_ENEMIES.includes(heroId) })),
    mySlot: 2,
    clock: { seconds: 13 * 60 + 5, at: Date.now() },
    souls: { ally: 64, enemy: 59 },
  };
  return {
    dl_lang: lang,
    dl_onboarded: '1',
    dl_gameLogs: 'off',
    dl_sync_v6: '1',
    dl_myHeroId: 'infernus',
    dl_heroLocked: '1',
    dl_laneColor: 'blue',
    dl_laneMode: 'duo',
    dl_allyPartnerId: 'seven',
    dl_laneEnemyIds: JSON.stringify(['lady_geist', 'baba']),
    dl_teamEnemyIds: JSON.stringify(['haze', 'abrams', 'mcginnis', 'paradox']),
    dl_ownedItems: JSON.stringify(OWNED),
    dl_inventoryStatus: JSON.stringify({ itemIds: OWNED, occupied: OWNED.length, locked: 2, unmatched: 0 }),
    dl_currentSouls: '2857',
    dl_board: JSON.stringify(board),
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function openWindow({ width, height, transparent }) {
  return new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent,
    backgroundColor: transparent ? '#00000000' : '#0b0d10',
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
}

/** Loads the page; the overlay's load can report ERR_FAILED although the page renders, so only the event counts. */
function load(win, hash) {
  const loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  win.loadFile(DIST_INDEX, hash ? { hash } : undefined).catch(() => {});
  return loaded;
}

/**
 * Captures the page; with `viewport`, laid out at that size through DevTools (a window cannot be taller than the
 * screen) and cut below the section whose title is `clipAfter` (the whole viewport if it is not found).
 */
async function capture(win, file, viewport, clipAfter) {
  const cdp = win.webContents.debugger;
  if (viewport) {
    cdp.attach('1.3');
    await cdp.sendCommand('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
    await cdp.sendCommand('Emulation.setScrollbarsHidden', { hidden: true });
  }
  // Game data download (at most 2.5 s, dataSource.ts), then icons and fonts
  await wait(5000);
  if (viewport) {
    // The title is a <span> in the header row of its section (App.tsx)
    const bottom = await win.webContents.executeJavaScript(
      `(() => {
        const title = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === ${JSON.stringify(clipAfter)});
        return title ? Math.ceil(title.parentElement.parentElement.getBoundingClientRect().bottom) + 12 : null;
      })()`
    );
    const height = Math.min(viewport.height, bottom ?? viewport.height);
    const clip = { x: 0, y: 0, width: viewport.width, height, scale: 1 };
    const { data } = await cdp.sendCommand('Page.captureScreenshot', { format: 'png', clip });
    cdp.detach();
    fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'));
    console.log(`${file}  ${clip.width}x${clip.height}`);
    return;
  }
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, file), image.toPNG());
  console.log(`${file}  ${image.getSize().width}x${image.getSize().height}`);
}

async function shootLang(lang, suffix, countersTitle) {
  // The main window writes the staged state; the overlay (same file:// origin) reads the same localStorage
  const main = openWindow({ width: 1100, height: 1000, transparent: false });
  await load(main);
  await main.webContents.executeJavaScript(
    `localStorage.clear(); Object.entries(${JSON.stringify(stagedState(lang))}).forEach(([k, v]) => localStorage.setItem(k, v));`
  );
  const reloaded = new Promise((resolve) => main.webContents.once('did-finish-load', resolve));
  main.webContents.reload();
  await reloaded;
  // Down to the end of the "Counter the enemies" cards (enemies.countersTitle of src/i18n)
  await capture(main, `app${suffix}.png`, { width: 1100, height: 1800 }, countersTitle);
  main.destroy();

  const overlay = openWindow({ width: 380, height: 760, transparent: true }); // resizable: tall enough for the 3 items
  await load(overlay, 'overlay');
  await capture(overlay, `overlay${suffix}.png`);
  overlay.destroy();
}

app.whenReady().then(async () => {
  if (!fs.existsSync(DIST_INDEX)) {
    console.error('dist/index.html is missing: run `npm run build` first.');
    app.exit(2);
    return;
  }
  try {
    await shootLang('fr', '', 'Contrer les ennemis');
    await shootLang('en', '-en', 'Counter the enemies');
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
