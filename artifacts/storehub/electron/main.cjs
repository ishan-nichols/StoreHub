'use strict';

const {
  app, BrowserWindow, Menu, Tray, shell,
  ipcMain, dialog, globalShortcut, nativeImage, session,
  Notification, powerSaveBlocker,
} = require('electron');
const path  = require('path');
const fs    = require('fs');

// ── Globals ───────────────────────────────────────────────────────────────────

// true only when launched via `electron:dev` (Vite dev server is running)
const useDevServer = process.argv.includes('--use-dev-server');
const ROOT    = path.join(__dirname, '..');
const DIST    = path.join(ROOT, 'dist', 'public');
const ASSETS  = path.join(__dirname, 'assets');
const CONFIG  = path.join(app.getPath('userData'), 'config.json');

/** @type {BrowserWindow|null} */
let mainWindow = null;
/** @type {Tray|null} */
let tray = null;
/** Prevents screen sleep during active POS session */
let sleepBlockerId = -1;
/** Map of paired Bluetooth device IDs → names (persisted across sessions) */
let pairedBluetoothDevices = loadConfig('pairedDevices', {});
/** Whether kiosk / lock-screen mode is active */
let kioskMode = loadConfig('kioskMode', false);
/** Kiosk exit PIN (4–8 digit string). Empty string disables PIN protection. */
const KIOSK_PIN = loadConfig('kioskPin', '');

// ── Config helpers ────────────────────────────────────────────────────────────

function loadConfig(key, defaultValue) {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    return raw[key] ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveConfig(key, value) {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch {}
  raw[key] = value;
  fs.writeFileSync(CONFIG, JSON.stringify(raw, null, 2));
}

// ── Window creation ───────────────────────────────────────────────────────────

function createWindow() {
  const iconPath = path.join(ASSETS, 'icon.png');
  const icon     = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

  mainWindow = new BrowserWindow({
    width:           1280,
    height:          800,
    minWidth:        1024,
    minHeight:       640,
    fullscreen:      kioskMode,
    // In kiosk mode: no title bar, no frame, no way to resize
    frame:           !kioskMode,
    resizable:       !kioskMode,
    movable:         !kioskMode,
    minimizable:     !kioskMode,
    maximizable:     true,
    title:           'StoreHub POS',
    icon,
    backgroundColor: '#1a1a2e',
    show:            false,   // revealed after 'ready-to-show' for clean splash
    webPreferences: {
      preload:               path.join(__dirname, 'preload.cjs'),
      contextIsolation:      true,
      nodeIntegration:       false,
      sandbox:               false,
      // Enable Web Bluetooth in the renderer
      enableBlinkFeatures:   'WebBluetooth',
      // Allow camera / mic without a separate permission prompt
      allowRunningInsecureContent: false,
    },
  });

  // Hide the default application menu (shows nothing on Windows in prod)
  Menu.setApplicationMenu(null);

  // ── Load URL ──────────────────────────────────────────────────────────────
  if (useDevServer) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'public', 'index.html'));
  }

  // ── Splash / reveal ───────────────────────────────────────────────────────
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (kioskMode) {
      mainWindow.setFullScreen(true);
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    } else {
      mainWindow.maximize();
    }
    startSleepBlocker();
  });

  // ── Close / minimize behaviour ────────────────────────────────────────────
  mainWindow.on('close', (e) => {
    if (kioskMode) {
      e.preventDefault();
      handleKioskExit();
      return;
    }
    // Non-kiosk: minimise to tray instead of quitting
    e.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // ── Kiosk: block Alt+F4 and other exit shortcuts ──────────────────────────
  if (kioskMode) {
    mainWindow.webContents.on('before-input-event', (e, input) => {
      if (
        (input.alt  && input.key === 'F4') ||
        (input.meta && input.key === 'q')  ||
        (input.control && input.key === 'w')
      ) {
        e.preventDefault();
      }
    });
  }

  // ── Navigation guard (keep inside the SPA) ────────────────────────────────
  mainWindow.webContents.on('will-navigate', (e, navUrl) => {
    const allowed = useDevServer
      ? navUrl.startsWith('http://localhost:5173')
      : navUrl.startsWith('file://');
    if (!allowed) {
      e.preventDefault();
      shell.openExternal(navUrl);
    }
  });

  // ── Open links in system browser ──────────────────────────────────────────
  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    shell.openExternal(openUrl);
    return { action: 'deny' };
  });
}

