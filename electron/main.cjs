const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, screen, shell, net, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const v8 = require('v8');
const vm = require('vm');
const { writeZip } = require('./zip.cjs');

const REPO_URL = 'https://github.com/PedroGomesFR/deadlock-blueprint';
const RELEASES_API = 'https://api.github.com/repos/PedroGomesFR/deadlock-blueprint/releases/latest';
// The portable exe can't update itself (electron-updater needs the installer): it only offers the download
const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch {
  // Not installed (development checkout): update notices through the GitHub API only
}
const canAutoUpdate = () => app.isPackaged && !isPortable && autoUpdater !== null;

// Explicit GC for the fallback thumbnail capture: thumbnails are native memory that V8 does not see, so
// without it they pile up between collections (several GB with many windows open)
v8.setFlagsFromString('--expose_gc');
const collectGarbage = vm.runInNewContext('gc');
let lastFallbackGc = 0;

// Capture with the classic Windows capturers (DXGI screen duplication, GDI window capture), not Windows.Graphics.Capture
// (WGC): every recorded game and the scanner's calibration use them, and WGC logs "ProcessFrame failed" on the game
// window, fails on some windows (wgc_capturer_win.cc -2147024809), and draws a yellow border around the captured
// game on Windows 10. The frame size comes from the stream's constraints (screenCapture.ts) with either capturer.
app.commandLine.appendSwitch(
  'disable-features',
  'AllowWgcScreenCapturer,AllowWgcScreenZeroHz,AllowWgcWindowCapturer,AllowWgcWindowZeroHz,WebRtcAllowWgcDesktopCapturer'
);
// Suppress noisy Chromium stderr logs
app.commandLine.appendSwitch('log-level', '3');

const APP_ICON = path.join(__dirname, '../dist/icons/upscalemedia-transformed.png');

let mainWindow = null;
let overlayWindow = null;
let isOverlayMode = false;
let isClickThrough = false;
// Size setting of the overlay (App.tsx): its page zoom, and the factor its window was resized by since it was created
let overlayScale = 1;

function getAppUrlOrFile(win) {
  const isDevServer = process.argv.includes('--dev');
  const distIndex = path.join(__dirname, '../dist/index.html');

  if (isDevServer) {
    win.loadURL('http://localhost:5173');
  } else if (fs.existsSync(distIndex)) {
    win.loadFile(distIndex);
  } else {
    win.loadURL('http://localhost:5173');
  }
}

/** Physical pixel resolution of a display (Electron's `bounds` is divided by Windows DPI scaleFactor). */
function getDisplayPixelSize(disp) {
  if (!disp) return { width: 0, height: 0 };
  const scale = disp.scaleFactor || 1;
  return {
    width: Math.round(disp.bounds.width * scale),
    height: Math.round(disp.bounds.height * scale),
  };
}

function getGamingDisplay() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  // Prefer primary display if landscape, otherwise the highest-resolution landscape display
  if (primary.bounds.width >= primary.bounds.height) {
    return primary;
  }
  const landscapes = displays
    .filter((d) => d.bounds.width > d.bounds.height)
    .sort((a, b) => {
      const pa = getDisplayPixelSize(a);
      const pb = getDisplayPixelSize(b);
      return pb.width * pb.height - pa.width * pa.height;
    });
  return landscapes[0] || primary;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 850,
    minWidth: 380,
    minHeight: 450,
    frame: true,
    transparent: false,
    autoHideMenuBar: true,
    backgroundColor: '#0c0b0e',
    title: 'Deadlock Blueprint',
    icon: fs.existsSync(APP_ICON) ? APP_ICON : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // CRITICAL: Keep auto-scan running in background even when playing Deadlock full-screen on the other monitor!
      backgroundThrottling: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  getAppUrlOrFile(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
      overlayWindow = null;
    }
  });
}

function ensureOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  const gamingDisplay = getGamingDisplay();
  const { x, y, width, height } = gamingDisplay.bounds;

  overlayWindow = new BrowserWindow({
    x: x + width - 395,
    y: y + Math.max(40, Math.floor((height - 640) / 2)),
    width: 380,
    height: 640,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const isDevServer = process.argv.includes('--dev');
  const distIndex = path.join(__dirname, '../dist/index.html');
  if (isDevServer) {
    overlayWindow.loadURL('http://localhost:5173/#overlay');
  } else if (fs.existsSync(distIndex)) {
    overlayWindow.loadFile(distIndex, { hash: 'overlay' });
  }

  overlayScale = 1;
  overlayWindow.on('closed', () => {
    overlayWindow = null;
    isOverlayMode = false;
    isClickThrough = false;
    broadcastOverlayState();
  });

  return overlayWindow;
}

function broadcastOverlayState() {
  const payload = { isOverlayMode, isClickThrough };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overlay-state-changed', payload);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay-state-changed', payload);
  }
}

