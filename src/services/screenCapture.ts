/**
 * Capture d'écran du jeu pour le scan temps réel (toutes les 350 ms).
 *
 * Un seul flux vidéo (capture « desktop » de Chromium) est ouvert sur la fenêtre Deadlock, et chaque scan en
 * lit l'image courante (~5 ms). Cela remplace les miniatures `desktopCapturer` : elles étaient prises de
 * TOUTES les fenêtres et TOUS les écrans en 1920x1080 à chaque scan (~45 Mo pour 9 fenêtres, ~270 ms),
 * puis encodées en JPEG et envoyées en base64, et leur mémoire native n'était libérée qu'au bon vouloir du
 * GC du processus principal : plusieurs Go de RAM sur un PC avec beaucoup de fenêtres.
 *
 * Si le flux est indisponible, repli sur l'ancienne capture par miniature (`captureScreen`).
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

let stream: MediaStream | null = null;
let grabber: FrameGrabber | null = null;
let activeSource: CaptureSourceInfo | null = null;
let activePreferredId = '';
let lastRefresh = 0;
let refreshing = false;
let streamUnavailable = !ImageCaptureCtor || !navigator.mediaDevices?.getUserMedia;

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
        maxWidth: 5120,
        maxHeight: 2880,
        maxFrameRate: 5,
      },
    },
  } as unknown as MediaStreamConstraints;
  const newStream = await navigator.mediaDevices.getUserMedia(constraints);
  const track = newStream.getVideoTracks()[0];
  // Window closed (Deadlock quit): reopen on the next best source at the next scan
  track.addEventListener('ended', () => {
    if (stream === newStream) closeStream();
  });
  stream = newStream;
  grabber = new ImageCaptureCtor!(track);
  activeSource = source;
}

async function refreshSource(preferredSourceId: string): Promise<void> {
  activePreferredId = preferredSourceId;
  lastRefresh = Date.now();
  const best = await window.electronAPI!.findCaptureSource(preferredSourceId || undefined);
  if (!best) {
    closeStream();
  } else if (best.id !== activeSource?.id) {
    await openStream(best);
  }
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
  } else if (grabber && refreshDue && !refreshing) {
    refreshing = true;
    refreshSource(preferredSourceId)
      .catch(() => closeStream())
      .finally(() => {
        refreshing = false;
      });
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

  if (!streamUnavailable) {
    try {
      return await grabFromStream(preferredSourceId);
    } catch (err) {
      // getUserMedia refused on this machine: use the heavier thumbnail capture from now on
      console.warn('Capture par flux indisponible, repli sur les miniatures :', err);
      streamUnavailable = true;
      closeStream();
    }
  }

  const res = await window.electronAPI.captureScreen(preferredSourceId || undefined);
  if (!res.success || !res.dataUrl) return null;
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