// ── Bluetooth ─────────────────────────────────────────────────────────────────

const KNOWN_READERS = ['square', 'stripe', 'bbpos', 'chipper', 'reader'];

function setupBluetooth() {
  // Auto-approve Bluetooth pairing for known card readers
  session.defaultSession.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();

    // 1. Check if we already paired this device
    const paired = deviceList.find(d => pairedBluetoothDevices[d.deviceId]);
    if (paired) { callback(paired.deviceId); return; }

    // 2. Auto-select a known card reader
    const reader = deviceList.find(d =>
      KNOWN_READERS.some(k => (d.deviceName || '').toLowerCase().includes(k))
    );
    if (reader) {
      pairedBluetoothDevices[reader.deviceId] = reader.deviceName;
      saveConfig('pairedDevices', pairedBluetoothDevices);
      callback(reader.deviceId);
      return;
    }

    // 3. Multiple unknown devices — let the renderer's Web Bluetooth UI handle it
    //    (leave callback uncalled → Chromium shows device picker)
  });

  // Remember newly paired devices reported from the renderer
  session.defaultSession.on('bluetooth-pairing-request', (_e, details, callback) => {
    pairedBluetoothDevices[details.deviceId] = details.deviceName ?? '';
    saveConfig('pairedDevices', pairedBluetoothDevices);
    callback({ confirmed: true });
  });
}

// ── USB (receipt printers, cash drawers) ─────────────────────────────────────

function setupUSB() {
  // Auto-approve USB access for common POS peripherals
  session.defaultSession.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    // Approve all — POS operators control what's plugged in
    const device = details.deviceList[0];
    callback(device ? device.deviceId : '');
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const always = ['usb', 'media', 'camera', 'microphone', 'notifications', 'clipboard-read'];
    return always.includes(permission);
  });

  session.defaultSession.setDevicePermissionHandler((_details) => true);
}

// ── Hardware permissions ──────────────────────────────────────────────────────

function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    // Grant everything for the POS app
    const granted = [
      'media',              // camera + microphone
      'camera',
      'microphone',
      'bluetooth',
      'usb',
      'notifications',
      'clipboard-read',
      'clipboard-sanitized-write',
      'fullscreen',
      'pointerLock',
      'nfc',
    ];
    callback(granted.includes(permission));
  });
}

