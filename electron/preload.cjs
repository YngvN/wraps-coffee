// CommonJS, same reasoning as main.cjs (package.json's "type": "module" would
// otherwise load a plain .js file here as ESM). Attached to the admin
// dashboard's own kiosk window, and (via `main.cjs`'s own
// `attachDisplayWindowPreload`) to a Display window opened from
// Display Manager's "+ Add Display" button - the managed monitor/signage
// windows `displayManager.cjs` opens on its own never get this, so
// `window.electronAPI` is how a renderer tells "I'm running in Electron,
// with real window chrome to control" apart from a plain browser tab or one
// of those signage windows.
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