function toggleOverlayMode(forceState) {
  const targetState = typeof forceState === 'boolean' ? forceState : !isOverlayMode;
  isOverlayMode = targetState;

  if (isOverlayMode) {
    const ov = ensureOverlayWindow();
    ov.showInactive();
    ov.setAlwaysOnTop(true, 'screen-saver');
  } else {
    isClickThrough = false;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setIgnoreMouseEvents(false);
      overlayWindow.hide();
    }
  }

  broadcastOverlayState();
}

function toggleClickThrough(forceState) {
  if (!isOverlayMode) {
    toggleOverlayMode(true);
  }
  isClickThrough = typeof forceState === 'boolean' ? forceState : !isClickThrough;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (isClickThrough) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      overlayWindow.setIgnoreMouseEvents(false);
    }
  }
  broadcastOverlayState();
}

app.whenReady().then(() => {
  createWindow();

  globalShortcut.register('Alt+O', () => {
    toggleOverlayMode();
  });

  globalShortcut.register('Alt+L', () => {
    toggleClickThrough();
  });

  globalShortcut.register('Alt+S', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('trigger-shortcut-scan');
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  setupAutoUpdater();
  setTimeout(() => checkForUpdates(false), 10000);
  setInterval(() => checkForUpdates(false), 6 * 3600 * 1000);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  endMatchLog();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers

// Picks what to capture WITHOUT taking any thumbnail (thumbnailSize 0): cheap enough to run every few
// seconds. The frames come from a single live stream the renderer opens on this source
// (src/services/screenCapture.ts).
ipcMain.handle('find-capture-source', async (_event, preferredSourceId) => {
  try {
    const displays = screen.getAllDisplays();
    const gamingDisplay = getGamingDisplay();
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    // Raw names: the interface adds its own (translated) labels
    const describe = (s, isDeadlockWindow) => {
      const disp = displays.find((d) => String(d.id) === String(s.display_id)) || gamingDisplay;
      const px = getDisplayPixelSize(disp);
      return {
        id: s.id,
        isDeadlockWindow,
        sourceName: isDeadlockWindow ? s.name : `${s.name} (${px.width}x${px.height})`,
      };
    };

    // 1. User explicitly chosen source
    const preferred = preferredSourceId && sources.find((s) => s.id === preferredSourceId);
    if (preferred) return describe(preferred, /^deadlock$/i.test(preferred.name.trim()) || /project8/i.test(preferred.name));

    // 2. Direct Deadlock Game Window (ignores Windows taskbar and other overlapping windows!)
    const dlWin = sources.find(
      (s) => s.id.startsWith('window:') && (/^deadlock$/i.test(s.name.trim()) || /project8/i.test(s.name))
    );
    if (dlWin) return describe(dlWin, true);

    // 3. Fallback: Primary Gaming Monitor
    const screenSources = sources.filter((s) => s.id.startsWith('screen:'));
    const screenSource =
      screenSources.find((s) => String(s.display_id) === String(gamingDisplay.id)) || screenSources[0];
    return screenSource ? describe(screenSource, false) : null;
  } catch {
    return null;
  }
});

// Fallback capture only (when the live stream is not available): a thumbnail of EVERY window and
// screen per call, so it is heavy and needs the explicit GC below.
ipcMain.handle('capture-screen', async (_event, preferredSourceId) => {
  try {
    const displays = screen.getAllDisplays();
    const gamingDisplay = getGamingDisplay();
    const gamingDisplayId = String(gamingDisplay.id);
    const gamingPx = getDisplayPixelSize(gamingDisplay);

    // Same size limit as the live stream (screenCapture.ts): a thumbnail is taken of every window and screen,
    // and 4K ones would be 4 times heavier for the same reading
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: {
        width: Math.max(1920, Math.min(2560, gamingPx.width || 1920)),
        height: Math.max(1080, Math.min(1600, gamingPx.height || 1080)),
      },
      fetchWindowIcons: false,
    });

    let targetSource = null;
    let isDeadlockWindow = false;

    // 1. User explicitly chosen source
    if (preferredSourceId) {
      targetSource = sources.find((s) => s.id === preferredSourceId && !s.thumbnail.isEmpty());
      if (targetSource && /deadlock|project8/i.test(targetSource.name)) {
        isDeadlockWindow = true;
      }
    }

    // 2. Direct Deadlock Game Window (ignores Windows taskbar and other overlapping windows!)
    if (!targetSource) {
      const dlWin = sources.find(
        (s) =>
          s.id.startsWith('window:') &&
          !s.thumbnail.isEmpty() &&
          (/^deadlock$/i.test(s.name.trim()) || /project8/i.test(s.name))
      );
      if (dlWin) {
        targetSource = dlWin;
        isDeadlockWindow = true;
      }
    }

    // 3. Fallback: Primary Gaming Monitor
    if (!targetSource) {
      const screenSources = sources.filter((s) => s.id.startsWith('screen:') && !s.thumbnail.isEmpty());
      targetSource =
        screenSources.find((s) => String(s.display_id) === gamingDisplayId) ||
        screenSources[0];
    }

    if (!targetSource) {
      return { success: false, error: 'No video source found.' };
    }

    const jpegBuf = targetSource.thumbnail.toJPEG(92);
    const dataUrl = `data:image/jpeg;base64,${jpegBuf.toString('base64')}`;
    const size = targetSource.thumbnail.getSize();
    const disp = displays.find((d) => String(d.id) === String(targetSource.display_id)) || gamingDisplay;
    const px = getDisplayPixelSize(disp);

    return {
      success: true,
      sourceName: isDeadlockWindow
        ? targetSource.name
        : `${targetSource.name} (${px.width}x${px.height})`,
      sourceId: targetSource.id,
      isDeadlockWindow,
      width: size.width,
      height: size.height,
      dataUrl,
      availableSources: sources
        .filter((s) => !s.thumbnail.isEmpty())
        .map((s) => ({
          id: s.id,
          name: s.id.startsWith('window:') ? `🎮 ${s.name}` : `🖥️ ${s.name}`,
          type: s.id.startsWith('window:') ? 'window' : 'screen',
        })),
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Screen capture failed.',
    };
  } finally {
    // Free this call's thumbnails once they are out of scope (at most every 2 s: a full GC costs a few ms)
    if (Date.now() - lastFallbackGc > 2000) {
      lastFallbackGc = Date.now();
      setImmediate(collectGarbage);
    }
  }
});

ipcMain.handle('get-sources', async () => {
  try {
    const displays = screen.getAllDisplays();
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map((s) => {
      const disp = displays.find((d) => String(d.id) === String(s.display_id));
      const px = getDisplayPixelSize(disp);
      return {
        id: s.id,
        name: s.name,
        type: 'screen',
        width: px.width,
        height: px.height,
        preview: s.thumbnail.toDataURL(),
      };
    });
  } catch {
    return [];
  }
});

ipcMain.handle('set-overlay-mode', (_event, enable) => {
  toggleOverlayMode(enable);
  return { isOverlayMode, isClickThrough };
});

ipcMain.handle('set-click-through', (_event, enable) => {
  toggleClickThrough(enable);
  return { isOverlayMode, isClickThrough };
});

/**
 * Overlay size: zooms its page (the zoom stays on this window, checked with Electron 33: the main window, same
 * origin, keeps 100%) and resizes the window by the same factor, top-right corner in place, so that the empty part
 * of a bigger window does not catch the clicks meant for the game. A window the player resized keeps its proportions.
 */
function setOverlayScale(scale) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const next = Math.min(1, Math.max(0.5, Number(scale) || 1));
  const ratio = next / overlayScale;
  overlayScale = next;
  overlayWindow.webContents.setZoomFactor(next);
  if (Math.abs(ratio - 1) < 0.01) return;
  const bounds = overlayWindow.getBounds();
  const width = Math.round(bounds.width * ratio);
  const height = Math.round(bounds.height * ratio);
  overlayWindow.setBounds({ x: bounds.x + bounds.width - width, y: bounds.y, width, height });
}