// ── System tray ───────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(ASSETS, 'tray-icon.png');
  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(trayIcon);
  tray.setToolTip('StoreHub POS');

  const buildMenu = () => ContextMenu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? 'Hide window' : 'Show window',
      click: () => {
        if (mainWindow?.isVisible()) { mainWindow.hide(); }
        else { mainWindow?.show(); mainWindow?.focus(); }
        tray.setContextMenu(buildMenu());
      },
    },
    { type: 'separator' },
    {
      label: `Kiosk mode: ${kioskMode ? 'ON' : 'OFF'}`,
      click: () => toggleKiosk(),
    },
    { type: 'separator' },
    { label: 'Quit StoreHub', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(buildMenu());
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// Lazy-require to avoid circular dependency at module load time
function ContextMenu() {}
ContextMenu.buildFromTemplate = Menu.buildFromTemplate;

// ── Kiosk mode ────────────────────────────────────────────────────────────────

function toggleKiosk() {
  kioskMode = !kioskMode;
  saveConfig('kioskMode', kioskMode);

  if (!mainWindow) return;

  if (kioskMode) {
    mainWindow.setFullScreen(true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setResizable(false);
    mainWindow.setMovable(false);
    mainWindow.setMinimizable(false);
  } else {
    mainWindow.setFullScreen(false);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setResizable(true);
    mainWindow.setMovable(true);
    mainWindow.setMinimizable(true);
  }
}

/** Shows a PIN dialog. Resolves true if correct PIN entered or no PIN set. */
async function promptKioskPin() {
  if (!KIOSK_PIN) return true;

  const pinWindow = new BrowserWindow({
    width:           400,
    height:          300,
    resizable:       false,
    frame:           false,
    alwaysOnTop:     true,
    modal:           true,
    parent:          mainWindow,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  const pinHtml = path.join(__dirname, 'kiosk-pin.html');
  pinWindow.loadFile(pinHtml);

  return new Promise((resolve) => {
    ipcMain.once('kiosk-pin-submit', (_e, entered) => {
      pinWindow.close();
      resolve(entered === KIOSK_PIN);
    });
    pinWindow.on('closed', () => resolve(false));
  });
}

async function handleKioskExit() {
  const ok = await promptKioskPin();
  if (ok) {
    app.isQuitting = true;
    app.quit();
  }
}

// ── Screen sleep blocker ──────────────────────────────────────────────────────

function startSleepBlocker() {
  if (sleepBlockerId < 0) {
    sleepBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  }
}

function stopSleepBlocker() {
  if (sleepBlockerId >= 0 && powerSaveBlocker.isStarted(sleepBlockerId)) {
    powerSaveBlocker.stop(sleepBlockerId);
    sleepBlockerId = -1;
  }
}

// ── Auto-updater ──────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  if (!app.isPackaged) return;   // only check for updates in packaged builds

  const { autoUpdater } = require('electron-updater');

  autoUpdater.autoDownload    = true;   // download silently in background
  autoUpdater.autoInstallOnAppQuit = true;  // install on next quit

  autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('update-available');
    showNative('StoreHub Update', 'A new version is downloading in the background.');
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-downloaded');
    showNative('StoreHub Update Ready', 'Update downloaded. It will install on next restart.');
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater]', err.message);
  });

  // Check on launch, then every 4 hours
  autoUpdater.checkForUpdates().catch(console.error);
  setInterval(() => autoUpdater.checkForUpdates().catch(console.error), 4 * 60 * 60 * 1000);
}

// ── Native notifications helper ───────────────────────────────────────────────

function showNative(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

// ── IPC handlers (called from preload → renderer) ─────────────────────────────

function setupIPC() {
  // Native file-save dialog (PDF export)
  ipcMain.handle('show-save-dialog', async (_e, opts) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title:       opts.title ?? 'Save file',
      defaultPath: opts.filename ?? 'storehub-export.pdf',
      filters:     opts.filters  ?? [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled) return null;
    return result.filePath;
  });

  // Write bytes to a path returned by show-save-dialog
  ipcMain.handle('write-file', async (_e, filePath, base64Data) => {
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    return true;
  });

  // Native print dialog
  ipcMain.handle('print', async (_e, opts) => {
    return new Promise((resolve) => {
      mainWindow.webContents.print(
        { silent: false, printBackground: true, ...opts },
        (success, reason) => resolve({ success, reason }),
      );
    });
  });

  // Print to PDF and return base64
  ipcMain.handle('print-to-pdf', async () => {
    const data = await mainWindow.webContents.printToPDF({ printBackground: true });
    return data.toString('base64');
  });

  // Native system notification
  ipcMain.handle('notify', (_e, title, body) => { showNative(title, body); });

  // App version
  ipcMain.handle('get-version', () => app.getVersion());

  // Kiosk mode queries / toggle
  ipcMain.handle('get-kiosk-mode', () => kioskMode);
  ipcMain.handle('set-kiosk-mode', (_e, enabled) => {
    if (enabled !== kioskMode) toggleKiosk();
  });

  // Forget a paired Bluetooth device
  ipcMain.handle('forget-bluetooth-device', (_e, deviceId) => {
    delete pairedBluetoothDevices[deviceId];
    saveConfig('pairedDevices', pairedBluetoothDevices);
  });

  // Restart to apply a downloaded update
  ipcMain.handle('restart-and-update', () => {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.quitAndInstall();
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

// Single-instance lock — second launch focuses the existing window
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  // Register as a Windows login/startup item so the POS app launches on boot
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });

  setupPermissions();
  setupBluetooth();
  setupUSB();
  setupIPC();
  createWindow();
  createTray();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopSleepBlocker();
  // On macOS keep the app running; on Windows/Linux quit
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { app.isQuitting = true; });

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopSleepBlocker();
});
