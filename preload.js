const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('wl', {
  // overlay
  onInit: on('init'),
  onTrack: on('track'),
  onPos: on('pos'),
  onSettings: on('settings'),
  onVis: on('vis'),
  close: () => ipcRenderer.send('close'),
  // settings window
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (patch) => ipcRenderer.send('set-settings', patch),
  resetSettings: () => ipcRenderer.send('reset-settings')
});
