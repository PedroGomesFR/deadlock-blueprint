export interface ElectronSourceInfo {
  id: string;
  name: string;
  type: 'screen' | 'window';
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

declare global {
  interface Window {
    electronAPI?: {
      findCaptureSource: (preferredSourceId?: string) => Promise<CaptureSourceInfo | null>;
      captureScreen: (preferredSourceId?: string) => Promise<CaptureScreenResponse>;
      getSources: () => Promise<ElectronSourceInfo[]>;
      setOverlayMode: (enable?: boolean) => Promise<OverlayState>;
      setClickThrough: (enable?: boolean) => Promise<OverlayState>;
      windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
      onOverlayStateChanged: (callback: (state: OverlayState) => void) => () => void;
      onTriggerShortcutScan: (callback: () => void) => () => void;
    };
  }
}
