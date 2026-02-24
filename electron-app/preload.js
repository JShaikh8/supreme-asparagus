// electron-app/preload.js
// Security bridge between main and renderer processes

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Attempt login with Oracle credentials
   */
  login: (credentials) => ipcRenderer.invoke('login', credentials),

  /**
   * Login without VPN (baseline-only mode)
   * Skips Oracle authentication and disables internal features
   */
  loginNoVpn: () => ipcRenderer.invoke('login-no-vpn'),

  /**
   * Logout and clear stored credentials
   */
  logout: () => ipcRenderer.invoke('logout'),

  /**
   * Get Oracle connection defaults (host, port, database)
   */
  getOracleDefaults: () => ipcRenderer.invoke('get-oracle-defaults'),

  /**
   * Check if running in Electron environment
   */
  isElectron: true,

  /**
   * Get app version
   */
  getVersion: () => ipcRenderer.invoke('get-version')
});
