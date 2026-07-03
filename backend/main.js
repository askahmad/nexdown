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
  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('update_status', { status: 'checking', text: 'Checking for updates...' });
  });
  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update_status', { status: 'available', text: 'Update available. Downloading...' });
  });
  autoUpdater.on('update-not-available', (info) => {
    // Optionally notify or ignore
    mainWindow.webContents.send('update_status', { status: 'not-available' });
  });
  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('update_status', { status: 'error', text: 'Error checking for updates' });
  });
  autoUpdater.on('download-progress', (progressObj) => {
    let msg = `Downloading update: ${Math.round(progressObj.percent)}%`;
    mainWindow.webContents.send('update_status', { status: 'downloading', text: msg });
  });
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('update_status', { status: 'downloaded', text: 'Update ready to install!' });
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });
}

app.whenReady().then(() => {
  createWindow();

  // Check for updates shortly after app opens
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
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
