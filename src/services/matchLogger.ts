/**
 * Journal de partie : ce que le scanner a vu et ce que l'application en a déduit, pour analyser une partie après
 * coup et recalibrer le scanner sur de vraies images.
 *
 * Un dossier par partie (les 5 dernières sont gardées) dans %APPDATA%\deadlock-tactical-autobuild\match-logs\ :
 * - `journal.log` : une ligne SCAN à chaque changement de ce que voit le scanner (mode HUD / boutique, héros, âmes,
 *   état des 12 slots avec l'erreur de reconnaissance), et les lignes ÉTAT / RECO / ÉVÉNEMENT de l'application ;
 * - `images\` : coin inventaire (`inv_*.jpg`, x 0..420, y 820..1080) et cases de score (`top_*.jpg`, x 840..1080,
 *   y 30..80) toutes les 2 s, image complète (`full_*.jpg`) chaque minute, en coordonnées 1920x1080 (l'image telle
 *   que le scanner l'a lue) ; l'image complète d'une capture qui n'est pas en 16:9 est gardée telle quelle.
 *
 * Le journal démarre au premier écran de jeu (barre du haut ou boutique) et se ferme 2 min après le dernier, ou
 * quand l'application détecte une nouvelle partie.
 *
 * Désactivé par défaut : le joueur l'active au premier lancement ou dans les Réglages (`dl_gameLogs`). Rien n'est
 * envoyé, les fichiers ne quittent le PC que s'il les joint lui-même à un signalement.
 */
import { getLastNormalizedFrame, type InventorySlotReading, type VisionDetectionResult } from './visionScanner';

export const GAME_LOGS_KEY = 'dl_gameLogs';

