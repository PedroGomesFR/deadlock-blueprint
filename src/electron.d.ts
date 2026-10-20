export interface ElectronSourceInfo {
  id: string;
  name: string;
  type: 'screen' | 'window';
  width?: number;
  height?: number;
  preview?: string;
}

export interface CaptureScreenResponse {
  success: boolean;
  error?: string;
  sourceName?: string;
  sourceId?: string;
  isDeadlockWindow?: boolean;
  width?: number;
  height?: number;
  dataUrl?: string;
  availableSources?: ElectronSourceInfo[];
}

/** Source picked by the main process for the live capture stream (no thumbnail taken). */
export interface CaptureSourceInfo {
  id: string;
  sourceName: string;
  isDeadlockWindow: boolean;
}

export interface OverlayState {
  isOverlayMode: boolean;
  isClickThrough: boolean;
}

export interface AppInfo {
  version: string;
  isPortable: boolean;
  isPackaged: boolean;
  canAutoUpdate: boolean;
  repoUrl: string;
}

export type UpdateStatus =
  | { state: 'idle' | 'checking' | 'none' }
  | { state: 'available'; version: string; url: string } // portable / development: download it by hand
  | { state: 'downloading' | 'ready'; version: string } // installed version: electron-updater
  | { state: 'error'; message: string };

export interface ProblemReportResult {
  path: string;
  fileName: string;
  logFolder: string | null;
}

declare global {
  interface Window {
    electronAPI?: {
      findCaptureSource: (preferredSourceId?: string) => Promise<CaptureSourceInfo | null>;
      captureScreen: (preferredSourceId?: string) => Promise<CaptureScreenResponse>;
      getSources: () => Promise<ElectronSourceInfo[]>;
      setOverlayMode: (enable?: boolean) => Promise<OverlayState>;
      setClickThrough: (enable?: boolean) => Promise<OverlayState>;
      /** Overlay window only: zoom of its page, its window resized by the same factor. */
      setOverlayScale: (scale: number) => Promise<number>;
      /** Writes to the clipboard (item name for the shop search). */
      copyText: (text: string) => Promise<boolean>;
      windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
      getAppInfo: () => Promise<AppInfo>;
      /** Opens a page of the project's GitHub repository (or deadlock-api.com) in the browser. */
      openExternal: (url: string) => Promise<boolean>;
      /** Match log files (src/services/matchLogger.ts), written by the main process. */
      matchLog: {
        start: () => void;
        write: (text: string) => void;
        image: (name: string, data: ArrayBuffer) => void;
        end: () => void;
        openFolder: () => Promise<string>;
        info: () => Promise<{ latest: string | null }>;
        deleteAll: () => Promise<boolean>;
      };
      createProblemReport: (payload: { info: string; state: string; includeLog: boolean }) => Promise<ProblemReportResult>;
      updates: {
        check: () => Promise<UpdateStatus>;
        status: () => Promise<UpdateStatus>;
        install: () => Promise<void>;
        onStatus: (callback: (status: UpdateStatus) => void) => () => void;
      };
      onOverlayStateChanged: (callback: (state: OverlayState) => void) => () => void;
      onTriggerShortcutScan: (callback: () => void) => () => void;
    };
  }
}
