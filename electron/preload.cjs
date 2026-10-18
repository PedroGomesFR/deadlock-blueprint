const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  findCaptureSource: (preferredSourceId) => ipcRenderer.invoke('find-capture-source', preferredSourceId),
  captureScreen: (preferredSourceId) => ipcRenderer.invoke('capture-screen', preferredSourceId),
  getSources: () => ipcRenderer.invoke('get-sources'),
  setOverlayMode: (enable) => ipcRenderer.invoke('set-overlay-mode', enable),
  setClickThrough: (enable) => ipcRenderer.invoke('set-click-through', enable),
  windowControl: (action) => ipcRenderer.invoke('window-control', action),
  onOverlayStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('overlay-state-changed', listener);
    return () => ipcRenderer.removeListener('overlay-state-changed', listener);
  },
  onTriggerShortcutScan: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('trigger-shortcut-scan', listener);
    return () => ipcRenderer.removeListener('trigger-shortcut-scan', listener);
  },
});
