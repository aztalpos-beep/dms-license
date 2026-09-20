// main.js — Electron entry point. This is what `npm start` actually runs.
// Wires: license guard (online/offline/grace-period check) + sync engine
// (offline-first Sale/Inventory writes that push to the cloud when online).

require('dotenv').config();
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { LicenseGuard } = require('./license-guard');
const { LocalDb } = require('./local-db');
const { SyncEngine } = require('./sync-engine');

let mainWindow;
let guard;
let localDb;
let syncEngine;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

async function enforceLicense() {
  const result = await guard.check();
  if (mainWindow) {
    mainWindow.webContents.send(result.allowed ? 'license:ok' : 'license:blocked', result);
  }
  return result.allowed;
}

async function getQueueStatus() {
  const queue = await localDb.getAll('sync_queue');
  const pending = queue.filter((q) => q.status === 'pending').length;
  const synced = queue.filter((q) => q.status === 'synced').length;
  return { pending, synced, total: queue.length };
}

app.whenReady().then(async () => {
  createWindow();

  localDb = new LocalDb();
  guard = new LicenseGuard(localDb);

  mainWindow.webContents.once('did-finish-load', async () => {
    try {
      await guard.init(localDb);
    } catch (err) {
      mainWindow.webContents.send('license:blocked', {
        allowed: false,
        reason: 'first_run_needs_internet',
        message: 'Internet connection is required for first-time setup. ' + err.message,
      });
      return;
    }

    const allowed = await enforceLicense();
    setInterval(enforceLicense, 15 * 60 * 1000);

    // Sync engine only needs a device_id, not license approval, to queue
    // writes locally — but we only START the background push/pull loop once
    // the license check has passed at least once.
    syncEngine = new SyncEngine(localDb, guard.deviceId, process.env.DMS_CLOUD_API);
    if (allowed) {
      syncEngine.startBackgroundLoop(15000); // every 15s for demo visibility; raise for production
    }
  });
});

ipcMain.handle('license:checkNow', async () => guard.check());

ipcMain.handle('pos:createSale', async (event, { total_amount, note }) => {
  if (!syncEngine) throw new Error('Sync engine not ready yet');
  return syncEngine.writeAndQueue('sales', {
    customer_id: null,
    total_amount: Number(total_amount),
    payload: JSON.stringify({ note: note || null }),
  });
});

ipcMain.handle('pos:adjustInventory', async (event, { item_id, delta_qty, reason }) => {
  if (!syncEngine) throw new Error('Sync engine not ready yet');
  return syncEngine.writeAndQueue('inventory_adjustments', {
    item_id,
    delta_qty: Number(delta_qty),
    reason: reason || null,
  });
});

ipcMain.handle('pos:getStock', async (event, { item_id }) => {
  if (!syncEngine) return 0;
  return syncEngine.getLocalStock(item_id);
});

ipcMain.handle('pos:getQueueStatus', async () => getQueueStatus());

ipcMain.handle('pos:forceSyncNow', async () => {
  if (!syncEngine) return { pending: 0, synced: 0, total: 0 };
  await syncEngine.processQueue();
  await syncEngine.pullRemoteChanges();
  return getQueueStatus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
