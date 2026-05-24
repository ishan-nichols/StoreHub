'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, typed API surface to the renderer via window.electronAPI.
// The renderer (React app) can call these without ever touching Node.js directly.

contextBridge.exposeInMainWorld('electronAPI', {
  // ── File system ──────────────────────────────────────────────────────────

  /** Opens a native Save dialog. Returns the chosen path or null if cancelled. */
  showSaveDialog: (opts) => ipcRenderer.invoke('show-save-dialog', opts),

  /** Writes base64-encoded bytes to a file path from showSaveDialog. */
  writeFile: (filePath, base64Data) => ipcRenderer.invoke('write-file', filePath, base64Data),

  // ── Printing ──────────────────────────────────────────────────────────────

  /** Opens the native Windows Print dialog for the current page. */
  print: (opts) => ipcRenderer.invoke('print', opts ?? {}),

  /** Renders the current page to PDF; returns base64-encoded PDF bytes. */
  printToPDF: () => ipcRenderer.invoke('print-to-pdf'),

  // ── Notifications ─────────────────────────────────────────────────────────

  /** Shows a native Windows notification (low-stock alert, tax deadline, etc.) */
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),

  // ── App info ──────────────────────────────────────────────────────────────

  getVersion: () => ipcRenderer.invoke('get-version'),

  // ── Kiosk mode ────────────────────────────────────────────────────────────

  getKioskMode:  ()       => ipcRenderer.invoke('get-kiosk-mode'),
  setKioskMode:  (enabled) => ipcRenderer.invoke('set-kiosk-mode', enabled),

  // ── Bluetooth ─────────────────────────────────────────────────────────────

  forgetBluetoothDevice: (deviceId) => ipcRenderer.invoke('forget-bluetooth-device', deviceId),

  // ── Auto-updater ──────────────────────────────────────────────────────────

  restartAndUpdate: () => ipcRenderer.invoke('restart-and-update'),

  /** Register a listener that fires when an update is available. */
  onUpdateAvailable: (cb) => {
    ipcRenderer.on('update-available', cb);
    return () => ipcRenderer.removeListener('update-available', cb);
  },

  /** Register a listener that fires when an update has been downloaded. */
  onUpdateDownloaded: (cb) => {
    ipcRenderer.on('update-downloaded', cb);
    return () => ipcRenderer.removeListener('update-downloaded', cb);
  },

  // ── Kiosk PIN submission (used by the PIN window) ─────────────────────────

  submitKioskPin: (pin) => ipcRenderer.send('kiosk-pin-submit', pin),

  // ── Platform detection ───────────────────────────────────────────────────

  isElectron: true,
  platform:   process.platform,
});
