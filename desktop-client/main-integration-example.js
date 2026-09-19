// main-integration-example.js
// Shows exactly where to wire the license guard into an Electron app's main process.
// Adapt paths/imports to your real main.js — this is a drop-in reference, not a
// separate app.

const { app, BrowserWindow, ipcMain } = require('electron');
const { LicenseGuard } = require('./license-guard');
const { LocalDb } = require('./local-db');

let mainWindow;
let guard;
let localDb;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: __dirname + '/preload.js',
      contextIsolation: true,
    },
  });
  mainWindow.loadFile('index.html');
}

async function enforceLicenseOrQuit() {
  const result = await guard.check();
  if (!result.allowed) {
    // Send the reason to the renderer so it can show a proper screen
    // ("trial expired", "please connect to internet", etc.) instead of
    // just crashing or silently closing.
    mainWindow.webContents.send('license:blocked', result);
    return false;
  }
  mainWindow.webContents.send('license:ok', result);
  return true;
}

app.whenReady().then(async () => {
  localDb = new LocalDb();
  guard = new LicenseGuard(localDb);

  await createWindow();

  try {
    await guard.init(localDb);
  } catch (err) {
    // First-run registration failed — almost certainly no internet on first install.
    mainWindow.webContents.send('license:blocked', {
      allowed: false,
      reason: 'first_run_needs_internet',
      message: 'Internet connection is required for first-time setup.',
    });
    return;
  }

  const ok = await enforceLicenseOrQuit();
  if (!ok) return; // renderer shows the block screen; do not proceed to load POS UI

  // Periodic re-check while the app is running (every 15 min).
  setInterval(enforceLicenseOrQuit, 15 * 60 * 1000);
});

// Renderer can also ask on-demand (e.g. before starting a new sale) — wire this
// into whatever creates a Sale/Payment record so a blocked license can't write.
ipcMain.handle('license:checkNow', async () => {
  return guard.check();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
