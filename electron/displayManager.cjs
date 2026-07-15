// CommonJS on purpose, same reason as electron/main.cjs.
const { screen, BrowserWindow } = require('electron')

/** monitorId (string) -> its currently-open managed BrowserWindow. */
const managedWindows = new Map()
/** monitorId (string) -> the URL last loaded into it — the guard that keeps an unrelated machine's heartbeat (which rewrites/rebroadcasts the *whole* admin.displayMachines array) from causing spurious window recreation/flicker here. */
const lastLoadedUrl = new Map()

function monitorIdFor(display) {
  return String(display.id)
}

/**
 * Every physical monitor Electron currently detects, each paired with a
 * stable-for-this-OS-session id and a human label. `excludeDisplayId` (a
 * `role: 'server'` machine's own primary/admin display) is left out
 * entirely so it can never be assigned a Screen and hijacked — pass `null`
 * for a `role: 'display'` machine, where every monitor is fair game since
 * there's no admin-login window on any of them.
 */
function detectMonitors(excludeDisplayId) {
  return screen
    .getAllDisplays()
    .filter((display) => display.id !== excludeDisplayId)
    .map((display) => ({
      id: monitorIdFor(display),
      label: `${display.size.width}x${display.size.height}${display.internal ? ' (built-in)' : ''}`,
      display,
    }))
}

function urlForMonitor(baseUrl, assignedScreenID) {
  return assignedScreenID ? `${baseUrl}/screens/${assignedScreenID}?unattended=1` : `${baseUrl}/display-standby`
}

/**
 * Creates a kiosk window pinned to `display`'s own bounds. Positioned there
 * *before* enabling kiosk mode, and only actually enabled once the window
 * reports `ready-to-show` rather than immediately after construction — on
 * Windows, calling `setKiosk`/fullscreen too early can still land the
 * window on the wrong monitor if it hasn't finished settling at its target
 * position yet.
 */
function openManagedWindow(monitorId, display, url) {
  const window = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    show: false,
    autoHideMenuBar: true,
  })
  window.once('ready-to-show', () => {
    window.setKiosk(true)
    window.show()
  })
  window.loadURL(url)
  window.on('closed', () => {
    managedWindows.delete(monitorId)
    lastLoadedUrl.delete(monitorId)
  })
  managedWindows.set(monitorId, window)
  lastLoadedUrl.set(monitorId, url)
}

/**
 * Brings every currently-detected monitor's window in line with `monitors`
 * (this machine's own entry from `admin.displayMachines`, via
 * `electron/syncClient.cjs`) — opens a window for a newly-detected monitor,
 * closes one for a monitor no longer physically present, and only reloads
 * an existing window if its URL actually changed since the last reconcile.
 */
function reconcile(baseUrl, monitors, excludeDisplayId) {
  const detected = detectMonitors(excludeDisplayId)
  const detectedIds = new Set(detected.map((monitor) => monitor.id))

  for (const [monitorId, window] of managedWindows) {
    if (!detectedIds.has(monitorId)) window.close()
  }

  for (const monitor of detected) {
    const assignedScreenID = monitors.find((reported) => reported.id === monitor.id)?.assignedScreenID ?? null
    const url = urlForMonitor(baseUrl, assignedScreenID)
    const existingWindow = managedWindows.get(monitor.id)

    if (!existingWindow) {
      openManagedWindow(monitor.id, monitor.display, url)
      continue
    }
    if (lastLoadedUrl.get(monitor.id) !== url) {
      lastLoadedUrl.set(monitor.id, url)
      existingWindow.loadURL(url)
    }
  }
}

module.exports = { detectMonitors, reconcile }
