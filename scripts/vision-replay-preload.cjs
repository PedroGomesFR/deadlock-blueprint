// Bridge of the vision replay page (src/replay/replay.ts) to scripts/vision-replay.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('replayAPI', {
  getJobs: () => ipcRenderer.invoke('replay-jobs'),
  readFile: (file) => ipcRenderer.invoke('replay-read', file),
  result: (name, summary) => ipcRenderer.send('replay-result', name, summary),
  done: () => ipcRenderer.send('replay-done'),
});
