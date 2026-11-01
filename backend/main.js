const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Basic auto-updater configuration
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// 1. Start the Express server in the background
try {
  require('./server');
  console.log('[Electron] Background Express server started successfully.');
} catch (err) {
  console.error('[Electron] Failed to start Express server:', err);
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 850,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    title: 'NexDown Desktop',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Since this is a simple local app with local server
    },
    autoHideMenuBar: true, // Clean native UI window
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links (like folders or browser URLs) in user's default browser/explorer
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ── Auto-Updater Events ──
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info?.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update_status', {
        status: 'available',
        text: `Update available (${info?.version || 'new version'}). Downloading...`
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] App is up to date.');
  });

  autoUpdater.on('error', (err) => {
    // Senior Best Practice: Background startup update checks must fail silently.
    // Do not disrupt the user with an error banner if offline or no GitHub release is found.
    console.warn('[AutoUpdater] Background update check failed (silent):', err ? (err.message || err) : err);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    console.log(`[AutoUpdater] Download: ${percent}%`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update_status', {
        status: 'downloading',
        text: `Downloading update: ${percent}%`
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info?.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update_status', {
        status: 'downloaded',
        text: `Update ready to install!`
      });
    }
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });
}

app.whenReady().then(() => {
  createWindow();

  // Check for updates shortly after app opens (only in packaged production environment)
  setTimeout(() => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }
  }, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
