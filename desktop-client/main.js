// main.js — Electron entry point. This is what `npm start` actually runs.
// It wires the license guard (and sync engine, if you're using it) to a
// simple window that shows license status. Replace the window content
// with your real POS UI once this is confirmed working end to end.

require('dotenv').config();
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { LicenseGuard } = require('./license-guard');
const { LocalDb } = require('./local-db');

let mainWindow;
let guard;
let localDb;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
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

app.whenReady().then(async () => {
  createWindow();

  localDb = new LocalDb();
  guard = new LicenseGuard(localDb);

  // Wait for the window to actually finish loading before pushing status to it
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

    await enforceLicense();
    // Re-check every 15 minutes while the app is running.
    setInterval(enforceLicense, 15 * 60 * 1000);
  });
});

ipcMain.handle('license:checkNow', async () => guard.check());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
