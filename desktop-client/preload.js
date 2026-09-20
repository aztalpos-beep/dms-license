// preload.js — exposes a minimal, safe API to the renderer (React/HTML UI).
// The renderer NEVER gets direct access to license-guard.js, sync-engine.js,
// the private key, or the local DB — only this narrow bridge.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dmsLicense', {
  checkNow: () => ipcRenderer.invoke('license:checkNow'),
  onBlocked: (callback) => ipcRenderer.on('license:blocked', (_event, result) => callback(result)),
  onOk: (callback) => ipcRenderer.on('license:ok', (_event, result) => callback(result)),
});

contextBridge.exposeInMainWorld('dmsPos', {
  createSale: (data) => ipcRenderer.invoke('pos:createSale', data),
  adjustInventory: (data) => ipcRenderer.invoke('pos:adjustInventory', data),
  getStock: (item_id) => ipcRenderer.invoke('pos:getStock', { item_id }),
  getQueueStatus: () => ipcRenderer.invoke('pos:getQueueStatus'),
  forceSyncNow: () => ipcRenderer.invoke('pos:forceSyncNow'),
});