ipcMain.handle('set-overlay-scale', (event, scale) => {
  if (overlayWindow && !overlayWindow.isDestroyed() && event.sender === overlayWindow.webContents) setOverlayScale(scale);
  return overlayScale;
});

// "Copy the item name" (to paste it into the shop search): the clipboard only, nothing is sent to the game
ipcMain.handle('copy-text', (_event, text) => {
  if (typeof text !== 'string' || text.length === 0 || text.length > 200) return false;
  clipboard.writeText(text);
  return true;
});

// Match logs (src/services/matchLogger.ts): one folder per game under %APPDATA%\deadlock-tactical-autobuild\
// match-logs\, with journal.log (what the scanner saw and what the app decided) and images\ (HUD crops
// every 2 s, full frame every minute) so that a game can be replayed and the scanner re-calibrated afterwards.
const MATCH_LOGS_KEPT = 5;
let matchLogDir = null;
let matchLogStream = null;

function matchLogsRoot() {
  return path.join(app.getPath('userData'), 'match-logs');
}

function endMatchLog() {
  if (matchLogStream) matchLogStream.end();
  matchLogStream = null;
  matchLogDir = null;
}

ipcMain.on('match-log-start', () => {
  try {
    endMatchLog();
    const root = matchLogsRoot();
    fs.mkdirSync(root, { recursive: true });
    const previous = fs
      .readdirSync(root)
      .filter((name) => name.startsWith('partie_'))
      .sort();
    for (const name of previous.slice(0, Math.max(0, previous.length - (MATCH_LOGS_KEPT - 1)))) {
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
    }
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(
      now.getMinutes()
    )}-${pad(now.getSeconds())}`;
    matchLogDir = path.join(root, `partie_${stamp}`);
    fs.mkdirSync(path.join(matchLogDir, 'images'), { recursive: true });
    matchLogStream = fs.createWriteStream(path.join(matchLogDir, 'journal.log'), { flags: 'a' });
    matchLogStream.write(`Deadlock Blueprint ${app.getVersion()} — journal de partie du ${now.toLocaleString('fr-FR')}\n`);
  } catch (error) {
    console.error('match-log-start', error);
    endMatchLog();
  }
});

ipcMain.on('match-log-write', (_event, text) => {
  if (matchLogStream && typeof text === 'string') matchLogStream.write(text);
});

ipcMain.on('match-log-image', (_event, name, data) => {
  if (!matchLogDir || typeof name !== 'string' || !data) return;
  fs.writeFile(path.join(matchLogDir, 'images', path.basename(name)), Buffer.from(data), () => {});
});

ipcMain.on('match-log-end', () => endMatchLog());

ipcMain.handle('open-match-logs', () => {
  const root = matchLogsRoot();
  fs.mkdirSync(root, { recursive: true });
  return shell.openPath(matchLogDir || root);
});

/** Newest match log folder (the current one if a match is being logged). */
function latestMatchLogDir() {
  if (matchLogDir) return matchLogDir;
  const root = matchLogsRoot();
  if (!fs.existsSync(root)) return null;
  const folders = fs
    .readdirSync(root)
    .filter((name) => name.startsWith('partie_'))
    .sort();
  return folders.length > 0 ? path.join(root, folders[folders.length - 1]) : null;
}

ipcMain.handle('match-logs-info', () => {
  const dir = latestMatchLogDir();
  return { latest: dir ? path.basename(dir) : null };
});

// Game logs turned off or deleted from Settings: nothing is left on disk
ipcMain.handle('delete-match-logs', () => {
  endMatchLog();
  fs.rmSync(matchLogsRoot(), { recursive: true, force: true });
  return true;
});

// Problem report (Diagnostics › Report a problem): a .zip in the Downloads folder with the system info, the
// app state and, if the player wants, the last match log. GitHub can't receive files through a URL: the
// player drags the .zip into the pre-filled issue page opened next.
const REPORT_MAX_BYTES = 20 * 1024 * 1024; // GitHub attachments are limited to 25 MB

function reportImages(dir) {
  const imagesDir = path.join(dir, 'images');
  if (!fs.existsSync(imagesDir)) return [];
  const names = fs.readdirSync(imagesDir).sort().reverse(); // newest first
  // Full frames (1 per minute) first: they show everything; then the most recent HUD crops
  return [...names.filter((n) => n.startsWith('full_')), ...names.filter((n) => !n.startsWith('full_'))].map((n) =>
    path.join(imagesDir, n)
  );
}

ipcMain.handle('create-problem-report', (_event, payload) => {
  const { info = '', state = '', includeLog = false } = payload || {};
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(
    now.getMinutes()
  )}`;
  const system = [
    `Deadlock Blueprint ${app.getVersion()}${isPortable ? ' (portable)' : app.isPackaged ? ' (installed)' : ' (dev)'}`,
    `Windows ${os.release()} ${os.arch()} — Electron ${process.versions.electron}, Chrome ${process.versions.chrome}`,
    `Displays: ${screen
      .getAllDisplays()
      .map((d) => {
        const px = getDisplayPixelSize(d);
        return `${px.width}x${px.height} @${d.scaleFactor}x${d.id === screen.getPrimaryDisplay().id ? ' (primary)' : ''}`;
      })
      .join(', ')}`,
  ].join('\n');
  const entries = [
    { name: 'info.txt', data: Buffer.from(`${system}\n\n${info}\n`, 'utf8') },
    { name: 'state.json', data: Buffer.from(String(state), 'utf8') },
  ];

  let logFolder = null;
  const dir = includeLog ? latestMatchLogDir() : null;
  if (dir && fs.existsSync(path.join(dir, 'journal.log'))) {
    logFolder = path.basename(dir);
    const journal = fs.readFileSync(path.join(dir, 'journal.log'));
    entries.push({ name: `${logFolder}/journal.log`, data: journal });
    let total = journal.length;
    for (const file of reportImages(dir)) {
      const data = fs.readFileSync(file);
      if (total + data.length > REPORT_MAX_BYTES) continue;
      total += data.length;
      entries.push({ name: `${logFolder}/images/${path.basename(file)}`, data, compress: false });
    }
  }

  let outDir = app.getPath('downloads');
  if (!fs.existsSync(outDir)) outDir = app.getPath('userData');
  const zipPath = path.join(outDir, `Deadlock-Blueprint-report-${stamp}.zip`);
  writeZip(zipPath, entries);
  shell.showItemInFolder(zipPath);
  return { path: zipPath, fileName: path.basename(zipPath), logFolder };
});

