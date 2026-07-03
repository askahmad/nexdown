const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

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
    icon: path.join(__dirname, '..', 'extension', 'icon128.png'),
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
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