/** Game logs are opt-in: 'on' only after the player said yes. */
export function isMatchLogEnabled(): boolean {
  try {
    return localStorage.getItem(GAME_LOGS_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setMatchLogEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(GAME_LOGS_KEY, enabled ? 'on' : 'off');
  } catch {
    // Ignore
  }
  if (!enabled) endLog('journaux désactivés');
}

const HUD_IMAGE_INTERVAL_MS = 2000;
const FULL_IMAGE_INTERVAL_MS = 60000;
const MATCH_END_AFTER_MS = 120000;
const RECENT_LOG_MS = 60000;
const GAME_SCREENS_TO_START = 3;

const INV_CROP = { x: 0, y: 820, w: 420, h: 260 };
const TOP_CROP = { x: 840, y: 30, w: 240, h: 50 };

let active = false;
let logStartedAt = 0;
let lastInGameAt = 0;
let gameScreenStreak = 0;
let lastHudImageAt = 0;
let lastFullImageAt = 0;
let imageIndex = 0;
let lastScanSignature = '';
// Latest ÉTAT / RECO lines (kept while no log is open, written again when one starts)
const stateLines = new Map<string, string>();

const logApi = () => window.electronAPI?.matchLog;

function clock(): string {
  const d = new Date();
  return `${d.toLocaleTimeString('fr-FR')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function write(line: string): void {
  logApi()?.write(`${clock()} ${line}\n`);
}

function startLog(detection: VisionDetectionResult): void {
  logApi()?.start();
  active = true;
  logStartedAt = Date.now();
  imageIndex = 0;
  lastHudImageAt = 0;
  lastFullImageAt = 0;
  lastScanSignature = '';
  write(
    `DÉBUT source="${detection.sourceName}" fenêtre Deadlock=${detection.isDeadlockWindow ? 'oui' : 'non'}`
  );
  for (const [key, line] of stateLines) write(`${key} ${line}`);
}

function endLog(reason: string): void {
  if (!active) return;
  write(`FIN (${reason})`);
  logApi()?.end();
  active = false;
}

function describeSlot(s: InventorySlotReading): string {
  const err = (e: number | undefined) => (e !== undefined && e < 900 ? e.toFixed(1) : '-');
  switch (s.state) {
    case 'empty':
      return `${s.slot} ·`;
    case 'locked':
      return `${s.slot} 🔒`;
    case 'item':
      return `${s.slot} ${s.itemId} ${err(s.error)}`;
    case 'cooldown':
      return `${s.slot} ⏳${s.itemId} ${err(s.error)}`;
    default:
      return `${s.slot} ?${s.category}:${s.itemId} ${err(s.error)}/${s.secondId} ${err(s.secondError)}`;
  }
}

/** Saves a region of a frame (pixel coordinates of that frame). */
function saveRegion(
  frame: HTMLCanvasElement | ImageBitmap,
  region: { x: number; y: number; w: number; h: number },
  name: string,
  quality: number
): void {
  const canvas = document.createElement('canvas');
  canvas.width = region.w;
  canvas.height = region.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(frame, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
  canvas.toBlob(
    (blob) => {
      blob?.arrayBuffer().then((data) => logApi()?.image(name, data));
    },
    'image/jpeg',
    quality
  );
}

/**
 * Called after every scan, before the frame is released. Opens the log on the first game screen, closes it
 * 2 min after the last one, writes a SCAN line when what the scanner sees changes, and saves the HUD crops.
 */
export function logScan(detection: VisionDetectionResult, frame: ImageBitmap | string): void {
  if (!logApi() || !isMatchLogEnabled()) return;
  const now = Date.now();
  const inGame = Boolean(detection.hudVisible || detection.shopOpen);
  gameScreenStreak = inGame ? gameScreenStreak + 1 : 0;
  if (inGame) {
    // A single frame read as the shop in a menu opened an empty log: wait for a few game screens in a row
    if (!active && gameScreenStreak >= GAME_SCREENS_TO_START) startLog(detection);
    lastInGameAt = now;
  } else if (active && now - lastInGameAt > MATCH_END_AFTER_MS) {
    endLog("plus d'écran de jeu depuis 2 min");
  }
  if (!active) return;

  const mode = detection.shopOpen ? 'BOUTIQUE' : detection.hudVisible ? 'HUD' : 'AUTRE';
  const slots = detection.inventorySlots ?? [];
  // Matching errors change on every frame: only what is seen is compared, the errors are just written along
  const signature = JSON.stringify([
    mode,
    detection.detectedHeroId,
    detection.highlightedHeroId,
    detection.abilityHeroId,
    detection.detectedSouls,
    detection.detectedEnemyIds,
    detection.allySlots,
    detection.enemySlots,
    slots.map((s) => `${s.state}:${s.state === 'unknown' ? '' : s.itemId ?? ''}`),
  ]);
  if (signature !== lastScanSignature) {
    lastScanSignature = signature;
    // Portraits slot by slot ("?" unreadable): the lineups are voted per slot (matchTracker.ts)
    const portraits = (slotIds?: (string | null)[]) => (slotIds ? slotIds.map((id) => id ?? '?').join(',') : '-');
    write(
      `SCAN ${mode} héros=${detection.detectedHeroId ?? '-'} (portrait ${detection.highlightedHeroId ?? '-'}, sorts ${
        detection.abilityHeroId ?? '-'
      }) âmes=${detection.detectedSouls ?? '?'} ennemis=[${detection.detectedEnemyIds.join(',')}] alliés@=[${portraits(
        detection.allySlots
      )}] ennemis@=[${portraits(detection.enemySlots)}] slots occupés=${detection.occupiedSlotsCount} cadenas=${
        detection.lockedSlotsCount ?? 0
      } inconnus=${detection.unmatchedSlotsCount ?? 0} | ${slots.map(describeSlot).join(' | ')}`
    );
  }

  // The frame as the scanner analysed it, normalized to 1920x1080 (a frame too small to be analysed has none): the
  // crops are pasted back at their place by the replay harness
  const normalized = getLastNormalizedFrame();
  if (normalized && now - lastHudImageAt >= HUD_IMAGE_INTERVAL_MS) {
    lastHudImageAt = now;
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${String(imageIndex++).padStart(4, '0')}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(
      d.getSeconds()
    )}`;
    saveRegion(normalized, INV_CROP, `inv_${stamp}.jpg`, 0.95);
    saveRegion(normalized, TOP_CROP, `top_${stamp}.jpg`, 0.95);
    if (now - lastFullImageAt >= FULL_IMAGE_INTERVAL_MS) {
      lastFullImageAt = now;
      // Not 16:9: the capture as it is, to see where the HUD really sits if the layout guessed for it is wrong
      // (the replay harness normalizes full frames itself)
      const raw = typeof frame !== 'string' && Math.abs(frame.width / frame.height - 16 / 9) > 0.02 ? frame : null;
      if (raw) saveRegion(raw, { x: 0, y: 0, w: raw.width, h: raw.height }, `full_${stamp}.jpg`, 0.85);
      else saveRegion(normalized, { x: 0, y: 0, w: 1920, h: 1080 }, `full_${stamp}.jpg`, 0.85);
    }
  }
}

/** Application state (key: ÉTAT, RECO...): written when it changes, and again at the start of each log. */
export function logState(key: string, line: string): void {
  if (stateLines.get(key) === line) return;
  stateLines.set(key, line);
  if (active) write(`${key} ${line}`);
}

/** Decision or notable event of the application (item added/removed, hero locked, inventory ignored...). */
export function logEvent(text: string): void {
  if (active) write(`ÉVÉNEMENT ${text}`);
}

/**
 * New match detected by the application: the current log is closed and the next game screen opens a new one,
 * unless the log was opened less than a minute ago (by this very match, before its enemies were recognized).
 */
export function restartMatchLog(reason: string): void {
  if (active && Date.now() - logStartedAt < RECENT_LOG_MS) {
    write(`ÉVÉNEMENT ${reason} (ce journal couvre déjà cette partie)`);
    return;
  }
  endLog(reason);
}