// Links opened in the browser: only the project's GitHub pages and the data source
ipcMain.handle('open-external', (_event, url) => {
  if (typeof url !== 'string') return false;
  if (!url.startsWith(`${REPO_URL}/`) && url !== REPO_URL && !url.startsWith('https://deadlock-api.com')) return false;
  shell.openExternal(url);
  return true;
});

ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  isPortable,
  isPackaged: app.isPackaged,
  canAutoUpdate: canAutoUpdate(),
  repoUrl: REPO_URL,
}));

// Updates. Installed version: electron-updater downloads the new version from the GitHub release and installs
// it on restart. Portable version and development: only a notice with a link to the release page.
let updateStatus = { state: 'idle' };

function sendUpdateStatus(status) {
  updateStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', status);
}

/** -1, 0 or 1, comparing "1.4.0" style versions (a "v" prefix and pre-release tags are ignored). */
function compareVersions(a, b) {
  const parse = (v) =>
    String(v)
      .replace(/^v/, '')
      .split(/[.-]/)
      .slice(0, 3)
      .map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

function setupAutoUpdater() {
  if (!canAutoUpdate()) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdateStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => sendUpdateStatus({ state: 'downloading', version: info.version }));
  autoUpdater.on('update-not-available', () => sendUpdateStatus({ state: 'none' }));
  autoUpdater.on('update-downloaded', (info) => sendUpdateStatus({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => sendUpdateStatus({ state: 'error', message: String(err && err.message) }));
}

async function checkForUpdates(manual) {
  if (['checking', 'downloading', 'ready'].includes(updateStatus.state)) return updateStatus;
  if (canAutoUpdate()) {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      sendUpdateStatus({ state: 'error', message: String(err && err.message) });
    }
    return updateStatus;
  }
  if (!app.isPackaged && !manual) return updateStatus; // no automatic check from a development checkout
  sendUpdateStatus({ state: 'checking' });
  try {
    const res = await net.fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const release = await res.json();
    if (release.tag_name && compareVersions(release.tag_name, app.getVersion()) > 0) {
      sendUpdateStatus({
        state: 'available',
        version: String(release.tag_name).replace(/^v/, ''),
        url: release.html_url || `${REPO_URL}/releases/latest`,
      });
    } else {
      sendUpdateStatus({ state: 'none' });
    }
  } catch (err) {
    sendUpdateStatus({ state: 'error', message: String(err && err.message) });
  }
  return updateStatus;
}

ipcMain.handle('check-for-updates', () => checkForUpdates(true));
ipcMain.handle('get-update-status', () => updateStatus);
ipcMain.handle('install-update', () => {
  if (canAutoUpdate() && updateStatus.state === 'ready') autoUpdater.quitAndInstall();
});

ipcMain.handle('window-control', (_event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
  if (action === 'close') mainWindow.close();
});
