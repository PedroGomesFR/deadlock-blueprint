/**
 * Capture d'écran du jeu pour le scan temps réel (toutes les 350 ms).
 *
 * Un seul flux vidéo (capture « desktop » de Chromium) est ouvert sur la fenêtre Deadlock, et chaque scan en
 * lit l'image courante (~5 ms). Cela remplace les miniatures `desktopCapturer` : elles étaient prises de
 * TOUTES les fenêtres et TOUS les écrans en 1920x1080 à chaque scan (~45 Mo pour 9 fenêtres, ~270 ms),
 * puis encodées en JPEG et envoyées en base64, et leur mémoire native n'était libérée qu'au bon vouloir du
 * GC du processus principal : plusieurs Go de RAM sur un PC avec beaucoup de fenêtres.
 *
 * Si le flux ne s'ouvre pas plusieurs fois de suite, repli sur l'ancienne capture par miniature (`captureScreen`)
 * pendant une minute, puis nouvel essai du flux.
 */
import type { CaptureSourceInfo } from '../electron';

export interface GameFrame {
  /** Live frame (to close once analysed), or JPEG data URL from the fallback capture. */
  image: ImageBitmap | string;
  sourceName: string;
  isDeadlockWindow: boolean;
}

interface FrameGrabber {
  grabFrame(): Promise<ImageBitmap>;
}

// ImageCapture (Chromium) is not in TypeScript's DOM lib
const ImageCaptureCtor = (
  globalThis as unknown as { ImageCapture?: new (track: MediaStreamTrack) => FrameGrabber }
).ImageCapture;

// The best source is re-checked in the background (Deadlock started/closed, user choice changed)
const SOURCE_REFRESH_MS = 3000;
// A minimized window delivers no frame: give up on this scan instead of blocking the scan loop
const GRAB_TIMEOUT_MS = 1500;
// The scan loop waits for each scan: picking the source or opening the stream must not block it either
const OPEN_TIMEOUT_MS = 5000;
// The stream could not be opened this many times in a row (the window closed in between, or no capture on this
// machine): the heavy thumbnail capture for a minute, then the stream again
const STREAM_FAILURES_BEFORE_FALLBACK = 3;
const FALLBACK_DURATION_MS = 60000;
// Capture size: 16:9 screens up to 1440p arrive at their own size (4K at 2560x1440), 16:10 (2560x1600) and
// ultrawide (3440x1440 -> 2560x1072) with their HUD at about the 1080p scale or more. The scanner normalizes every
// frame to 1920x1080: a 4K frame would cost four times the pixels for the same reading.
const MAX_CAPTURE_WIDTH = 2560;
const MAX_CAPTURE_HEIGHT = 1600;

let stream: MediaStream | null = null;
let grabber: FrameGrabber | null = null;
let activeSource: CaptureSourceInfo | null = null;
let activePreferredId = '';
let lastRefresh = 0;
// One source refresh at a time: two streams opened together, the first one was never closed
let refreshInFlight: Promise<void> | null = null;
const streamSupported = Boolean(ImageCaptureCtor && navigator.mediaDevices?.getUserMedia);
let streamFailures = 0;
let fallbackUntil = 0;

/** `promise`, or an error after `ms` (the promise itself keeps running). */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} : pas de réponse après ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function closeStream(): void {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  grabber = null;
  activeSource = null;
}

