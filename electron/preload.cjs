// CommonJS, same reasoning as main.cjs (package.json's "type": "module" would
// otherwise load a plain .js file here as ESM). Only attached to the admin
// dashboard's own kiosk window (see main.cjs) - the managed monitor/signage
// windows (displayManager.cjs) never get this, so `window.electronAPI` is
// exactly how the renderer tells "I'm the dashboard, running in Electron"
// apart from a plain browser tab or a signage window.
const { contextBridge, ipcRenderer } = require('electron')

// Exposed instead of the raw ipcRenderer so the renderer never gets a direct
// Node/Electron handle (contextIsolation stays intact) - just the three
// actions the dashboard's own window-control buttons need, standing in for
// the native title bar kiosk mode has no room for.
contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  /** Toggles kiosk mode on the window hosting this page; resolves to the new state (`true` = now in kiosk/fullscreen) so the renderer's own button icon can follow along without a separate change-event listener. */
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  /** Current kiosk state, for the button's initial icon on mount. */
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
})
