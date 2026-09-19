// preload.js — exposes a minimal, safe API to the renderer (React UI).
// The renderer NEVER gets direct access to license-guard.js, the private
// key, or the local DB — only this narrow bridge.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dmsLicense', {
  checkNow: () => ipcRenderer.invoke('license:checkNow'),
  onBlocked: (callback) => ipcRenderer.on('license:blocked', (_event, result) => callback(result)),
  onOk: (callback) => ipcRenderer.on('license:ok', (_event, result) => callback(result)),
});