async function openStream(source: CaptureSourceInfo): Promise<void> {
  closeStream();
  // Legacy Chromium constraints: the only way to capture a given desktopCapturer source with getUserMedia
  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: source.id,
        maxWidth: MAX_CAPTURE_WIDTH,
        maxHeight: MAX_CAPTURE_HEIGHT,
        maxFrameRate: 5,
      },
    },
  } as unknown as MediaStreamConstraints;
  const request = navigator.mediaDevices.getUserMedia(constraints);
  let newStream: MediaStream;
  try {
    newStream = await withTimeout(request, OPEN_TIMEOUT_MS, 'Ouverture du flux');
  } catch (err) {
    // A stream that opens after the timeout is closed straight away
    request.then(
      (late) => late.getTracks().forEach((t) => t.stop()),
      () => {}
    );
    throw err;
  }
  const track = newStream.getVideoTracks()[0];
  if (!track) {
    newStream.getTracks().forEach((t) => t.stop());
    throw new Error('Flux sans piste vidéo');
  }
  // Window closed (Deadlock quit): reopen on the next best source at the next scan
  track.addEventListener('ended', () => {
    if (stream === newStream) closeStream();
  });
  stream = newStream;
  grabber = new ImageCaptureCtor!(track);
  activeSource = source;
  streamFailures = 0;
}

async function updateSource(preferredSourceId: string): Promise<void> {
  activePreferredId = preferredSourceId;
  lastRefresh = Date.now();
  const best = await withTimeout(
    window.electronAPI!.findCaptureSource(preferredSourceId || undefined),
    OPEN_TIMEOUT_MS,
    'Choix de la source'
  );
  if (!best) {
    closeStream();
  } else if (best.id !== activeSource?.id) {
    await openStream(best);
  }
}

/** Picks the best source and opens the stream on it if it changed; a refresh already running is shared. */
function refreshSource(preferredSourceId: string): Promise<void> {
  refreshInFlight ??= updateSource(preferredSourceId).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Next frame or null after GRAB_TIMEOUT_MS; a frame arriving after the timeout is closed right away. */
function grabWithTimeout(g: FrameGrabber): Promise<ImageBitmap | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      resolve(null);
    }, GRAB_TIMEOUT_MS);
    g.grabFrame().then(
      (bitmap) => {
        if (settled) {
          bitmap.close();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(bitmap);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

async function grabFromStream(preferredSourceId: string): Promise<GameFrame | null> {
  const refreshDue = Date.now() - lastRefresh > SOURCE_REFRESH_MS;
  if (preferredSourceId !== activePreferredId || (!grabber && refreshDue)) {
    await refreshSource(preferredSourceId);
  } else if (grabber && refreshDue) {
    // The current stream keeps serving frames while the best source is checked in the background. A failed check
    // keeps it; a failed opening of another source has already closed it (openStream), the next scan retries.
    refreshSource(preferredSourceId).catch(() => {});
  }
  const source = activeSource;
  if (!grabber || !source) return null;
  const bitmap = await grabWithTimeout(grabber);
  return bitmap
    ? { image: bitmap, sourceName: source.sourceName, isDeadlockWindow: source.isDeadlockWindow }
    : null;
}

/** Current image of the game window (or gaming screen), or null when nothing can be captured. */
export async function grabGameFrame(preferredSourceId = ''): Promise<GameFrame | null> {
  if (!window.electronAPI) return null;

  if (streamSupported && Date.now() >= fallbackUntil) {
    try {
      return await grabFromStream(preferredSourceId);
    } catch (err) {
      closeStream();
      // Tried again at the next source refresh (a few seconds): the window may have closed in between
      if (++streamFailures < STREAM_FAILURES_BEFORE_FALLBACK) return null;
      console.warn('Capture par flux indisponible, repli sur les miniatures pendant une minute :', err);
      streamFailures = 0;
      fallbackUntil = Date.now() + FALLBACK_DURATION_MS;
    }
  }

  const res = await withTimeout(
    window.electronAPI.captureScreen(preferredSourceId || undefined),
    OPEN_TIMEOUT_MS,
    'Capture par miniature'
  ).catch(() => null);
  if (!res?.success || !res.dataUrl) return null;
  return {
    image: res.dataUrl,
    sourceName: res.sourceName || 'Écran de jeu',
    isDeadlockWindow: Boolean(res.isDeadlockWindow),
  };
}

/** Releases a frame once analysed (live frames hold ~8 MB until closed). */
export function releaseGameFrame(frame: GameFrame): void {
  if (typeof frame.image !== 'string') frame.image.close();
}
