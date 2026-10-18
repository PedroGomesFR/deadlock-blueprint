const { app, BrowserWindow, ipcMain, desktopCapturer, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const v8 = require('v8');
const vm = require('vm');

// Explicit GC for the fallback thumbnail capture: thumbnails are native memory that V8 does not see, so
// without it they pile up between collections (several GB with many windows open)
v8.setFlagsFromString('--expose_gc');
const collectGarbage = vm.runInNewContext('gc');
let lastFallbackGc = 0;

// Disable buggy WGC capturer (wgc_capturer_win.cc:356 -2147024809) and suppress noisy Chromium stderr logs
app.commandLine.appendSwitch(
  'disable-features',
  'AllowWgcScreenCapturer,AllowWgcScreenZeroHz,AllowWgcWindowCapturer,AllowWgcWindowZeroHz,WebRtcAllowWgcDesktopCapturer'
);
app.commandLine.appendSwitch('log-level', '3');

const APP_ICON = path.join(__dirname, '../dist/icons/upscalemedia-transformed.png');

let mainWindow = null;
let overlayWindow = null;
let isOverlayMode = false;
let isClickThrough = false;

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

function getGamingDisplay() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  // Prefer primary display if landscape, otherwise any landscape display
  if (primary.bounds.width >= primary.bounds.height) {
    return primary;
  }
  return displays.find((d) => d.bounds.width > d.bounds.height) || primary;
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
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
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
    const gamingDisplay = getGamingDisplay();
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    const describe = (s, isDeadlockWindow) => ({
      id: s.id,
      isDeadlockWindow,
      sourceName: isDeadlockWindow
        ? `Jeu : ${s.name}`
        : `${s.name} (${gamingDisplay.bounds.width}x${gamingDisplay.bounds.height})`,
    });

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

// Fallback capture only (when the live stream is not available): a 1920x1080 thumbnail of EVERY window and
// screen per call, so it is heavy (~45 MB per call with 9 windows) and needs the explicit GC below.
ipcMain.handle('capture-screen', async (_event, preferredSourceId) => {
  try {
    const gamingDisplay = getGamingDisplay();
    const gamingDisplayId = String(gamingDisplay.id);

    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 1920, height: 1080 },
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

    // 3. Fallback: Primary Gaming Monitor (DISPLAY2: 1920x1080, display_id === gamingDisplayId)
    if (!targetSource) {
      const screenSources = sources.filter((s) => s.id.startsWith('screen:') && !s.thumbnail.isEmpty());
      targetSource =
        screenSources.find((s) => String(s.display_id) === gamingDisplayId) ||
        screenSources[0];
    }

    if (!targetSource) {
      return { success: false, error: 'Aucune source vidéo détectée.' };
    }

    const jpegBuf = targetSource.thumbnail.toJPEG(92);
    const dataUrl = `data:image/jpeg;base64,${jpegBuf.toString('base64')}`;
    const size = targetSource.thumbnail.getSize();

    return {
      success: true,
      sourceName: isDeadlockWindow
        ? `Jeu : ${targetSource.name}`
        : `${targetSource.name} (${gamingDisplay.bounds.width}x${gamingDisplay.bounds.height})`,
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
      error: err.message || 'Erreur lors de la capture décran.',
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
      const resLabel = disp
        ? `${disp.bounds.width}x${disp.bounds.height} ${disp.bounds.width > disp.bounds.height ? '(Jeu / Paysage)' : '(Vertical)'}`
        : '';
      return {
        id: s.id,
        name: `${s.name} — ${resLabel}`,
        type: 'screen',
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

ipcMain.handle('window-control', (_event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
  if (action === 'close') mainWindow.close();
});
